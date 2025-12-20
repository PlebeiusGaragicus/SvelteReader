<script lang="ts">
	import { onMount } from 'svelte';
	import { MessageSquare, Trash2, X, Bot } from '@lucide/svelte';
	import type { AnnotationLocal, AnnotationColor } from '$lib/types';
	import { getAnnotationDisplayColor, annotationHasHighlight, annotationHasChat } from '$lib/types';

	interface Props {
		annotation: AnnotationLocal;
		position: { x: number; y: number };
		onUpdateColor: (color: AnnotationColor | null) => void;
		onUpdateNote: (note: string | undefined) => void;
		onDelete: () => void;
		onClose: () => void;
		onOpenAIChat?: () => void;
	}

	let { annotation, position, onUpdateColor, onUpdateNote, onDelete, onClose, onOpenAIChat }: Props = $props();
	
	// Derived state from composable properties
	const currentHighlightColor = $derived(getAnnotationDisplayColor(annotation));
	const hasHighlight = $derived(annotationHasHighlight(annotation));
	const hasChat = $derived(annotationHasChat(annotation));

	let showNoteInput = $state(false);
	let noteText = $state('');
	let popupElement: HTMLDivElement;
	
	// Initialize noteText when annotation changes
	$effect(() => {
		noteText = annotation.note || '';
	});

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (popupElement && !popupElement.contains(event.target as Node)) {
			onClose();
		}
	}

	onMount(() => {
		// Delay adding listener to avoid immediate close from the click that opened the popup
		const timeout = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 100);
		
		return () => {
			clearTimeout(timeout);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	const colors: { color: AnnotationColor; bg: string; ring: string }[] = [
		{ color: 'yellow', bg: 'bg-yellow-300', ring: 'ring-yellow-500' },
		{ color: 'green', bg: 'bg-green-300', ring: 'ring-green-500' },
		{ color: 'blue', bg: 'bg-blue-300', ring: 'ring-blue-500' },
		{ color: 'pink', bg: 'bg-pink-300', ring: 'ring-pink-500' }
	];

	// Calculate adjusted position to keep popup on screen
	const POPUP_WIDTH = 240;
	const POPUP_HEIGHT = 48;
	const MARGIN = 10;

	const adjustedPosition = $derived(() => {
		if (typeof window === 'undefined') return position;
		
		let x = position.x;
		let y = position.y - POPUP_HEIGHT - MARGIN;
		
		const halfWidth = POPUP_WIDTH / 2;
		if (x - halfWidth < MARGIN) {
			x = halfWidth + MARGIN;
		} else if (x + halfWidth > window.innerWidth - MARGIN) {
			x = window.innerWidth - halfWidth - MARGIN;
		}
		
		if (y < MARGIN) {
			y = position.y + MARGIN + 20;
		}
		
		return { x, y };
	});

	function handleColorClick(color: AnnotationColor) {
		if (color === currentHighlightColor) {
			// Clicking same color - toggle off (but only delete if no other content)
			if (!annotation.note && !hasChat) {
				onDelete();
			} else {
				onUpdateColor(null);  // Remove highlight but keep annotation
			}
		} else {
			onUpdateColor(color);
		}
	}

	function toggleNoteInput() {
		showNoteInput = !showNoteInput;
		if (showNoteInput) {
			noteText = annotation.note || '';
		}
	}

	function handleSaveNote() {
		onUpdateNote(noteText.trim() || undefined);
		showNoteInput = false;
	}

	function handleDeleteNote() {
		onUpdateNote(undefined);
		noteText = '';
		showNoteInput = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSaveNote();
		} else if (event.key === 'Escape') {
			if (showNoteInput) {
				showNoteInput = false;
			} else {
				onClose();
			}
		}
	}
</script>

<div
	bind:this={popupElement}
	class="annotation-edit-popup no-select fixed z-50 flex flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
	style="left: {adjustedPosition().x}px; top: {adjustedPosition().y}px; transform: translateX(-50%); background-color: var(--popover); color: var(--popover-foreground);"
	role="dialog"
	aria-label="Edit annotation"
>
	<!-- Main toolbar -->
	<div class="flex items-center gap-1 p-2">
		<!-- Highlight colors with X on selected to toggle off -->
		<div class="flex items-center gap-1 border-r border-border pr-2">
			{#each colors as { color, bg, ring }}
				{@const isSelected = currentHighlightColor === color}
				<button
					onclick={() => handleColorClick(color)}
					class="relative h-6 w-6 rounded-full transition-transform hover:scale-110 {bg} {isSelected ? `ring-2 ${ring}` : ''}"
					aria-label={isSelected ? "Remove highlight" : `Highlight ${color}`}
					title={isSelected ? "Remove highlight" : `Highlight ${color}`}
				>
					{#if isSelected}
						<span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">✕</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Edit note button -->
		<button
			onclick={toggleNoteInput}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent {showNoteInput || annotation.note ? 'bg-accent text-green-600' : ''}"
			aria-label={annotation.note ? 'Edit note' : 'Add note'}
			title={annotation.note ? 'Edit note' : 'Add note'}
		>
			<MessageSquare class="h-4 w-4" />
		</button>

		{#if annotation.note}
			<!-- AI Chat button (shown when annotation has a note) -->
			<button
				onclick={() => onOpenAIChat?.()}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-blue-500/10"
				aria-label="AI Chat"
				title="AI Chat with this context"
			>
				<Bot class="h-4 w-4" />
			</button>
		{:else}
			<!-- Delete button (shown when no note) -->
			<button
				onclick={onDelete}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
				aria-label="Delete annotation"
				title="Delete annotation"
			>
				<Trash2 class="h-4 w-4" />
			</button>
		{/if}

		<!-- Close button -->
		<button
			onclick={onClose}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent"
			aria-label="Close"
			title="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Note input area -->
	{#if showNoteInput}
		<div class="border-t border-border p-2">
			<textarea
				bind:value={noteText}
				onkeydown={handleKeydown}
				placeholder="Add a note..."
				class="w-64 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				rows="3"
			></textarea>
			<div class="mt-2 flex justify-between">
				<div class="flex gap-1">
					{#if annotation.note}
						<button
							onclick={handleDeleteNote}
							class="rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
						>
							Remove note
						</button>
					{/if}
					<!-- Delete annotation button in note view -->
					<button
						onclick={onDelete}
						class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
						aria-label="Delete annotation"
						title="Delete annotation"
					>
						<Trash2 class="h-3 w-3" />
						Delete
					</button>
				</div>
				<div class="flex gap-2">
					<button
						onclick={() => (showNoteInput = false)}
						class="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
					>
						Cancel
					</button>
					<button
						onclick={handleSaveNote}
						class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Selected text preview -->
	<div class="border-t border-border p-2">
		<p class="line-clamp-2 text-xs italic text-muted-foreground">
			"{annotation.text.slice(0, 100)}{annotation.text.length > 100 ? '...' : ''}"
		</p>
	</div>
</div>
