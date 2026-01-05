<script lang="ts">
	import { X, MessageSquare, FileText, Link, PanelRightClose } from '@lucide/svelte';
	import {
		synthArtifactStore,
		synthThreadStore,
		synthSourceStore,
		synthWorkspaceStore,
		type TabItem
	} from '$lib/stores/synthesize';

	interface Props {
		column: 'left' | 'right';
		tabs: TabItem[];
		activeTabId: string | null;
		onTabSelect: (id: string) => void;
		onTabClose: (id: string) => void;
		showClosePanel?: boolean;
		onClosePanel?: () => void;
	}

	let {
		column,
		tabs,
		activeTabId,
		onTabSelect,
		onTabClose,
		showClosePanel = false,
		onClosePanel
	}: Props = $props();

	function getTabTitle(tab: TabItem): string {
		if (tab.type === 'artifact') {
			const artifact = synthArtifactStore.artifacts.find((a) => a.id === tab.id);
			if (artifact) {
				return artifact.versions[artifact.currentVersionIndex]?.title || 'Untitled';
			}
		} else if (tab.type === 'thread') {
			const thread = synthThreadStore.threads.find((t) => t.id === tab.id);
			return thread?.title || 'Chat';
		} else if (tab.type === 'source') {
			const source = synthSourceStore.sources.find((s) => s.id === tab.id);
			return source?.title || 'Source';
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
	{#if tabs.length > 0}
		<div class="flex h-10 items-center gap-1 border-b border-zinc-800 bg-zinc-900/50 px-2">
			<div class="flex flex-1 gap-1 overflow-x-auto">
			{#each tabs as tab (tab.id)}
				{@const TabIcon = getTabIcon(tab.type)}
				<div
					onclick={() => onTabSelect(tab.id)}
					onkeydown={(e) => e.key === 'Enter' && onTabSelect(tab.id)}
					role="tab"
					tabindex="0"
					aria-selected={activeTabId === tab.id}
					class="group flex cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-sm transition-colors {activeTabId ===
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
			</div>

			{#if showClosePanel && onClosePanel}
				<button
					onclick={onClosePanel}
					class="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
					title="Close panel"
				>
					<PanelRightClose class="h-4 w-4" />
				</button>
			{/if}
		</div>
	{/if}

	<!-- Content area -->
	<div class="flex-1 overflow-hidden">
		{#if tabs.length === 0}
			<div class="flex h-full items-center justify-center text-zinc-600">
				<p class="text-sm">No tabs open</p>
			</div>
		{:else if activeTabId}
			{@const activeTab = tabs.find((t) => t.id === activeTabId)}
			{#if activeTab}
				{#if activeTab.type === 'thread'}
					<!-- Thread/Chat content will be rendered here -->
					<slot name="thread" {activeTabId} />
				{:else if activeTab.type === 'artifact'}
					<!-- File editor content will be rendered here -->
					<slot name="artifact" {activeTabId} />
				{:else if activeTab.type === 'source'}
					<!-- Source viewer content will be rendered here -->
					<slot name="source" {activeTabId} />
				{/if}
			{/if}
		{/if}
	</div>
</div>

