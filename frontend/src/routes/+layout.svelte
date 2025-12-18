<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import TopBar from '$lib/components/TopBar.svelte';

	let { children } = $props();
</script>

<ModeWatcher defaultMode="dark" />
<Toaster richColors position="top-center" />

<div class="min-h-screen bg-background text-foreground">
	<TopBar />
	<main>
		{@render children()}
	</main>
</div>
