<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { books, type Book } from '$lib/stores/books.svelte';
	import { annotations } from '$lib/stores/annotations.svelte';
	import { syncStore } from '$lib/stores/sync.svelte';
	import { spectateStore } from '$lib/stores/spectate.svelte';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { userFilesStore, type UserFile } from '$lib/stores/userFiles.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import { FileCard, FileUploadButton, FileEditModal } from '$lib/components/reader';
	import { BookOpen, Binoculars, FolderOpen, User, LogIn, FileText, ChevronDown, ChevronRight, Search, X, Filter, Upload } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';
	import { toast } from 'svelte-sonner';

	// Helper: Middle-truncate an npub (e.g., "npub1abc...xyz")
	function truncateNpubMiddle(npub: string, maxLength: number = 24): string {
		if (npub.length <= maxLength) return npub;
		const prefixLength = 8; // "npub1" + a few chars
		const suffixLength = 6;
		return `${npub.slice(0, prefixLength)}...${npub.slice(-suffixLength)}`;
	}

	// Ensure mode is set correctly when navigating to this page
	onMount(() => {
		if (modeStore.current !== 'reader') {
			modeStore.setMode('reader');
		}
	});

	// Set up sync callbacks when logged in (SyncStatusButton is in TopBar)
	// Only enable sync when NOT spectating (can't sync someone else's data)
	$effect(() => {
		if (cyphertap.isLoggedIn && !spectateStore.isSpectating) {
			annotations.setCyphertap(cyphertap);
			books.setCyphertap(cyphertap);
			syncStore.setCyphertap(cyphertap);
			syncStore.setMergeCallback(annotations.mergeFromNostr);
			syncStore.setBookMergeCallback(books.mergeFromNostr);
			// Initialize user files store
			if (cyphertap.npub) {
				userFilesStore.initialize(cyphertap.npub);
			}
		} else {
			annotations.setCyphertap(null);
			books.setCyphertap(null);
			syncStore.setCyphertap(null);
			userFilesStore.setNpub(null);
		}
	});
	
	// Determine if we should show the library (logged in OR spectating)
	const canViewLibrary = $derived(cyphertap.isLoggedIn || spectateStore.isSpectating);
	
	// Other books with EPUB data (from other users on this device)
	let otherBooks = $state<Book[]>([]);
	let showOtherBooks = $state(false);
	
	// My Files section state
	let showFilesSection = $state(true);
	let fileSearchQuery = $state('');
	let fileTypeFilter = $state<'all' | 'pdf' | 'image' | 'text'>('all');
	
	// Filtered files based on search and type filter
	const filteredFiles = $derived.by(() => {
		let result = userFilesStore.files;
		
		// Apply type filter
		if (fileTypeFilter !== 'all') {
			result = result.filter(f => f.type === fileTypeFilter);
		}
		
		// Apply search filter
		if (fileSearchQuery.trim()) {
			const query = fileSearchQuery.toLowerCase();
			result = result.filter(f => f.name.toLowerCase().includes(query));
		}
		
		return result;
	});
	
	// Load other books when logged in and not spectating
	async function loadOtherBooks() {
		if (cyphertap.isLoggedIn && !spectateStore.isSpectating) {
			const others = await books.getOtherBooksWithEpub();
			// Filter out books that current user already has (by sha256)
			const myBookHashes = new Set(books.items.map(b => b.sha256));
			otherBooks = others.filter(b => !myBookHashes.has(b.sha256));
		} else {
			otherBooks = [];
		}
	}
	
	// Reload other books when user's books change or login state changes
	$effect(() => {
		const _ = books.items; // Track changes to user's books
		const __ = cyphertap.isLoggedIn;
		const ___ = spectateStore.isSpectating;
		loadOtherBooks();
	});

	// Drag and drop state
	let isDragging = $state(false);
	let dragFileType = $state<'epub' | 'file' | 'unknown'>('unknown');
	let importButtonRef = $state<ImportButton>();
	let fileUploadRef = $state<FileUploadButton>();

	// Detect file type from drag event
	function detectDragFileType(e: DragEvent): 'epub' | 'file' | 'unknown' {
		const items = e.dataTransfer?.items;
		if (!items || items.length === 0) return 'unknown';
		
		for (const item of Array.from(items)) {
			if (item.type === 'application/epub+zip') return 'epub';
			if (item.type === 'application/pdf') return 'file';
			if (item.type.startsWith('image/')) return 'file';
			if (item.type.startsWith('text/')) return 'file';
		}
		
		// Check file extension from file name if available
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			const fileName = files[0].name.toLowerCase();
			if (fileName.endsWith('.epub')) return 'epub';
			if (fileName.endsWith('.pdf') || fileName.endsWith('.txt') || fileName.endsWith('.md')) return 'file';
			if (fileName.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'file';
		}
		
		return 'unknown';
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
		dragFileType = detectDragFileType(e);
	}

	function handleDragLeave(e: DragEvent) {
		// Only set to false if leaving the main container
		if (e.currentTarget === e.target) {
			isDragging = false;
			dragFileType = 'unknown';
		}
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		
		const file = e.dataTransfer?.files?.[0];
		if (!file) return;
		
		const fileName = file.name.toLowerCase();
		const isEpub = fileName.endsWith('.epub') || file.type === 'application/epub+zip';
		const isFile = file.type === 'application/pdf' || 
			file.type.startsWith('image/') || 
			file.type.startsWith('text/') ||
			fileName.endsWith('.pdf') ||
			fileName.endsWith('.txt') ||
			fileName.endsWith('.md') ||
			fileName.match(/\.(png|jpg|jpeg|gif|webp)$/);
		
		if (isEpub && importButtonRef) {
			// Handle EPUB - use existing import button logic
			importButtonRef.processFile(file);
		} else if (isFile && fileUploadRef) {
			// Handle file - use file upload logic and show edit modal
			const uploadedFile = await fileUploadRef.processFile(file);
			if (uploadedFile) {
				// Show the edit modal for single file drops
				editingFile = uploadedFile;
				isNewFileImport = true;
				showEditModal = true;
			}
		} else {
			toast.error('Unsupported file type', {
				description: 'Please drop an EPUB, PDF, image, or text file.'
			});
		}
		
		dragFileType = 'unknown';
	}
	
	// File handlers
	let editingFile = $state<UserFile | null>(null);
	let showEditModal = $state(false);
	let isNewFileImport = $state(false);
	
	function handleDeleteFile(file: UserFile) {
		userFilesStore.deleteFile(file.id);
	}
	
	function handleEditFile(file: UserFile) {
		editingFile = file;
		isNewFileImport = false;
		showEditModal = true;
	}
	
	function handleNewFileImported(file: UserFile) {
		editingFile = file;
		isNewFileImport = true;
		showEditModal = true;
	}
	
	function handleCloseEditModal() {
		showEditModal = false;
		editingFile = null;
		isNewFileImport = false;
	}
