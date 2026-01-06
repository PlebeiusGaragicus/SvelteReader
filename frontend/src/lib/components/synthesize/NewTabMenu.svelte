<script lang="ts">
	import {
		Plus,
		MessageSquare,
		FileText,
		Link,
		X,
		Search,
		FilePlus,
		MessageSquarePlus,
		Globe2
	} from '@lucide/svelte';
	import {
		synthProjectStore,
		synthWorkspaceStore,
		synthSourceStore,
		synthArtifactStore,
		synthThreadStore
	} from '$lib/stores/synthesize';
	import type { TabType } from '$lib/stores/synthesize/types';

	interface Props {
		column: 'left' | 'right';
	}

	let { column }: Props = $props();

	let isOpen = $state(false);
	let isSearching = $state(false);
	let searchTerm = $state('');
	let showSourceInput = $state(false);
	let sourceUrl = $state('');
	let sourceTitle = $state('');
	
	// Button reference for positioning dropdown
	let buttonRef = $state<HTMLButtonElement | null>(null);
	let dropdownPosition = $state({ top: 0, left: 0 });

	const currentProjectId = $derived(synthProjectStore.currentProjectId);

	// Search results across files, threads, and sources
	const searchResults = $derived.by(() => {
		const term = searchTerm.toLowerCase().trim();
		const projectId = currentProjectId || '';

		const projectFiles = synthArtifactStore.getProjectArtifacts(projectId);
		const projectThreads = synthThreadStore.getProjectThreads(projectId);
		const projectSources = synthSourceStore.getProjectSources(projectId);

		const filteredFiles = projectFiles
			.filter((f) => {
				const title = f.versions[f.currentVersionIndex]?.title?.toLowerCase() || '';
				return title.includes(term);
			})
			.map((f) => ({
				id: f.id,
				type: 'artifact' as TabType,
				title: f.versions[f.currentVersionIndex]?.title || 'Untitled',
				icon: FileText
			}));

		const filteredThreads = projectThreads
			.filter((t) => {
				return t.title.toLowerCase().includes(term);
			})
			.map((t) => ({
				id: t.id,
				type: 'thread' as TabType,
				title: t.title,
				icon: MessageSquare
			}));

		const filteredSources = projectSources
			.filter((s) => {
				return s.title.toLowerCase().includes(term) || s.url.toLowerCase().includes(term);
			})
			.map((s) => ({
				id: s.id,
				type: 'source' as TabType,
				title: s.title,
				icon: Link
			}));

		return [...filteredFiles, ...filteredThreads, ...filteredSources];
	});

	function handleNewChat() {
		synthWorkspaceStore.createNewThread(column);
		closeMenu();
	}

	function handleNewFile() {
		synthWorkspaceStore.createNewFile(column);
		closeMenu();
	}

	function handleAddSource() {
		showSourceInput = true;
	}

	function toggleSearch() {
		isSearching = !isSearching;
		if (isSearching) {
			searchTerm = '';
		}
	}

	function handleOpenItem(id: string, type: TabType) {
		synthWorkspaceStore.openItem(id, type, column);
		closeMenu();
	}

	async function submitSource() {
		if (!sourceUrl.trim() || !currentProjectId) return;

		let title = sourceTitle.trim();
		if (!title) {
			try {
				title = new URL(sourceUrl).hostname;
			} catch {
				title = 'Source';
			}
		}

		// Create the source
		const source = synthSourceStore.createSource(
			currentProjectId,
			title,
			sourceUrl.trim(),
			'', // Content will be fetched later
			{}
		);

		// Open it in the workspace
		synthWorkspaceStore.openItem(source.id, 'source', column);
		closeMenu();
	}

	function cancelSourceInput() {
		sourceUrl = '';
		sourceTitle = '';
		showSourceInput = false;
	}

	function closeMenu() {
		isOpen = false;
		isSearching = false;
		showSourceInput = false;
		searchTerm = '';
		sourceUrl = '';
		sourceTitle = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showSourceInput) {
				cancelSourceInput();
			} else if (isSearching) {
				isSearching = false;
				searchTerm = '';
			} else {
				closeMenu();
			}
		} else if (e.key === 'Enter' && showSourceInput) {
			submitSource();
		}
	}
</script>

<div class="relative shrink-0">
	<button
		bind:this={buttonRef}
		onclick={() => {
			if (buttonRef) {
				const rect = buttonRef.getBoundingClientRect();
				dropdownPosition = { top: rect.bottom + 4, left: rect.left };
			}
			isOpen = !isOpen;
		}}
		class="flex items-center justify-center rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
		title="New tab"
	>
		<Plus class="h-4 w-4" />
	</button>

	{#if isOpen}
		<!-- Backdrop -->
		<div
			class="fixed inset-0 z-40"
			onclick={closeMenu}
			onkeydown={(e) => e.key === 'Escape' && closeMenu()}
			role="presentation"
		></div>

		<!-- Dropdown Menu - Fixed position to avoid overflow clipping -->
		<div
			class="fixed z-50 w-64 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl"
			style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px;"
			onkeydown={handleKeydown}
			role="menu"
			tabindex="-1"
		>
			{#if showSourceInput}
				<!-- Source URL Input -->
				<div class="space-y-2 p-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-zinc-400">Add Source URL</span>
						<button
							onclick={cancelSourceInput}
							class="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
						>
							<X class="h-3 w-3" />
						</button>
					</div>
					<input
						type="url"
						bind:value={sourceUrl}
						placeholder="https://example.com/article"
						class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
						autofocus
					/>
					<input
						type="text"
						bind:value={sourceTitle}
						placeholder="Title (optional)"
						class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
					/>
					<button
						onclick={submitSource}
						disabled={!sourceUrl.trim()}
						class="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
					>
						Add Source
					</button>
				</div>
			{:else if isSearching}
				<!-- Search Mode -->
				<div class="p-2">
					<div class="relative">
						<Search
							class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
						/>
						<input
							type="text"
							bind:value={searchTerm}
							placeholder="Search files & chats..."
							class="w-full rounded bg-zinc-800 py-1.5 pl-8 pr-3 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500/50"
							autofocus
						/>
					</div>
				</div>
				<div class="max-h-[300px] overflow-y-auto py-1">
					{#each searchResults as result}
						{@const Icon = result.icon}
						<button
							onclick={() => handleOpenItem(result.id, result.type)}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
						>
							<Icon class="h-3.5 w-3.5 flex-shrink-0" />
							<span class="truncate">{result.title}</span>
						</button>
					{:else}
						<div class="px-3 py-4 text-center text-xs text-zinc-600">No results found</div>
					{/each}
				</div>
			{:else}
				<!-- Main Menu -->
				<button
					onclick={handleNewFile}
					class="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
					role="menuitem"
				>
					<FilePlus class="h-4 w-4 text-emerald-400" />
					New File
				</button>
				<button
					onclick={handleNewChat}
					class="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
					role="menuitem"
				>
					<MessageSquarePlus class="h-4 w-4 text-blue-400" />
					New Chat
				</button>
				<button
					onclick={handleAddSource}
					class="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
					role="menuitem"
				>
					<Globe2 class="h-4 w-4 text-amber-400" />
					Add Source
				</button>
				<div class="my-1 border-t border-zinc-800"></div>
				<button
					onclick={toggleSearch}
					class="flex w-full items-center justify-between rounded px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
					role="menuitem"
				>
					<div class="flex items-center gap-2">
						<Search class="h-4 w-4 text-zinc-500" />
						Open...
					</div>
					<span class="text-[10px] text-zinc-600">⌘K</span>
				</button>
			{/if}
		</div>
	{/if}
</div>
