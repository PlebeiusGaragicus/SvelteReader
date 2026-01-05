<script lang="ts">
	import { Bot, User, Search, Globe, Loader2, Copy, Check, RefreshCw, ChevronDown, ChevronUp } from '@lucide/svelte';
	import SourceCitations from './SourceCitations.svelte';

	interface ToolCallWithStatus {
		id: string;
		name: string;
		args: Record<string, unknown>;
		status: 'pending' | 'executing' | 'completed' | 'error';
		result?: { content: string };
	}

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		sources?: Array<{ index: number; title: string; url: string; snippet?: string }>;
		isStreaming?: boolean;
		toolCalls?: ToolCallWithStatus[];
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
	let expandedToolCalls = $state<Set<string>>(new Set());

	function toggleToolCallExpand(toolCallId: string) {
		const newSet = new Set(expandedToolCalls);
		if (newSet.has(toolCallId)) {
			newSet.delete(toolCallId);
		} else {
			newSet.add(toolCallId);
		}
		expandedToolCalls = newSet;
	}

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

	function getToolCallIcon(name: string) {
		switch (name) {
			case 'web_search': return Search;
			case 'scrape_url': return Globe;
			default: return Search;
		}
	}

	function formatToolCallDisplay(toolCall: ToolCallWithStatus): { icon: typeof Search; text: string; details?: string } {
		switch (toolCall.name) {
			case 'web_search': {
				const query = toolCall.args.query as string;
				return { 
					icon: Search, 
					text: toolCall.status === 'completed' ? 'Searched for:' : 'Searching for:',
					details: query ? `"${query}"` : undefined
				};
			}
			case 'scrape_url': {
				const url = toolCall.args.url as string;
				const domain = url ? new URL(url).hostname.replace('www.', '') : 'page';
				return { 
					icon: Globe, 
					text: toolCall.status === 'completed' ? 'Read:' : 'Reading:',
					details: domain
				};
			}
			default:
				return { 
					icon: Search, 
					text: `${toolCall.name}`,
					details: undefined
				};
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
		result = result.replace(/\[(\d+)\]/g, '<sup class="text-cyan-500 font-medium cursor-pointer hover:text-cyan-400">[$1]</sup>');
		
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
		{@const isUser = message.role === 'user'}
		{@const hasContent = message.content && message.content.trim() !== ''}
		{@const hasToolCalls = !isUser && message.toolCalls && message.toolCalls.length > 0}
		
		<div class="flex gap-3 {isUser ? 'justify-end' : 'justify-start'}">
			{#if !isUser}
				<!-- Assistant avatar -->
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
					<Bot class="h-4 w-4 text-white" />
				</div>
			{/if}
			
			<div class="flex max-w-[85%] flex-col gap-2 {isUser ? 'items-end' : 'items-start'}">
				<!-- Message bubble (only if has content) -->
				{#if hasContent}
					<div class="rounded-2xl px-4 py-3 {isUser 
						? 'rounded-br-md bg-cyan-500 text-white' 
						: 'rounded-bl-md bg-muted'
					}">
						{#if isUser}
							<p class="text-sm">{message.content}</p>
						{:else}
							<div class="prose prose-sm max-w-none dark:prose-invert text-sm">
								{@html parseMarkdown(message.content)}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Tool calls display - shows what searches were performed -->
				{#if hasToolCalls}
					<div class="flex flex-col gap-1.5 w-full">
						{#each message.toolCalls as toolCall (toolCall.id)}
							{@const formatted = formatToolCallDisplay(toolCall)}
							{@const Icon = formatted.icon}
							{@const isExpanded = expandedToolCalls.has(toolCall.id)}
							
							<div class="rounded-lg border border-cyan-500/20 bg-cyan-500/5 overflow-hidden">
								<!-- Tool call header -->
								<button
									onclick={() => toggleToolCallExpand(toolCall.id)}
									class="flex items-center gap-2 w-full px-3 py-2 text-sm text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
								>
									<Icon class="h-4 w-4 shrink-0" />
									<span class="font-medium">{formatted.text}</span>
									{#if formatted.details}
										<span class="text-cyan-700 dark:text-cyan-300 italic truncate">{formatted.details}</span>
									{/if}
									
									{#if toolCall.status === 'pending' || toolCall.status === 'executing'}
										<Loader2 class="h-3.5 w-3.5 animate-spin ml-auto" />
									{:else if toolCall.result}
										<div class="ml-auto">
											{#if isExpanded}
												<ChevronUp class="h-4 w-4 opacity-50" />
											{:else}
												<ChevronDown class="h-4 w-4 opacity-50" />
											{/if}
										</div>
									{/if}
								</button>
								
								<!-- Expanded tool result -->
								{#if isExpanded && toolCall.result?.content}
									<div class="border-t border-cyan-500/20 px-3 py-2 bg-muted/50">
										<p class="text-xs text-muted-foreground mb-1">Result:</p>
										<div class="text-sm text-foreground/80 max-h-32 overflow-y-auto">
											<pre class="whitespace-pre-wrap break-all font-mono text-xs">{toolCall.result.content.slice(0, 500)}{toolCall.result.content.length > 500 ? '...' : ''}</pre>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Sources -->
				{#if !isUser && message.sources && message.sources.length > 0}
					<div class="w-full">
						<SourceCitations sources={message.sources} compact />
					</div>
				{/if}

				<!-- Actions for assistant messages -->
				{#if !isUser && !message.isStreaming && hasContent}
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
			
			{#if isUser}
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
