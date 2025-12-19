<script lang="ts">
	import { onMount } from 'svelte';
	import { MessageSquare, Trash2, X } from '@lucide/svelte';
	import type { Annotation, AnnotationColor } from '$lib/types';

	interface Props {
		annotation: Annotation;
		position: { x: number; y: number };
		onUpdateColor: (color: AnnotationColor) => void;
		onUpdateNote: (note: string | undefined) => void;
		onDelete: () => void;
		onClose: () => void;
	}

	let { annotation, position, onUpdateColor, onUpdateNote, onDelete, onClose }: Props = $props();

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
		if (color !== annotation.color) {
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
	class="annotation-edit-popup no-select fixed z-50 flex flex-col rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
	style="left: {adjustedPosition().x}px; top: {adjustedPosition().y}px; transform: translateX(-50%);"
	role="dialog"
	aria-label="Edit annotation"
>
	<!-- Main toolbar -->
	<div class="flex items-center gap-1 p-2">
		<!-- Highlight colors with X on selected to toggle off (only for highlight type, not note-only) -->
		<div class="flex items-center gap-1 border-r border-border pr-2">
			{#each colors as { color, bg, ring }}
				{@const isSelected = annotation.color === color && annotation.type === 'highlight'}
				<button
					onclick={() => isSelected ? onDelete() : handleColorClick(color)}
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

		<!-- Delete button -->
		<button
			onclick={onDelete}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
			aria-label="Delete annotation"
			title="Delete annotation"
		>
			<Trash2 class="h-4 w-4" />
		</button>

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
				{#if annotation.note}
					<button
						onclick={handleDeleteNote}
						class="rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
					>
						Remove note
					</button>
				{:else}
					<div></div>
				{/if}
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
