<script lang="ts">
	import { Bot, User, Search, Globe, Loader2, Copy, Check, RefreshCw } from '@lucide/svelte';
	import SourceCitations from './SourceCitations.svelte';

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		sources?: Array<{ index: number; title: string; url: string; snippet?: string }>;
		isStreaming?: boolean;
		toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
	}

	interface Props {
		messages: ChatMessage[];
		isLoading?: boolean;
		streamingContent?: string;
		currentPhase?: 'idle' | 'classifying' | 'searching' | 'synthesizing';
		onRegenerate?: () => void;
	}

	let { 
		messages, 
		isLoading = false, 
		streamingContent = '', 
		currentPhase = 'idle',
		onRegenerate 
	}: Props = $props();

	let copiedId = $state<string | null>(null);

	async function copyToClipboard(content: string, messageId: string) {
		try {
			await navigator.clipboard.writeText(content);
			copiedId = messageId;
			setTimeout(() => { copiedId = null; }, 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}

	function getPhaseText(phase: typeof currentPhase): string {
		switch (phase) {
			case 'classifying': return 'Analyzing query...';
			case 'searching': return 'Searching the web...';
			case 'synthesizing': return 'Synthesizing answer...';
			default: return 'Thinking...';
		}
	}

	// Simple markdown parsing for chat messages
	function parseMarkdown(text: string): string {
		// Escape HTML first
		let result = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		
		// Headers
		result = result.replace(/^### (.+)$/gm, '<h3 class="mt-3 mb-1 text-base font-semibold">$1</h3>');
		result = result.replace(/^## (.+)$/gm, '<h2 class="mt-3 mb-1 text-lg font-semibold">$1</h2>');
		result = result.replace(/^# (.+)$/gm, '<h1 class="mt-3 mb-1 text-xl font-bold">$1</h1>');
		
		// Bold and italic
		result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
		result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
		
		// Inline code
		result = result.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">$1</code>');
		
		// Links with citation format [text](url)
		result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cyan-500 underline hover:no-underline">$1</a>');
		
		// Citation numbers [1], [2], etc.
		result = result.replace(/\[(\d+)\]/g, '<sup class="text-cyan-500 font-medium">[$1]</sup>');
		
		// Lists
		result = result.replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
		result = result.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>');
		
		// Paragraphs (simple newline handling)
		result = result.replace(/\n\n/g, '</p><p class="my-2">');
		result = '<p class="my-1">' + result + '</p>';
		
		return result;
	}
</script>

<div class="flex flex-col gap-4">
	{#each messages as message (message.id)}
		<div class="flex gap-3 {message.role === 'user' ? 'justify-end' : 'justify-start'}">
			{#if message.role === 'assistant'}
				<!-- Assistant avatar -->
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
					<Bot class="h-4 w-4 text-white" />
				</div>
			{/if}
			
			<div class="flex max-w-[85%] flex-col gap-2 {message.role === 'user' ? 'items-end' : 'items-start'}">
				<!-- Message bubble -->
				<div class="rounded-2xl px-4 py-3 {message.role === 'user' 
					? 'rounded-br-md bg-cyan-500 text-white' 
					: 'rounded-bl-md bg-muted'
				}">
					{#if message.content}
						{#if message.role === 'user'}
							<p class="text-sm">{message.content}</p>
						{:else}
							<div class="prose prose-sm max-w-none dark:prose-invert text-sm">
								{@html parseMarkdown(message.content)}
							</div>
						{/if}
					{:else if message.isStreaming}
						<div class="flex gap-1">
							<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 0ms"></span>
							<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 150ms"></span>
							<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 300ms"></span>
						</div>
					{/if}
				</div>

				<!-- Tool calls indicator -->
				{#if message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each message.toolCalls as toolCall}
							<div class="flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-600 dark:text-cyan-400">
								{#if toolCall.name === 'web_search'}
									<Search class="h-3 w-3" />
									<span>Searched: {toolCall.args?.query || 'web'}</span>
								{:else if toolCall.name === 'scrape_url'}
									<Globe class="h-3 w-3" />
									<span>Reading page...</span>
								{:else}
									<span>{toolCall.name}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Sources -->
				{#if message.role === 'assistant' && message.sources && message.sources.length > 0}
					<div class="w-full">
						<SourceCitations sources={message.sources} compact />
					</div>
				{/if}

				<!-- Actions for assistant messages -->
				{#if message.role === 'assistant' && !message.isStreaming && message.content}
					<div class="flex items-center gap-1">
						<button
							onclick={() => copyToClipboard(message.content, message.id)}
							class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							title="Copy message"
						>
							{#if copiedId === message.id}
								<Check class="h-3.5 w-3.5" />
							{:else}
								<Copy class="h-3.5 w-3.5" />
							{/if}
						</button>
						
						{#if onRegenerate}
							<button
								onclick={onRegenerate}
								class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
								title="Regenerate response"
							>
								<RefreshCw class="h-3.5 w-3.5" />
							</button>
						{/if}
					</div>
				{/if}
			</div>
			
			{#if message.role === 'user'}
				<!-- User avatar -->
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
					<User class="h-4 w-4 text-muted-foreground" />
				</div>
			{/if}
		</div>
	{/each}

	<!-- Streaming response indicator -->
	{#if isLoading && streamingContent}
		<div class="flex gap-3 justify-start">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
				<Bot class="h-4 w-4 text-white" />
			</div>
			<div class="flex max-w-[85%] flex-col gap-2">
				<div class="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
					<div class="prose prose-sm max-w-none dark:prose-invert text-sm">
						{@html parseMarkdown(streamingContent)}
					</div>
				</div>
			</div>
		</div>
	{:else if isLoading}
		<!-- Loading phase indicator -->
		<div class="flex gap-3 justify-start">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
				<Bot class="h-4 w-4 text-white" />
			</div>
			<div class="flex max-w-[85%] flex-col gap-2">
				<div class="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 class="h-4 w-4 animate-spin" />
						<span>{getPhaseText(currentPhase)}</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

