<script lang="ts">
	import { onMount } from 'svelte';
	import SynthSidebar from './SynthSidebar.svelte';
	import TabbedPanel from './TabbedPanel.svelte';
	import SynthChatPanel from './SynthChatPanel.svelte';
	import FileEditor from './FileEditor.svelte';
	import SourceViewer from './SourceViewer.svelte';
	import {
		synthArtifactStore,
		synthThreadStore,
		synthProjectStore,
		synthWorkspaceStore,
		synthSourceStore,
		synthAgentStore
	} from '$lib/stores/synthesize';
	import type { Artifact, Thread, Source } from '$lib/stores/synthesize/types';

	interface Props {
		userNpub?: string | null;
		onBackToProjects: () => void;
	}

	let { userNpub = null, onBackToProjects }: Props = $props();

	// Panel state
	let sidebarCollapsed = $state(false);
	let sidebarWidth = $state(240);
	let leftColumnWidth = $state(0);
	let isDraggingSidebar = $state(false);
	let isDraggingDivider = $state(false);

	const currentProjectId = $derived(synthProjectStore.currentProjectId);

	function handleSelectFile(artifact: Artifact) {
		synthWorkspaceStore.openItem(artifact.id, 'artifact');
	}

	function handleSelectThread(thread: Thread) {
		synthWorkspaceStore.openItem(thread.id, 'thread');
	}

	function handleSelectSource(source: Source) {
		synthWorkspaceStore.openItem(source.id, 'source');
	}

	function handleTabSelect(id: string, column: 'left' | 'right') {
		synthWorkspaceStore.selectTab(id, column);
	}

	function handleTabClose(id: string, column: 'left' | 'right') {
		synthWorkspaceStore.closeTab(id, column);
	}

	function handleToggleSidebar() {
		sidebarCollapsed = !sidebarCollapsed;
	}

	// Handle sidebar resize
	function handleSidebarMouseDown(e: MouseEvent) {
		if (sidebarCollapsed) return;
		e.preventDefault();
		isDraggingSidebar = true;
		document.addEventListener('mousemove', handleSidebarMouseMove);
		document.addEventListener('mouseup', handleSidebarMouseUp);
	}

	function handleSidebarMouseMove(e: MouseEvent) {
		if (!isDraggingSidebar) return;
		const newWidth = Math.max(180, Math.min(400, e.clientX));
		sidebarWidth = newWidth;
	}

	function handleSidebarMouseUp() {
		isDraggingSidebar = false;
		document.removeEventListener('mousemove', handleSidebarMouseMove);
		document.removeEventListener('mouseup', handleSidebarMouseUp);
	}

	// Handle middle divider resize
	function handleDividerMouseDown(e: MouseEvent) {
		if (synthWorkspaceStore.rightPanelCollapsed) return;
		e.preventDefault();
		isDraggingDivider = true;
		document.addEventListener('mousemove', handleDividerMouseMove);
		document.addEventListener('mouseup', handleDividerMouseUp);
	}

	function handleDividerMouseMove(e: MouseEvent) {
		if (!isDraggingDivider) return;
		const offset = sidebarCollapsed ? 48 : sidebarWidth;
		const availableWidth = window.innerWidth - offset;
		const newWidth = Math.max(300, Math.min(availableWidth - 300, e.clientX - offset));
		leftColumnWidth = newWidth;
	}

	function handleDividerMouseUp() {
		isDraggingDivider = false;
		document.removeEventListener('mousemove', handleDividerMouseMove);
		document.removeEventListener('mouseup', handleDividerMouseUp);
	}

	// Track previous project ID to detect project changes
	let previousProjectId: string | null = null;

	onMount(() => {
		const offset = sidebarCollapsed ? 48 : sidebarWidth;
		leftColumnWidth = (window.innerWidth - offset) / 2;

		if (currentProjectId) {
			synthArtifactStore.loadProjectArtifacts(currentProjectId);
			synthThreadStore.loadProjectThreads(currentProjectId);
			synthSourceStore.loadProjectSources(currentProjectId);
			previousProjectId = currentProjectId;
		}
	});

	$effect(() => {
		if (currentProjectId) {
			if (previousProjectId && previousProjectId !== currentProjectId) {
				// Save any unsaved work before switching projects
				synthArtifactStore.saveAllDirtyArtifacts();

				// Clear previous project state
				synthArtifactStore.clearProjectState();
				synthThreadStore.clearProjectState();
				synthSourceStore.clearProjectState();
				synthWorkspaceStore.clearProjectState();
				synthAgentStore.clearProjectState();
			}

			// Load project data
			if (previousProjectId !== currentProjectId) {
				synthArtifactStore.loadProjectArtifacts(currentProjectId);
				synthThreadStore.loadProjectThreads(currentProjectId);
				synthSourceStore.loadProjectSources(currentProjectId);
				previousProjectId = currentProjectId;
			}
		}
	});
