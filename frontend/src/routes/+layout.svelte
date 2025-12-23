<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import TopBar from '$lib/components/TopBar.svelte';
	import { onMount } from 'svelte';
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { cyphertap } from 'cyphertap';
	import { spectateStore } from '$lib/stores/spectate.svelte';

	let { children } = $props();

	// Determine which pubkey to use for data queries
	// Priority: spectate target > logged-in user > none
	function getActivePubkey(): string | undefined {
		if (spectateStore.isSpectating && spectateStore.target) {
			return spectateStore.target.pubkey;
		}
		if (cyphertap.isLoggedIn) {
			return cyphertap.getUserHex() || undefined;
		}
		return undefined;
	}

	// Initialize stores from IndexedDB on app load, scoped to active user
	async function initializeStores() {
		const pubkey = getActivePubkey();
		console.log('[Layout] Initializing stores for:', 
			spectateStore.isSpectating ? `spectating ${pubkey?.slice(0, 8)}` : 
			pubkey ? `user ${pubkey.slice(0, 8)}` : 'none'
		);
		await books.initialize(pubkey);
		await annotations.initialize(pubkey);
	}

	onMount(() => {
		initializeStores();
	});

	// Re-initialize stores when login state or spectate state changes
	$effect(() => {
		// Track both login and spectate state
		const isLoggedIn = cyphertap.isLoggedIn;
		const isSpectating = spectateStore.isSpectating;
		// This will trigger when either changes
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
