<script lang="ts">
	import { Cyphertap } from 'cyphertap';
	import { BookOpen } from '@lucide/svelte';
</script>

<header class="border-b border-border">
	<div class="container mx-auto flex h-14 items-center justify-between px-4">
		<a href="/" class="flex items-center gap-2">
			<BookOpen class="h-6 w-6" />
			<span class="text-xl font-bold">SvelteReader</span>
		</a>

		<Cyphertap />
	</div>
</header>
