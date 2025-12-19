<script lang="ts">
	import { MessageSquare, Bot, X } from '@lucide/svelte';
	import type { AnnotationColor } from '$lib/types';

	interface Props {
		selectedText: string;
		position: { x: number; y: number };
		onHighlight: (color: AnnotationColor, note?: string) => void;
		onSendToAI?: () => void;
		onClose: () => void;
	}

	let { selectedText, position, onHighlight, onSendToAI, onClose }: Props = $props();

	// Calculate adjusted position to keep popup on screen
	const POPUP_WIDTH = 220;
	const POPUP_HEIGHT = 48;
	const MARGIN = 10;

	const adjustedPosition = $derived(() => {
		if (typeof window === 'undefined') return position;
		
		let x = position.x;
		let y = position.y - POPUP_HEIGHT - MARGIN;
		
		// Keep within horizontal bounds
		const halfWidth = POPUP_WIDTH / 2;
		if (x - halfWidth < MARGIN) {
			x = halfWidth + MARGIN;
		} else if (x + halfWidth > window.innerWidth - MARGIN) {
			x = window.innerWidth - halfWidth - MARGIN;
		}
		
		// If popup would go above viewport, show below selection instead
		if (y < MARGIN) {
			y = position.y + MARGIN + 20;
		}
		
		return { x, y };
	});

	let showNoteInput = $state(false);
	let noteText = $state('');
	let selectedColor = $state<AnnotationColor>('yellow');

	const colors: { color: AnnotationColor; bg: string; ring: string }[] = [
		{ color: 'yellow', bg: 'bg-yellow-300', ring: 'ring-yellow-500' },
		{ color: 'green', bg: 'bg-green-300', ring: 'ring-green-500' },
		{ color: 'blue', bg: 'bg-blue-300', ring: 'ring-blue-500' },
		{ color: 'pink', bg: 'bg-pink-300', ring: 'ring-pink-500' }
	];

	function handleHighlight() {
		onHighlight(selectedColor, noteText.trim() || undefined);
		resetState();
	}

	function handleColorClick(color: AnnotationColor) {
		selectedColor = color;
		if (!showNoteInput) {
			onHighlight(color);
			resetState();
		}
	}

	function toggleNoteInput() {
		showNoteInput = !showNoteInput;
	}

	function resetState() {
		showNoteInput = false;
		noteText = '';
		selectedColor = 'yellow';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleHighlight();
		} else if (event.key === 'Escape') {
			if (showNoteInput) {
				showNoteInput = false;
				noteText = '';
			} else {
				onClose();
			}
		}
	}
</script>

<div
	class="text-selection-popup no-select fixed z-50 flex flex-col rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
	style="left: {adjustedPosition().x}px; top: {adjustedPosition().y}px; transform: translateX(-50%);"
	role="dialog"
	aria-label="Text selection options"
>
	<!-- Main toolbar -->
	<div class="flex items-center gap-1 p-2">
		<!-- Highlight colors -->
		<div class="flex items-center gap-1 border-r border-border pr-2">
			{#each colors as { color, bg, ring }}
				<button
					onclick={() => handleColorClick(color)}
					class="h-6 w-6 rounded-full transition-transform hover:scale-110 {bg} {selectedColor === color && showNoteInput ? `ring-2 ${ring}` : ''}"
					aria-label="Highlight {color}"
					title="Highlight {color}"
				></button>
			{/each}
		</div>

		<!-- Add note button -->
		<button
			onclick={toggleNoteInput}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent {showNoteInput ? 'bg-accent' : ''}"
			aria-label="Add note"
			title="Add note"
		>
			<MessageSquare class="h-4 w-4" />
		</button>

		<!-- Send to AI button (placeholder) -->
		<button
			onclick={() => onSendToAI?.()}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			aria-label="Send to AI (coming soon)"
			title="Send to AI (coming soon)"
			disabled
		>
			<Bot class="h-4 w-4" />
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
			<div class="mt-2 flex justify-end gap-2">
				<button
					onclick={() => {
						showNoteInput = false;
						noteText = '';
					}}
					class="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
				>
					Cancel
				</button>
				<button
					onclick={handleHighlight}
					class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
				>
					Save
				</button>
			</div>
		</div>
	{/if}

	<!-- Selected text preview -->
	{#if selectedText && showNoteInput}
		<div class="border-t border-border p-2">
			<p class="line-clamp-2 text-xs italic text-muted-foreground">
				"{selectedText.slice(0, 100)}{selectedText.length > 100 ? '...' : ''}"
			</p>
		</div>
	{/if}
</div>
