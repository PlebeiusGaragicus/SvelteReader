<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { synthArtifactStore } from '$lib/stores/synthesize';

	interface Props {
		artifactId: string | null;
	}

	let { artifactId }: Props = $props();

	let textareaRef = $state<HTMLTextAreaElement | undefined>(undefined);
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	const artifact = $derived(
		artifactId ? synthArtifactStore.artifacts.find((a) => a.id === artifactId) : null
	);

	const currentVersion = $derived(
		artifact ? artifact.versions[artifact.currentVersionIndex] : null
	);

	const content = $derived(artifactId ? synthArtifactStore.getLiveContent(artifactId) || '' : '');

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		if (artifactId) {
			synthArtifactStore.updateLiveContent(artifactId, target.value);

			// Debounced auto-save
			if (saveTimeout) {
				clearTimeout(saveTimeout);
			}
			saveTimeout = setTimeout(() => {
				if (artifactId) {
					synthArtifactStore.saveArtifactNow(artifactId);
				}
			}, 2000);
		}
	}

	// Cleanup on unmount
	onDestroy(() => {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		// Save any pending changes
		if (artifactId && synthArtifactStore.dirtyArtifactIds.includes(artifactId)) {
			synthArtifactStore.saveArtifactNow(artifactId);
		}
	});
</script>

<div class="flex h-full flex-col bg-zinc-900">
	{#if !artifact}
		<div class="flex h-full items-center justify-center text-zinc-600">
			<p class="text-sm">Select a file to edit</p>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-medium text-zinc-200">{currentVersion?.title || 'Untitled'}</h3>
				{#if artifact.isDirty}
					<span class="h-2 w-2 rounded-full bg-violet-500" title="Unsaved changes"></span>
				{/if}
			</div>
			<div class="text-xs text-zinc-500">
				v{artifact.currentVersionIndex + 1} of {artifact.versions.length}
			</div>
		</div>

		<!-- Editor -->
		<div class="flex-1 overflow-hidden">
			<textarea
				bind:this={textareaRef}
				value={content}
				oninput={handleInput}
				class="h-full w-full resize-none border-0 bg-zinc-900 p-4 font-mono text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
				placeholder="Start writing..."
				spellcheck="false"
			></textarea>
		</div>
	{/if}
</div>

