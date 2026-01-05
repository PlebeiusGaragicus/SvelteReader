<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { cyphertap } from 'cyphertap';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { ProjectDashboard } from '$lib/components/synthesize';
	import { synthProjectStore } from '$lib/stores/synthesize';
	import type { Project } from '$lib/stores/synthesize/types';

	let hasInitialized = $state(false);

	const isReady = $derived(cyphertap.isReady);
	const userNpub = $derived(cyphertap.npub);

	// Initialize when wallet becomes ready
	$effect(() => {
		if (browser && isReady && userNpub && !hasInitialized) {
			hasInitialized = true;
			synthProjectStore.init(userNpub);
		}
	});

	onMount(() => {
		// Set the mode
		modeStore.setMode('synthesize');
	});

	function handleProjectSelect(project: Project) {
		synthProjectStore.selectProject(project.id);
		goto(`/synthesize/${project.id}`);
	}
</script>

<svelte:head>
	<title>Synthesize | SvelteReader</title>
</svelte:head>

{#if !isReady}
	<div class="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-zinc-950">
		<div class="text-center">
			<div class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
			<p class="text-zinc-400">Loading...</p>
		</div>
	</div>
{:else}
	<ProjectDashboard userNpub={userNpub || ''} onProjectSelect={handleProjectSelect} />
{/if}

