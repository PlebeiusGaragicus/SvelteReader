<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { cyphertap } from 'cyphertap';
	import { Lock, User } from '@lucide/svelte';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { WorkspaceLayout } from '$lib/components/synthesize';
	import {
		synthProjectStore,
		synthArtifactStore,
		synthThreadStore,
		synthSourceStore,
		synthWorkspaceStore,
		synthAgentStore
	} from '$lib/stores/synthesize';

	const projectId = $derived($page.params.id);
	const isReady = $derived(cyphertap.isReady);
	const isLoggedIn = $derived(cyphertap.isLoggedIn);
	const userNpub = $derived(cyphertap.npub);

	let hasInitialized = $state(false);
	let projectNotFound = $state(false);

	// Initialize when wallet becomes ready and user is logged in
	$effect(() => {
		if (browser && isReady && isLoggedIn && userNpub && !hasInitialized && projectId) {
			hasInitialized = true;
			
			synthProjectStore.init(userNpub).then(() => {
				// Check if project exists
				const project = synthProjectStore.projects.find(p => p.id === projectId);
				if (project) {
					synthProjectStore.selectProject(projectId);
				} else {
					projectNotFound = true;
				}
			});
		}
	});

	onMount(() => {
		modeStore.setMode('synthesize');
	});

	function handleBackToProjects() {
		// Save any unsaved work before navigating
		synthArtifactStore.saveAllDirtyArtifacts();

		// Clear current project selection
		synthProjectStore.selectProject(null);

		// Clear project-specific state
		synthArtifactStore.clearProjectState();
		synthThreadStore.clearProjectState();
		synthSourceStore.clearProjectState();
		synthWorkspaceStore.clearProjectState();
		synthAgentStore.clearProjectState();

		goto('/synthesize');
	}
</script>

<svelte:head>
	<title>SvelteReader | Synthesize</title>
</svelte:head>

{#if !isReady}
	<div class="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-zinc-950">
		<div class="text-center">
			<div class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
			<p class="text-zinc-400">Loading...</p>
		</div>
	</div>
{:else if !isLoggedIn}
	<!-- Redirect to login for project pages -->
	<div class="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-6 bg-zinc-950">
		<Lock class="h-12 w-12 text-zinc-600" />
		<p class="text-lg text-zinc-400">Please login to access this project</p>
		<div class="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/80 px-6 py-4">
			<User class="h-8 w-8 text-violet-500" />
			<div class="text-left">
				<p class="font-medium text-zinc-200">Login Required</p>
				<p class="text-sm text-zinc-500">
					Click the login button in the top right corner
				</p>
			</div>
		</div>
		<button
			onclick={() => goto('/synthesize')}
			class="rounded-lg border border-zinc-700 px-6 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
		>
			Back to Synthesize
		</button>
	</div>
{:else if projectNotFound}
	<div class="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 bg-zinc-950">
		<p class="text-lg text-zinc-400">Project not found</p>
		<button
			onclick={() => goto('/synthesize')}
			class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
		>
			Back to Projects
		</button>
	</div>
{:else}
	<WorkspaceLayout userNpub={userNpub} onBackToProjects={handleBackToProjects} />
{/if}

