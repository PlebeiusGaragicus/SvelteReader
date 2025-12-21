<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import TopBar from '$lib/components/TopBar.svelte';
	import { onMount } from 'svelte';
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';

	let { children } = $props();

	// Initialize stores from IndexedDB on app load
	onMount(async () => {
		await books.initialize();
		await annotations.initialize();
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
