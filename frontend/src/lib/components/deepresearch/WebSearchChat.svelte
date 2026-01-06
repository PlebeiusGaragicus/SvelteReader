<script lang="ts">
	import { Bot, User, Loader2, Copy, Check, ChevronDown, ChevronUp } from '@lucide/svelte';
	import { MarkdownRenderer } from '$lib/components/chat';
	import SourceCitations from './SourceCitations.svelte';
	import ToolCallDisplay from './ToolCallDisplay.svelte';

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
		currentPhase?: 'idle' | 'clarifying' | 'planning' | 'researching' | 'synthesizing' | 'classifying' | 'searching';
	}

	let { 
		messages, 
		isLoading = false, 
		streamingContent = '', 
		currentPhase = 'idle'
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
			case 'clarifying': return 'Clarifying your request...';
			case 'planning': return 'Planning research strategy...';
			case 'researching': return 'Conducting deep research...';
			case 'synthesizing': return 'Synthesizing findings...';
			case 'classifying': return 'Analyzing query...';
			case 'searching': return 'Searching the web...';
			default: return 'Thinking...';
		}
	}
</script>

<div class="flex flex-col gap-6">
	{#each messages as message (message.id)}
		{@const isUser = message.role === 'user'}
		{@const hasContent = message.content && message.content.trim() !== ''}
		{@const hasToolCalls = !isUser && message.toolCalls && message.toolCalls.length > 0}
		
		{#if isUser}
			<!-- User Message -->
			<div class="flex gap-3 justify-end">
				<div class="flex flex-col items-end gap-1 max-w-[85%]">
					<div class="rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground">
						<p class="text-sm whitespace-pre-wrap">{message.content}</p>
					</div>
				</div>
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
					<User class="h-4 w-4 text-muted-foreground" />
				</div>
			</div>
		{:else}
			<!-- Assistant Message -->
			<div class="flex gap-3">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
					<Bot class="h-4 w-4 text-white" />
				</div>
				
				<div class="flex flex-col gap-3 flex-1 min-w-0">
					<!-- Tool Calls -->
					{#if hasToolCalls}
						<div class="flex flex-col gap-2">
							{#each message.toolCalls as toolCall (toolCall.id)}
								<ToolCallDisplay {toolCall} />
							{/each}
						</div>
					{/if}

					<!-- Message Content -->
					{#if hasContent}
						<div class="rounded-2xl rounded-tl-md bg-muted px-4 py-3">
							<div class="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-ul:my-2 prose-li:my-0.5">
								<MarkdownRenderer content={message.content} />
							</div>
						</div>
					{/if}

					<!-- Sources -->
					{#if message.sources && message.sources.length > 0}
						<SourceCitations sources={message.sources} compact />
					{/if}

					<!-- Actions -->
					{#if hasContent && !message.isStreaming}
						<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<button
								onclick={() => copyToClipboard(message.content, message.id)}
								class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
								title="Copy message"
							>
								{#if copiedId === message.id}
									<Check class="h-3.5 w-3.5 text-green-500" />
									<span>Copied</span>
								{:else}
									<Copy class="h-3.5 w-3.5" />
									<span>Copy</span>
								{/if}
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/each}

	<!-- Streaming Response -->
	{#if isLoading && streamingContent}
		<div class="flex gap-3">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
				<Bot class="h-4 w-4 text-white" />
			</div>
			<div class="flex-1 min-w-0">
				<div class="rounded-2xl rounded-tl-md bg-muted px-4 py-3">
					<div class="prose prose-sm max-w-none dark:prose-invert">
						<MarkdownRenderer content={streamingContent} />
					</div>
				</div>
			</div>
		</div>
	{:else if isLoading}
		<!-- Loading Indicator -->
		<div class="flex gap-3">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
				<Bot class="h-4 w-4 text-white" />
			</div>
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3">
					<div class="flex items-center gap-1.5">
						<div class="h-2 w-2 rounded-full bg-foreground/40 animate-[pulse_1.4s_ease-in-out_infinite]"></div>
						<div class="h-2 w-2 rounded-full bg-foreground/40 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]"></div>
						<div class="h-2 w-2 rounded-full bg-foreground/40 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]"></div>
					</div>
					<span class="text-sm text-muted-foreground">{getPhaseText(currentPhase)}</span>
				</div>
			</div>
		</div>
	{/if}
</div>
