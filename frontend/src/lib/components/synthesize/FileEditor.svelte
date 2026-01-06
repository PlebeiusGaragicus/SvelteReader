<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ChevronLeft, ChevronRight, ImageIcon } from '@lucide/svelte';
	import { synthArtifactStore } from '$lib/stores/synthesize';
	import MarkdownEditor from './MarkdownEditor.svelte';

	interface Props {
		artifactId: string | null;
	}

	let { artifactId }: Props = $props();

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	const AUTOSAVE_DELAY = 500;

	// Image file extensions
	const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];

	const artifact = $derived(
		artifactId ? synthArtifactStore.artifacts.find((a) => a.id === artifactId) : null
	);

	const currentVersion = $derived(
		artifact ? artifact.versions[artifact.currentVersionIndex] : null
	);

	const content = $derived(artifactId ? synthArtifactStore.getLiveContent(artifactId) || '' : '');

	// Check if file is an image based on extension
	const isImage = $derived.by(() => {
		if (!currentVersion?.title) return false;
		const ext = currentVersion.title.split('.').pop()?.toLowerCase();
		return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
	});

	// For image files, try to create a data URL from content
	const imageDataUrl = $derived.by(() => {
		if (!isImage || !content) return null;
		// If content already looks like a data URL, use it directly
		if (content.startsWith('data:image/')) return content;
		// If it starts with http, it's a URL
		if (content.startsWith('http://') || content.startsWith('https://')) return content;
		// Otherwise, try to interpret as base64
		const ext = currentVersion?.title.split('.').pop()?.toLowerCase() || 'png';
		const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
		// Check if it's already base64 encoded
		if (/^[A-Za-z0-9+/=]+$/.test(content.replace(/\s/g, ''))) {
			return `data:${mimeType};base64,${content.replace(/\s/g, '')}`;
		}
		return null;
	});

	const canGoPrev = $derived(artifact && artifact.currentVersionIndex > 0);
	const canGoNext = $derived(
		artifact && artifact.currentVersionIndex < artifact.versions.length - 1
	);

	function handleContentChange(newContent: string) {
		if (artifactId) {
			synthArtifactStore.updateLiveContent(artifactId, newContent);

			// Debounced auto-save
			if (saveTimeout) {
				clearTimeout(saveTimeout);
			}
			saveTimeout = setTimeout(() => {
				if (artifactId) {
					synthArtifactStore.saveArtifactNow(artifactId);
				}
			}, AUTOSAVE_DELAY);
		}
	}

	function handleSave() {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		if (artifactId) {
			synthArtifactStore.saveArtifactNow(artifactId);
		}
	}

	function handlePrevVersion() {
		if (!artifact || !canGoPrev) return;
		handleSave();
		synthArtifactStore.setArtifactVersion(artifact.id, artifact.currentVersionIndex - 1);
	}

	function handleNextVersion() {
		if (!artifact || !canGoNext) return;
		handleSave();
		synthArtifactStore.setArtifactVersion(artifact.id, artifact.currentVersionIndex + 1);
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

<div class="flex h-full flex-col bg-zinc-950">
	{#if !artifact}
		<div class="flex h-full items-center justify-center text-zinc-600">
			<p class="text-sm">Select a file to edit</p>
		</div>
	{:else}
		<!-- Minimal Header with version controls -->
		<div class="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/30 px-4 py-1.5">
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-medium text-zinc-300">{currentVersion?.title || 'Untitled'}</h3>
				{#if artifact.isDirty}
					<span class="h-1.5 w-1.5 rounded-full bg-violet-500" title="Unsaved changes"></span>
				{/if}
			</div>

			<!-- Version navigation -->
			{#if artifact.versions.length > 1}
				<div class="flex items-center gap-2">
					<button
						onclick={handlePrevVersion}
						disabled={!canGoPrev}
						class="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
					>
						<ChevronLeft class="h-4 w-4" />
					</button>
					<span class="text-xs text-zinc-500">
						v{artifact.currentVersionIndex + 1}/{artifact.versions.length}
					</span>
					<button
						onclick={handleNextVersion}
						disabled={!canGoNext}
						class="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30"
					>
						<ChevronRight class="h-4 w-4" />
					</button>
				</div>
			{/if}
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-hidden">
			{#if isImage}
				<!-- Image Viewer -->
				<div class="flex h-full flex-col items-center justify-center bg-zinc-900/50 p-8">
					{#if imageDataUrl}
						<img
							src={imageDataUrl}
							alt={currentVersion?.title || 'Image'}
							class="max-h-full max-w-full rounded-lg object-contain shadow-lg"
						/>
					{:else}
						<div class="flex flex-col items-center gap-4 text-zinc-500">
							<ImageIcon class="h-16 w-16" />
							<p class="text-sm">Unable to display image</p>
							<p class="text-xs text-zinc-600">
								Image content may be in an unsupported format
							</p>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Markdown Editor -->
				<MarkdownEditor {content} onContentChange={handleContentChange} onSave={handleSave} />
			{/if}
		</div>
	{/if}
</div>
