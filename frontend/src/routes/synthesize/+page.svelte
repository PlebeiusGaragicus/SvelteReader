<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { cyphertap } from 'cyphertap';
	import { Sparkles, FileText, MessageSquare, Globe, User } from '@lucide/svelte';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { ProjectDashboard } from '$lib/components/synthesize';
	import { synthProjectStore } from '$lib/stores/synthesize';
	import type { Project } from '$lib/stores/synthesize/types';

	let hasInitialized = $state(false);

	const isReady = $derived(cyphertap.isReady);
	const isLoggedIn = $derived(cyphertap.isLoggedIn);
	const userNpub = $derived(cyphertap.npub);

	// Initialize when wallet becomes ready and user is logged in
	$effect(() => {
		if (browser && isReady && isLoggedIn && userNpub && !hasInitialized) {
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
	<!-- Welcome Page for Logged Out Users -->
	<div class="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-zinc-950 px-4">
		<div class="mx-auto max-w-2xl text-center">
			<!-- Hero Icon -->
			<div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20">
				<Sparkles class="h-10 w-10 text-violet-500" />
			</div>

			<!-- Title -->
			<h1 class="mb-4 text-4xl font-bold text-zinc-100">
				Synthesize Mode
			</h1>

			<!-- Description -->
			<p class="mb-8 text-lg text-zinc-400">
				Create deep research projects with AI-powered synthesis. Organize your thoughts, 
				gather sources, and generate insights with intelligent assistance.
			</p>

			<!-- Features Grid -->
			<div class="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
					<FileText class="mx-auto mb-2 h-6 w-6 text-amber-500" />
					<h3 class="font-medium text-zinc-200">Smart Files</h3>
					<p class="mt-1 text-sm text-zinc-500">Create and edit markdown files with version history</p>
				</div>
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
					<MessageSquare class="mx-auto mb-2 h-6 w-6 text-blue-500" />
					<h3 class="font-medium text-zinc-200">AI Chats</h3>
					<p class="mt-1 text-sm text-zinc-500">Converse with AI to synthesize ideas</p>
				</div>
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
					<Globe class="mx-auto mb-2 h-6 w-6 text-emerald-500" />
					<h3 class="font-medium text-zinc-200">Web Sources</h3>
					<p class="mt-1 text-sm text-zinc-500">Import and reference web content</p>
				</div>
			</div>

			<!-- Login CTA -->
			<div class="flex flex-col items-center gap-4">
				<div class="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/80 px-6 py-4">
					<User class="h-8 w-8 text-violet-500" />
					<div class="text-left">
						<p class="font-medium text-zinc-200">Login Required</p>
						<p class="text-sm text-zinc-500">
							Click the login button in the top right corner
						</p>
					</div>
				</div>
				<p class="text-sm text-zinc-600">
					Login with your Nostr key to access Synthesize mode
				</p>
			</div>
		</div>
	</div>
{:else}
	<ProjectDashboard userNpub={userNpub || ''} onProjectSelect={handleProjectSelect} />
{/if}

