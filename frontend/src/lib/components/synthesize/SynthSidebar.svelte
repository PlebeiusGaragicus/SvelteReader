<script lang="ts">
	import {
		ChevronLeft,
		ChevronRight,
		MessageSquare,
		FileText,
		Link,
		Plus,
		Folder,
		MoreVertical,
		Trash2
	} from '@lucide/svelte';
	import {
		synthProjectStore,
		synthThreadStore,
		synthArtifactStore,
		synthSourceStore,
		synthWorkspaceStore
	} from '$lib/stores/synthesize';
	import type { Artifact, Thread, Source } from '$lib/stores/synthesize/types';

	interface Props {
		collapsed?: boolean;
		onToggleCollapse?: () => void;
		onSelectFile: (artifact: Artifact) => void;
		onSelectThread: (thread: Thread) => void;
		onSelectSource: (source: Source) => void;
		onBackToProjects: () => void;
	}

	let {
		collapsed = false,
		onToggleCollapse,
		onSelectFile,
		onSelectThread,
		onSelectSource,
		onBackToProjects
	}: Props = $props();

	type SectionType = 'threads' | 'files' | 'sources';
	let activeSection = $state<SectionType>('threads');

	const currentProject = $derived(synthProjectStore.currentProject);
	const currentProjectId = $derived(synthProjectStore.currentProjectId);

	const projectThreads = $derived(
		currentProjectId ? synthThreadStore.getProjectThreads(currentProjectId) : []
	);
	const projectArtifacts = $derived(
		currentProjectId ? synthArtifactStore.getProjectArtifacts(currentProjectId) : []
	);
	const projectSources = $derived(
		currentProjectId ? synthSourceStore.getProjectSources(currentProjectId) : []
	);

	function handleNewThread() {
		synthWorkspaceStore.createNewThread('left');
	}

	function handleNewFile() {
		synthWorkspaceStore.createNewFile('left');
	}

	function getArtifactTitle(artifact: Artifact): string {
		return artifact.versions[artifact.currentVersionIndex]?.title || 'Untitled';
	}

	function formatThreadPreview(thread: Thread): string {
		if (thread.description) {
			return thread.description.length > 40
				? thread.description.slice(0, 40) + '...'
				: thread.description;
		}
		return 'No messages yet';
	}
</script>

<div
	class="flex h-full flex-col border-r border-zinc-800 bg-zinc-900/50 transition-all {collapsed
		? 'w-12'
		: 'w-60'}"
>
	<!-- Header -->
	<div class="flex h-12 items-center justify-between border-b border-zinc-800 px-3">
		{#if !collapsed}
			<button
				onclick={onBackToProjects}
				class="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
			>
				<Folder class="h-4 w-4" />
				<span class="truncate max-w-[120px]">{currentProject?.title || 'Projects'}</span>
			</button>
		{/if}
		<button
			onclick={onToggleCollapse}
			class="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
		>
			{#if collapsed}
				<ChevronRight class="h-4 w-4" />
			{:else}
				<ChevronLeft class="h-4 w-4" />
			{/if}
		</button>
	</div>

	{#if !collapsed}
		<!-- Section Tabs -->
		<div class="flex border-b border-zinc-800">
			<button
				onclick={() => (activeSection = 'threads')}
				class="flex-1 px-3 py-2 text-xs font-medium transition-colors {activeSection === 'threads'
					? 'border-b-2 border-violet-500 text-violet-400'
					: 'text-zinc-500 hover:text-zinc-300'}"
			>
				<MessageSquare class="mx-auto h-4 w-4" />
			</button>
			<button
				onclick={() => (activeSection = 'files')}
				class="flex-1 px-3 py-2 text-xs font-medium transition-colors {activeSection === 'files'
					? 'border-b-2 border-violet-500 text-violet-400'
					: 'text-zinc-500 hover:text-zinc-300'}"
			>
				<FileText class="mx-auto h-4 w-4" />
			</button>
			<button
				onclick={() => (activeSection = 'sources')}
				class="flex-1 px-3 py-2 text-xs font-medium transition-colors {activeSection === 'sources'
					? 'border-b-2 border-violet-500 text-violet-400'
					: 'text-zinc-500 hover:text-zinc-300'}"
			>
				<Link class="mx-auto h-4 w-4" />
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto">
			{#if activeSection === 'threads'}
				<!-- Threads List -->
				<div class="p-2">
					<button
						onclick={handleNewThread}
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
					>
						<Plus class="h-4 w-4" />
						<span>New Chat</span>
					</button>

					<div class="mt-2 space-y-1">
						{#each projectThreads as thread (thread.id)}
							<button
								onclick={() => onSelectThread(thread)}
								class="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-800 {synthThreadStore.currentThreadId ===
								thread.id
									? 'bg-zinc-800'
									: ''}"
							>
								<MessageSquare class="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm text-zinc-200">{thread.title}</p>
									<p class="truncate text-xs text-zinc-500">{formatThreadPreview(thread)}</p>
								</div>
							</button>
						{/each}
					</div>

					{#if projectThreads.length === 0}
						<p class="px-3 py-4 text-center text-xs text-zinc-600">No conversations yet</p>
					{/if}
				</div>
			{:else if activeSection === 'files'}
				<!-- Files List -->
				<div class="p-2">
					<button
						onclick={handleNewFile}
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
					>
						<Plus class="h-4 w-4" />
						<span>New File</span>
					</button>

					<div class="mt-2 space-y-1">
						{#each projectArtifacts as artifact (artifact.id)}
							<button
								onclick={() => onSelectFile(artifact)}
								class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-800 {synthArtifactStore.currentArtifactId ===
								artifact.id
									? 'bg-zinc-800'
									: ''}"
							>
								<FileText class="h-4 w-4 shrink-0 text-zinc-500" />
								<span class="truncate text-sm text-zinc-200">{getArtifactTitle(artifact)}</span>
							</button>
						{/each}
					</div>

					{#if projectArtifacts.length === 0}
						<p class="px-3 py-4 text-center text-xs text-zinc-600">No files yet</p>
					{/if}
				</div>
			{:else if activeSection === 'sources'}
				<!-- Sources List -->
				<div class="p-2">
					<div class="space-y-1">
						{#each projectSources as source (source.id)}
							<button
								onclick={() => onSelectSource(source)}
								class="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-800 {synthSourceStore.currentSourceId ===
								source.id
									? 'bg-zinc-800'
									: ''}"
							>
								<Link class="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm text-zinc-200">{source.title}</p>
									<p class="truncate text-xs text-zinc-500">{source.url}</p>
								</div>
							</button>
						{/each}
					</div>

					{#if projectSources.length === 0}
						<p class="px-3 py-4 text-center text-xs text-zinc-600">No sources yet</p>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Collapsed state - just show icons -->
		<div class="flex flex-col items-center gap-2 p-2">
			<button
				onclick={() => {
					onToggleCollapse?.();
					activeSection = 'threads';
				}}
				class="rounded p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
				title="Threads"
			>
				<MessageSquare class="h-4 w-4" />
			</button>
			<button
				onclick={() => {
					onToggleCollapse?.();
					activeSection = 'files';
				}}
				class="rounded p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
				title="Files"
			>
				<FileText class="h-4 w-4" />
			</button>
			<button
				onclick={() => {
					onToggleCollapse?.();
					activeSection = 'sources';
				}}
				class="rounded p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
				title="Sources"
			>
				<Link class="h-4 w-4" />
			</button>
		</div>
	{/if}
</div>

