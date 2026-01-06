<script lang="ts">
	import { onMount } from 'svelte';
	import { MoreVertical, FileText, Image, File, Trash2, Download, Pencil } from '@lucide/svelte';
	import { userFilesStore, type UserFile } from '$lib/stores/userFiles.svelte';
	import { goto } from '$app/navigation';

	interface Props {
		file: UserFile;
		onDelete?: (file: UserFile) => void;
		onRename?: (file: UserFile) => void;
		onEdit?: (file: UserFile) => void;
	}

	let { file, onDelete, onRename, onEdit }: Props = $props();
	
	let menuOpen = $state(false);
	let deleteConfirm = $state(false);
	let isRenaming = $state(false);
	let renameValue = $state(file.name);
	let renameInput = $state<HTMLInputElement | null>(null);
	let menuElement: HTMLDivElement | null = $state(null);

	function getIcon(type: UserFile['type']) {
		switch (type) {
			case 'pdf': return FileText;
			case 'image': return Image;
			default: return File;
		}
	}

	function getTypeColor(type: UserFile['type']): string {
		switch (type) {
			case 'pdf': return 'text-red-500';
			case 'image': return 'text-blue-500';
			default: return 'text-green-500';
		}
	}

	function getTypeBgColor(type: UserFile['type']): string {
		switch (type) {
			case 'pdf': return 'bg-red-500/10';
			case 'image': return 'bg-blue-500/10';
			default: return 'bg-green-500/10';
		}
	}

	function getTypeLabel(type: UserFile['type']): string {
		switch (type) {
			case 'pdf': return 'PDF';
			case 'image': return 'Image';
			default: return 'Text';
		}
	}

	function handleNavigate(e: MouseEvent) {
		// Don't navigate if clicking menu or renaming
		if (menuOpen || isRenaming) return;
		e.preventDefault();
		goto(`/file/${file.id}`);
	}

	function handleDownload(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		
		const blob = userFilesStore.getFileBlob(file);
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = file.name;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function handleStartRename(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		isRenaming = true;
		renameValue = file.name;
		// Focus input after state update
		setTimeout(() => renameInput?.focus(), 10);
	}

	async function handleRename() {
		if (renameValue.trim() && renameValue !== file.name) {
			await userFilesStore.updateFile(file.id, { name: renameValue.trim() });
		}
		isRenaming = false;
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleRename();
		} else if (e.key === 'Escape') {
			isRenaming = false;
			renameValue = file.name;
		}
	}

	function handleEdit(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		onEdit?.(file);
	}

	function handleDelete(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		
		if (deleteConfirm) {
			onDelete?.(file);
			menuOpen = false;
			deleteConfirm = false;
		} else {
			deleteConfirm = true;
			setTimeout(() => { deleteConfirm = false; }, 3000);
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (menuOpen && menuElement && !menuElement.contains(event.target as Node)) {
			menuOpen = false;
			deleteConfirm = false;
		}
	}

	function handleDoubleClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		handleStartRename(e);
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	const Icon = $derived(getIcon(file.type));
	const typeColor = $derived(getTypeColor(file.type));
	const typeBgColor = $derived(getTypeBgColor(file.type));
</script>

<a
	href="/file/{file.id}"
	class="file-card group relative cursor-pointer overflow-visible rounded-lg border border-border bg-card transition-shadow hover:shadow-lg"
	onmouseleave={() => { menuOpen = false; deleteConfirm = false; }}
	onclick={handleNavigate}
>
	<!-- Thumbnail / Preview -->
	<div class="relative aspect-[2/3] overflow-hidden rounded-t-lg bg-muted flex items-center justify-center">
		{#if file.thumbnail}
			<!-- Image or PDF thumbnail -->
			<img
				src={file.thumbnail}
				alt={file.name}
				class="h-full w-full object-cover"
			/>
		{:else if file.type === 'text' && file.textPreview}
			<!-- Text preview -->
			<div class="absolute inset-0 p-2 overflow-hidden {typeBgColor}">
				<p class="text-[8px] leading-tight text-muted-foreground font-mono whitespace-pre-wrap break-words">
					{file.textPreview}
				</p>
			</div>
		{:else}
			<!-- Fallback icon -->
			<Icon class="h-12 w-12 {typeColor}" />
		{/if}

		<!-- Type badge -->
		<span class="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium {typeColor}">
			{getTypeLabel(file.type)}
		</span>
	</div>

	<!-- Context Menu Button -->
	<div 
		bind:this={menuElement}
		class="absolute right-2 top-2 z-20 transition-opacity {menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}"
	>
		<button
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				menuOpen = !menuOpen;
			}}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 backdrop-blur hover:bg-background"
			aria-label="File options"
		>
			<MoreVertical class="h-4 w-4" />
		</button>

		{#if menuOpen}
			<div class="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border border-border bg-popover p-1 shadow-lg">
				{#if onEdit}
				<button
				onclick={handleEdit}
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				>
				<Pencil class="h-4 w-4" />
				Edit...
			</button>
			{/if}
			<button
				onclick={handleStartRename}
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
			>
				<Pencil class="h-4 w-4" />
				Rename...
			</button>
			<button
					onclick={handleDownload}
					class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				>
					<Download class="h-4 w-4" />
					Download
				</button>
				<div class="my-1 border-t border-border"></div>
				<button
					onclick={handleDelete}
					class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
				>
					<Trash2 class="h-4 w-4" />
					{deleteConfirm ? 'Click to confirm' : 'Delete'}
				</button>
			</div>
		{/if}
	</div>

	<!-- Info -->
	<div class="p-2">
		{#if isRenaming}
			<input
				bind:this={renameInput}
				bind:value={renameValue}
				onclick={(e) => e.stopPropagation()}
				onblur={handleRename}
				onkeydown={handleRenameKeydown}
				class="w-full text-xs font-semibold bg-transparent border-b border-primary focus:outline-none"
			/>
		{:else}
			<h3 
				class="mb-0.5 line-clamp-2 text-xs font-semibold cursor-text" 
				title={file.name}
				ondblclick={handleDoubleClick}
			>
				{file.name}
			</h3>
		{/if}
		<div class="flex items-center justify-between text-[10px] text-muted-foreground">
			<span>{userFilesStore.formatSize(file.size)}</span>
		</div>
	</div>
</a>
