<script lang="ts">
	import { Cyphertap } from 'cyphertap';
	import { BookOpen, User } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import SyncStatusButton from './reader/SyncStatusButton.svelte';
	import SpectateButton from './SpectateButton.svelte';
	import ModeSelector from './ModeSelector.svelte';
	import { spectateStore } from '$lib/stores/spectate.svelte';
</script>

<header class="border-b border-border">
	<div class="flex h-14 items-center justify-between px-4">
		<div class="flex items-center gap-3">
			<a href="/" class="flex items-center gap-2">
				<BookOpen class="h-6 w-6" />
				<span class="text-xl font-bold">SvelteReader</span>
			</a>
			<span class="text-muted-foreground/40">|</span>
			<ModeSelector />
		</div>

		<div class="flex items-center gap-2">
			{#if browser}
				<SpectateButton />
				{#if spectateStore.isSpectating}
					<!-- Dummy user button while spectating - doesn't load Cyphertap -->
					<button
						class="flex h-9 items-center gap-2 px-3 rounded-md bg-muted/50 text-muted-foreground cursor-not-allowed text-sm"
						title="Stop spectating to access your account"
						disabled
					>
						<User class="h-4 w-4" />
						<span>Currently spectating</span>
					</button>
				{:else}
					<Cyphertap />
					<SyncStatusButton />
				{/if}
			{:else}
				<div class="h-9 w-9"></div>
			{/if}
		</div>
	</div>
</header>
