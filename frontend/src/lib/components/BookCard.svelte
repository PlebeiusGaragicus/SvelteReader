<script lang="ts">
	import { onMount } from 'svelte';
	import { MoreVertical, Trash2, BookOpen, Ghost, BookX, MessageSquareX, X } from '@lucide/svelte';
	import type { Book } from '$lib/stores/books';
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { removeEpubData } from '$lib/services/storageService';

	interface Props {
		book: Book;
	}

	let { book }: Props = $props();
	let menuOpen = $state(false);
	let showDeleteModal = $state(false);
	let menuElement: HTMLDivElement | null = $state(null);

	// Convert base64 to data URL for display
	const coverUrl = $derived(
		book.coverBase64 ? `data:image/jpeg;base64,${book.coverBase64}` : null
	);

	function openDeleteModal(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		showDeleteModal = true;
	}

	async function handleDeleteBook(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		await books.remove(book.id);
		showDeleteModal = false;
	}

	async function handleDeleteAnnotations(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		await annotations.removeForBook(book.sha256);
		showDeleteModal = false;
	}

	async function handleDeleteAll(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		await annotations.removeForBook(book.sha256);
		await books.remove(book.id);
		showDeleteModal = false;
	}

	function closeModal(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		showDeleteModal = false;
	}

	function handleClickOutside(event: MouseEvent) {
		if (menuOpen && menuElement && !menuElement.contains(event.target as Node)) {
			menuOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

<a
	href="/book/{book.id}"
	class="book-card group relative cursor-pointer rounded-lg border border-border bg-card transition-shadow hover:shadow-lg"
>
	<div class="relative aspect-[2/3] overflow-hidden rounded-t-lg bg-muted">
		{#if coverUrl}
			<img
				src={coverUrl}
				alt={book.title}
				class="h-full w-full object-cover"
			/>
		{:else}
			<div class="flex h-full w-full items-center justify-center">
				<BookOpen class="h-10 w-10 text-muted-foreground" />
			</div>
		{/if}
		
		{#if !book.hasEpubData}
			<div class="absolute inset-0 flex items-center justify-center bg-background/60">
				<Ghost class="h-8 w-8 text-muted-foreground" />
			</div>
		{/if}

		{#if book.progress > 0}
			<div class="absolute bottom-0 left-0 right-0 h-1 bg-muted">
				<div
					class="h-full bg-primary transition-all"
					style="width: {book.progress}%"
				></div>
			</div>
		{/if}

		<!-- Context Menu Button -->
		<div 
			bind:this={menuElement}
			class="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
		>
			<button
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					menuOpen = !menuOpen;
				}}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 backdrop-blur hover:bg-background"
				aria-label="Book options"
			>
				<MoreVertical class="h-4 w-4" />
			</button>

			{#if menuOpen}
				<div class="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-border bg-popover p-1 shadow-lg">
					<button
						onclick={openDeleteModal}
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
					>
						<Trash2 class="h-4 w-4" />
						Delete...
					</button>
				</div>
			{/if}
		</div>
	</div>

	<div class="p-2">
		<h3 class="mb-0.5 line-clamp-2 text-xs font-semibold">{book.title}</h3>
		<p class="line-clamp-1 text-xs text-muted-foreground">{book.author}</p>
		{#if book.progress > 0}
			<p class="mt-1 text-xs text-muted-foreground">{Math.round(book.progress)}%</p>
		{/if}
	</div>
</a>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onclick={closeModal}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div 
			class="mx-4 w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold">Delete Options</h3>
				<button
					onclick={closeModal}
					class="rounded-md p-1 hover:bg-accent"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			
			<p class="mb-4 text-sm text-muted-foreground">
				Choose what to delete for "{book.title}"
			</p>
			
			<div class="flex flex-col gap-2">
				<button
					onclick={handleDeleteBook}
					class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
				>
					<BookX class="h-4 w-4" />
					Delete Book Only
				</button>
				<button
					onclick={handleDeleteAnnotations}
					class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
				>
					<MessageSquareX class="h-4 w-4" />
					Delete Annotations Only
				</button>
				<button
					onclick={handleDeleteAll}
					class="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
				>
					<Trash2 class="h-4 w-4" />
					Delete All Data
				</button>
			</div>
			
			<button
				onclick={closeModal}
				class="mt-4 w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
			>
				Cancel
			</button>
		</div>
	</div>
{/if}
