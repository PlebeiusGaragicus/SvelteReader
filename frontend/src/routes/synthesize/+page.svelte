<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { cyphertap } from 'cyphertap';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { ProjectDashboard, WorkspaceLayout } from '$lib/components/synthesize';
	import {
		synthProjectStore,
		synthArtifactStore,
		synthThreadStore,
		synthSourceStore
	} from '$lib/stores/synthesize';
	import type { Project } from '$lib/stores/synthesize/types';

	// View state: 'dashboard' or 'workspace'
	let currentView = $state<'dashboard' | 'workspace'>('dashboard');

	const isReady = $derived(cyphertap.isReady);
	const userNpub = $derived(cyphertap.npub);

	// Sync current project with view
	$effect(() => {
		if (synthProjectStore.currentProjectId) {
			currentView = 'workspace';
		}
	});

	onMount(async () => {
		// Set the mode
		modeStore.setMode('synthesize');

		// Initialize projects store for this user
		if (isReady && userNpub) {
			await synthProjectStore.init(userNpub);

			// If there's a current project, show workspace view
			if (synthProjectStore.currentProjectId) {
				currentView = 'workspace';
			}
		}
	});

	function handleProjectSelect(project: Project) {
		synthProjectStore.selectProject(project.id);
		currentView = 'workspace';
	}

	function handleBackToProjects() {
		// Save any unsaved work before navigating
		synthArtifactStore.saveAllDirtyArtifacts();

		// Clear current project selection
		synthProjectStore.selectProject(null);

		// Clear project-specific state
		synthArtifactStore.clearProjectState();
		synthThreadStore.clearProjectState();
		synthSourceStore.clearProjectState();

		currentView = 'dashboard';
	}
</script>

<svelte:head>
	<title>Synthesize | SvelteReader</title>
</svelte:head>

{#if !isReady}
	<div class="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-zinc-950">
		<div class="text-center">
			<div class="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent mx-auto"></div>
			<p class="text-zinc-400">Loading...</p>
		</div>
	</div>
{:else if currentView === 'dashboard'}
	<ProjectDashboard userNpub={userNpub || ''} onProjectSelect={handleProjectSelect} />
{:else}
	<WorkspaceLayout userNpub={userNpub} onBackToProjects={handleBackToProjects} />
{/if}

