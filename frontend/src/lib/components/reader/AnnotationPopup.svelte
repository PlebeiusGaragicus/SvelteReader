<script lang="ts">
	import { onMount } from 'svelte';
	import { MessageSquare, Trash2, X, Bot } from '@lucide/svelte';
	import type { Annotation, AnnotationColor, AnnotationType } from '$lib/types';

	interface Props {
		// For new selections
		selectedText?: string;
		cfiRange?: string;
		// For editing existing annotations
		annotation?: Annotation;
		// Common
		position: { x: number; y: number };
		onSave: (data: { color: AnnotationColor; note?: string; type: AnnotationType }) => void;
		onDelete?: () => void;
		onClose: () => void;
		onOpenAIChat?: (context: { text: string; cfiRange: string; note?: string; threadId?: string }) => void;
	}

	let { 
		selectedText, 
		cfiRange,
		annotation, 
		position, 
		onSave, 
		onDelete, 
		onClose,
		onOpenAIChat 
	}: Props = $props();

	let popupElement: HTMLDivElement;
	let showNoteInput = $state(false);
	let noteText = $state('');
	let selectedColor = $state<AnnotationColor>('yellow');

	// Determine if we're editing an existing annotation
	const isEditing = $derived(!!annotation);
	const displayText = $derived(annotation?.text || selectedText || '');
	const hasNote = $derived(isEditing && !!annotation?.note);

	// Initialize state from annotation when editing
	$effect(() => {
		if (annotation) {
			noteText = annotation.note || '';
			selectedColor = annotation.color;
		}
	});

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (popupElement && !popupElement.contains(event.target as Node)) {
			onClose();
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
		if (isEditing) {
			// When editing, clicking a different color updates immediately
			if (color !== annotation?.color) {
				selectedColor = color;
				onSave({ color, note: annotation?.note, type: 'highlight' });
			} else if (annotation?.type === 'highlight') {
				// Clicking the same color on a highlight removes it
				onDelete?.();
			}
		} else {
			// For new selections, clicking a color creates the highlight immediately
			selectedColor = color;
			if (!showNoteInput) {
				onSave({ color, type: 'highlight' });
			}
		}
	}

	function toggleNoteInput() {
		showNoteInput = !showNoteInput;
		if (showNoteInput && annotation) {
			noteText = annotation.note || '';
		}
	}

	function handleSaveNote() {
		const type: AnnotationType = noteText.trim() ? 'note' : 'highlight';
		onSave({ color: selectedColor, note: noteText.trim() || undefined, type });
		if (!isEditing) {
			onClose();
		}
		showNoteInput = false;
	}

	function handleDeleteNote() {
		noteText = '';
		onSave({ color: selectedColor, note: undefined, type: 'highlight' });
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

	function handleAIChat() {
		// Capture context before any state changes
		const text = annotation?.text || selectedText || '';
		const range = annotation?.cfiRange || cfiRange || '';
		const note = annotation?.note || noteText.trim() || undefined;
		const existingThreadId = annotation?.chatThreadId;
		
		if (!isEditing) {
			// For new selections, save as ai-chat type (blue underline)
			onSave({ color: selectedColor, note: noteText.trim() || undefined, type: 'ai-chat' });
		}
		onOpenAIChat?.({ text, cfiRange: range, note, threadId: existingThreadId });
	}
</script>

<div
	bind:this={popupElement}
	class="annotation-popup no-select fixed z-50 flex flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
	style="left: {adjustedPosition().x}px; top: {adjustedPosition().y}px; transform: translateX(-50%); background-color: var(--popover); color: var(--popover-foreground);"
	role="dialog"
	aria-label={isEditing ? "Edit annotation" : "Text selection options"}
>
	<!-- Main toolbar -->
	<div class="flex items-center gap-1 p-2">
		<!-- Highlight colors -->
		<div class="flex items-center gap-1 border-r border-border pr-2">
			{#each colors as { color, bg, ring }}
				{@const isSelected = selectedColor === color && (isEditing ? annotation?.type === 'highlight' : showNoteInput)}
				{@const isCurrentColor = isEditing && annotation?.color === color && annotation?.type === 'highlight'}
				<button
					onclick={() => handleColorClick(color)}
					class="relative h-6 w-6 rounded-full transition-transform hover:scale-110 {bg} {isSelected || isCurrentColor ? `ring-2 ${ring}` : ''}"
					aria-label={isCurrentColor ? "Remove highlight" : `Highlight ${color}`}
					title={isCurrentColor ? "Remove highlight" : `Highlight ${color}`}
				>
					{#if isCurrentColor}
						<span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">✕</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Note button -->
		<button
			onclick={toggleNoteInput}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent {showNoteInput || hasNote ? 'bg-accent text-green-600' : ''}"
			aria-label={hasNote ? 'Edit note' : 'Add note'}
			title={hasNote ? 'Edit note' : 'Add note'}
		>
			<MessageSquare class="h-4 w-4" />
		</button>

		<!-- AI Chat button (always enabled) -->
		<button
			onclick={handleAIChat}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-blue-500/10"
			aria-label="AI Chat"
			title="AI Chat with this context"
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
			<div class="mt-2 flex justify-between">
				<div class="flex gap-1">
					{#if hasNote}
						<button
							onclick={handleDeleteNote}
							class="rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
						>
							Remove note
						</button>
					{/if}
					{#if isEditing}
						<button
							onclick={() => onDelete?.()}
							class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
							aria-label="Delete annotation"
							title="Delete annotation"
						>
							<Trash2 class="h-3 w-3" />
							Delete
						</button>
					{/if}
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
	<div class="border-t border-border p-2 max-w-xs">
		<p class="line-clamp-2 text-xs italic text-muted-foreground break-words">
			"{displayText.slice(0, 100)}{displayText.length > 100 ? '...' : ''}"
		</p>
	</div>
</div>
