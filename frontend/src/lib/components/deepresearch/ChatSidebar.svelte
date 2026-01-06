<script lang="ts">
	import { 
		Plus, 
		Clock, 
		Trash2, 
		Search, 
		ChevronRight,
		MessageSquare,
		PanelLeftClose,
		PanelLeft,
		X
	} from '@lucide/svelte';
	import { deepResearchHistoryStore, type ResearchThread } from '$lib/stores/deepResearchHistory.svelte';

	interface Props {
		currentThreadId?: string | null;
		onSelectThread: (threadId: string) => void;
		onNewChat: () => void;
		collapsed?: boolean;
		onToggleCollapse?: () => void;
	}

	let { 
		currentThreadId, 
		onSelectThread, 
		onNewChat,
		collapsed = false,
		onToggleCollapse
	}: Props = $props();

	// Section expansion state
	let chatsExpanded = $state(true);
	
	// Search and filter state
	let searchQuery = $state('');
	let deleteConfirmId = $state<string | null>(null);

	// Simple time formatting
	function formatDistanceToNow(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);
		
		if (diffSec < 60) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHour < 24) return `${diffHour}h ago`;
		if (diffDay < 7) return `${diffDay}d ago`;
		if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
		return `${Math.floor(diffDay / 30)}mo ago`;
	}

	// Get threads - reactive to store changes
	const threads = $derived(deepResearchHistoryStore.threads);

	// Filter threads by search query
	const filteredThreads = $derived.by(() => {
		if (!searchQuery.trim()) {
			return threads;
		}
		const query = searchQuery.toLowerCase();
		return threads.filter(t => 
			t.title.toLowerCase().includes(query)
		);
	});

	// Group threads by date
	const groupedThreads = $derived.by(() => {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const weekAgo = new Date(today);
		weekAgo.setDate(weekAgo.getDate() - 7);
		const monthAgo = new Date(today);
		monthAgo.setMonth(monthAgo.getMonth() - 1);

		const groups: { label: string; threads: ResearchThread[] }[] = [
			{ label: 'Today', threads: [] },
			{ label: 'Yesterday', threads: [] },
			{ label: 'Previous 7 Days', threads: [] },
			{ label: 'Previous 30 Days', threads: [] },
			{ label: 'Older', threads: [] },
		];

		for (const thread of filteredThreads) {
			const date = new Date(thread.updatedAt);
			const isToday = date.toDateString() === today.toDateString();
			const isYesterday = date.toDateString() === yesterday.toDateString();
			
			if (isToday) {
				groups[0].threads.push(thread);
			} else if (isYesterday) {
				groups[1].threads.push(thread);
			} else if (date > weekAgo) {
				groups[2].threads.push(thread);
			} else if (date > monthAgo) {
				groups[3].threads.push(thread);
			} else {
				groups[4].threads.push(thread);
			}
		}

		return groups.filter(g => g.threads.length > 0);
	});

	function formatTime(dateString: string): string {
		try {
			return formatDistanceToNow(new Date(dateString));
		} catch {
			return 'Unknown';
		}
	}

	function handleDelete(threadId: string) {
		if (deleteConfirmId === threadId) {
			deepResearchHistoryStore.deleteThread(threadId);
			deleteConfirmId = null;
			if (currentThreadId === threadId) {
				onNewChat();
			}
		} else {
			deleteConfirmId = threadId;
			setTimeout(() => {
				if (deleteConfirmId === threadId) {
					deleteConfirmId = null;
				}
			}, 3000);
		}
	}

	function handleCreateThread() {
		onNewChat();
	}
</script>