</script>

<svelte:head>
	<title>SvelteReader | Library</title>
</svelte:head>

<main 
	class="px-4 py-8 min-h-[calc(100vh-3.5rem)] relative"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if !canViewLibrary}
		<!-- Demo page for logged out users -->
		<div class="flex flex-col items-center justify-center py-16 text-center max-w-2xl mx-auto">
			<div class="relative mb-8">
				<BookOpen class="h-24 w-24 text-cyan-500" />
				<div class="absolute -bottom-2 -right-2 bg-primary text-primary-foreground rounded-full p-2">
					<LogIn class="h-4 w-4" />
				</div>
			</div>
			
			<h1 class="text-3xl font-bold mb-4">Reader Mode</h1>
			<p class="text-lg text-muted-foreground mb-6">
				Import and read EPUB books with AI-powered annotations, highlights, and notes.
			</p>
			
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 w-full">
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<BookOpen class="h-8 w-8 text-cyan-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Read EPUBs</h3>
					<p class="text-xs text-muted-foreground">Import and read your ebook collection in the browser</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<div class="h-8 w-8 text-yellow-500 mb-2 mx-auto flex items-center justify-center text-xl">✨</div>
					<h3 class="font-medium mb-1">AI Annotations</h3>
					<p class="text-xs text-muted-foreground">Highlight text and get AI-powered insights</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<div class="h-8 w-8 text-green-500 mb-2 mx-auto flex items-center justify-center text-xl">🔄</div>
					<h3 class="font-medium mb-1">Nostr Sync</h3>
					<p class="text-xs text-muted-foreground">Sync annotations across devices via Nostr</p>
				</div>
			</div>
			
			<div class="flex flex-col items-center gap-3">
				<p class="text-muted-foreground">
					<User class="inline h-4 w-4 mr-1" />
					Log in with Nostr to access Reader mode
				</p>
				<p class="text-sm text-muted-foreground">
					Or use the <Binoculars class="inline h-4 w-4" /> button to view another user's library
				</p>
			</div>
		</div>
	{:else if spectateStore.isSpectating && books.items.length === 0}
		<!-- Spectating user with no books -->
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<Binoculars class="mb-4 h-20 w-20 text-blue-400" />
			<h2 class="mb-2 text-2xl font-semibold">No books found</h2>
			<p class="mb-6 text-muted-foreground">This user hasn't published any books yet</p>
		</div>
	{:else}
		{#if spectateStore.isSpectating && spectateStore.target}
			<!-- Spectating Header -->
			<div class="mb-6 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<Binoculars class="h-6 w-6 text-blue-400" />
					<div>
						<h1 class="library-header text-2xl font-bold">
							{spectateStore.target.profile?.displayName || spectateStore.target.profile?.name || 'User'}'s Library
						</h1>
						<p class="text-xs text-muted-foreground font-mono">{truncateNpubMiddle(spectateStore.target.npub)}</p>
					</div>
				</div>
				<span class="rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-400">View Only</span>
			</div>
			
			<!-- Spectating Books Grid -->
			{#if books.items.length > 0}
				<div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
					{#each books.items as book (book.id)}
						<BookCard {book} />
					{/each}
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
					<Binoculars class="mb-4 h-12 w-12 text-muted-foreground" />
					<p class="text-muted-foreground">This user hasn't published any books yet</p>
				</div>
			{/if}
		{:else}
			<!-- ======================= MY LIBRARY SECTION ======================= -->
			<section class="mb-12">
				<div class="mb-6 flex items-center justify-between">
					<div class="flex items-center gap-3">
						<BookOpen class="h-6 w-6 text-cyan-500" />
						<h1 class="text-2xl font-bold">My Library</h1>
						{#if books.items.length > 0}
							<span class="text-sm text-muted-foreground">({books.items.length})</span>
						{/if}
					</div>
					<ImportButton bind:this={importButtonRef} />
				</div>
				
				{#if books.items.length > 0}
					<div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
						{#each books.items as book (book.id)}
							<BookCard {book} />
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
						<BookOpen class="mb-4 h-12 w-12 text-muted-foreground" />
						<p class="text-muted-foreground">No books in your library yet</p>
						<p class="text-sm text-muted-foreground mt-1">Import an EPUB or drag and drop a file</p>
					</div>
				{/if}
				
				<!-- Available Books Section (other users' books with EPUB data) -->
				{#if otherBooks.length > 0}
					<div class="mt-8">
						<button
							onclick={() => showOtherBooks = !showOtherBooks}
							class="flex items-center gap-2 text-base font-semibold text-muted-foreground hover:text-foreground transition-colors mb-4"
						>
							<FolderOpen class="h-5 w-5" />
							<span>Available on This Device</span>
							<span class="text-sm font-normal">({otherBooks.length})</span>
							{#if showOtherBooks}
								<ChevronDown class="h-4 w-4" />
							{:else}
								<ChevronRight class="h-4 w-4" />
							{/if}
						</button>
						
						{#if showOtherBooks}
							<p class="text-sm text-muted-foreground mb-4">
								These books have EPUB data stored locally from other accounts. Add them to your library to read.
							</p>
							<div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
								{#each otherBooks as book (book.id)}
									<BookCard {book} showAdoptButton={true} onAdopt={() => loadOtherBooks()} />
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</section>
			
			<!-- ======================= MY FILES SECTION ======================= -->
			{#if cyphertap.isLoggedIn}
				<section>
					<div class="mb-6 flex items-center justify-between">
						<div class="flex items-center gap-3">
							<FileText class="h-6 w-6 text-purple-500" />
							<h1 class="text-2xl font-bold">My Files</h1>
							{#if userFilesStore.files.length > 0}
								<span class="text-sm text-muted-foreground">({userFilesStore.files.length})</span>
							{/if}
						</div>
						<FileUploadButton bind:this={fileUploadRef} variant="compact" onFileImported={handleNewFileImported} />
					</div>
					
					<p class="text-sm text-muted-foreground mb-4">
						PDFs, images, and text files that can be used by Deep Research agents.
					</p>
					
					{#if userFilesStore.files.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
							<FileUploadButton onFileImported={handleNewFileImported} />
						</div>
					{:else}
						<!-- Filter and Search Bar -->
						<div class="flex flex-wrap items-center gap-3 mb-4">
							<!-- Search -->
							<div class="relative flex-1 min-w-48 max-w-xs">
								<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<input
									type="text"
									bind:value={fileSearchQuery}
									placeholder="Search files..."
									class="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
								/>
								{#if fileSearchQuery}
									<button
										onclick={() => { fileSearchQuery = ''; }}
										class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
									>
										<X class="h-4 w-4" />
									</button>
								{/if}
							</div>
							
							<!-- Type Filter -->
							<div class="flex items-center gap-1 rounded-lg border border-border p-1">
								<button
									onclick={() => { fileTypeFilter = 'all'; }}
									class="px-3 py-1 text-xs font-medium rounded-md transition-colors
										{fileTypeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}"
								>
									All
								</button>
								<button
									onclick={() => { fileTypeFilter = 'pdf'; }}
									class="px-3 py-1 text-xs font-medium rounded-md transition-colors
										{fileTypeFilter === 'pdf' ? 'bg-red-500 text-white' : 'text-muted-foreground hover:bg-muted'}"
								>
									PDF
								</button>
								<button
									onclick={() => { fileTypeFilter = 'image'; }}
									class="px-3 py-1 text-xs font-medium rounded-md transition-colors
										{fileTypeFilter === 'image' ? 'bg-blue-500 text-white' : 'text-muted-foreground hover:bg-muted'}"
								>
									Image
								</button>
								<button
									onclick={() => { fileTypeFilter = 'text'; }}
									class="px-3 py-1 text-xs font-medium rounded-md transition-colors
										{fileTypeFilter === 'text' ? 'bg-green-500 text-white' : 'text-muted-foreground hover:bg-muted'}"
								>
									Text
								</button>
							</div>
						</div>
						
						<!-- Files Grid -->
						{#if filteredFiles.length === 0}
							<div class="flex flex-col items-center justify-center py-8 text-center">
								<Search class="h-8 w-8 text-muted-foreground/50 mb-2" />
								<p class="text-sm text-muted-foreground">No files match your search</p>
								<button
									onclick={() => { fileSearchQuery = ''; fileTypeFilter = 'all'; }}
									class="mt-2 text-xs text-primary hover:underline"
								>
									Clear filters
								</button>
							</div>
						{:else}
							<div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
								{#each filteredFiles as file (file.id)}
									<FileCard 
										{file} 
										onDelete={handleDeleteFile}
										onEdit={handleEditFile}
									/>
								{/each}
							</div>
						{/if}
						
						{#if userFilesStore.totalSize > 0}
							<p class="text-xs text-muted-foreground mt-4">
								{filteredFiles.length} of {userFilesStore.files.length} files • Total: {userFilesStore.formatSize(userFilesStore.totalSize)}
							</p>
						{/if}
					{/if}
				</section>
			{/if}
		{/if}
	{/if}

	<!-- Drag overlay -->
	{#if isDragging}
		<div class="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none">
			<div class="text-center">
				{#if dragFileType === 'epub'}
					<BookOpen class="mx-auto h-16 w-16 text-cyan-500 mb-2" />
					<p class="text-lg font-medium text-cyan-500">Drop EPUB to import</p>
				{:else if dragFileType === 'file'}
					<FileText class="mx-auto h-16 w-16 text-purple-500 mb-2" />
					<p class="text-lg font-medium text-purple-500">Drop file to import</p>
				{:else}
					<Upload class="mx-auto h-16 w-16 text-primary mb-2" />
					<p class="text-lg font-medium text-primary">Drop file to import</p>
					<p class="text-sm text-muted-foreground mt-1">EPUB, PDF, images, or text files</p>
				{/if}
			</div>
		</div>
	{/if}
</main>

<!-- File Edit Modal -->
<FileEditModal
	file={editingFile}
	open={showEditModal}
	onClose={handleCloseEditModal}
	isNewFile={isNewFileImport}
/>


