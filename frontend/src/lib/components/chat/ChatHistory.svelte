<script lang="ts">
	import { MessageSquare, Trash2 } from '@lucide/svelte';
	import type { ThreadInfo } from '$lib/stores/chat.svelte';

	interface Props {
		threads: ThreadInfo[];
		isLoading?: boolean;
		currentThreadId: string | null;
		onSelectThread: (threadId: string) => void;
		onDeleteThread: (threadId: string) => void;
		onNewThread: () => void;
	}

	let { threads, isLoading = false, currentThreadId, onSelectThread, onDeleteThread, onNewThread }: Props = $props();

	function formatDate(dateStr?: string): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return 'Today';
		} else if (diffDays === 1) {
			return 'Yesterday';
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		} else {
			return date.toLocaleDateString();
		}
	}

	function getThreadTitle(thread: ThreadInfo): string {
		// Use extracted title from first message if available
		if (thread.title) {
			return thread.title;
		}
		// Fall back to metadata title
		if (thread.metadata?.title) {
			return thread.metadata.title as string;
		}
		// Use first few characters of thread ID as fallback
		return `Chat ${thread.thread_id.slice(0, 8)}...`;
	}
</script>

<div class="flex h-full flex-col" onclick={(e) => e.stopPropagation()} role="presentation">
	<div class="flex-1 overflow-y-auto p-2">
		{#if isLoading}
			<!-- Loading skeleton -->
			<div class="flex flex-col gap-1">
				{#each Array(5) as _, i}
					<div class="flex flex-col gap-1.5 rounded-lg px-3 py-2">
						<div class="h-4 w-3/4 animate-pulse rounded bg-muted"></div>
						<div class="h-3 w-1/3 animate-pulse rounded bg-muted"></div>
					</div>
				{/each}
			</div>
		{:else if threads.length === 0}
			<div class="flex flex-col items-center justify-center py-8 text-center">
				<MessageSquare class="mb-2 h-8 w-8 text-muted-foreground/50" />
				<p class="text-xs text-muted-foreground">No conversations yet</p>
			</div>
		{:else}
			<div class="flex flex-col gap-1">
				{#each threads as thread (thread.thread_id)}
					<div
						class="group relative flex items-center rounded-lg px-3 py-2 transition-colors {currentThreadId === thread.thread_id ? 'bg-accent' : 'hover:bg-muted'}"
					>
					<button
						onclick={(e) => {
							e.stopPropagation();
							onSelectThread(thread.thread_id);
						}}
						class="flex flex-1 flex-col items-start gap-0.5 text-left"
					>
							<span class="line-clamp-1 text-sm">
								{getThreadTitle(thread)}
							</span>
							{#if thread.created_at}
								<span class="text-xs text-muted-foreground">
									{formatDate(thread.created_at)}
								</span>
							{/if}
						</button>

						<button
							onclick={(e) => {
								e.stopPropagation();
								onDeleteThread(thread.thread_id);
							}}
							class="absolute right-2 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:inline-flex"
							title="Delete conversation"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
