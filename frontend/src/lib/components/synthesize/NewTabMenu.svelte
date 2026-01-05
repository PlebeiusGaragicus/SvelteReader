<script lang="ts">
	import { Plus, MessageSquare, FileText, Link, X } from '@lucide/svelte';
	import { synthProjectStore, synthWorkspaceStore, synthSourceStore } from '$lib/stores/synthesize';

	interface Props {
		column: 'left' | 'right';
	}

	let { column }: Props = $props();

	let isOpen = $state(false);
	let showSourceInput = $state(false);
	let sourceUrl = $state('');
	let sourceTitle = $state('');

	const currentProjectId = $derived(synthProjectStore.currentProjectId);

	function handleNewChat() {
		synthWorkspaceStore.createNewThread(column);
		isOpen = false;
	}

	function handleNewFile() {
		synthWorkspaceStore.createNewFile(column);
		isOpen = false;
	}

	function handleAddSource() {
		showSourceInput = true;
	}

	async function submitSource() {
		if (!sourceUrl.trim() || !currentProjectId) return;

		const title = sourceTitle.trim() || new URL(sourceUrl).hostname;

		// Create the source
		const source = synthSourceStore.createSource(
			currentProjectId,
			title,
			sourceUrl.trim(),
			'', // Content will be fetched later
			{}
		);

		// Open it in the workspace
		synthWorkspaceStore.openItem(source.id, 'source', column);

		// Reset state
		sourceUrl = '';
		sourceTitle = '';
		showSourceInput = false;
		isOpen = false;
	}

	function cancelSourceInput() {
		sourceUrl = '';
		sourceTitle = '';
		showSourceInput = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showSourceInput) {
				cancelSourceInput();
			} else {
				isOpen = false;
			}
		} else if (e.key === 'Enter' && showSourceInput) {
			submitSource();
		}
	}
</script>

<div class="relative">
	<button
		onclick={() => (isOpen = !isOpen)}
		class="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
		title="New tab"
	>
		<Plus class="h-4 w-4" />
	</button>

	{#if isOpen}
		<!-- Backdrop -->
		<button
			class="fixed inset-0 z-40"
			onclick={() => {
				isOpen = false;
				showSourceInput = false;
			}}
			aria-label="Close menu"
		></button>

		<!-- Dropdown Menu -->
		<div
			class="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl"
			onkeydown={handleKeydown}
			role="menu"
		>
			{#if showSourceInput}
				<!-- Source URL Input -->
				<div class="space-y-2 p-1">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-zinc-400">Add Source URL</span>
						<button
							onclick={cancelSourceInput}
							class="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
						>
							<X class="h-3 w-3" />
						</button>
					</div>
					<input
						type="url"
						bind:value={sourceUrl}
						placeholder="https://example.com/article"
						class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
						autofocus
					/>
					<input
						type="text"
						bind:value={sourceTitle}
						placeholder="Title (optional)"
						class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
					/>
					<button
						onclick={submitSource}
						disabled={!sourceUrl.trim()}
						class="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
					>
						Add Source
					</button>
				</div>
			{:else}
				<!-- Menu Items -->
				<button
					onclick={handleNewChat}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
					role="menuitem"
				>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
						<MessageSquare class="h-4 w-4 text-blue-400" />
					</div>
					<div>
						<p class="font-medium">New Chat</p>
						<p class="text-xs text-zinc-500">Start a research conversation</p>
					</div>
				</button>

				<button
					onclick={handleNewFile}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
					role="menuitem"
				>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
						<FileText class="h-4 w-4 text-emerald-400" />
					</div>
					<div>
						<p class="font-medium">New File</p>
						<p class="text-xs text-zinc-500">Create a markdown document</p>
					</div>
				</button>

				<button
					onclick={handleAddSource}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
					role="menuitem"
				>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
						<Link class="h-4 w-4 text-amber-400" />
					</div>
					<div>
						<p class="font-medium">Add Source</p>
						<p class="text-xs text-zinc-500">Import a URL for reference</p>
					</div>
				</button>
			{/if}
		</div>
	{/if}
</div>

