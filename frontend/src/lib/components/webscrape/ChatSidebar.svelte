<script lang="ts">
	import { 
		Plus, 
		Clock, 
		Trash2, 
		Search, 
		ChevronLeft, 
		ChevronRight,
		MessageSquare,
		BookOpen,
		X
	} from '@lucide/svelte';
	import { webSearchHistoryStore, type ChatThread } from '$lib/stores/webSearchHistory.svelte';

	// Simple time formatting (replaces date-fns formatDistanceToNow)
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

	let searchQuery = $state('');
	let deleteConfirmId = $state<string | null>(null);

	// Filter threads by search query
	const filteredThreads = $derived.by(() => {
		if (!searchQuery.trim()) {
			return webSearchHistoryStore.threads;
		}
		const query = searchQuery.toLowerCase();
		return webSearchHistoryStore.threads.filter(t => 
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

		const groups: { label: string; threads: ChatThread[] }[] = [
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
			webSearchHistoryStore.deleteThread(threadId);
			deleteConfirmId = null;
			// If deleted current thread, start new chat
			if (currentThreadId === threadId) {
				onNewChat();
			}
		} else {
			deleteConfirmId = threadId;
			// Auto-clear confirmation after 3 seconds
			setTimeout(() => {
				if (deleteConfirmId === threadId) {
					deleteConfirmId = null;
				}
			}, 3000);
		}
	}

	function getDomainFromSources(thread: ChatThread): string[] {
		const domains = new Set<string>();
		for (const source of thread.sources.slice(0, 3)) {
			try {
				const url = new URL(source.url);
				domains.add(url.hostname.replace('www.', ''));
			} catch {
				// Skip invalid URLs
			}
		}
		return Array.from(domains);
	}
</script>

{#if collapsed}
	<!-- Collapsed sidebar - just icons -->
	<div class="flex flex-col items-center w-16 py-4 bg-secondary/50 border-r border-border h-full">
		{#if onToggleCollapse}
			<button
				onclick={() => onToggleCollapse()}
				class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-4"
				title="Expand sidebar"
			>
				<ChevronRight class="h-5 w-5" />
			</button>
		{/if}
		
		<button
			onclick={() => onNewChat()}
			class="p-2.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity mb-6"
			title="New search"
		>
			<Plus class="h-5 w-5" />
		</button>
		
		<div class="flex flex-col items-center gap-2 flex-1 overflow-y-auto w-full px-2">
			{#each webSearchHistoryStore.recentThreads as thread (thread.id)}
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
		
		<button
			onclick={() => { /* Could open library view */ }}
			class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mt-4"
			title="Library"
		>
			<BookOpen class="h-5 w-5" />
		</button>
	</div>
{:else}
	<!-- Expanded sidebar -->
	<div class="flex flex-col w-72 bg-secondary/30 border-r border-border h-full">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-border">
			<h2 class="font-semibold text-sm">Search History</h2>
			<div class="flex items-center gap-1">
				<button
					onclick={() => onNewChat()}
					class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
					title="New search"
				>
					<Plus class="h-4 w-4" />
				</button>
				{#if onToggleCollapse}
					<button
						onclick={() => onToggleCollapse()}
						class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
						title="Collapse sidebar"
					>
						<ChevronLeft class="h-4 w-4" />
					</button>
				{/if}
			</div>
		</div>
		
		<!-- Search -->
		<div class="px-3 py-2">
			<div class="relative">
				<Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search history..."
					class="w-full pl-8 pr-8 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
				/>
				{#if searchQuery}
					<button
						onclick={() => { searchQuery = ''; }}
						class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
		</div>
		
		<!-- Thread list -->
		<div class="flex-1 overflow-y-auto px-2 pb-4">
			{#if groupedThreads.length === 0}
				<div class="flex flex-col items-center justify-center py-8 text-center px-4">
					{#if searchQuery}
						<Search class="h-8 w-8 text-muted-foreground/50 mb-2" />
						<p class="text-sm text-muted-foreground">No results found</p>
					{:else}
						<MessageSquare class="h-8 w-8 text-muted-foreground/50 mb-2" />
						<p class="text-sm text-muted-foreground">No search history yet</p>
						<p class="text-xs text-muted-foreground/70 mt-1">Your searches will appear here</p>
					{/if}
				</div>
			{:else}
				{#each groupedThreads as group (group.label)}
					<div class="mb-3">
						<h3 class="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
							{group.label}
						</h3>
						<div class="space-y-0.5">
							{#each group.threads as thread (thread.id)}
								{@const isActive = currentThreadId === thread.id}
								{@const isDeleting = deleteConfirmId === thread.id}
								{@const domains = getDomainFromSources(thread)}
								
								<div class="group relative">
									<button
										onclick={() => onSelectThread(thread.id)}
										class="w-full text-left px-3 py-2 rounded-lg transition-colors
											{isActive 
												? 'bg-primary/10 text-foreground' 
												: 'text-foreground/80 hover:bg-muted'}"
									>
										<div class="flex items-start gap-2">
											<div class="flex-1 min-w-0">
												<p class="text-sm font-medium truncate {isActive ? 'text-primary' : ''}">
													{thread.title}
												</p>
												<div class="flex items-center gap-2 mt-0.5">
													<span class="text-xs text-muted-foreground flex items-center gap-1">
														<Clock class="h-3 w-3" />
														{formatTime(thread.updatedAt)}
													</span>
													{#if domains.length > 0}
														<span class="text-xs text-muted-foreground/70 truncate max-w-[100px]">
															• {domains.slice(0, 2).join(', ')}
														</span>
													{/if}
												</div>
											</div>
										</div>
									</button>
									
									<!-- Delete button -->
									<button
										onclick={(e) => { e.stopPropagation(); handleDelete(thread.id); }}
										class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity
											{isDeleting 
												? 'bg-destructive text-destructive-foreground opacity-100' 
												: 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'}"
										title={isDeleting ? 'Click again to confirm' : 'Delete'}
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</div>
		
		<!-- Footer -->
		{#if webSearchHistoryStore.threads.length > 0}
			<div class="p-3 border-t border-border">
				<div class="flex items-center justify-between text-xs text-muted-foreground">
					<span>{webSearchHistoryStore.threads.length} searches</span>
					<button
						onclick={() => { 
							if (confirm('Clear all search history?')) {
								webSearchHistoryStore.clearAll();
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

