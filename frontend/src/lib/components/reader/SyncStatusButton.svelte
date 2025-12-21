<script lang="ts">
	import { Cloud, CloudOff, RefreshCw, Check, AlertCircle } from '@lucide/svelte';
	import { syncStore } from '$lib/stores/sync.svelte';

	let showPopover = $state(false);
	let buttonElement: HTMLButtonElement;

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

	function handleClickOutside(event: MouseEvent) {
		if (buttonElement && !buttonElement.contains(event.target as Node)) {
			const popover = document.getElementById('sync-popover');
			if (popover && !popover.contains(event.target as Node)) {
				showPopover = false;
			}
		}
	}

	$effect(() => {
		if (showPopover) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div class="relative">
	<button
		bind:this={buttonElement}
		onclick={() => showPopover = !showPopover}
		class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showPopover ? 'bg-accent' : ''}"
		aria-label="Sync status"
	>
		{#if syncStore.status === 'syncing'}
			<RefreshCw class="h-5 w-5 animate-spin text-blue-500" />
		{:else if syncStore.status === 'success'}
			<Check class="h-5 w-5 text-green-500" />
		{:else if syncStore.status === 'error'}
			<AlertCircle class="h-5 w-5 text-red-500" />
		{:else if syncStore.isLoggedIn}
			<Cloud class="h-5 w-5 text-blue-500" />
		{:else}
			<CloudOff class="h-5 w-5 text-muted-foreground" />
		{/if}
	</button>

	{#if showPopover}
		<div
			id="sync-popover"
			class="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-background shadow-lg"
		>
			<div class="p-4 space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="font-medium text-sm">Nostr Sync</h3>
					{#if syncStore.isLoggedIn}
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
							<span>Fetched:</span>
							<span>{syncStore.stats.fetchedCount} annotations</span>
						</div>
						{#if syncStore.stats.mergedCount > 0}
							<div class="flex justify-between">
								<span>Merged:</span>
								<span>{syncStore.stats.mergedCount} new</span>
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
					disabled={!syncStore.isLoggedIn || syncStore.status === 'syncing'}
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