</script>

<div class="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-zinc-950">
	<!-- Sidebar -->
	<div class="flex-shrink-0" style="width: {sidebarCollapsed ? '48px' : sidebarWidth + 'px'}">
		<SynthSidebar
			onSelectFile={handleSelectFile}
			onSelectThread={handleSelectThread}
			onSelectSource={handleSelectSource}
			collapsed={sidebarCollapsed}
			onToggleCollapse={handleToggleSidebar}
			{onBackToProjects}
		/>
	</div>

	<!-- Sidebar resize handle -->
	{#if !sidebarCollapsed}
		<div
			class="w-1 cursor-col-resize bg-zinc-800 transition-colors hover:bg-violet-500/50 {isDraggingSidebar
				? 'bg-violet-500'
				: ''}"
			onmousedown={handleSidebarMouseDown}
			role="separator"
			aria-orientation="vertical"
		></div>
	{/if}

	<!-- Main Workspace Area -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Left Column -->
		<div
			class="flex flex-col overflow-hidden"
			style="width: {synthWorkspaceStore.rightPanelCollapsed ? '100%' : leftColumnWidth + 'px'}"
		>
			<TabbedPanel
				column="left"
				tabs={synthWorkspaceStore.leftTabs}
				activeTabId={synthWorkspaceStore.activeLeftTabId}
				onTabSelect={(id) => handleTabSelect(id, 'left')}
				onTabClose={(id) => handleTabClose(id, 'left')}
			>
				{#snippet thread(props: { activeTabId: string })}
					<SynthChatPanel threadId={props.activeTabId} />
				{/snippet}
				{#snippet artifact(props: { activeTabId: string })}
					<FileEditor artifactId={props.activeTabId} />
				{/snippet}
				{#snippet source(props: { activeTabId: string })}
					<SourceViewer sourceId={props.activeTabId} />
				{/snippet}
			</TabbedPanel>
		</div>

		<!-- Middle Divider -->
		{#if !synthWorkspaceStore.rightPanelCollapsed}
			<div
				class="w-1 cursor-col-resize bg-zinc-800 transition-colors hover:bg-violet-500/50 {isDraggingDivider
					? 'bg-violet-500'
					: ''}"
				onmousedown={handleDividerMouseDown}
				role="separator"
				aria-orientation="vertical"
			></div>

			<!-- Right Column -->
			<div class="flex flex-1 flex-col overflow-hidden">
				<TabbedPanel
					column="right"
					tabs={synthWorkspaceStore.rightTabs}
					activeTabId={synthWorkspaceStore.activeRightTabId}
					onTabSelect={(id) => handleTabSelect(id, 'right')}
					onTabClose={(id) => handleTabClose(id, 'right')}
					showClosePanel={true}
					onClosePanel={() => synthWorkspaceStore.collapseRightPanel()}
				>
					{#snippet thread(props: { activeTabId: string })}
						<SynthChatPanel threadId={props.activeTabId} />
					{/snippet}
					{#snippet artifact(props: { activeTabId: string })}
						<FileEditor artifactId={props.activeTabId} />
					{/snippet}
					{#snippet source(props: { activeTabId: string })}
						<SourceViewer sourceId={props.activeTabId} />
					{/snippet}
				</TabbedPanel>
			</div>
		{/if}
	</div>
</div>

