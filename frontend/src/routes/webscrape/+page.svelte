<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Globe, User, LogIn, Search, Newspaper, Sparkles, Zap, ArrowLeft } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { walletStore } from '$lib/stores/wallet.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { WebSearchInput, DiscoveryFeed, WebSearchChat } from '$lib/components/webscrape';
	import type { PaymentInfo } from '$lib/types/chat';

	// Chat state
	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		sources?: Array<{ index: number; title: string; url: string; snippet?: string }>;
		isStreaming?: boolean;
		toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
	}

	let messages = $state<ChatMessage[]>([]);
	let isSearching = $state(false);
	let streamingContent = $state('');
	let currentPhase = $state<'idle' | 'classifying' | 'searching' | 'synthesizing'>('idle');
	let threadId = $state<string | null>(null);
	let error = $state<string | null>(null);
	
	const isLoggedIn = $derived(cyphertap.isLoggedIn);
	const hasChat = $derived(messages.length > 0);

	// Message cost in sats
	const MESSAGE_COST_SATS = parseInt(import.meta.env.VITE_MESSAGE_COST_SATS || '1', 10);

	// Create payment generator bound to cyphertap
	const generatePayment = walletStore.createPaymentGenerator(cyphertap);

	// Ensure mode is set correctly when navigating to this page
	onMount(() => {
		if (modeStore.current !== 'webscrape') {
			modeStore.setMode('webscrape');
		}
		
		// Sync wallet state
		walletStore.syncWithCypherTap({
			balance: cyphertap.balance,
			isReady: cyphertap.isReady,
			isLoggedIn: cyphertap.isLoggedIn,
			npub: cyphertap.npub,
		});
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

	async function handleSearch(query: string) {
		if (isSearching) return;
		
		error = null;
		isSearching = true;
		streamingContent = '';
		currentPhase = 'classifying';
		
		// Add user message
		const userMessageId = crypto.randomUUID();
		messages = [...messages, {
			id: userMessageId,
			role: 'user',
			content: query,
		}];
		
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
			const formattedMessages = messages.map(m => ({
				type: m.role === 'user' ? 'human' : 'ai',
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
					stream_mode: 'messages',
				}),
			});
			
			if (!response.ok) {
				throw new Error(`Agent request failed: ${response.status}`);
			}
			
			if (!response.body) {
				throw new Error('No response body');
			}
			
			currentPhase = 'synthesizing';
			
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let assistantContent = '';
			let toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
			let sources: Array<{ index: number; title: string; url: string; snippet?: string }> = [];
			
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				
				buffer += decoder.decode(value, { stream: true });
				
				// Process complete SSE events
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';
				
				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') continue;
						
						try {
							const parsed = JSON.parse(data);
							
							// Handle different event types from LangGraph
							if (parsed.type === 'ai' && parsed.content) {
								assistantContent += parsed.content;
								streamingContent = assistantContent;
							} else if (parsed.content && typeof parsed.content === 'string') {
								// Some responses come without type
								assistantContent += parsed.content;
								streamingContent = assistantContent;
							} else if (parsed.tool_calls) {
								for (const tc of parsed.tool_calls) {
									toolCalls.push({
										name: tc.name,
										args: tc.args || {},
									});
								}
							}
							
							// Check for sources in the response
							if (parsed.sources) {
								sources = parsed.sources;
							}
						} catch {
							// Skip malformed JSON
						}
					}
				}
			}
			
			// Extract sources from the response content if not provided separately
			if (sources.length === 0 && assistantContent) {
				// Simple extraction of URLs mentioned in Sources section
				const sourcesMatch = assistantContent.match(/\*\*Sources:\*\*[\s\S]*$/);
				if (sourcesMatch) {
					const urlMatches = [...sourcesMatch[0].matchAll(/\d+\.\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
					sources = urlMatches.map((match, i) => ({
						index: i + 1,
						title: match[1],
						url: match[2],
					}));
				}
			}
			
			// Add assistant message
			if (assistantContent) {
				messages = [...messages, {
					id: crypto.randomUUID(),
					role: 'assistant',
					content: assistantContent,
					sources,
					toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				}];
			}
			
		} catch (e) {
			const errorMessage = (e as Error).message;
			console.error('[WebSearch] Error:', e);
			error = errorMessage;
			toast.error('Search failed', { description: errorMessage });
			
			// Add error message
			messages = [...messages, {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: `I encountered an error while searching: ${errorMessage}. Please try again.`,
			}];
		} finally {
			isSearching = false;
			streamingContent = '';
			currentPhase = 'idle';
		}
	}

	function startNewChat() {
		messages = [];
		threadId = null;
		error = null;
	}
</script>

<div class="min-h-[calc(100vh-3.5rem)] px-4 py-8">
	{#if !isLoggedIn}
		<!-- Demo page for logged out users -->
		<div class="flex flex-col items-center justify-center py-16 text-center max-w-2xl mx-auto">
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
		<div class="max-w-3xl mx-auto">
			<!-- Header with back button -->
			<div class="flex items-center gap-3 mb-6">
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
			
			<!-- Chat messages -->
			<div class="mb-6">
				<WebSearchChat 
					{messages}
					isLoading={isSearching}
					{streamingContent}
					{currentPhase}
				/>
			</div>
			
			<!-- Input -->
			<div class="sticky bottom-4">
				<WebSearchInput 
					onSubmit={handleSearch} 
					isLoading={isSearching}
					placeholder="Ask a follow-up question..."
				/>
			</div>
		</div>
	{:else}
		<!-- Hero section with search -->
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
				isLoading={isSearching}
				placeholder="What would you like to know?"
			/>
			
			{#if error}
				<p class="mt-4 text-sm text-destructive">{error}</p>
			{/if}
		</div>

		<!-- Discovery feed -->
		<div class="max-w-screen-lg mx-auto mt-8">
			<DiscoveryFeed />
		</div>
	{/if}
</div>
