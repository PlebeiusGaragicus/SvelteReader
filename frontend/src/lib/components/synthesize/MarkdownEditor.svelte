<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
	import { EditorState, Compartment } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { MarkdownRenderer } from '$lib/components/chat';

	interface Props {
		content: string;
		readonly?: boolean;
		onContentChange?: (content: string) => void;
		onSave?: () => void;
	}

	let { content, readonly = false, onContentChange, onSave }: Props = $props();

	let editorContainer = $state<HTMLDivElement | undefined>(undefined);
	let editorView = $state<EditorView | undefined>(undefined);
	let mode = $state<'edit' | 'preview'>('edit');

	const readOnlyCompartment = new Compartment();

	// Custom theme to match our dark UI
	const customTheme = EditorView.theme({
		'&': {
			height: '100%',
			fontSize: '14px',
			backgroundColor: 'transparent'
		},
		'.cm-content': {
			fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
			padding: '16px',
			caretColor: '#a78bfa'
		},
		'.cm-cursor': {
			borderLeftColor: '#a78bfa'
		},
		'.cm-activeLine': {
			backgroundColor: 'rgba(255, 255, 255, 0.03)'
		},
		'.cm-selectionBackground': {
			backgroundColor: 'rgba(167, 139, 250, 0.2) !important'
		},
		'.cm-gutters': {
			backgroundColor: 'transparent',
			borderRight: '1px solid #27272a',
			color: '#52525b'
		},
		'.cm-activeLineGutter': {
			backgroundColor: 'transparent',
			color: '#a1a1aa'
		},
		'.cm-scroller': {
			overflow: 'auto'
		}
	});

	// Save keyboard shortcut
	const saveKeymap = keymap.of([
		{
			key: 'Mod-s',
			run: () => {
				onSave?.();
				return true;
			}
		}
	]);

	function createEditor() {
		if (!editorContainer) return;

		const state = EditorState.create({
			doc: content,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				drawSelection(),
				history(),
				markdown(),
				keymap.of([...defaultKeymap, ...historyKeymap]),
				saveKeymap,
				oneDark,
				customTheme,
				readOnlyCompartment.of(EditorState.readOnly.of(readonly)),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						const newContent = update.state.doc.toString();
						onContentChange?.(newContent);
					}
				})
			]
		});

		editorView = new EditorView({
			state,
			parent: editorContainer
		});
	}

	function destroyEditor() {
		editorView?.destroy();
		editorView = undefined;
	}

	// Sync content from props to editor
	$effect(() => {
		if (editorView && content !== editorView.state.doc.toString()) {
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: content
				}
			});
		}
	});

	// Sync readonly state
	$effect(() => {
		if (editorView) {
			editorView.dispatch({
				effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readonly))
			});
		}
	});

	onMount(() => {
		if (mode === 'edit') {
			createEditor();
		}
	});

	onDestroy(() => {
		destroyEditor();
	});

	function toggleMode() {
		if (mode === 'edit') {
			mode = 'preview';
			destroyEditor();
		} else {
			mode = 'edit';
			// Wait for DOM to update before creating editor
			requestAnimationFrame(() => createEditor());
		}
	}
</script>

<div class="flex h-full flex-col">
	<!-- Toolbar -->
	<div class="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
		<div class="flex gap-1">
			<button
				onclick={() => mode !== 'edit' && toggleMode()}
				class="rounded px-2.5 py-1 text-xs font-medium transition-colors {mode === 'edit'
					? 'bg-zinc-700 text-zinc-100'
					: 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}"
			>
				Edit
			</button>
			<button
				onclick={() => mode !== 'preview' && toggleMode()}
				class="rounded px-2.5 py-1 text-xs font-medium transition-colors {mode === 'preview'
					? 'bg-zinc-700 text-zinc-100'
					: 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}"
			>
				Preview
			</button>
		</div>

		{#if !readonly && onSave}
			<button
				onclick={onSave}
				class="rounded px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
			>
				Save
			</button>
		{/if}
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-hidden">
		{#if mode === 'edit'}
			<div bind:this={editorContainer} class="h-full w-full bg-zinc-900"></div>
		{:else}
			<div class="prose prose-invert prose-sm h-full max-w-none overflow-y-auto p-4">
				<MarkdownRenderer {content} />
			</div>
		{/if}
	</div>
</div>

