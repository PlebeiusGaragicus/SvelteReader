<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import type { EditorView as EditorViewType } from '@codemirror/view';
	import type { OcrVersion } from '$lib/stores/userFiles.svelte';
	import { Loader2, Save, X, ChevronLeft, ChevronRight } from '@lucide/svelte';

	interface Props {
		ocrVersion: OcrVersion;
		onSave?: (updatedVersion: OcrVersion) => void;
		onClose?: () => void;
	}

	let { ocrVersion, onSave, onClose }: Props = $props();

	// Editor state
	let editorContainer = $state<HTMLDivElement | undefined>(undefined);
	let editorView: EditorViewType | undefined = undefined; // Not reactive to avoid loops
	let isEditorReady = $state(false);
	let currentPageIndex = $state(0);
	let editedPages = $state<string[]>([...ocrVersion.pages]); // Initialize directly
	let hasUnsavedChanges = $state(false);
	let isSaving = $state(false);
	let editorInitialized = false;

	const totalPages = $derived(editedPages.length);

	let cmModules = $state<{
		EditorView: typeof EditorViewType;
		EditorState: typeof import('@codemirror/state').EditorState;
		keymap: typeof import('@codemirror/view').keymap;
		highlightActiveLine: typeof import('@codemirror/view').highlightActiveLine;
		markdown: typeof import('@codemirror/lang-markdown').markdown;
		languages: typeof import('@codemirror/language-data').languages;
		oneDark: typeof import('@codemirror/theme-one-dark').oneDark;
		defaultKeymap: typeof import('@codemirror/commands').defaultKeymap;
		history: typeof import('@codemirror/commands').history;
		historyKeymap: typeof import('@codemirror/commands').historyKeymap;
	} | null>(null);

	function createEditorTheme(EditorView: typeof EditorViewType) {
		return EditorView.theme(
			{
				'&': {
					height: '100%',
					fontSize: '15px',
					fontFamily: "'Inter', system-ui, sans-serif",
					backgroundColor: '#0a0a0a'
				},
				'.cm-content': {
					padding: '16px 24px',
					caretColor: '#f59e0b',
					lineHeight: '1.7'
				},
				'.cm-cursor': {
					borderLeftColor: '#f59e0b',
					borderLeftWidth: '2px'
				},
				'.cm-activeLine': {
					backgroundColor: 'rgba(24, 24, 27, 0.8)'
				},
				'.cm-line': {
					padding: '0 8px'
				},
				'.cm-scroller': {
					overflow: 'auto',
					fontFamily: "'Inter', system-ui, sans-serif"
				},
				'.cm-selectionBackground': {
					backgroundColor: 'rgba(245, 158, 11, 0.2) !important'
				}
			},
			{ dark: true }
		);
	}

	function initializeEditor() {
		if (!browser || !cmModules || !editorContainer || editorInitialized) return;

		const {
			EditorView,
			EditorState,
			keymap,
			highlightActiveLine,
			markdown,
			languages,
			oneDark,
			defaultKeymap,
			history,
			historyKeymap
		} = cmModules;

		// Save keymap
		const saveKeymap = keymap.of([
			{
				key: 'Mod-s',
				run: () => {
					handleSave();
					return true;
				}
			}
		]);

		const initialContent = editedPages[currentPageIndex] ?? '';

		editorView = new EditorView({
			state: EditorState.create({
				doc: initialContent,
				extensions: [
					highlightActiveLine(),
					history(),
					markdown({ codeLanguages: languages }),
					keymap.of([...historyKeymap, ...defaultKeymap]),
					saveKeymap,
					oneDark,
					createEditorTheme(EditorView),
					EditorView.lineWrapping,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							const newContent = update.state.doc.toString();
							// Use untrack to avoid reactive loops
							untrack(() => {
								editedPages[currentPageIndex] = newContent;
								hasUnsavedChanges = true;
							});
						}
					})
				]
			}),
			parent: editorContainer
		});

		editorInitialized = true;
	}

	onMount(async () => {
		if (!browser) return;

		const [view, state, markdown, langData, theme, commands] = await Promise.all([
			import('@codemirror/view'),
			import('@codemirror/state'),
			import('@codemirror/lang-markdown'),
			import('@codemirror/language-data'),
			import('@codemirror/theme-one-dark'),
			import('@codemirror/commands')
		]);

		cmModules = {
			EditorView: view.EditorView,
			EditorState: state.EditorState,
			keymap: view.keymap,
			highlightActiveLine: view.highlightActiveLine,
			markdown: markdown.markdown,
			languages: langData.languages,
			oneDark: theme.oneDark,
			defaultKeymap: commands.defaultKeymap,
			history: commands.history,
			historyKeymap: commands.historyKeymap
		};

		isEditorReady = true;
	});

	// Create editor when container and modules are ready
	$effect(() => {
		if (isEditorReady && cmModules && editorContainer && !editorInitialized) {
			initializeEditor();
		}
	});

	// Sync page content when changing pages (only when page index changes)
	$effect(() => {
		const pageIdx = currentPageIndex; // Track this dependency
		if (editorView && editorInitialized) {
			const pageContent = untrack(() => editedPages[pageIdx] ?? '');
			const currentDoc = editorView.state.doc.toString();
			if (currentDoc !== pageContent) {
				editorView.dispatch({
					changes: {
						from: 0,
						to: editorView.state.doc.length,
						insert: pageContent
					}
				});
			}
		}
	});

	onDestroy(() => {
		editorView?.destroy();
		editorView = undefined;
		editorInitialized = false;
	});

	function goToPreviousPage() {
		if (currentPageIndex > 0) {
			currentPageIndex--;
		}
	}

	function goToNextPage() {
		if (currentPageIndex < totalPages - 1) {
			currentPageIndex++;
		}
	}

	async function handleSave() {
		if (isSaving) return;

		isSaving = true;
		try {
			const updatedVersion: OcrVersion = {
				...ocrVersion,
				pages: [...editedPages]
			};
			onSave?.(updatedVersion);
			hasUnsavedChanges = false;
		} finally {
			isSaving = false;
		}
	}

	function handleClose() {
		if (hasUnsavedChanges) {
			if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
				return;
			}
		}
		onClose?.();
	}