<!-- Sidebar container -->
<div class="relative flex h-full">
	{#if collapsed}
		<!-- Collapsed state -->
		<div class="flex h-full w-14 flex-col items-center border-r border-border bg-secondary/30 py-3">
			<button
				onclick={onToggleCollapse}
				class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				title="Expand sidebar"
			>
				<PanelLeft class="h-5 w-5" />
			</button>
			
			<button
				onclick={handleCreateThread}
				class="mt-4 rounded-full bg-primary p-2.5 text-primary-foreground transition-opacity hover:opacity-90"
				title="New research"
			>
				<Plus class="h-5 w-5" />
			</button>
			
			<div class="flex flex-col items-center gap-1 flex-1 overflow-y-auto w-full px-2 mt-4">
				{#each deepResearchHistoryStore.recentThreads as thread (thread.id)}
					<button
						onclick={() => onSelectThread(thread.id)}
						class="p-2 rounded-lg transition-colors w-full
							{currentThreadId === thread.id 
								? 'bg-primary/10 text-primary' 
								: 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
						title={thread.title}
					>
						<MessageSquare class="h-5 w-5 mx-auto" />
					</button>
				{/each}
			</div>
		</div>
	{:else}
		<!-- Expanded state -->
		<div class="flex h-full w-64 flex-col border-r border-border bg-secondary/30">
			<!-- Header with collapse button -->
			<div class="flex items-center justify-between border-b border-border px-3 py-3">
				<span class="text-sm font-semibold text-foreground">Research History</span>
				<button
					onclick={onToggleCollapse}
					class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					title="Collapse sidebar"
				>
					<PanelLeftClose class="h-4 w-4" />
				</button>
			</div>

			<!-- Chats Section -->
			<div class="flex flex-col flex-1 min-h-0">
				<div class="flex w-full items-center justify-between px-3 py-2">
					<button
						onclick={() => (chatsExpanded = !chatsExpanded)}
						class="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronRight
							class="h-4 w-4 transition-transform {chatsExpanded ? 'rotate-90' : ''}"
						/>
						<span class="text-xs font-medium uppercase tracking-wider">Threads</span>
						<span class="text-xs text-muted-foreground">({threads.length})</span>
					</button>

					<button
						onclick={handleCreateThread}
						class="group/plus rounded-lg p-1.5 transition-colors hover:bg-muted"
						title="New research"
					>
						<Plus
							class="h-4 w-4 text-primary transition-all group-hover/plus:scale-110"
							strokeWidth={2.5}
						/>
					</button>
				</div>

				{#if chatsExpanded}
					<!-- Search -->
					<div class="px-3 py-2">
						<div class="relative">
							<Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
							<input
								type="text"
								bind:value={searchQuery}
								placeholder="Search..."
								class="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
							/>
							{#if searchQuery}
								<button
									onclick={() => { searchQuery = ''; }}
									class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								>
									<X class="h-3 w-3" />
								</button>
							{/if}
						</div>
					</div>

					<!-- Thread list -->
					<div class="flex-1 overflow-y-auto px-2 pb-2">
						{#if groupedThreads.length === 0}
							<div class="flex flex-col items-center justify-center py-8 text-center px-2">
								{#if searchQuery}
									<Search class="h-6 w-6 text-muted-foreground/50 mb-2" />
									<p class="text-xs text-muted-foreground">No results found</p>
								{:else}
									<MessageSquare class="h-6 w-6 text-muted-foreground/50 mb-2" />
									<p class="text-xs text-muted-foreground">No research history</p>
									<p class="text-[10px] text-muted-foreground/70 mt-1">
										Start a new research to see it here
									</p>
								{/if}
							</div>
						{:else}
							{#each groupedThreads as group (group.label)}
								<div class="mb-3">
									<h3 class="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
										{group.label}
									</h3>
									<div class="space-y-0.5">
										{#each group.threads as thread (thread.id)}
											{@const isActive = currentThreadId === thread.id}
											{@const isDeleting = deleteConfirmId === thread.id}
											
											<div class="group relative">
												<button
													onclick={() => onSelectThread(thread.id)}
													class="w-full text-left px-2.5 py-2 rounded-lg transition-colors
														{isActive 
															? 'bg-primary/10 text-foreground' 
															: 'hover:bg-muted/50 text-foreground/80'}"
												>
													<p class="text-xs font-medium truncate {isActive ? 'text-primary' : ''}">
														{thread.title}
													</p>
													<div class="flex items-center gap-1.5 mt-0.5">
														<Clock class="h-2.5 w-2.5 text-muted-foreground" />
														<span class="text-[10px] text-muted-foreground">
															{formatTime(thread.updatedAt)}
														</span>
														{#if thread.researchPhase === 'complete'}
															<span class="text-[10px] text-green-500">• Complete</span>
														{/if}
													</div>
												</button>
												
												<!-- Delete button -->
												<button
													onclick={(e) => { e.stopPropagation(); handleDelete(thread.id); }}
													class="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all
														{isDeleting 
															? 'bg-destructive text-destructive-foreground opacity-100' 
															: 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'}"
													title={isDeleting ? 'Click to confirm' : 'Delete'}
												>
													<Trash2 class="h-3 w-3" />
												</button>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			{#if threads.length > 0}
				<div class="border-t border-border px-3 py-2.5">
					<div class="flex items-center justify-between text-[10px] text-muted-foreground">
						<span>{threads.length} thread{threads.length !== 1 ? 's' : ''}</span>
						<button
							onclick={() => { 
								if (confirm('Clear all research history?')) {
									deepResearchHistoryStore.clearAll();
									onNewChat();
								}
							}}
							class="hover:text-destructive transition-colors"
						>
							Clear all
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
