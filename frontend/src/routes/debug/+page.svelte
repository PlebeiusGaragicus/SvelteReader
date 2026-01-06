<script lang="ts">
	/**
	 * Debug Page - View all Nostr events for the logged-in user
	 * 
	 * This is a debug/development tool to inspect what events have been
	 * published to relays. Keep this code separate from production.
	 */
	import { onMount } from 'svelte';
	import { cyphertap } from 'cyphertap';
	import { ExternalLink, Trash2, RefreshCw, AlertCircle } from '@lucide/svelte';
	
	interface NostrEvent {
		id: string;
		pubkey: string;
		kind: number;
		created_at: number;
		content: string;
		tags: string[][];
	}
	
	let events = $state<NostrEvent[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let userPubkey = $state<string | null>(null);
	let deletingIds = $state<Set<string>>(new Set());
	
	// Kind descriptions for display
	const kindDescriptions: Record<number, string> = {
		0: 'Profile Metadata',
		1: 'Short Text Note',
		3: 'Contact List',
		5: 'Event Deletion',
		10002: 'Relay List',
		30800: 'Annotation',
		30801: 'Book Announcement',
	};
	
	function getKindDescription(kind: number): string {
		return kindDescriptions[kind] || `Kind ${kind}`;
	}
	
	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleString();
	}
	
	function getEventSummary(event: NostrEvent): string {
		// Try to extract meaningful info based on kind
		if (event.kind === 30801) {
			// Book announcement
			const titleTag = event.tags.find(t => t[0] === 'title');
			return titleTag ? `Book: ${titleTag[1]}` : 'Book Announcement';
		}
		if (event.kind === 30800) {
			// Annotation
			const dTag = event.tags.find(t => t[0] === 'd');
			return dTag ? `Annotation: ${dTag[1].slice(0, 40)}...` : 'Annotation';
		}
		if (event.kind === 5) {
			// Deletion
			const eTags = event.tags.filter(t => t[0] === 'e');
			return `Deletes ${eTags.length} event(s)`;
		}
		if (event.content) {
			return event.content.slice(0, 100) + (event.content.length > 100 ? '...' : '');
		}
		return 'No content';
	}
	
	async function fetchAllEvents() {
		if (!cyphertap.isLoggedIn) {
			error = 'Not logged in to Nostr';
			return;
		}
		
		isLoading = true;
		error = null;
		events = [];
		
		try {
			userPubkey = cyphertap.getUserHex();
			if (!userPubkey) {
				error = 'Could not get user pubkey';
				return;
			}
			
			console.log('[Debug] Fetching all events for pubkey:', userPubkey);
			
			// Subscribe to all events from this user
			const fetchedEvents: NostrEvent[] = [];
			
			// Use a promise to wait for events
			await new Promise<void>((resolve) => {
				const unsubscribe = cyphertap.subscribe(
					{ authors: [userPubkey!] },
					(event) => {
						fetchedEvents.push({
							id: event.id,
							pubkey: event.pubkey,
							kind: event.kind,
							created_at: event.created_at,
							content: event.content,
							tags: event.tags || []
						});
					}
				);
				
				// Wait a bit for events to come in, then resolve
				setTimeout(() => {
					unsubscribe();
					resolve();
				}, 3000);
			});
			
			// Sort by created_at descending (newest first)
			events = fetchedEvents.sort((a, b) => b.created_at - a.created_at);
			console.log(`[Debug] Fetched ${events.length} events`);
			
		} catch (e) {
			console.error('[Debug] Error fetching events:', e);
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	}
	
	async function deleteEvent(eventId: string) {
		if (!cyphertap.isLoggedIn) {
			error = 'Not logged in';
			return;
		}
		
		deletingIds = new Set([...deletingIds, eventId]);
		
		try {
			console.log('[Debug] Publishing deletion for event:', eventId);
			
			// Publish a kind 5 deletion event
			await cyphertap.publishEvent({
				kind: 5,
				tags: [['e', eventId]],
				content: 'Deleted via debug panel',
				created_at: Math.floor(Date.now() / 1000)
			});
			
			console.log('[Debug] Deletion event published');
			
			// Remove from local list
			events = events.filter(e => e.id !== eventId);
			
		} catch (e) {
			console.error('[Debug] Error deleting event:', e);
			error = e instanceof Error ? e.message : 'Failed to delete';
		} finally {
			deletingIds = new Set([...deletingIds].filter(id => id !== eventId));
		}
	}
	
	function openOnNjump(eventId: string) {
		window.open(`https://njump.me/${eventId}`, '_blank');
	}
	
	onMount(() => {
		// Auto-fetch if logged in
		if (cyphertap.isLoggedIn) {
			fetchAllEvents();
		}
	});
</script>

<svelte:head>
	<title>SvelteReader | Debug</title>
</svelte:head>

<div class="min-h-screen bg-background p-6">
	<div class="mx-auto max-w-4xl">
		<div class="mb-6 flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold text-foreground">Nostr Events Debug</h1>
				{#if userPubkey}
					<p class="mt-1 text-sm text-muted-foreground font-mono">
						{userPubkey.slice(0, 16)}...{userPubkey.slice(-8)}
					</p>
				{/if}
			</div>
			<button
				onclick={fetchAllEvents}
				disabled={isLoading}
				class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
			>
				<RefreshCw class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
				{isLoading ? 'Fetching...' : 'Refresh'}
			</button>
		</div>
		
		{#if !cyphertap.isLoggedIn}
			<div class="rounded-lg border border-border bg-card p-8 text-center">
				<AlertCircle class="mx-auto h-12 w-12 text-muted-foreground" />
				<p class="mt-4 text-lg font-medium">Not Logged In</p>
				<p class="mt-2 text-muted-foreground">
					Please log in to Nostr to view your events.
				</p>
			</div>
		{:else if error}
			<div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
				<p class="text-destructive">{error}</p>
			</div>
		{:else if isLoading}
			<div class="rounded-lg border border-border bg-card p-8 text-center">
				<RefreshCw class="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
				<p class="mt-4 text-muted-foreground">Fetching events from relays...</p>
			</div>
		{:else if events.length === 0}
			<div class="rounded-lg border border-border bg-card p-8 text-center">
				<p class="text-muted-foreground">No events found for this user.</p>
			</div>
		{:else}
			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">{events.length} events found</p>
				
				{#each events as event (event.id)}
					<div class="rounded-lg border border-border bg-card p-4">
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
										{getKindDescription(event.kind)}
									</span>
									<span class="text-xs text-muted-foreground">
										{formatDate(event.created_at)}
									</span>
								</div>
								<p class="mt-2 text-sm text-foreground">
									{getEventSummary(event)}
								</p>
								<p class="mt-1 font-mono text-xs text-muted-foreground">
									{event.id.slice(0, 24)}...
								</p>
								{#if event.tags.length > 0}
									<details class="mt-2">
										<summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
											{event.tags.length} tags
										</summary>
										<div class="mt-1 rounded bg-muted/50 p-2 text-xs font-mono">
											{#each event.tags as tag}
												<div class="truncate">[{tag.join(', ')}]</div>
											{/each}
										</div>
									</details>
								{/if}
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => openOnNjump(event.id)}
									class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent"
									title="View on njump.me"
								>
									<ExternalLink class="h-4 w-4" />
								</button>
								<button
									onclick={() => deleteEvent(event.id)}
									disabled={deletingIds.has(event.id)}
									class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
									title="Delete event"
								>
									{#if deletingIds.has(event.id)}
										<RefreshCw class="h-4 w-4 animate-spin" />
									{:else}
										<Trash2 class="h-4 w-4" />
									{/if}
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
