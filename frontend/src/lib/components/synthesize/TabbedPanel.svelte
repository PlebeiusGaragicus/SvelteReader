<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X, MessageSquare, FileText, Link, PanelRightClose } from '@lucide/svelte';
	import {
		synthArtifactStore,
		synthThreadStore,
		synthSourceStore,
		synthWorkspaceStore,
		type TabItem
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
</script>

<div class="flex h-full flex-col bg-zinc-950">
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
