<script lang="ts">
	import { Cyphertap } from 'cyphertap';
	import { List, BookOpen } from '@lucide/svelte';
	import { page } from '$app/stores';

	let showToc = $state(false);

	const isReading = $derived($page.url.pathname.startsWith('/book/'));
</script>

<header class="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
	<div class="flex h-14 items-center px-4">
		<div class="flex flex-1 items-center gap-2">
			{#if isReading}
				<button
					onclick={() => (showToc = !showToc)}
					class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
					aria-label="Toggle table of contents"
				>
					<List class="h-5 w-5" />
				</button>
			{/if}
		</div>

		<a href="/" class="flex items-center gap-2 font-semibold">
			<BookOpen class="h-5 w-5" />
			<span>SvelteReader</span>
		</a>

		<div class="flex flex-1 items-center justify-end">
			<Cyphertap />
		</div>
	</div>
</header>
