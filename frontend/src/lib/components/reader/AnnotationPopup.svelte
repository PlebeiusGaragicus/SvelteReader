<script lang="ts">
	import { onMount } from 'svelte';
	import { MessageSquare, Trash2, X, Bot } from '@lucide/svelte';
	import type { AnnotationLocal, AnnotationColor } from '$lib/types';
	import { annotationHasHighlight, annotationHasChat, getAnnotationDisplayColor, getAnnotationKey } from '$lib/types';

	// Composable annotation data - allows highlight + note + chat simultaneously
	export interface AnnotationSaveData {
		highlightColor?: AnnotationColor | null;  // null = explicitly no highlight
		note?: string;
		chatThreadId?: string;
	}

	interface Props {
		// For new selections
		selectedText?: string;
		cfiRange?: string;
		// For editing existing annotations
		annotation?: AnnotationLocal;
		// Common
		position: { x: number; y: number };
		onSave: (data: AnnotationSaveData) => void | Promise<void>;
		onDelete?: () => void | Promise<void>;
		onClose: () => void;
		onOpenAIChat?: (context: { text: string; cfiRange: string; note?: string; threadId?: string; annotationKey?: string }) => void;
		// Read-only mode (spectate)
		readOnly?: boolean;
	}

	let { 
		selectedText, 
		cfiRange,
		annotation, 
		position, 
		onSave, 
		onDelete, 
		onClose,
		onOpenAIChat,
		readOnly = false
	}: Props = $props();

	let popupElement: HTMLDivElement;
	let showNoteInput = $state(false);
	let noteText = $state('');
	let selectedColor = $state<AnnotationColor>('yellow');
	// Track if user explicitly selected a highlight color (for new annotations)
	let userSelectedHighlight = $state(false);
	// Delete confirmation modal
	let showDeleteConfirm = $state(false);

	// Determine if we're editing an existing annotation
	const isEditing = $derived(!!annotation);
	const displayText = $derived(annotation?.text || selectedText || '');
	const hasNote = $derived(isEditing && !!annotation?.note);
	const hasHighlight = $derived(isEditing && annotation ? annotationHasHighlight(annotation) : false);
	const hasChat = $derived(isEditing && annotation ? annotationHasChat(annotation) : false);
	
	// Get the current highlight color (using composable model)
	const currentHighlightColor = $derived(
		annotation ? getAnnotationDisplayColor(annotation) : null
	);

	// Initialize state from annotation when editing
	$effect(() => {
		if (annotation) {
			noteText = annotation.note || '';
			// Use highlightColor if set
			if (annotation.highlightColor) {
				selectedColor = annotation.highlightColor;
			}
		}
	});

	// Click outside to close (but not when delete confirmation is showing)
	function handleClickOutside(event: MouseEvent) {
		if (showDeleteConfirm) return; // Don't close while confirmation modal is open
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
		if (isEditing && annotation) {
			const currentColor = currentHighlightColor;
			if (color !== currentColor) {
				// Clicking a different color - add/change highlight while preserving other properties
				selectedColor = color;
				userSelectedHighlight = true;
				onSave({ 
					highlightColor: color,
					note: annotation.note
				});
				onClose();
			} else {
				// Clicking the same color - toggle highlight off (but keep note/chat if present)
				if (annotation.note || annotationHasChat(annotation)) {
					// Has other properties - just remove highlight
					onSave({ 
						highlightColor: null,
						note: annotation.note
					});
					onClose();
				} else {
					// Only has highlight - delete entire annotation
					onDelete?.();
				}
			}
		} else {
			// For new selections, clicking a color marks that user explicitly chose a highlight
			selectedColor = color;
			userSelectedHighlight = true;
			if (!showNoteInput) {
				onSave({ highlightColor: color });
				onClose();
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
		const note = noteText.trim() || undefined;
		
		// For new annotations, only include highlight if user explicitly selected a color
		// For existing annotations, preserve their highlight state
		const highlightColor = isEditing 
			? (annotation?.highlightColor ?? null)
			: (userSelectedHighlight ? selectedColor : null);
		
		// Save first (onClose clears textSelection/editingAnnotation which onSave needs)
		onSave({ 
			highlightColor,
			note
		});
		
		// Then close popup
		onClose();
	}

	function handleDeleteNote() {
		noteText = '';
		
		// If annotation has highlight or chat threads, just remove the note
		// Otherwise, delete the entire annotation
		if (hasHighlight || hasChat) {
			// Save first, then close (onClose clears state that onSave needs)
			// Use null to explicitly clear the note (undefined means "don't change")
			onSave({ 
				highlightColor: annotation?.highlightColor ?? null,
				note: null
			});
			onClose();
		} else {
			// No other content - delete entire annotation
			onDelete?.();
		}
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
		// Get first thread ID if any exist (for continuing existing chat)
		const existingThreadId = annotation?.chatThreadIds?.[0];
		const annotationKey = annotation ? getAnnotationKey(annotation.bookSha256, annotation.cfiRange) : undefined;
		
		if (!isEditing) {
			// For new selections, create annotation for chat context
			// Only include highlight if user explicitly clicked a color button first
			onSave({ 
				highlightColor: userSelectedHighlight ? selectedColor : null,
				note: noteText.trim() || undefined
			});
		}
		onOpenAIChat?.({ text, cfiRange: range, note, threadId: existingThreadId, annotationKey });
	}
</script>

<div
	bind:this={popupElement}
	class="annotation-popup no-select fixed z-50 flex flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
	style="left: {adjustedPosition().x}px; top: {adjustedPosition().y}px; transform: translateX(-50%); background-color: var(--popover); color: var(--popover-foreground);"
	role="dialog"
	aria-label={readOnly ? "View annotation" : (isEditing ? "Edit annotation" : "Text selection options")}
>
	{#if readOnly}
		<!-- Read-only view for spectate mode -->
		<div class="p-3 max-w-xs">
			<p class="text-xs text-muted-foreground mb-2">Viewing annotation</p>
			{#if hasHighlight}
				<div class="flex items-center gap-2 mb-2">
					<span class="text-xs text-muted-foreground">Highlight:</span>
					<span class="h-4 w-4 rounded-full {colors.find(c => c.color === currentHighlightColor)?.bg || 'bg-yellow-300'}"></span>
				</div>
			{/if}
			{#if hasNote}
				<div class="mb-2">
					<span class="text-xs text-muted-foreground">Note:</span>
					<p class="text-sm mt-1 p-2 bg-green-500/10 rounded border border-green-500/20">{annotation?.note}</p>
				</div>
			{/if}
			{#if hasChat}
				<p class="text-xs text-blue-400">Has AI chat thread</p>
			{/if}
			<button
				onclick={onClose}
				class="mt-2 w-full rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
			>
				Close
			</button>
		</div>
	{:else}
		<!-- Main toolbar (editing mode) -->
		<div class="flex items-center gap-1 p-2">
			<!-- Highlight colors -->
			<div class="flex items-center gap-1 border-r border-border pr-2">
				{#each colors as { color, bg, ring }}
					{@const isSelected = selectedColor === color && (isEditing ? hasHighlight : showNoteInput)}
					{@const isCurrentColor = isEditing && currentHighlightColor === color}
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

			<!-- AI Chat button - highlighted if annotation has chat thread -->
			<button
				onclick={handleAIChat}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-blue-500/10 {hasChat ? 'bg-blue-500/10 text-blue-600' : 'text-blue-500'}"
				aria-label={hasChat ? 'Continue AI Chat' : 'AI Chat'}
				title={hasChat ? 'Continue AI Chat' : 'AI Chat with this context'}
			>
				<Bot class="h-4 w-4" />
			</button>

			<!-- Delete button (only for existing annotations) -->
			{#if isEditing}
				<button
					onclick={() => showDeleteConfirm = true}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-destructive/10 text-destructive"
					aria-label="Delete annotation"
					title="Delete annotation"
				>
					<Trash2 class="h-4 w-4" />
				</button>
			{/if}
		</div>
	{/if}

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
					{#if isEditing}
						<button
							onclick={handleDeleteNote}
							class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
							aria-label={hasHighlight || hasChat ? "Delete note" : "Delete annotation"}
							title={hasHighlight || hasChat ? "Delete note" : "Delete annotation"}
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
	<div class="border-t border-border p-2 w-60">
		<p class="line-clamp-2 text-xs italic text-muted-foreground break-words">
			"{displayText.slice(0, 100)}{displayText.length > 100 ? '...' : ''}"
		</p>
	</div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
		onclick={() => showDeleteConfirm = false}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div 
			class="w-80 rounded-lg border border-border bg-background p-4 shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 class="text-lg font-semibold mb-2">Delete Annotation?</h3>
			<p class="text-sm text-muted-foreground mb-4">
				This will permanently delete this annotation including any highlights, notes, and chat history.
			</p>
			<div class="flex justify-end gap-2">
				<button
					onclick={() => showDeleteConfirm = false}
					class="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
				>
					Cancel
				</button>
				<button
					onclick={async () => { 
						showDeleteConfirm = false; 
						await onDelete?.(); 
					}}
					class="rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
