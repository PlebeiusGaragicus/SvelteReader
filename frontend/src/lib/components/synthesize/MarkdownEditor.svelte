<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { EditorView as EditorViewType } from '@codemirror/view';

	interface Props {
		content: string;
		readonly?: boolean;
		onContentChange?: (content: string) => void;
		onSave?: () => void;
	}

	let { content, readonly = false, onContentChange, onSave }: Props = $props();

	let editorContainer = $state<HTMLDivElement | undefined>(undefined);
	let editorView = $state<EditorViewType | undefined>(undefined);
	let isEditorReady = $state(false);
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
		livePreview: typeof import('$lib/codemirror/livePreview').livePreview;
	} | null>(null);

	// Custom theme to match our dark UI with prose-like styling
	function createEditorTheme(EditorView: typeof EditorViewType) {
		return EditorView.theme(
			{
				'&': {
					height: '100%',
					fontSize: '16px',
					fontFamily: "'Inter', system-ui, sans-serif",
					backgroundColor: '#0a0a0a'
				},
				'.cm-content': {
					padding: '16px 24px',
					caretColor: '#a78bfa',
					lineHeight: '1.75'
				},
				'.cm-cursor': {
					borderLeftColor: '#a78bfa',
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
					backgroundColor: 'rgba(167, 139, 250, 0.2) !important'
				}
			},
			{ dark: true }
		);
	}

	// Load CodeMirror modules dynamically (client-side only)
	onMount(async () => {
		if (!browser) return;

		const [view, state, markdown, langData, theme, commands, livePreviewModule] = await Promise.all(
			[
				import('@codemirror/view'),
				import('@codemirror/state'),
				import('@codemirror/lang-markdown'),
				import('@codemirror/language-data'),
				import('@codemirror/theme-one-dark'),
				import('@codemirror/commands'),
				import('$lib/codemirror/livePreview')
			]
		);

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
			historyKeymap: commands.historyKeymap,
			livePreview: livePreviewModule.livePreview
		};

		isEditorReady = true;
	});

	// Create/update editor when container and modules are ready
	$effect(() => {
		if (!browser || !isEditorReady || !cmModules || !editorContainer) return;

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
			historyKeymap,
			livePreview
		} = cmModules;

		// Create save keymap
		const saveKeymap = keymap.of([
			{
				key: 'Mod-s',
				run: () => {
					onSave?.();
					return true;
				}
			}
		]);

		if (!editorView) {
			// Create new editor
			editorView = new EditorView({
				state: EditorState.create({
					doc: content,
					extensions: [
						highlightActiveLine(),
						history(),
						markdown({ codeLanguages: languages }),
						// historyKeymap MUST come before defaultKeymap for undo/redo to work
						keymap.of([...historyKeymap, ...defaultKeymap]),
						saveKeymap,
						oneDark,
						createEditorTheme(EditorView),
						livePreview,
						EditorView.lineWrapping,
						EditorState.readOnly.of(readonly),
						EditorView.updateListener.of((update) => {
							if (update.docChanged) {
								onContentChange?.(update.state.doc.toString());
							}
						})
					]
				}),
				parent: editorContainer
			});
		}
	});

	// Sync content from props to editor (when content changes externally)
	$effect(() => {
		if (editorView && content !== editorView.state.doc.toString()) {
			const currentContent = editorView.state.doc.toString();
			// Only update if actually different (avoid loops)
			if (content.trim() !== currentContent.trim()) {
				editorView.dispatch({
					changes: {
						from: 0,
						to: editorView.state.doc.length,
						insert: content
					}
				});
			}
		}
	});

	onDestroy(() => {
		editorView?.destroy();
		editorView = undefined;
	});
</script>

<div class="h-full w-full">
	{#if !isEditorReady}
		<div class="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
			<div class="text-center">
				<div
					class="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-500"
				></div>
				<p class="text-sm">Loading editor...</p>
			</div>
		</div>
	{:else}
		<div bind:this={editorContainer} class="h-full w-full overflow-hidden bg-zinc-950"></div>
	{/if}
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
