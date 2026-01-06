<script lang="ts">
	import { X, FilePlus, FileText, Upload } from '@lucide/svelte';
	import { synthArtifactStore, synthProjectStore, synthWorkspaceStore } from '$lib/stores/synthesize';
	import { FILE_TEMPLATES } from '$lib/templates';
	import { onMount } from 'svelte';

	interface Props {
		column?: 'left' | 'right';
		onClose: () => void;
	}

	let { column = 'left', onClose }: Props = $props();

	let fileName = $state('');
	let isDragging = $state(false);
	let inputRef = $state<HTMLInputElement | null>(null);

	// Image extensions that should be read as data URLs
	const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];

	function isImageFile(filename: string): boolean {
		const ext = filename.split('.').pop()?.toLowerCase();
		return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
	}

	function readFileAsDataURL(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
	}

	function handleCreateEmpty() {
		if (!fileName.trim()) return;
		let name = fileName.trim();
		if (!name.includes('.')) name += '.md';

		const projectId = synthProjectStore.currentProjectId;
		if (!projectId) return;

		const artifact = synthArtifactStore.createArtifact(projectId, name, '');
		synthWorkspaceStore.openItem(artifact.id, 'artifact', column);
		onClose();
	}

	function handleTemplateSelect(template: (typeof FILE_TEMPLATES)[0]) {
		const projectId = synthProjectStore.currentProjectId;
		if (!projectId) return;

		const artifact = synthArtifactStore.createArtifact(
			projectId,
			template.title + '.md',
			template.content
		);
		synthWorkspaceStore.openItem(artifact.id, 'artifact', column);
		onClose();
	}

	async function handleFiles(files: FileList | null) {
		if (!files || !synthProjectStore.currentProjectId) return;

		for (const file of Array.from(files)) {
			let content: string;
			
			// For image files, read as data URL to preserve binary content
			if (isImageFile(file.name)) {
				content = await readFileAsDataURL(file);
			} else {
				content = await file.text();
			}
			
			const artifact = synthArtifactStore.createArtifact(
				synthProjectStore.currentProjectId,
				file.name,
				content
			);
			synthWorkspaceStore.openItem(artifact.id, 'artifact', column);
		}
		onClose();
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		handleFiles(e.dataTransfer?.files || null);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleCreateEmpty();
		} else if (e.key === 'Escape') {
			onClose();
		}
	}

	onMount(() => {
		inputRef?.focus();
	});

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
	onclick={handleBackdropClick}
	onkeydown={handleKeydown}
>
	<div
		class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
		role="dialog"
		aria-modal="true"
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-zinc-800 bg-zinc-800/50 px-4 py-3">
			<div class="flex items-center gap-2">
				<FilePlus class="h-5 w-5 text-amber-500" />
				<h3 class="font-semibold text-zinc-100">Create New File</h3>
			</div>
			<button
				onclick={onClose}
				class="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="space-y-8 overflow-y-auto p-6">
			<!-- Filename Input -->
			<section>
				<label
					for="filename"
					class="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500"
				>
					File Name
				</label>
				<div class="flex gap-2">
					<input
						id="filename"
						bind:this={inputRef}
						bind:value={fileName}
						onkeydown={handleKeydown}
						placeholder="document.md"
						class="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-amber-500"
					/>
					<button
						onclick={handleCreateEmpty}
						disabled={!fileName.trim()}
						class="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Create
					</button>
				</div>
			</section>

			<!-- Templates -->
			<section>
				<label class="mb-3 block text-xs font-bold uppercase tracking-wider text-zinc-500">
					Templates
				</label>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each FILE_TEMPLATES as template}
						<button
							onclick={() => handleTemplateSelect(template)}
							class="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800"
						>
							<div
								class="rounded bg-zinc-800 p-2 text-zinc-500 transition-colors group-hover:text-amber-500"
							>
								<FileText class="h-4 w-4" />
							</div>
							<div>
								<div class="text-sm font-medium text-zinc-200">{template.title}</div>
								<div class="text-[10px] text-zinc-500">Quick start template</div>
							</div>
						</button>
					{/each}
				</div>
			</section>

			<!-- Drag & Drop -->
			<section>
				<label class="mb-3 block text-xs font-bold uppercase tracking-wider text-zinc-500">
					Import Files
				</label>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					ondragover={(e) => {
						e.preventDefault();
						isDragging = true;
					}}
					ondragleave={() => (isDragging = false)}
					ondrop={handleDrop}
					class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all
						{isDragging
						? 'border-amber-500 bg-amber-500/5'
						: 'border-zinc-800 bg-zinc-800/10 hover:border-zinc-700'}"
				>
					<input
						type="file"
						multiple
						class="absolute inset-0 cursor-pointer opacity-0"
						onchange={(e) => handleFiles(e.currentTarget.files)}
					/>
					<div class="mb-3 rounded-full bg-zinc-800 p-3 text-zinc-500">
						<Upload class="h-6 w-6" />
					</div>
					<p class="text-sm font-medium text-zinc-300">Click or drag files here to upload</p>
					<p class="mt-1 text-center text-xs text-zinc-500">
						Supports markdown, text, code files, and images
					</p>
				</div>
			</section>
		</div>
	</div>
</div>