</script>

<div class="flex h-full flex-col bg-zinc-950">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
		<div class="flex items-center gap-3">
			<h3 class="text-sm font-medium text-amber-500">
				Editing OCR: {ocrVersion.label || `Version ${ocrVersion.id.slice(0, 8)}`}
			</h3>
			{#if hasUnsavedChanges}
				<span class="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-500">Unsaved</span>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<!-- Page navigation -->
			{#if totalPages > 1}
				<div class="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1">
					<button
						onclick={goToPreviousPage}
						disabled={currentPageIndex === 0}
						class="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
					>
						<ChevronLeft class="h-4 w-4" />
					</button>
					<span class="min-w-[4rem] text-center text-xs text-zinc-300">
						Page {currentPageIndex + 1} / {totalPages}
					</span>
					<button
						onclick={goToNextPage}
						disabled={currentPageIndex === totalPages - 1}
						class="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
					>
						<ChevronRight class="h-4 w-4" />
					</button>
				</div>
			{/if}

			<!-- Save button -->
			<button
				onclick={handleSave}
				disabled={!hasUnsavedChanges || isSaving}
				class="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{#if isSaving}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
				{:else}
					<Save class="h-3.5 w-3.5" />
				{/if}
				Save
			</button>

			<!-- Close button -->
			<button
				onclick={handleClose}
				class="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
			>
				<X class="h-3.5 w-3.5" />
				Close
			</button>
		</div>
	</div>

	<!-- Editor -->
	<div class="flex-1 overflow-hidden">
		{#if !isEditorReady}
			<div class="flex h-full items-center justify-center text-zinc-500">
				<div class="text-center">
					<Loader2 class="mx-auto mb-2 h-6 w-6 animate-spin" />
					<p class="text-sm">Loading editor...</p>
				</div>
			</div>
		{:else}
			<div bind:this={editorContainer} class="h-full w-full overflow-hidden"></div>
		{/if}
	</div>
</div>

<style>
	:global(.cm-editor) {
		height: 100%;
		background-color: #0a0a0a;
	}
	:global(.cm-scroller) {
		font-family: 'Inter', system-ui, sans-serif;
		overflow: auto !important;
	}
</style>
