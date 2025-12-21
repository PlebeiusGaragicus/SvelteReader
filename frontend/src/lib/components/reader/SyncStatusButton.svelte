<script lang="ts">
	import { onMount } from 'svelte';
	import { Cloud, CloudOff, RefreshCw, Check, AlertCircle } from '@lucide/svelte';
	import { syncStore } from '$lib/stores/sync.svelte';
	import { cyphertap } from 'cyphertap';

	let showPopover = $state(false);
	let containerElement: HTMLDivElement;

	// Use CypherTap's reactive login state directly
	const isLoggedIn = $derived(cyphertap.isLoggedIn);

	function formatTime(timestamp: number | null): string {
		if (!timestamp) return 'Never';
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		
		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		return date.toLocaleDateString();
	}

	function handleSync() {
		syncStore.sync();
	}

	function handleToggle() {
		showPopover = !showPopover;
	}

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (containerElement && !containerElement.contains(event.target as Node)) {
			showPopover = false;
		}
	}

	onMount(() => {
		const timeout = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 100);
		
		return () => {
			clearTimeout(timeout);
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<!-- Only show when logged in -->
{#if isLoggedIn}
<div class="relative" bind:this={containerElement}>
	<button
		onclick={handleToggle}
		class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showPopover ? 'bg-accent' : ''}"
		aria-label="Sync status"
	>
		{#if syncStore.status === 'syncing'}
			<RefreshCw class="h-5 w-5 animate-spin text-blue-500" />
		{:else if syncStore.status === 'success'}
			<Check class="h-5 w-5 text-green-500" />
		{:else if syncStore.status === 'error'}
			<AlertCircle class="h-5 w-5 text-red-500" />
		{:else if isLoggedIn}
			<Cloud class="h-5 w-5 text-green-500" />
		{:else}
			<CloudOff class="h-5 w-5 text-muted-foreground" />
		{/if}
	</button>

	{#if showPopover}
		<div
			class="sync-popover absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-background shadow-lg"
		>
			<div class="p-4 space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="font-medium text-sm">Nostr Sync</h3>
					{#if isLoggedIn}
						<span class="text-xs text-green-500 flex items-center gap-1">
							<span class="h-2 w-2 rounded-full bg-green-500"></span>
							Connected
						</span>
					{:else}
						<span class="text-xs text-muted-foreground flex items-center gap-1">
							<span class="h-2 w-2 rounded-full bg-muted-foreground"></span>
							Not logged in
						</span>
					{/if}
				</div>

				{#if syncStore.stats.lastSyncAt}
					<div class="text-xs text-muted-foreground space-y-1">
						<div class="flex justify-between">
							<span>Last sync:</span>
							<span>{formatTime(syncStore.stats.lastSyncAt)}</span>
						</div>
						<div class="flex justify-between">
							<span>Books:</span>
							<span>{syncStore.stats.booksFetchedCount} synced</span>
						</div>
						<div class="flex justify-between">
							<span>Annotations:</span>
							<span>{syncStore.stats.fetchedCount} synced</span>
						</div>
						{#if syncStore.stats.ghostBooksCreated > 0}
							<div class="flex justify-between text-amber-500">
								<span>Ghost books:</span>
								<span>{syncStore.stats.ghostBooksCreated}</span>
							</div>
						{/if}
						{#if syncStore.stats.mergedCount > 0}
							<div class="flex justify-between">
								<span>New items:</span>
								<span>{syncStore.stats.mergedCount + syncStore.stats.booksMergedCount}</span>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">No sync performed yet</p>
				{/if}

				{#if syncStore.error && syncStore.status === 'error'}
					<div class="text-xs text-red-500 bg-red-500/10 rounded p-2">
						{syncStore.error}
					</div>
				{/if}

				<button
					onclick={handleSync}
					disabled={!isLoggedIn || syncStore.status === 'syncing'}
					class="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if syncStore.status === 'syncing'}
						<RefreshCw class="h-4 w-4 animate-spin" />
						Syncing...
					{:else}
						<RefreshCw class="h-4 w-4" />
						Sync Now
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>
{/if}
