<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Globe, User, LogIn, Search, Sparkles, Zap, ArrowLeft, Bot, Loader2, Brain, Settings } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { walletStore } from '$lib/stores/wallet.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { agentsStore } from '$lib/stores/agents.svelte';
	import { apiKeysStore } from '$lib/stores/apiKeys.svelte';
	import { deepResearchHistoryStore, type LangGraphMessage, type SearchSource } from '$lib/stores/deepResearchHistory.svelte';
	import { 
		DeepResearchInput, 
		DiscoveryFeed, 
		DeepResearchChat, 
		ChatSidebar, 
		// RelatedQuestions, // Disabled for now - UI performance issues
		ResearchProgress,
		TaskTracker,
		ClarificationInput,
		AgentSelector,
		ConfigurationSidebar,
		ToolCallDisplay,
		SourcesSidebar,
		SourceModal,
		ResearchInputBar,
		type CitedSource
	} from '$lib/components/deepresearch';
	import {
		submitMessage,
		resumeWithClarification,
		cancelActiveRuns,
		type ClarificationInterrupt,
		type ClarificationResponse,
		type TodoItem,
	} from '$lib/services/deepresearch-langgraph';
	import type { PaymentInfo } from '$lib/types/chat';

	// =============================================================================
	// TYPES
	// =============================================================================

	interface ToolCallWithStatus {
		id: string;
		name: string;
		args: Record<string, unknown>;
		status: 'pending' | 'executing' | 'completed' | 'error';
		result?: { content: string };
	}

	interface ProcessedMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		toolCalls?: ToolCallWithStatus[];
		sources?: SearchSource[];
		isStreaming?: boolean;
	}

	// =============================================================================
	// STATE
	// =============================================================================

	let langGraphMessages = $state<LangGraphMessage[]>([]);
	let isStreaming = $state(false);
	let streamingContent = $state('');
	let currentPhase = $state<'idle' | 'clarifying' | 'planning' | 'researching' | 'synthesizing' | 'complete'>('idle');
	let threadId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let sidebarCollapsed = $state(true); // Collapsed by default
	let suggestions = $state<string[]>([]);
	let loadingSuggestions = $state(false);
	let isLoadingThread = $state(false);
	let researchIterations = $state(0);
	let activeResearchTopics = $state<string[]>([]);
	let todos = $state<TodoItem[]>([]);
	let tasksCollapsed = $state(true);
	let researchBrief = $state<string>('');
	
	// Clarification interrupt state
	let clarificationInterrupt = $state<ClarificationInterrupt | null>(null);
	let clarificationInterruptId = $state<string | null>(null);
	let isSubmittingClarification = $state(false);
	
	// Track if user has started a search (to hide Discover)
	let hasStartedSearch = $state(false);
	
	// New sidebars state
	let configSidebarOpen = $state(false);
	let sourcesSidebarCollapsed = $state(true);
	let selectedSource = $state<CitedSource | null>(null);
	let sourceModalOpen = $state(false);
	
	// Mock cited sources (will be populated from agent responses in future)
	let citedSources = $state<CitedSource[]>([]);
	
	// Research options
	let webSearchEnabled = $state(true);
	let fileRagEnabled = $state(false);
	
	const isLoggedIn = $derived(cyphertap.isLoggedIn);

	// Debug mode - disable payments in development
	const isDebugMode = import.meta.env.VITE_DEBUG === 'true' || import.meta.env.DEV;

	// Message cost in sats
	const MESSAGE_COST_SATS = parseInt(import.meta.env.VITE_MESSAGE_COST_SATS || '1', 10);

	// Create payment generator bound to cyphertap
	const generatePayment = walletStore.createPaymentGenerator(cyphertap);
	
	// Derived: awaiting clarification from agent
	const awaitingClarification = $derived(clarificationInterrupt !== null);
	
	// Derived: detect when clarification JSON is streaming (incomplete JSON in stream)
	const isStreamingClarificationJson = $derived.by(() => {
		if (!isStreaming || !streamingContent) return false;
		const trimmed = streamingContent.trim();
		if (!trimmed.startsWith('{')) return false;
		
		// Check for clarification patterns
		const hasClarificationPatterns = 
			trimmed.includes('"need_clarification"') || 
			trimmed.includes('"question"') ||
			trimmed.includes('"verification"') ||
			trimmed.includes('"clarification_needed"');
		
		if (!hasClarificationPatterns) return false;
		
		// If we can't parse it, it's still streaming
		try {
			JSON.parse(trimmed);
			return false;
		} catch {
			return true;
		}
	});

	// =============================================================================
	// PROCESSED MESSAGES - Convert LangGraph messages to display format
	// =============================================================================

	const processedMessages = $derived.by((): ProcessedMessage[] => {
		const messageMap = new Map<string, { message: LangGraphMessage; toolCalls: ToolCallWithStatus[]; order: number }>();
		// Track content hashes to deduplicate messages with same content
		const seenContentHashes = new Set<string>();
		
		langGraphMessages.forEach((message, index) => {
			if (message.type === 'ai') {
				// Extract tool calls from AI message
				const toolCallsWithStatus: ToolCallWithStatus[] = [];
				
				if (message.tool_calls && message.tool_calls.length > 0) {
					for (const tc of message.tool_calls) {
						toolCallsWithStatus.push({
							id: tc.id || `tool-${index}-${tc.name}`,
							name: tc.name,
							args: tc.args || {},
							status: 'pending',
						});
					}
				}
				
				const messageContent = extractStringContent(message);
				const hasContent = messageContent && messageContent.trim() !== '';
				const hasToolCalls = toolCallsWithStatus.length > 0;
				
				// Skip messages with no displayable content
				if (!hasContent && !hasToolCalls) {
					return;
				}
				
				// Create content hash for deduplication
				const contentHash = hasContent ? messageContent.slice(0, 100) : '';
				
				// Skip if we've already seen this exact content (deduplication)
				if (hasContent && seenContentHashes.has(contentHash)) {
					return;
				}
				
				if (hasContent) {
					seenContentHashes.add(contentHash);
				}
				
				// Use stable ID - prefer message.id, fall back to index-based
				const stableId = message.id || `ai-${index}`;
				messageMap.set(stableId, { message, toolCalls: toolCallsWithStatus, order: index });
				
			} else if (message.type === 'tool') {
				const toolCallId = message.tool_call_id;
				if (!toolCallId) return;
				
				// Find the AI message that made this tool call and update its status
				for (const [, data] of messageMap.entries()) {
					const toolCallIndex = data.toolCalls.findIndex(tc => tc.id === toolCallId);
					if (toolCallIndex !== -1) {
						data.toolCalls[toolCallIndex] = {
							...data.toolCalls[toolCallIndex],
							status: 'completed',
							result: { content: extractStringContent(message) }
						};
						break;
					}
				}
				
			} else if (message.type === 'human') {
				const stableId = message.id || `human-${index}`;
				const content = extractStringContent(message);
				
				// Skip empty human messages
				if (!content.trim()) return;
				
				// Deduplicate human messages too
				const contentHash = content.slice(0, 100);
				if (seenContentHashes.has(contentHash)) {
					return;
				}
				seenContentHashes.add(contentHash);
				
				messageMap.set(stableId, { message, toolCalls: [], order: index });
			}
		});
		
		// Sort by original order and convert to ProcessedMessage array
		return Array.from(messageMap.entries())
			.sort(([, a], [, b]) => a.order - b.order)
			.map(([id, data]): ProcessedMessage => {
				const content = extractStringContent(data.message);
				
				let sources: SearchSource[] = [];
				if (data.message.type === 'ai' && content) {
					const sourcesMatch = content.match(/\*\*Sources:\*\*[\s\S]*$/);
					if (sourcesMatch) {
						const urlMatches = [...sourcesMatch[0].matchAll(/(\d+)\.\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
						sources = urlMatches.map((match) => ({
							index: parseInt(match[1]),
							title: match[2],
							url: match[3],
						}));
					}
				}
				
				return {
					id,
					role: data.message.type === 'human' ? 'user' : 'assistant',
					content,
					toolCalls: data.toolCalls.length > 0 ? data.toolCalls : undefined,
					sources: sources.length > 0 ? sources : undefined,
				};
			});
	});

	const hasChat = $derived(processedMessages.length > 0 || isStreaming);
	
	// Derived: show Discover feed only when no search started
	const showDiscoveryFeed = $derived(!hasStartedSearch && processedMessages.length === 0 && !isStreaming);

	const showStreamingBubble = $derived.by(() => {
		// Don't show if not streaming or no content yet
		if (!isStreaming || !streamingContent || !streamingContent.trim()) return false;
		
		// Parse the streaming content to get clean text (in case it's clarification JSON)
		const cleanStreamingContent = parseClarificationContent(streamingContent);
		if (!cleanStreamingContent.trim()) return false;
		
		// Find the last human message index
		const lastHumanIdx = processedMessages.findLastIndex(m => m.role === 'user');
		
		// Find the last AI message after the last human message
		const lastAiAfterHuman = processedMessages.findLast((m, i) => m.role === 'assistant' && i > lastHumanIdx);
		
		if (lastAiAfterHuman && lastAiAfterHuman.content) {
			// If the synced message content is similar to streaming content, hide the streaming bubble
			// This prevents duplicate display when onMessagesSync has caught up
			const syncedContent = lastAiAfterHuman.content.trim();
			const streamingClean = cleanStreamingContent.trim();
			
			// Check if contents are substantially the same (either one starts with the other)
			if (syncedContent.length > 0) {
				const shortSynced = syncedContent.slice(0, 50);
				const shortStreaming = streamingClean.slice(0, 50);
				
				if (shortSynced === shortStreaming || 
					streamingClean.startsWith(shortSynced) || 
					syncedContent.startsWith(shortStreaming)) {
					return false;
				}
			}
		}
		
		return true;
	});

	const currentSources = $derived.by((): SearchSource[] => {
		const allSources: SearchSource[] = [];
		for (const msg of processedMessages) {
			if (msg.sources) {
				allSources.push(...msg.sources);
			}
		}
		return allSources;
	});

	// =============================================================================
	// HELPERS
	// =============================================================================

	/**
	 * Parse clarification JSON content and extract clean text.
	 * The agent sometimes returns JSON with fields like need_clarification, question, verification.
	 * We want to display only the clean verification/response text, not the raw JSON.
	 */
	function parseClarificationContent(content: string): string {
		// Quick check - if it doesn't look like JSON, return as-is
		const trimmed = content.trim();
		if (!trimmed.startsWith('{')) {
			return content;
		}
		
		// Check for clarification JSON patterns
		if (trimmed.includes('"need_clarification"') || 
			trimmed.includes('"verification"') ||
			trimmed.includes('"clarification_needed"')) {
			try {
				const parsed = JSON.parse(trimmed);
				// Extract the clean text from known fields
				if (parsed.verification && typeof parsed.verification === 'string') {
					return parsed.verification;
				}
				if (parsed.response && typeof parsed.response === 'string') {
					return parsed.response;
				}
				// If it's just metadata with no content, return empty
				if (parsed.need_clarification === false && !parsed.verification && !parsed.response) {
					return '';
				}
			} catch {
				// Not valid JSON, return as-is
			}
		}
		return content;
	}

	function extractStringContent(message: LangGraphMessage): string {
		let rawContent = '';
		
		if (typeof message.content === 'string') {
			rawContent = message.content;
		} else if (Array.isArray(message.content)) {
			rawContent = message.content
				.filter((c): c is { type: 'text'; text: string } => 
					typeof c === 'object' && c !== null && 'type' in c && c.type === 'text'
				)
				.map(c => c.text)
				.join('\n');
		}
		
		// Parse clarification JSON to extract clean text
		return parseClarificationContent(rawContent);
	}

	// =============================================================================
	// LIFECYCLE
	// =============================================================================

	onMount(() => {
		if (modeStore.current !== 'deepresearch') {
			modeStore.setMode('deepresearch');
		}
		
		walletStore.syncWithCypherTap({
			balance: cyphertap.balance,
			isReady: cyphertap.isReady,
			isLoggedIn: cyphertap.isLoggedIn,
			npub: cyphertap.npub,
		});
		
		deepResearchHistoryStore.initialize();
		agentsStore.initialize();
		
		// Initialize API keys with user's npub if logged in
		if (cyphertap.isLoggedIn && cyphertap.npub) {
			apiKeysStore.setNpub(cyphertap.npub);
		}
	});

	$effect(() => {
		walletStore.syncWithCypherTap({
			balance: cyphertap.balance,
			isReady: cyphertap.isReady,
			isLoggedIn: cyphertap.isLoggedIn,
			npub: cyphertap.npub,
		});
		
		// Update API keys scope when login changes
		if (cyphertap.isLoggedIn && cyphertap.npub) {
			apiKeysStore.setNpub(cyphertap.npub);
		} else {
			apiKeysStore.setNpub(undefined);
		}
	});

	// Auto-scroll only on new messages (not every streaming token)
	$effect(() => {
		const _msgs = processedMessages.length;
		// Only track message count changes, not streaming content
		
		tick().then(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		});
	});

	// Save thread to history when messages change (but not during loading/streaming)
	// Use untrack for the save call to prevent infinite effect loops
	$effect(() => {
		// Track these values to trigger the effect
		const id = threadId;
		const messages = langGraphMessages;
		const streaming = isStreaming;
		const loading = isLoadingThread;
		
		if (id && messages.length > 0 && !streaming && !loading) {
			// Use untrack to prevent the save from triggering this effect again
			untrack(() => {
				deepResearchHistoryStore.saveThread(
					id,
					messages,
					currentSources,
					suggestions,
					researchBrief,
					currentPhase === 'complete' ? 'complete' : undefined
				);
			});
		}
	});

	// =============================================================================
	// SUGGESTIONS GENERATION
	// =============================================================================

	async function generateSuggestions() {
		if (langGraphMessages.length < 2) {
			loadingSuggestions = false;
			return;
		}
		
		loadingSuggestions = true;
		suggestions = [];
		
		try {
			const backendUrl = settingsStore.backendUrl;
			
			const history: [string, string][] = [];
			for (const msg of langGraphMessages) {
				if (msg.type === 'human') {
					const content = extractStringContent(msg);
					if (content) history.push(['human', content]);
				} else if (msg.type === 'ai') {
					const content = extractStringContent(msg);
					if (content && !msg.tool_calls?.length) history.push(['assistant', content]);
				}
			}
			
			if (history.length < 2) {
				loadingSuggestions = false;
				return;
			}
			
			const response = await fetch(`${backendUrl}/api/suggestions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ history }),
			});
			
			if (response.ok) {
				const data = await response.json();
				suggestions = data.suggestions || [];
				
				if (threadId && suggestions.length > 0) {
					deepResearchHistoryStore.updateSuggestions(threadId, suggestions);
				}
			}
		} catch (e) {
			console.warn('[DeepResearch] Failed to generate suggestions:', e);
		} finally {
			loadingSuggestions = false;
		}
	}

	// =============================================================================
	// RESEARCH HANDLER - Using LangGraph SDK
	// =============================================================================

	async function handleSearch(query: string) {
		if (isStreaming || awaitingClarification) return;
		
		error = null;
		isStreaming = true;
		streamingContent = '';
		currentPhase = 'clarifying';
		suggestions = [];
		researchIterations = 0;
		activeResearchTopics = [];
		todos = [];
		researchBrief = '';
		clarificationInterrupt = null;
		clarificationInterruptId = null;
		hasStartedSearch = true;
		
		// Add optimistic user message
		const userMessage: LangGraphMessage = {
			type: 'human',
			content: query,
			id: crypto.randomUUID(),
		};
		langGraphMessages = [...langGraphMessages, userMessage];
		
		// Generate payment if not in debug mode
		let payment: PaymentInfo | null = null;
		if (!isDebugMode && cyphertap.isLoggedIn && cyphertap.isReady && cyphertap.balance >= MESSAGE_COST_SATS) {
			try {
				payment = await generatePayment(MESSAGE_COST_SATS, 'Deep research query');
				if (payment) {
					console.log('[DeepResearch] Payment token generated:', payment.amount_sats, 'sats');
				}
			} catch (e) {
				console.warn('[DeepResearch] Payment generation failed, continuing without payment:', e);
			}
		} else if (isDebugMode) {
			console.log('[DeepResearch] Debug mode - skipping payment');
		}
		
		try {
			const result = await submitMessage(
				query,
				{
					threadId,
					payment: payment ? {
						ecash_token: payment.ecash_token,
						amount_sats: payment.amount_sats,
						mint: payment.mint,
					} : undefined,
				},
				{
					onToken: (token) => {
						streamingContent += token;
					},
					onMessagesSync: (messages) => {
						langGraphMessages = [...messages];
						
						// Track active research topics from tool calls
						const lastMessage = messages[messages.length - 1];
						if (lastMessage?.type === 'ai' && lastMessage.tool_calls) {
							for (const tc of lastMessage.tool_calls) {
								if (tc.name === 'ConductResearch' && tc.args?.research_topic) {
									const topic = tc.args.research_topic as string;
									if (!activeResearchTopics.includes(topic)) {
										activeResearchTopics = [...activeResearchTopics, topic.slice(0, 80)];
									}
								}
							}
						}
					},
					onPhaseChange: (phase) => {
						currentPhase = phase as typeof currentPhase;
						if (phase === 'synthesizing') {
							activeResearchTopics = [];
						}
					},
					onResearchBrief: (brief) => {
						researchBrief = brief;
					},
					onResearchIterations: (count) => {
						researchIterations = count;
					},
					onTodosSync: (todoList) => {
						todos = todoList;
					},
					onThreadId: (id) => {
						threadId = id;
					},
				onClarificationInterrupt: (interrupt, interruptId) => {
					console.log('[DeepResearch] Clarification interrupt received:', interrupt.question);
					clarificationInterrupt = interrupt;
					clarificationInterruptId = interruptId;
					currentPhase = 'clarifying';
					isStreaming = false;
					streamingContent = '';
				},
				onComplete: (messages) => {
					console.log('[DeepResearch] Research complete with', messages.length, 'messages');
					langGraphMessages = [...messages];
					currentPhase = 'complete';
					activeResearchTopics = [];
					// Explicitly reset streaming state to prevent UI freeze
					isStreaming = false;
					streamingContent = '';
				},
				onError: (err) => {
					console.error('[DeepResearch] Stream error:', err);
					error = err.message;
					toast.error('Research failed', { description: err.message });
					// Reset streaming state on error
					isStreaming = false;
					streamingContent = '';
				},
				}
			);
			
			// Update threadId if it was created
			if (result.threadId && !threadId) {
				threadId = result.threadId;
			}
			
		} catch (e) {
			const errorMessage = (e as Error).message;
			console.error('[DeepResearch] Error:', e);
			error = errorMessage;
			toast.error('Research failed', { description: errorMessage });
			
			langGraphMessages = [...langGraphMessages, {
				type: 'ai',
				content: `I encountered an error during research: ${errorMessage}. Please try again.`,
				id: crypto.randomUUID(),
			}];
		} finally {
			// Only clear streaming if not awaiting clarification
			if (!clarificationInterrupt) {
				isStreaming = false;
				streamingContent = '';
			}
		}
	}
	
	// =============================================================================
	// CLARIFICATION RESPONSE HANDLER
	// =============================================================================
	
	async function handleClarificationResponse(response: ClarificationResponse) {
		if (!clarificationInterrupt || !clarificationInterruptId || !threadId) {
			console.error('[DeepResearch] No active clarification interrupt');
			return;
		}
		
		isSubmittingClarification = true;
		isStreaming = true;
		streamingContent = '';
		
		// Add the user's clarification as a message for display
		const clarificationMessage: LangGraphMessage = {
			type: 'human',
			content: response.response || JSON.stringify(response.selected || []),
			id: crypto.randomUUID(),
		};
		langGraphMessages = [...langGraphMessages, clarificationMessage];
		
		const interruptId = clarificationInterruptId;
		
		// Clear the interrupt state
		clarificationInterrupt = null;
		clarificationInterruptId = null;
		
		try {
			await resumeWithClarification(
				threadId,
				interruptId,
				response,
				{
					onToken: (token) => {
						streamingContent += token;
					},
					onMessagesSync: (messages) => {
						langGraphMessages = [...messages];
					},
					onPhaseChange: (phase) => {
						currentPhase = phase as typeof currentPhase;
					},
					onResearchBrief: (brief) => {
						researchBrief = brief;
					},
					onResearchIterations: (count) => {
						researchIterations = count;
					},
					onTodosSync: (todoList) => {
						todos = todoList;
					},
				onClarificationInterrupt: (interrupt, newInterruptId) => {
					// Another clarification needed
					clarificationInterrupt = interrupt;
					clarificationInterruptId = newInterruptId;
					currentPhase = 'clarifying';
					isStreaming = false;
					streamingContent = '';
				},
				onComplete: (messages) => {
					console.log('[DeepResearch] Resume complete with', messages.length, 'messages');
					langGraphMessages = [...messages];
					currentPhase = 'complete';
					// Explicitly reset streaming state to prevent UI freeze
					isStreaming = false;
					streamingContent = '';
				},
				onError: (err) => {
					console.error('[DeepResearch] Resume error:', err);
					error = err.message;
					toast.error('Failed to continue research', { description: err.message });
					// Reset streaming state on error
					isStreaming = false;
					streamingContent = '';
				},
				}
			);
		} catch (e) {
			const errorMessage = (e as Error).message;
			console.error('[DeepResearch] Resume error:', e);
			error = errorMessage;
		} finally {
			isSubmittingClarification = false;
			if (!clarificationInterrupt) {
				isStreaming = false;
				streamingContent = '';
			}
		}
	}

	function startNewChat() {
		langGraphMessages = [];
		threadId = null;
		error = null;
		streamingContent = '';
		suggestions = [];
		currentPhase = 'idle';
		researchIterations = 0;
		activeResearchTopics = [];
		todos = [];
		researchBrief = '';
		clarificationInterrupt = null;
		clarificationInterruptId = null;
		hasStartedSearch = false;
	}

	function loadThread(id: string) {
		// Guard: don't reload the same thread or while already loading
		if (id === threadId || isLoadingThread) {
			return;
		}
		
		const thread = deepResearchHistoryStore.getThread(id);
		if (!thread) {
			console.warn('[DeepResearch] Thread not found:', id);
			return;
		}
		
		isLoadingThread = true;
		
		// Reset streaming state
		isStreaming = false;
		streamingContent = '';
		error = null;
		loadingSuggestions = false;
		clarificationInterrupt = null;
		clarificationInterruptId = null;
		
		// Load thread data from local storage
		threadId = id;
		// Use JSON parse/stringify instead of structuredClone to avoid DataCloneError
		langGraphMessages = JSON.parse(JSON.stringify(thread.messages));
		suggestions = thread.suggestions ? [...thread.suggestions] : [];
		researchBrief = thread.researchBrief || '';
		currentPhase = thread.researchPhase || 'idle';
		
		// If thread has messages, user has started search
		hasStartedSearch = langGraphMessages.length > 0;
		
		// Mark loading complete synchronously - don't use setTimeout which can cause loops
		isLoadingThread = false;
	}

	function handleSuggestionClick(suggestion: string) {
		handleSearch(suggestion);
	}
	
	// Source handlers
	function handleSelectSource(source: CitedSource) {
		selectedSource = source;
		sourceModalOpen = true;
	}
	
	function handleCloseSourceModal() {
		sourceModalOpen = false;
		selectedSource = null;
	}
	
	// Extract cited sources from current messages (mock for now, will be enhanced later)
	$effect(() => {
		const sources: CitedSource[] = [];
		for (const msg of processedMessages) {
			if (msg.sources) {
				for (const s of msg.sources) {
					sources.push({
						id: `source-${s.index}`,
						title: s.title,
						url: s.url,
						type: 'web',
						citedInMessageId: msg.id,
					});
				}
			}
		}
		citedSources = sources;
	});
</script>

<svelte:head>
	<title>SvelteReader | Deep Research</title>
</svelte:head>

<div class="flex h-[calc(100vh-3.5rem)]">
	<!-- Sidebar (only for logged in users with history) -->
	{#if isLoggedIn}
		<ChatSidebar
			currentThreadId={threadId}
			onSelectThread={loadThread}
			onNewChat={startNewChat}
			collapsed={sidebarCollapsed}
			onToggleCollapse={() => { sidebarCollapsed = !sidebarCollapsed; }}
		/>
	{/if}

	<!-- Main content -->
	<div class="flex-1 flex flex-col overflow-hidden">
	{#if !isLoggedIn}
		<!-- Demo page for logged out users -->
			<div class="flex flex-col items-center justify-center py-16 text-center max-w-2xl mx-auto px-4">
			<div class="relative mb-8">
				<Brain class="h-24 w-24 text-cyan-500" />
				<div class="absolute -bottom-2 -right-2 bg-primary text-primary-foreground rounded-full p-2">
					<LogIn class="h-4 w-4" />
				</div>
			</div>
			
			<h1 class="text-3xl font-bold mb-4">Deep Research Mode</h1>
			<p class="text-lg text-muted-foreground mb-6">
				AI-powered deep research with parallel agents, strategic planning, and comprehensive reports.
			</p>
			
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 w-full">
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Search class="h-8 w-8 text-cyan-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Parallel Research</h3>
					<p class="text-xs text-muted-foreground">Multiple agents research in parallel for faster results</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Sparkles class="h-8 w-8 text-yellow-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Strategic Planning</h3>
					<p class="text-xs text-muted-foreground">Clarifying questions and research briefs before diving in</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Brain class="h-8 w-8 text-purple-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Thoughtful Synthesis</h3>
					<p class="text-xs text-muted-foreground">Reflection and compression for high-quality reports</p>
				</div>
			</div>
			
			<div class="flex flex-col items-center gap-3">
				<p class="text-muted-foreground">
					<User class="inline h-4 w-4 mr-1" />
					Log in with Nostr to access Deep Research mode
				</p>
			</div>
		</div>
		{:else if hasChat}
			<!-- Chat view -->
			<div class="flex flex-col h-full max-w-3xl mx-auto w-full px-4">
				<!-- Header with back button and balance -->
				<div class="flex items-center gap-3 py-3 flex-shrink-0 border-b border-border/50">
					<button
						onclick={startNewChat}
						class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft class="h-4 w-4" />
						New research
					</button>
					
					<div class="ml-auto flex items-center gap-2">
						{#if cyphertap.balance > 0}
							<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Zap class="h-3.5 w-3.5 text-yellow-500" />
								<span>{cyphertap.balance} sats</span>
							</div>
						{/if}
					</div>
				</div>
				
				<!-- Research Progress Panel -->
				{#if isStreaming}
					<div class="flex-shrink-0 mb-4">
						<ResearchProgress
							phase={currentPhase}
							{researchIterations}
							maxIterations={5}
							{activeResearchTopics}
						/>
					</div>
				{/if}
				
				<!-- Task Tracker -->
				{#if todos.length > 0}
					<div class="flex-shrink-0 mb-4">
						<TaskTracker 
							{todos} 
							collapsed={tasksCollapsed}
							onToggle={() => { tasksCollapsed = !tasksCollapsed; }}
						/>
					</div>
				{/if}
				
				<!-- Chat messages - scrollable area -->
				<div 
					bind:this={messagesContainer}
					class="flex-1 overflow-y-auto space-y-4"
				>
					<DeepResearchChat 
						messages={processedMessages}
						isLoading={isStreaming}
						streamingContent={showStreamingBubble ? streamingContent : ''}
						{currentPhase}
					/>
					
					<!-- Related questions - disabled for now due to UI performance issues -->
					<!-- {#if !isStreaming && suggestions.length > 0}
						<RelatedQuestions
							{suggestions}
							onSelectSuggestion={handleSuggestionClick}
							isLoading={isStreaming}
						/>
					{:else if loadingSuggestions}
						<RelatedQuestions
							suggestions={[]}
							onSelectSuggestion={handleSuggestionClick}
							isLoading={true}
						/>
					{/if} -->
				</div>
				
				<!-- Input - fixed at bottom -->
				<div class="flex-shrink-0 py-4">
					{#if awaitingClarification && clarificationInterrupt}
						<!-- Clarification input when agent needs info -->
						<ClarificationInput
							interrupt={clarificationInterrupt}
							onSubmit={handleClarificationResponse}
							isSubmitting={isSubmittingClarification}
						/>
					{:else if isStreamingClarificationJson}
						<!-- Agent is preparing a clarification question -->
						<div class="w-full max-w-2xl mx-auto">
							<div class="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 px-5 py-4">
								<div class="flex-shrink-0">
									<div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
										<Loader2 class="w-4 h-4 text-cyan-400 animate-spin" />
									</div>
								</div>
								<p class="text-sm text-cyan-300">Preparing a question for you...</p>
							</div>
						</div>
					{:else}
						<!-- Normal input for follow-up questions -->
						<ResearchInputBar 
							onSubmit={handleSearch} 
							isLoading={isStreaming}
							placeholder="Ask a follow-up question..."
							{webSearchEnabled}
							{fileRagEnabled}
							onWebSearchToggle={(enabled) => { webSearchEnabled = enabled; }}
							onFileRagToggle={(enabled) => { fileRagEnabled = enabled; }}
							onOpenSettings={() => { configSidebarOpen = true; }}
						/>
					{/if}
			</div>
		</div>
	{:else}
		<!-- Hero section with search -->
			<div class="flex-1 flex flex-col px-4 overflow-y-auto">
		<div class="flex flex-col items-center justify-center py-12 lg:py-20 flex-shrink-0">
			<h1 class="text-3xl lg:text-4xl font-light text-center mb-8 text-muted-foreground">
				Research deeply. <span class="text-foreground">Get answers.</span>
			</h1>
			
			<ResearchInputBar 
				onSubmit={handleSearch} 
				isLoading={isStreaming}
				placeholder="What would you like to research?"
				{webSearchEnabled}
				{fileRagEnabled}
				onWebSearchToggle={(enabled) => { webSearchEnabled = enabled; }}
				onFileRagToggle={(enabled) => { fileRagEnabled = enabled; }}
				onOpenSettings={() => { configSidebarOpen = true; }}
			/>
					
			{#if error}
				<p class="mt-4 text-sm text-destructive">{error}</p>
			{/if}
		</div>

		<!-- Discovery feed - hidden once user starts searching -->
				{#if showDiscoveryFeed}
					<div class="max-w-screen-lg mx-auto w-full mt-8 pb-8">
						<DiscoveryFeed />
					</div>
				{/if}
		</div>
	{/if}
</div>

	<!-- Right sidebar for sources (only show when in chat view) -->
	{#if isLoggedIn && hasChat}
		<SourcesSidebar
			sources={citedSources}
			collapsed={sourcesSidebarCollapsed}
			onToggleCollapse={() => { sourcesSidebarCollapsed = !sourcesSidebarCollapsed; }}
			onSelectSource={handleSelectSource}
		/>
	{/if}
</div>

<!-- Configuration Sidebar -->
<ConfigurationSidebar
	open={configSidebarOpen}
	onClose={() => { configSidebarOpen = false; }}
/>

<!-- Source Modal -->
<SourceModal
	source={selectedSource}
	open={sourceModalOpen}
	onClose={handleCloseSourceModal}
/>
