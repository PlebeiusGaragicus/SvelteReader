<script lang="ts">
	import { Eye, X, RefreshCw, Trash2, Settings, History, ChevronLeft, Copy, Check } from '@lucide/svelte';
	import { spectateStore, type SpectateHistoryEntry } from '$lib/stores/spectate.svelte';
	import { fetchRemoteUserData } from '$lib/services/nostrService';
	import { deleteDataByOwner } from '$lib/services/storageService';
	import { getDefaultRelays } from '$lib/types/nostr';
	import { books } from '$lib/stores/books.svelte';
	import { annotations } from '$lib/stores/annotations.svelte';
	import { decodeNpub } from '$lib/utils/nostr';
	
	// UI state
	let showPopover = $state(false);
	let currentView = $state<'main' | 'history' | 'editRelays'>('main');
	let isLoading = $state(false);
	let inputError = $state<string | null>(null);
	
	// Form inputs
	let npubInput = $state('');
	let relayInput = $state('');
	let editRelaysInput = $state('');
	let editingHistoryEntry = $state<SpectateHistoryEntry | null>(null);
	
	// Refs for click-outside detection
	let popoverRef = $state<HTMLDivElement>();
	let buttonRef: HTMLButtonElement;
	
	// Copy button state
	let copiedNpub = $state(false);
	
	const defaultRelays = getDefaultRelays();
	
	// Helper: Middle-truncate an npub (e.g., "npub1abc...xyz")
	function truncateNpubMiddle(npub: string, maxLength: number = 24): string {
		if (npub.length <= maxLength) return npub;
		const prefixLength = 8; // "npub1" + a few chars
		const suffixLength = 6;
		return `${npub.slice(0, prefixLength)}...${npub.slice(-suffixLength)}`;
	}
	
	// Helper: Copy npub to clipboard
	async function copyNpub(npub: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(npub);
			copiedNpub = true;
			setTimeout(() => { copiedNpub = false; }, 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
	
	// Helper: Format relative time (e.g., "5 minutes ago", "2 hours ago")
	function formatRelativeTime(date: Date | number): string {
		const now = Date.now();
		const timestamp = typeof date === 'number' ? date : date.getTime();
		const diffMs = now - timestamp;
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);
		
		if (diffSec < 60) return 'just now';
		if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
		if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
		if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
		return new Date(timestamp).toLocaleDateString();
	}
	
	// Helper: Parse relay URLs from text input
	function parseRelays(input: string): string[] {
		return input
			.split(/[,\n]/)
			.map(r => r.trim())
			.filter(r => r.startsWith('wss://') || r.startsWith('ws://'));
	}
	
	// Helper: Store fetched data to IndexedDB
	async function storeFetchedData(result: Awaited<ReturnType<typeof fetchRemoteUserData>>) {
		for (const book of result.books) {
			const existing = books.getBySha256(book.sha256);
			if (!existing) {
				await books.add({
					...book,
					progress: 0,
					currentPage: 0,
					totalPages: 0,
					hasEpubData: false,
					isPublic: true,
					syncPending: false,
				});
			}
		}
		
		for (const annotation of result.annotations) {
			await annotations.upsert(annotation.bookSha256, annotation.cfiRange, {
				text: annotation.text,
				highlightColor: annotation.highlightColor,
				note: annotation.note,
				nostrEventId: annotation.nostrEventId,
				nostrCreatedAt: annotation.nostrCreatedAt,
				isPublic: true,
				syncPending: false,
			});
		}
	}
	
	// Open popover and reset to appropriate view
	function openPopover() {
		showPopover = true;
		inputError = null;
		currentView = 'main';
		editingHistoryEntry = null;
		
		if (spectateStore.target) {
			npubInput = spectateStore.target.npub;
			relayInput = spectateStore.target.relays.join('\n');
		} else {
			npubInput = '';
			relayInput = defaultRelays.join('\n');
		}
	}
	
	function closePopover() {
		showPopover = false;
	}
	
	function togglePopover() {
		if (showPopover) {
			closePopover();
		} else {
			openPopover();
		}
	}
	
	// Navigate between views
	function goToHistory() {
		currentView = 'history';
		inputError = null;
	}
	
	function goToMain() {
		currentView = 'main';
		inputError = null;
		editingHistoryEntry = null;
	}
	
	function goToEditRelays(entry: SpectateHistoryEntry) {
		editingHistoryEntry = entry;
		editRelaysInput = entry.relays.join('\n');
		currentView = 'editRelays';
		inputError = null;
	}
	
	// Click outside handler - only close if clicking outside both button and popover
	function handleClickOutside(e: MouseEvent) {
		if (!showPopover) return;
		
		const target = e.target as Node;
		if (buttonRef?.contains(target)) return;
		if (popoverRef?.contains(target)) return;
		
		closePopover();
	}
	
	// Spectate from history entry (uses cached local data)
	async function spectateFromHistory(entry: SpectateHistoryEntry) {
		spectateStore.startSpectating(entry.pubkey, entry.npub, entry.relays);
		if (entry.profile) {
			spectateStore.setProfile(entry.profile);
		}
		
		await books.initialize(entry.pubkey);
		await annotations.initialize(entry.pubkey);
		
		closePopover();
		window.location.reload();
	}
	
	// Save edited relays for a history entry
	function saveRelays() {
		if (!editingHistoryEntry) return;
		
		const relays = parseRelays(editRelaysInput);
		if (relays.length === 0) {
			inputError = 'Please enter at least one valid relay URL';
			return;
		}
		
		spectateStore.updateHistoryRelays(editingHistoryEntry.pubkey, relays);
		currentView = 'history';
		editingHistoryEntry = null;
		inputError = null;
	}
	
	// Start spectating a new user
	async function startSpectating() {
		inputError = null;
		
		const trimmedNpub = npubInput.trim();
		if (!trimmedNpub) {
			inputError = 'Please enter an npub';
			return;
		}
		
		if (!trimmedNpub.startsWith('npub1')) {
			inputError = 'Invalid npub format (should start with npub1)';
			return;
		}
		
		let hexPubkey: string;
		try {
			const decoded = decodeNpub(trimmedNpub);
			if (!decoded) {
				inputError = 'Invalid npub format';
				return;
			}
			hexPubkey = decoded;
		} catch (e) {
			inputError = 'Invalid npub format';
			console.error('[Spectate] Failed to decode npub:', e);
			return;
		}
		
		const relays = parseRelays(relayInput);
		if (relays.length === 0) {
			inputError = 'Please enter at least one valid relay URL';
			return;
		}
		
		// Check for existing local data
		await books.initialize(hexPubkey);
		await annotations.initialize(hexPubkey);
		
		const existingBooks = books.items;
		if (existingBooks.length > 0) {
			// Use local data
			console.log(`[Spectate] Found ${existingBooks.length} local books for ${hexPubkey.slice(0, 8)}, using local data`);
			
			spectateStore.startSpectating(hexPubkey, trimmedNpub, relays);
			
			const historyEntry = spectateStore.history.find(h => h.pubkey === hexPubkey);
			if (historyEntry?.profile) {
				spectateStore.setProfile(historyEntry.profile);
			}
			
			closePopover();
			window.location.reload();
			return;
		}
		
		// Fetch from relays
		isLoading = true;
		
		try {
			const result = await fetchRemoteUserData(hexPubkey, relays);
			
			if (!result.success) {
				inputError = result.error || 'Failed to fetch user data';
				return;
			}
			
			spectateStore.startSpectating(hexPubkey, trimmedNpub, relays);
			
			if (result.profile) {
				spectateStore.setProfile(result.profile);
			}
			
			await books.initialize(hexPubkey);
			await annotations.initialize(hexPubkey);
			await storeFetchedData(result);
			
			spectateStore.setLastSynced(Date.now());
			
			closePopover();
			window.location.reload();
			
		} catch (e) {
			inputError = 'Failed to fetch user data';
			console.error('[Spectate] Error:', e);
		} finally {
			isLoading = false;
		}
	}
	
	// Sync current spectate target
	async function handleSync() {
		if (!spectateStore.target) return;
		
		isLoading = true;
		inputError = null;
		
		try {
			const result = await fetchRemoteUserData(
				spectateStore.target.pubkey,
				spectateStore.target.relays
			);
			
			if (!result.success) {
				inputError = result.error || 'Failed to sync';
				return;
			}
			
			if (result.profile) {
				spectateStore.setProfile(result.profile);
			}
			
			await storeFetchedData(result);
			spectateStore.setLastSynced(Date.now());
			
			window.location.reload();
			
		} catch (e) {
			inputError = 'Sync failed';
			console.error('[Spectate] Sync failed:', e);
		} finally {
			isLoading = false;
		}
	}
	
	// Stop spectating
	function handleStopSpectating() {
		spectateStore.stopSpectating();
		closePopover();
		window.location.reload();
	}
	
	// Clear all local data for spectated user
	async function handleClearData() {
		if (!spectateStore.target) return;
		
		await deleteDataByOwner(spectateStore.target.pubkey);
		books.reset();
		annotations.reset();
		spectateStore.stopSpectating();
		closePopover();
		window.location.reload();
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative">
	<button
		bind:this={buttonRef}
		onclick={togglePopover}
		class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent transition-colors {spectateStore.isSpectating ? 'bg-blue-500/20 text-blue-400' : ''}"
		title={spectateStore.isSpectating ? `Spectating ${spectateStore.target?.npub?.slice(0, 12)}...` : 'View another library'}
	>
		<Eye class="h-5 w-5" />
	</button>
	
	{#if showPopover}
		<div
			bind:this={popoverRef}
			class="absolute right-0 top-full mt-2 w-96 rounded-lg border border-border bg-popover p-4 shadow-lg z-50"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') closePopover();
				e.stopPropagation();
			}}
			role="dialog"
			aria-label="Spectate options"
			tabindex="-1"
		>
			{#if currentView === 'history'}
				<!-- History View -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<button
							onclick={goToMain}
							class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
						>
							<ChevronLeft class="h-4 w-4" />
							Back
						</button>
						<h3 class="font-semibold text-sm">Previously viewed users</h3>
					</div>
					
					{#if spectateStore.history.length === 0}
						<p class="text-sm text-muted-foreground text-center py-4">No history yet</p>
					{:else}
						<div class="space-y-2 max-h-64 overflow-y-auto">
							{#each spectateStore.history as entry (entry.pubkey)}
								<div class="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 group">
									{#if entry.profile?.picture}
										<img src={entry.profile.picture} alt="" class="h-8 w-8 rounded-full object-cover" />
									{:else}
										<div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
											<Eye class="h-4 w-4 text-muted-foreground" />
										</div>
									{/if}
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium truncate">
											{entry.profile?.displayName || entry.profile?.name || truncateNpubMiddle(entry.npub, 20)}
										</p>
										<p class="text-xs text-muted-foreground truncate">
											{entry.relays.length} relay{entry.relays.length !== 1 ? 's' : ''}
										</p>
									</div>
									<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											onclick={() => goToEditRelays(entry)}
											class="p-1 rounded hover:bg-accent"
											title="Edit relays"
										>
											<Settings class="h-4 w-4" />
										</button>
										<button
											onclick={() => spectateStore.removeFromHistory(entry.pubkey)}
											class="p-1 rounded hover:bg-destructive/20 text-destructive"
											title="Remove from history"
										>
											<Trash2 class="h-4 w-4" />
										</button>
									</div>
									<button
										onclick={() => spectateFromHistory(entry)}
										disabled={isLoading}
										class="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
									>
										View
									</button>
								</div>
							{/each}
						</div>
					{/if}
					
					{#if inputError}
						<p class="text-sm text-destructive">{inputError}</p>
					{/if}
				</div>
				
			{:else if currentView === 'editRelays'}
				<!-- Edit Relays View -->
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<button
							onclick={goToHistory}
							class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
						>
							<ChevronLeft class="h-4 w-4" />
							Back
						</button>
						<h3 class="font-semibold text-sm">Edit Relays</h3>
					</div>
					
					{#if editingHistoryEntry}
						<div class="flex items-center justify-between gap-2">
							<p class="text-sm text-muted-foreground">
								{editingHistoryEntry.profile?.displayName || editingHistoryEntry.profile?.name || truncateNpubMiddle(editingHistoryEntry.npub)}
							</p>
							<button
								onclick={() => copyNpub(editingHistoryEntry!.npub)}
								class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
								title="Copy npub"
							>
								{#if copiedNpub}
									<Check class="h-3 w-3 text-green-500" />
								{:else}
									<Copy class="h-3 w-3" />
								{/if}
								<span class="font-mono">{truncateNpubMiddle(editingHistoryEntry.npub, 18)}</span>
							</button>
						</div>
						
						<div>
							<label for="edit-relay-input" class="text-xs text-muted-foreground">
								Relay URLs (one per line)
							</label>
							<textarea
								id="edit-relay-input"
								bind:value={editRelaysInput}
								rows="4"
								class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
							></textarea>
						</div>
						
						{#if inputError}
							<p class="text-sm text-destructive">{inputError}</p>
						{/if}
						
						<button
							onclick={saveRelays}
							class="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
						>
							Save Relays
						</button>
					{/if}
				</div>
				
			{:else if spectateStore.isSpectating && spectateStore.target}
				<!-- Spectating View -->
				<div class="space-y-3">
					<h3 class="font-semibold">Currently Spectating</h3>
					
					{#if spectateStore.target.profile?.picture}
						<div class="flex items-center gap-3">
							<img 
								src={spectateStore.target.profile.picture} 
								alt="Profile" 
								class="h-10 w-10 rounded-full object-cover"
							/>
							<div class="flex-1 min-w-0">
								<p class="font-medium truncate">
									{spectateStore.target.profile.displayName || spectateStore.target.profile.name || 'Unknown'}
								</p>
								<p class="text-xs text-muted-foreground font-mono">
									{truncateNpubMiddle(spectateStore.target.npub)}
								</p>
							</div>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground font-mono">
							{truncateNpubMiddle(spectateStore.target.npub)}
						</p>
					{/if}
					
					{#if inputError}
						<p class="text-sm text-destructive">{inputError}</p>
					{/if}
					
					{#if spectateStore.target.lastSynced}
						<p class="text-xs text-muted-foreground">
							Last synced {formatRelativeTime(spectateStore.target.lastSynced)}
						</p>
					{/if}
					
					<div class="flex gap-2">
						<button
							onclick={handleSync}
							disabled={isLoading}
							class="flex-1 flex items-center justify-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm hover:bg-secondary/80 disabled:opacity-50"
						>
							<RefreshCw class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
							{isLoading ? 'Syncing...' : 'Sync'}
						</button>
						<button
							onclick={handleClearData}
							class="flex items-center justify-center rounded-md bg-secondary px-3 py-2 text-sm hover:bg-secondary/80"
							title="Clear local data for this user"
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
					
					<button
						onclick={handleStopSpectating}
						class="w-full rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
					>
						Exit Spectate Mode
					</button>
				</div>
				
			{:else}
				<!-- Main View - Input Form -->
				<div class="space-y-3">
					<h3 class="font-semibold">Browse a user's library</h3>
					
					<!-- History button - always visible, but disabled when empty -->
					<button
						onclick={goToHistory}
						disabled={spectateStore.history.length === 0}
						class="w-full flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm {spectateStore.history.length > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50'}"
					>
						<History class="h-4 w-4" />
						Previously viewed users
					</button>
					
					<div class="border-t border-border"></div>
					
					<div>
						<label for="npub-input" class="text-xs text-muted-foreground">
							Nostr Public Key (npub)
						</label>
						<input
							id="npub-input"
							type="text"
							bind:value={npubInput}
							placeholder="npub1..."
							class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
					
					<div>
						<label for="relay-input" class="text-xs text-muted-foreground">
							Relay URLs (one per line or comma-separated)
						</label>
						<textarea
							id="relay-input"
							bind:value={relayInput}
							placeholder={defaultRelays[0]}
							rows="2"
							class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
						></textarea>
					</div>
					
					{#if inputError}
						<p class="text-sm text-destructive">{inputError}</p>
					{/if}
					
					<button
						onclick={startSpectating}
						disabled={isLoading || !npubInput.trim()}
						class="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
					>
						{#if isLoading}
							<RefreshCw class="h-4 w-4 animate-spin" />
							Fetching...
						{:else}
							Browse this user's library
						{/if}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
