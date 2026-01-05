<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import TopBar from '$lib/components/TopBar.svelte';
	import { books } from '$lib/stores/books.svelte';
	import { annotations } from '$lib/stores/annotations.svelte';
	import { cyphertap } from 'cyphertap';
	import { spectateStore } from '$lib/stores/spectate.svelte';

	let { children } = $props();

	// Track the current active pubkey for store initialization
	// Priority: spectate target > logged-in user > none
	const activePubkey = $derived.by(() => {
		if (spectateStore.isSpectating && spectateStore.target) {
			return spectateStore.target.pubkey;
		}
		if (cyphertap.isLoggedIn) {
			return cyphertap.getUserHex() || undefined;
		}
		return undefined;
	});

	// Re-initialize stores when the active pubkey changes
	// This properly tracks login/logout and spectate mode changes
	$effect(() => {
		const pubkey = activePubkey;
		console.log('[Layout] Initializing stores for:', 
			spectateStore.isSpectating ? `spectating ${pubkey?.slice(0, 8)}` : 
			pubkey ? `user ${pubkey.slice(0, 8)}` : 'none'
		);
		// Initialize stores - these handle their own async operations internally
		books.initialize(pubkey);
		annotations.initialize(pubkey);
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
