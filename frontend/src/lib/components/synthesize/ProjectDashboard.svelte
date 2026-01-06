<script lang="ts">
	import { Plus, Folder, Clock, FileText, Trash2 } from '@lucide/svelte';
	import { synthProjectStore, synthArtifactStore } from '$lib/stores/synthesize';
	import type { Project } from '$lib/stores/synthesize/types';

	interface Props {
		userNpub: string;
		onProjectSelect: (project: Project) => void;
	}

	let { userNpub, onProjectSelect }: Props = $props();

	let newProjectTitle = $state('');
	let isCreating = $state(false);
	let projectToDelete = $state<string | null>(null);

	const projects = $derived(synthProjectStore.sortedProjects);

	function getArtifactCount(projectId: string): number {
		return synthArtifactStore.getProjectArtifacts(projectId).length;
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = diffMs / (1000 * 60 * 60);
		const diffDays = diffMs / (1000 * 60 * 60 * 24);

		if (diffHours < 1) {
			const mins = Math.floor(diffMs / (1000 * 60));
			return `${mins}m ago`;
		} else if (diffHours < 24) {
			return `${Math.floor(diffHours)}h ago`;
		} else if (diffDays < 7) {
			return `${Math.floor(diffDays)}d ago`;
		} else {
			return date.toLocaleDateString();
		}
	}

	function handleCreateProject() {
		if (!newProjectTitle.trim()) return;
		const project = synthProjectStore.createProject(newProjectTitle.trim(), userNpub);
		newProjectTitle = '';
		isCreating = false;
		onProjectSelect(project);
	}

	function handleDeleteProject(id: string, e: Event) {
		e.stopPropagation();
		projectToDelete = id;
	}

	function confirmDelete() {
		if (projectToDelete) {
			synthProjectStore.deleteProject(projectToDelete);
			projectToDelete = null;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleCreateProject();
		} else if (e.key === 'Escape') {
			isCreating = false;
			newProjectTitle = '';
		}
	}
</script>

<div class="flex min-h-[calc(100vh-3.5rem)] flex-col bg-zinc-950 px-8 py-12">
	<div class="mx-auto w-full max-w-6xl">
		<div class="mb-8">
			<h2 class="text-2xl font-bold text-zinc-100">Synthesize Projects</h2>
			<p class="mt-1 text-zinc-500">
				Create and manage deep research projects with AI-powered synthesis
			</p>
		</div>

		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<!-- Create New Project Card -->
			{#if isCreating}
				<div class="rounded-xl border border-violet-500/50 bg-zinc-900 p-6">
					<input
						type="text"
						bind:value={newProjectTitle}
						onkeydown={handleKeydown}
						placeholder="Project name..."
						class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
						autofocus
					/>
					<div class="mt-4 flex gap-2">
						<button
							onclick={handleCreateProject}
							disabled={!newProjectTitle.trim()}
							class="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
						>
							Create
						</button>
						<button
							onclick={() => {
								isCreating = false;
								newProjectTitle = '';
							}}
							class="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
						>
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<button
					onclick={() => (isCreating = true)}
					class="group flex min-h-[160px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 p-6 transition-all hover:border-violet-500/50 hover:bg-zinc-900"
				>
					<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 transition-colors group-hover:bg-violet-500/20">
						<Plus class="h-6 w-6 text-zinc-400 transition-colors group-hover:text-violet-500" />
					</div>
					<span class="font-medium text-zinc-400 transition-colors group-hover:text-zinc-200">
						New Project
					</span>
				</button>
			{/if}

			<!-- Project Cards -->
			{#each projects as project (project.id)}
				<div
					class="group relative flex min-h-[160px] cursor-pointer flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/50"
					onclick={() => onProjectSelect(project)}
					onkeydown={(e) => e.key === 'Enter' && onProjectSelect(project)}
					role="button"
					tabindex="0"
				>
					<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20">
						<Folder class="h-5 w-5 text-violet-500" />
					</div>

					<h3 class="mb-1 font-semibold text-zinc-100 transition-colors group-hover:text-white">
						{project.title}
					</h3>

					<div class="mt-auto flex items-center gap-4 text-sm text-zinc-500">
						<span class="flex items-center gap-1">
							<FileText class="h-3.5 w-3.5" />
							{getArtifactCount(project.id)} files
						</span>
						<span class="flex items-center gap-1">
							<Clock class="h-3.5 w-3.5" />
							{formatDate(project.updatedAt)}
						</span>
					</div>

					<!-- Delete button -->
					<button
						onclick={(e) => handleDeleteProject(project.id, e)}
						class="absolute right-3 top-3 rounded-lg p-2 text-zinc-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
					>
						<Trash2 class="h-4 w-4" />
					</button>
				</div>
			{/each}
		</div>

		{#if projects.length === 0 && !isCreating}
			<div class="mt-8 text-center text-zinc-500">
				<p>No projects yet. Create your first project to get started!</p>
			</div>
		{/if}
	</div>
</div>

<!-- Delete Confirmation Modal -->
{#if projectToDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
		<div class="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
			<h3 class="text-lg font-semibold text-zinc-100">Delete Project?</h3>
			<p class="mt-2 text-sm text-zinc-400">
				This will permanently delete the project and all its files. This action cannot be undone.
			</p>
			<div class="mt-6 flex gap-3">
				<button
					onclick={() => (projectToDelete = null)}
					class="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
				>
					Cancel
				</button>
				<button
					onclick={confirmDelete}
					class="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

