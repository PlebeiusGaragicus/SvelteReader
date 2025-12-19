<script lang="ts">
	import { MessageSquare, Trash2, Plus } from '@lucide/svelte';

	interface ThreadInfo {
		thread_id: string;
		created_at?: string;
		metadata?: Record<string, unknown>;
	}

	interface Props {
		threads: ThreadInfo[];
		currentThreadId: string | null;
		onSelectThread: (threadId: string) => void;
		onDeleteThread: (threadId: string) => void;
		onNewThread: () => void;
	}

	let { threads, currentThreadId, onSelectThread, onDeleteThread, onNewThread }: Props = $props();

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
		if (thread.metadata?.title) {
			return thread.metadata.title as string;
		}
		// Use first few characters of thread ID as fallback
		return `Chat ${thread.thread_id.slice(0, 8)}...`;
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center justify-between border-b border-border p-3">
		<h3 class="text-sm font-medium">History</h3>
		<button
			onclick={onNewThread}
			class="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
			title="New conversation"
		>
			<Plus class="h-4 w-4" />
		</button>
	</div>

	<div class="flex-1 overflow-y-auto p-2">
		{#if threads.length === 0}
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
							onclick={() => onSelectThread(thread.thread_id)}
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
