<script lang="ts">
	import { Cyphertap } from 'cyphertap';
	import { BookOpen } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import SyncStatusButton from './reader/SyncStatusButton.svelte';
</script>

<header class="border-b border-border">
	<div class="flex h-14 items-center justify-between px-4">
		<a href="/" class="flex items-center gap-2">
			<BookOpen class="h-6 w-6" />
			<span class="text-xl font-bold">SvelteReader</span>
		</a>

		<div class="flex items-center gap-2">
			{#if browser}
				<SyncStatusButton />
				<Cyphertap />
			{:else}
				<div class="h-9 w-9"></div>
			{/if}
		</div>
	</div>
</header>
