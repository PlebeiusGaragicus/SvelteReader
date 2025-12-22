<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import TopBar from '$lib/components/TopBar.svelte';
	import { onMount } from 'svelte';
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { cyphertap } from 'cyphertap';

	let { children } = $props();

	// Initialize stores from IndexedDB on app load, scoped to current user
	async function initializeStores() {
		const userPubkey = cyphertap.isLoggedIn ? cyphertap.getUserHex() : null;
		console.log('[Layout] Initializing stores for user:', userPubkey?.slice(0, 8) || 'none');
		await books.initialize(userPubkey || undefined);
		await annotations.initialize(userPubkey || undefined);
	}

	onMount(() => {
		initializeStores();
	});

	// Re-initialize stores when login state changes
	$effect(() => {
		const isLoggedIn = cyphertap.isLoggedIn;
		// This will trigger when login state changes
		initializeStores();
	});
</script>

<ModeWatcher defaultMode="dark" />
<Toaster richColors position="top-center" />

<div class="min-h-screen bg-background text-foreground">
	<TopBar />
	<main>
		{@render children()}
	</main>
</div>
