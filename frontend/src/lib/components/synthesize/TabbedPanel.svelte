<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X, MessageSquare, FileText, Link, PanelRightClose, PanelRightOpen } from '@lucide/svelte';
	import {
		synthArtifactStore,
		synthThreadStore,
		synthSourceStore,
		synthWorkspaceStore,
		type TabItem,
		type TabType
	} from '$lib/stores/synthesize';
	import NewTabMenu from './NewTabMenu.svelte';

	interface Props {
		column: 'left' | 'right';
		tabs: TabItem[];
		activeTabId: string | null;
		onTabSelect: (id: string) => void;
		onTabClose: (id: string) => void;
		showClosePanel?: boolean;
		onClosePanel?: () => void;
		thread?: Snippet<[{ activeTabId: string }]>;
		artifact?: Snippet<[{ activeTabId: string }]>;
		source?: Snippet<[{ activeTabId: string }]>;
	}

	let {
		column,
		tabs,
		activeTabId,
		onTabSelect,
		onTabClose,
		showClosePanel = false,
		onClosePanel,
		thread,
		artifact,
		source
	}: Props = $props();

	// Drag and drop state
	let isDraggingOver = $state(false);
	let isDraggingRightEdge = $state(false);

	function getTabTitle(tab: TabItem): string {
		if (tab.type === 'artifact') {
			const art = synthArtifactStore.artifacts.find((a) => a.id === tab.id);
			if (art) {
				return art.versions[art.currentVersionIndex]?.title || 'Untitled';
			}
		} else if (tab.type === 'thread') {
			const thr = synthThreadStore.threads.find((t) => t.id === tab.id);
			return thr?.title || 'Chat';
		} else if (tab.type === 'source') {
			const src = synthSourceStore.sources.find((s) => s.id === tab.id);
			return src?.title || 'Source';
		}
		return 'Unknown';
	}

	function getTabIcon(type: TabItem['type']) {
		switch (type) {
			case 'thread':
				return MessageSquare;
			case 'artifact':
				return FileText;
			case 'source':
				return Link;
			default:
				return FileText;
		}
	}

	function handleClose(id: string, e: Event) {
		e.stopPropagation();
		onTabClose(id);
	}

	// Drag and drop handlers
	function handleDragStart(e: DragEvent, tabId: string, tabType: string) {
		if (e.dataTransfer) {
			e.dataTransfer.setData('application/svelte-tab-id', tabId);
			e.dataTransfer.setData('application/svelte-tab-type', tabType);
			e.dataTransfer.setData('application/svelte-tab-source-column', column);
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const wasDraggingRightEdge = isDraggingRightEdge;
		isDraggingOver = false;
		isDraggingRightEdge = false;

		const id = e.dataTransfer?.getData('application/svelte-tab-id');
		const type = e.dataTransfer?.getData('application/svelte-tab-type') as TabType | undefined;
		const sourceColumn = e.dataTransfer?.getData('application/svelte-tab-source-column');

		if (!id || !type) return;

		// Determine target column
		let targetColumn: 'left' | 'right' = column;
		if (column === 'left' && synthWorkspaceStore.rightPanelCollapsed && wasDraggingRightEdge) {
			targetColumn = 'right';
		}

		if (sourceColumn && (sourceColumn === 'left' || sourceColumn === 'right')) {
			if (sourceColumn !== targetColumn) {
				synthWorkspaceStore.moveTab(id, sourceColumn as 'left' | 'right', targetColumn);
			}
		} else {
			// Sidebar drag or unknown source
			synthWorkspaceStore.openItem(id, type, targetColumn);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		isDraggingOver = true;

		if (column === 'left' && synthWorkspaceStore.rightPanelCollapsed) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const x = e.clientX - rect.left;
			isDraggingRightEdge = x > rect.width * 0.8; // Right 20%
		} else {
			isDraggingRightEdge = false;
		}
	}

	function handleDragLeave() {
		isDraggingOver = false;
		isDraggingRightEdge = false;
	}
</script>

<div
	class="relative flex h-full flex-col bg-zinc-950"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="region"
	aria-label="Tabbed workspace panel"
>
	<!-- Drag over overlay -->
	{#if isDraggingOver}
		<div
			class="pointer-events-none absolute inset-0 z-50 border-2 border-violet-500/30 transition-all
				{isDraggingRightEdge
				? 'border-r-4 border-r-violet-500/50 bg-gradient-to-l from-violet-500/10 to-transparent'
				: 'bg-violet-500/5'}"
		>
			{#if isDraggingRightEdge}
				<div
					class="absolute right-4 top-1/2 -translate-y-1/2 rounded bg-violet-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg"
				>
					Split Right
				</div>
			{/if}
		</div>
	{/if}

	<!-- Tab bar -->
	<div class="flex h-10 items-center border-b border-zinc-800 bg-zinc-900/50">
		<!-- Tabs and + button grouped together, scrolling if needed -->
		<div class="flex flex-1 items-center gap-0.5 overflow-x-auto px-1">
			{#each tabs as tab (tab.id)}
				{@const TabIcon = getTabIcon(tab.type)}
				<div
					onclick={() => onTabSelect(tab.id)}
					onkeydown={(e) => e.key === 'Enter' && onTabSelect(tab.id)}
					role="tab"
					tabindex="0"
					aria-selected={activeTabId === tab.id}
					draggable="true"
					ondragstart={(e) => handleDragStart(e, tab.id, tab.type)}
					class="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-sm transition-colors {activeTabId ===
					tab.id
						? 'bg-zinc-800 text-zinc-100'
						: 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'}"
				>
					<TabIcon class="h-3.5 w-3.5 shrink-0" />
					<span class="max-w-[100px] truncate">{getTabTitle(tab)}</span>
					<button
						onclick={(e) => handleClose(tab.id, e)}
						class="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-zinc-700 group-hover:opacity-100"
					>
						<X class="h-3 w-3" />
					</button>
				</div>
			{/each}

			<!-- New tab button - positioned right after last tab -->
			<NewTabMenu {column} />
		</div>

		<!-- Open right panel button (when left column and right is collapsed) -->
		{#if column === 'left' && synthWorkspaceStore.rightPanelCollapsed}
			<button
				onclick={() => synthWorkspaceStore.toggleRightPanel()}
				class="shrink-0 border-l border-zinc-800 px-3 py-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
				title="Open right panel"
			>
				<PanelRightOpen class="h-4 w-4" />
			</button>
		{/if}

		<!-- Close panel button stays on the right -->
		{#if showClosePanel && onClosePanel}
			<button
				onclick={onClosePanel}
				class="shrink-0 border-l border-zinc-800 px-3 py-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
				title="Close panel"
			>
				<PanelRightClose class="h-4 w-4" />
			</button>
		{/if}
	</div>

	<!-- Content area -->
	<div class="flex-1 overflow-hidden">
		{#if tabs.length === 0}
			<div class="flex h-full flex-col items-center justify-center gap-4 text-zinc-600">
				<p class="text-sm">No tabs open</p>
				<p class="text-xs">Click the + button to get started</p>
			</div>
		{:else if activeTabId}
			{@const activeTab = tabs.find((t) => t.id === activeTabId)}
			{#if activeTab}
				{#if activeTab.type === 'thread' && thread}
					{@render thread({ activeTabId })}
				{:else if activeTab.type === 'artifact' && artifact}
					{@render artifact({ activeTabId })}
				{:else if activeTab.type === 'source' && source}
					{@render source({ activeTabId })}
				{/if}
			{/if}
		{/if}
	</div>
</div>
