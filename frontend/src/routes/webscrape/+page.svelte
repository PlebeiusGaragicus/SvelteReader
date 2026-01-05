<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Globe, User, LogIn, Search, Newspaper, Sparkles, Zap, ArrowLeft, Bot, Loader2 } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { walletStore } from '$lib/stores/wallet.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { webSearchHistoryStore, type LangGraphMessage, type SearchSource } from '$lib/stores/webSearchHistory.svelte';
	import { WebSearchInput, DiscoveryFeed, WebSearchChat, ChatSidebar, RelatedQuestions } from '$lib/components/webscrape';
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
	let currentPhase = $state<'idle' | 'classifying' | 'searching' | 'synthesizing'>('idle');
	let threadId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let sidebarCollapsed = $state(false);
	let suggestions = $state<string[]>([]);
	let loadingSuggestions = $state(false);
	let isLoadingThread = $state(false); // Prevents save loop when loading a thread
	
	const isLoggedIn = $derived(cyphertap.isLoggedIn);

	// Message cost in sats
	const MESSAGE_COST_SATS = parseInt(import.meta.env.VITE_MESSAGE_COST_SATS || '1', 10);

	// Create payment generator bound to cyphertap
	const generatePayment = walletStore.createPaymentGenerator(cyphertap);

	// =============================================================================
	// PROCESSED MESSAGES - Convert LangGraph messages to display format
	// =============================================================================

	const processedMessages = $derived.by((): ProcessedMessage[] => {
		const messageMap = new Map<string, { message: LangGraphMessage; toolCalls: ToolCallWithStatus[] }>();
		
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
				
				// Only include AI messages if they have content OR tool calls
				const messageContent = extractStringContent(message);
				const hasContent = messageContent && messageContent.trim() !== '';
				const hasToolCalls = toolCallsWithStatus.length > 0;
				
				if (hasContent || hasToolCalls) {
					const stableId = message.id || `ai-${index}`;
					messageMap.set(stableId, { message, toolCalls: toolCallsWithStatus });
				}
				
			} else if (message.type === 'tool') {
				// Match tool result to its tool call
				const toolCallId = message.tool_call_id;
				if (!toolCallId) return;
				
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
				messageMap.set(stableId, { message, toolCalls: [] });
			}
		});
		
		return Array.from(messageMap.entries()).map(([id, data]): ProcessedMessage => {
			const content = extractStringContent(data.message);
			
			// Extract sources from content if present
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

	// Show streaming bubble only when there's new content not yet in synced messages
	const showStreamingBubble = $derived.by(() => {
		if (!isStreaming || !streamingContent) return false;
		
		// Find the latest human message index
		const lastHumanIdx = processedMessages.findLastIndex(m => m.role === 'user');
		
		// Find if there is an AI message AFTER the latest human message
		const lastAiAfterHuman = processedMessages.findLast((m, i) => m.role === 'assistant' && i > lastHumanIdx);
		
		// If we have an AI message already synced, check if streaming content is ahead
		if (lastAiAfterHuman && lastAiAfterHuman.content) {
			// If the synced history content is already nearly as long as the streaming content,
			// the 'values' event has caught up, so hide the separate bubble
			if (lastAiAfterHuman.content.length > 0 && streamingContent.startsWith(lastAiAfterHuman.content.slice(0, 20))) {
				return false;
			}
		}
		
		return true;
	});

	// Extract sources from processed messages for the current thread
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

	function extractStringContent(message: LangGraphMessage): string {
		if (typeof message.content === 'string') {
			return message.content;
		}
		if (Array.isArray(message.content)) {
			return message.content
				.filter((c): c is { type: 'text'; text: string } => 
					typeof c === 'object' && c !== null && 'type' in c && c.type === 'text'
				)
				.map(c => c.text)
				.join('\n');
		}
		return '';
	}

	// =============================================================================
	// LIFECYCLE
	// =============================================================================

	onMount(() => {
		if (modeStore.current !== 'webscrape') {
			modeStore.setMode('webscrape');
		}
		
		walletStore.syncWithCypherTap({
			balance: cyphertap.balance,
			isReady: cyphertap.isReady,
			isLoggedIn: cyphertap.isLoggedIn,
			npub: cyphertap.npub,
		});
		
		// Initialize history store
		webSearchHistoryStore.initialize();
	});

	// Keep wallet synced
	$effect(() => {
		walletStore.syncWithCypherTap({
			balance: cyphertap.balance,
			isReady: cyphertap.isReady,
			isLoggedIn: cyphertap.isLoggedIn,
			npub: cyphertap.npub,
		});
	});

	// Auto-scroll on new messages
	$effect(() => {
		const _msgs = processedMessages.length;
		const _streaming = streamingContent;
		
		tick().then(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		});
	});

	// Save thread to history when messages update (but not when loading a thread)
	$effect(() => {
		if (threadId && langGraphMessages.length > 0 && !isStreaming && !isLoadingThread) {
			webSearchHistoryStore.saveThread(
				threadId,
				langGraphMessages,
				currentSources,
				suggestions
			);
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
		suggestions = []; // Clear previous suggestions
		
		try {
			const backendUrl = settingsStore.backendUrl;
			
			// Build chat history for suggestions
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
				console.log('[WebSearch] Not enough history for suggestions');
				loadingSuggestions = false;
				return;
			}
			
			console.log('[WebSearch] Generating suggestions from', history.length, 'messages');
			
			const response = await fetch(`${backendUrl}/api/suggestions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ history }),
			});
			
			if (response.ok) {
				const data = await response.json();
				suggestions = data.suggestions || [];
				console.log('[WebSearch] Generated', suggestions.length, 'suggestions');
				
				// Save to thread
				if (threadId && suggestions.length > 0) {
					webSearchHistoryStore.updateSuggestions(threadId, suggestions);
				}
			} else {
				console.warn('[WebSearch] Suggestions endpoint returned', response.status);
			}
		} catch (e) {
			console.warn('[WebSearch] Failed to generate suggestions:', e);
		} finally {
			loadingSuggestions = false;
		}
	}

	// =============================================================================
	// SEARCH HANDLER
	// =============================================================================

	async function handleSearch(query: string) {
		if (isStreaming) return;
		
		error = null;
		isStreaming = true;
		streamingContent = '';
		currentPhase = 'classifying';
		suggestions = []; // Clear previous suggestions
		
		// Add user message to LangGraph messages
		const userMessage: LangGraphMessage = {
			type: 'human',
			content: query,
			id: crypto.randomUUID(),
		};
		langGraphMessages = [...langGraphMessages, userMessage];
		
		// Generate payment token (optional - for paid mode)
		let payment: PaymentInfo | null = null;
		if (cyphertap.isLoggedIn && cyphertap.isReady && cyphertap.balance >= MESSAGE_COST_SATS) {
			try {
				payment = await generatePayment(MESSAGE_COST_SATS, 'Web search query');
				if (payment) {
					console.log('[WebSearch] Payment token generated:', payment.amount_sats, 'sats');
				}
			} catch (e) {
				console.warn('[WebSearch] Payment generation failed, continuing without payment:', e);
			}
		}
		
		// Create thread ID if not exists
		if (!threadId) {
			threadId = crypto.randomUUID();
		}
		
		try {
			const agentUrl = settingsStore.agentUrl;
			
			// Format messages for LangGraph
			const formattedMessages = langGraphMessages.map(m => ({
				type: m.type,
				content: m.content,
			}));
			
			// Build input
			const input: Record<string, unknown> = {
				messages: formattedMessages,
				tool_call_count: 0,
				research_iteration: 0,
			};
			
			// Add payment if available
			if (payment) {
				input.payment = {
					ecash_token: payment.ecash_token,
					amount_sats: payment.amount_sats,
					mint: payment.mint,
				};
			}
			
			currentPhase = 'searching';
			
			const response = await fetch(`${agentUrl}/runs/stream`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					assistant_id: 'web_agent',
					input,
					config: {
						configurable: {
							thread_id: threadId,
						},
					},
					// Use multiple stream modes for comprehensive event handling
					stream_mode: ['messages', 'values'],
				}),
			});
			
			if (!response.ok) {
				throw new Error(`Agent request failed: ${response.status}`);
			}
			
			if (!response.body) {
				throw new Error('No response body');
			}
			
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let currentContent = '';
			
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				
				buffer += decoder.decode(value, { stream: true });
				
				// Process complete SSE events
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';
				
				for (const line of lines) {
					if (!line.startsWith('event:') && !line.startsWith('data:')) continue;
					
					// Parse event type
					if (line.startsWith('event:')) {
						// Event type line - handled with next data line
						continue;
					}
					
					if (line.startsWith('data:')) {
						const data = line.slice(5).trim();
						if (!data || data === '[DONE]') continue;
						
						try {
							const parsed = JSON.parse(data);
							
							// Handle messages/partial events (streaming tokens)
							if (Array.isArray(parsed) && parsed.length > 0) {
								const lastChunk = parsed[parsed.length - 1];
								if (lastChunk?.type === 'ai' && lastChunk.content) {
									const newContent = lastChunk.content;
									if (newContent.length > currentContent.length) {
										currentContent = newContent;
										streamingContent = currentContent;
										currentPhase = 'synthesizing';
									}
								}
								// Detect tool calls from streaming
								if (lastChunk?.type === 'ai' && lastChunk.tool_calls?.length > 0) {
									currentPhase = 'searching';
								}
							}
							
							// Handle values events (full state snapshots)
							if (parsed.messages && Array.isArray(parsed.messages)) {
								console.log('[WebSearch] Values event - syncing', parsed.messages.length, 'messages');
								langGraphMessages = parsed.messages;
								
								// Reset content tracker for next iteration
								const lastMessage = parsed.messages[parsed.messages.length - 1];
								if (lastMessage?.type === 'ai') {
									currentContent = extractStringContent(lastMessage);
									
									// Check for tool calls
									if (lastMessage.tool_calls?.length > 0) {
										currentPhase = 'searching';
									} else if (currentContent) {
										currentPhase = 'synthesizing';
									}
								}
							}
							
						} catch {
							// Skip malformed JSON
						}
					}
				}
			}
			
			console.log('[WebSearch] Stream complete with', langGraphMessages.length, 'messages');
			
			// Generate follow-up suggestions after search completes
			generateSuggestions();
			
		} catch (e) {
			const errorMessage = (e as Error).message;
			console.error('[WebSearch] Error:', e);
			error = errorMessage;
			toast.error('Search failed', { description: errorMessage });
			
			// Add error message
			langGraphMessages = [...langGraphMessages, {
				type: 'ai',
				content: `I encountered an error while searching: ${errorMessage}. Please try again.`,
				id: crypto.randomUUID(),
			}];
		} finally {
			isStreaming = false;
			streamingContent = '';
			currentPhase = 'idle';
		}
	}

	function startNewChat() {
		langGraphMessages = [];
		threadId = null;
		error = null;
		streamingContent = '';
		suggestions = [];
	}

	function loadThread(id: string) {
		const thread = webSearchHistoryStore.getThread(id);
		if (thread) {
			isLoadingThread = true;
			threadId = id;
			// Deep clone to break reactive proxy connection from the store
			// This prevents infinite loops where reading message properties
			// creates dependencies on store state that gets updated by saveThread
			langGraphMessages = structuredClone(thread.messages);
			suggestions = thread.suggestions ? [...thread.suggestions] : [];
			error = null;
			streamingContent = '';
			loadingSuggestions = false;
			// Reset loading flag after state updates settle
			setTimeout(() => {
				isLoadingThread = false;
			}, 0);
		}
	}

	function handleSuggestionClick(suggestion: string) {
		handleSearch(suggestion);
	}
</script>

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
				<Globe class="h-24 w-24 text-cyan-500" />
				<div class="absolute -bottom-2 -right-2 bg-primary text-primary-foreground rounded-full p-2">
					<LogIn class="h-4 w-4" />
				</div>
			</div>
			
			<h1 class="text-3xl font-bold mb-4">Web Scrape Mode</h1>
			<p class="text-lg text-muted-foreground mb-6">
				Search the web and get AI-synthesized answers with source citations.
			</p>
			
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 w-full">
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Search class="h-8 w-8 text-cyan-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Web Search</h3>
					<p class="text-xs text-muted-foreground">Search across the web for real-time information</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Sparkles class="h-8 w-8 text-yellow-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">AI Synthesis</h3>
					<p class="text-xs text-muted-foreground">Get AI-powered summaries with citations</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Newspaper class="h-8 w-8 text-green-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Discover</h3>
					<p class="text-xs text-muted-foreground">Explore trending news and events</p>
				</div>
			</div>
			
			<div class="flex flex-col items-center gap-3">
				<p class="text-muted-foreground">
					<User class="inline h-4 w-4 mr-1" />
					Log in with Nostr to access Web Scrape mode
				</p>
			</div>
		</div>
		{:else if hasChat}
			<!-- Chat view -->
			<div class="flex flex-col h-full max-w-3xl mx-auto w-full px-4">
				<!-- Header with back button -->
				<div class="flex items-center gap-3 py-4 flex-shrink-0">
					<button
						onclick={startNewChat}
						class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft class="h-4 w-4" />
						New search
					</button>
					
					{#if cyphertap.balance > 0}
						<div class="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
							<Zap class="h-4 w-4 text-yellow-500" />
							<span>{cyphertap.balance} sats</span>
						</div>
					{/if}
				</div>
				
				<!-- Chat messages - scrollable area -->
				<div 
					bind:this={messagesContainer}
					class="flex-1 overflow-y-auto space-y-4"
				>
					<WebSearchChat 
						messages={processedMessages}
						isLoading={isStreaming}
						streamingContent={showStreamingBubble ? streamingContent : ''}
						{currentPhase}
					/>
					
					<!-- Related questions -->
					{#if !isStreaming && suggestions.length > 0}
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
					{/if}
				</div>
				
				<!-- Input - fixed at bottom -->
				<div class="flex-shrink-0 py-4">
					<WebSearchInput 
						onSubmit={handleSearch} 
						isLoading={isStreaming}
						placeholder="Ask a follow-up question..."
					/>
			</div>
		</div>
	{:else}
		<!-- Hero section with search -->
			<div class="flex-1 flex flex-col px-4">
		<div class="flex flex-col items-center justify-center py-12 lg:py-20">
			<h1 class="text-3xl lg:text-4xl font-light text-center mb-8 text-muted-foreground">
				Search the web. <span class="text-foreground">Get answers.</span>
			</h1>
					
					{#if cyphertap.balance > 0}
						<div class="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
							<Zap class="h-4 w-4 text-yellow-500" />
							<span>{cyphertap.balance} sats available</span>
							<span class="text-xs">({MESSAGE_COST_SATS} sat per query)</span>
						</div>
					{/if}
			
			<WebSearchInput 
				onSubmit={handleSearch} 
						isLoading={isStreaming}
				placeholder="What would you like to know?"
			/>
					
					{#if error}
						<p class="mt-4 text-sm text-destructive">{error}</p>
					{/if}
		</div>

		<!-- Discovery feed -->
				<div class="max-w-screen-lg mx-auto w-full mt-8 pb-8">
			<DiscoveryFeed />
				</div>
		</div>
	{/if}
</div>
</div>
