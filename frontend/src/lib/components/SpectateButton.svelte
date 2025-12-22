<script lang="ts">
	import { Eye, X, RefreshCw, Trash2, Settings, History, ChevronLeft } from '@lucide/svelte';
	import { get } from 'svelte/store';
	import { spectateStore, type SpectateHistoryEntry } from '$lib/stores/spectate.svelte';
	import { fetchRemoteUserData } from '$lib/services/nostrService';
	import { deleteDataByOwner } from '$lib/services/storageService';
	import { getDefaultRelays } from '$lib/types/nostr';
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { decodeNpub } from '$lib/utils/nostr';
	
	let showPopover = $state(false);
	let npubInput = $state('');
	let relayInput = $state('');
	let inputError = $state<string | null>(null);
	let isLoading = $state(false);
	let popoverRef: HTMLDivElement;
	let buttonRef: HTMLButtonElement;
	
	// UI state for different views
	let currentView = $state<'main' | 'history' | 'editRelays'>('main');
	let editingHistoryEntry = $state<SpectateHistoryEntry | null>(null);
	let editRelaysInput = $state('');
	
	// Get default relays from environment
	const defaultRelays = getDefaultRelays();
	
	function togglePopover() {
		showPopover = !showPopover;
		if (showPopover) {
			inputError = null;
			currentView = 'main';
			editingHistoryEntry = null;
			// Pre-fill with current target if spectating, otherwise use defaults
			if (spectateStore.target) {
				npubInput = spectateStore.target.npub;
				relayInput = spectateStore.target.relays.join('\n');
			} else {
				npubInput = '';
				relayInput = defaultRelays.join('\n');
			}
		}
	}
	
	// Quick spectate from history - loads local data, no fetch
	async function spectateFromHistory(entry: SpectateHistoryEntry) {
		// Start spectating mode with stored profile from history
		spectateStore.startSpectating(entry.pubkey, entry.npub, entry.relays);
		if (entry.profile) {
			spectateStore.setProfile(entry.profile);
		}
		
		// Initialize stores with the spectate user's pubkey to load local data
		await books.initialize(entry.pubkey);
		await annotations.initialize(entry.pubkey);
		
		showPopover = false;
		window.location.reload();
	}
	
	// Open relay editor for a history entry
	function openRelayEditor(entry: SpectateHistoryEntry) {
		editingHistoryEntry = entry;
		editRelaysInput = entry.relays.join('\n');
		currentView = 'editRelays';
	}
	
	// Save edited relays
	function saveRelays() {
		if (!editingHistoryEntry) return;
		
		const relays = editRelaysInput
			.split(/[,\n]/)
			.map((r: string) => r.trim())
			.filter((r: string) => r.startsWith('wss://') || r.startsWith('ws://'));
		
		if (relays.length === 0) {
			inputError = 'Please enter at least one valid relay URL';
			return;
		}
		
		spectateStore.updateHistoryRelays(editingHistoryEntry.pubkey, relays);
		currentView = 'history';
		editingHistoryEntry = null;
		inputError = null;
	}
	
	function handleClickOutside(e: MouseEvent) {
		const target = e.target as Node;
		// Don't close if clicking the button (toggle handles that) or inside the popover
		if (buttonRef?.contains(target)) return;
		if (popoverRef?.contains(target)) return;
		showPopover = false;
	}
	
	async function validateAndStartSpectating() {
		inputError = null;
		
		const trimmedNpub = npubInput.trim();
		if (!trimmedNpub) {
			inputError = 'Please enter an npub';
			return;
		}
		
		// Validate npub format and decode to hex
		try {
			if (!trimmedNpub.startsWith('npub1')) {
				inputError = 'Invalid npub format (should start with npub1)';
				return;
			}
			
			const hexPubkey = decodeNpub(trimmedNpub);
			if (!hexPubkey) {
				inputError = 'Invalid npub format';
				return;
			}
			
			// Parse relays (comma or newline separated)
			const relays = relayInput
				.split(/[,\n]/)
				.map((r: string) => r.trim())
				.filter((r: string) => r.startsWith('wss://') || r.startsWith('ws://'));
			
			if (relays.length === 0) {
				inputError = 'Please enter at least one valid relay URL';
				return;
			}
			
			// Check if we already have local data for this user
			await books.initialize(hexPubkey);
			await annotations.initialize(hexPubkey);
			
			// Get current books count after initialization
			const existingBooks = get(books);
			
			if (existingBooks.length > 0) {
				// We have local data - just start spectating without fetching
				console.log(`[Spectate] Found ${existingBooks.length} local books for ${hexPubkey.slice(0, 8)}, using local data`);
				
				// Start spectating mode
				spectateStore.startSpectating(hexPubkey, trimmedNpub, relays);
				
				// Try to get profile from history
				const historyEntry = spectateStore.history.find((h: SpectateHistoryEntry) => h.pubkey === hexPubkey);
				if (historyEntry?.profile) {
					spectateStore.setProfile(historyEntry.profile);
				}
				
				showPopover = false;
				window.location.reload();
				return;
			}
			
			// No local data - fetch from relays
			isLoading = true;
			inputError = null;
			
			const result = await fetchRemoteUserData(hexPubkey, relays);
			
			if (!result.success) {
				inputError = result.error || 'Failed to fetch user data';
				isLoading = false;
				return;
			}
			
			// Start spectating mode
			spectateStore.startSpectating(hexPubkey, trimmedNpub, relays);
			
			// Set profile if found
			if (result.profile) {
				spectateStore.setProfile(result.profile);
			}
			
			// Initialize stores with the spectate user's pubkey BEFORE adding data
			await books.initialize(hexPubkey);
			await annotations.initialize(hexPubkey);
			
			// Store the fetched books and annotations in IndexedDB
			// Only add books that don't already exist (check by sha256)
			for (const book of result.books) {
				const existing = books.getBySha256(book.sha256);
				if (!existing) {
					await books.add({
						...book,
						progress: 0,
						currentPage: 0,
						totalPages: 0,
						hasEpubData: false, // Ghost book - no EPUB data
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
			
			// Update last synced timestamp
			spectateStore.setLastSynced(Date.now());
			
			isLoading = false;
			showPopover = false;
			
			// Reload to reinitialize stores with spectate data
			window.location.reload();
			
		} catch (e) {
			inputError = 'Invalid npub format';
			isLoading = false;
			console.error('[Spectate] Failed to decode npub:', e);
		}
	}
	
	function handleStopSpectating() {
		spectateStore.stopSpectating();
		showPopover = false;
		// Reload to reinitialize stores
		window.location.reload();
	}
	
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
				isLoading = false;
				return;
			}
			
			// Update profile if found
			if (result.profile) {
				spectateStore.setProfile(result.profile);
			}
			
			// Merge new books (add any we don't have)
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
			
			// Merge annotations (upsert handles LWW)
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
			
			spectateStore.setLastSynced(Date.now());
			
			// Reload to show updated data
			window.location.reload();
			
		} catch (e) {
			inputError = 'Sync failed';
			console.error('[Spectate] Sync failed:', e);
		} finally {
			isLoading = false;
		}
	}
	
	async function handleClearData() {
		if (!spectateStore.target) return;
		
		const pubkey = spectateStore.target.pubkey;
		
		// Delete all books and annotations for this spectated user from IndexedDB
		await deleteDataByOwner(pubkey);
		
		// Reset in-memory stores
		books.reset();
		annotations.reset();
		
		// Stop spectating
		spectateStore.stopSpectating();
		showPopover = false;
		
		// Reload to reinitialize
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
			class="absolute left-0 top-full mt-2 w-80 rounded-lg border border-border bg-popover p-4 shadow-lg z-50"
		>
			<p class="text-xs text-muted-foreground mb-2">Debug: isSpectating={spectateStore.isSpectating}, view={currentView}</p>
			{#if spectateStore.isSpectating && spectateStore.target && currentView === 'main'}
				<!-- Currently spectating -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="font-semibold text-sm">Spectating</h3>
						<button
							onclick={() => showPopover = false}
							class="text-muted-foreground hover:text-foreground"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
					
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
								<p class="text-xs text-muted-foreground truncate">
									{spectateStore.target.npub.slice(0, 20)}...
								</p>
							</div>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground truncate">
							{spectateStore.target.npub}
						</p>
					{/if}
					
					{#if spectateStore.target.lastSynced}
						<p class="text-xs text-muted-foreground">
							Last synced: {new Date(spectateStore.target.lastSynced).toLocaleString()}
						</p>
					{/if}
					
					{#if inputError}
						<p class="text-sm text-destructive">{inputError}</p>
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
			{:else if currentView === 'history'}
				<!-- History view -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<button
							onclick={() => currentView = 'main'}
							class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
						>
							<ChevronLeft class="h-4 w-4" />
							Back
						</button>
						<h3 class="font-semibold text-sm">History</h3>
						<button
							onclick={() => showPopover = false}
							class="text-muted-foreground hover:text-foreground"
						>
							<X class="h-4 w-4" />
						</button>
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
											{entry.profile?.displayName || entry.profile?.name || entry.npub.slice(0, 16) + '...'}
										</p>
										<p class="text-xs text-muted-foreground truncate">
											{entry.relays.length} relay{entry.relays.length !== 1 ? 's' : ''}
										</p>
									</div>
									<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											onclick={() => openRelayEditor(entry)}
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
				<!-- Edit relays view -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<button
							onclick={() => { currentView = 'history'; inputError = null; }}
							class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
						>
							<ChevronLeft class="h-4 w-4" />
							Back
						</button>
						<h3 class="font-semibold text-sm">Edit Relays</h3>
						<button
							onclick={() => showPopover = false}
							class="text-muted-foreground hover:text-foreground"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
					
					{#if editingHistoryEntry}
						<p class="text-sm text-muted-foreground truncate">
							{editingHistoryEntry.profile?.displayName || editingHistoryEntry.profile?.name || editingHistoryEntry.npub.slice(0, 20) + '...'}
						</p>
						
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
			{:else}
				<!-- Main view - Not spectating, show input form -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="font-semibold text-sm">View Another Library</h3>
						<div class="flex items-center gap-1">
							<button
								onclick={() => { console.log('[Spectate] History button clicked, history length:', spectateStore.history.length); currentView = 'history'; }}
								class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
								title="View history ({spectateStore.history.length})"
							>
								<History class="h-4 w-4" />
							</button>
							<button
								onclick={() => showPopover = false}
								class="text-muted-foreground hover:text-foreground"
							>
								<X class="h-4 w-4" />
							</button>
						</div>
					</div>
					
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
						onclick={validateAndStartSpectating}
						disabled={isLoading}
						class="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
					>
						{#if isLoading}
							<RefreshCw class="h-4 w-4 animate-spin" />
							Fetching...
						{:else}
							View Library
						{/if}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
