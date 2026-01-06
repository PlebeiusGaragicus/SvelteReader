<script lang="ts">
	import { X, Globe, Link, Search } from '@lucide/svelte';
	import { synthSourceStore, synthProjectStore, synthWorkspaceStore } from '$lib/stores/synthesize';
	import { onMount } from 'svelte';

	interface Props {
		column?: 'left' | 'right';
		onClose: () => void;
	}

	let { column = 'left', onClose }: Props = $props();

	let urlList = $state('');
	let inputRef = $state<HTMLTextAreaElement | null>(null);

	async function handleAddUrls() {
		const urls = urlList
			.split('\n')
			.map((u) => u.trim())
			.filter((u) => u.length > 0);
		if (urls.length === 0 || !synthProjectStore.currentProjectId) return;

		const projectId = synthProjectStore.currentProjectId;

		for (const url of urls) {
			try {
				const response = await fetch(url, {
					method: 'GET',
					headers: {
						Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
					},
					mode: 'cors'
				});

				if (response.ok) {
					const html = await response.text();
					const tempDiv = document.createElement('div');
					tempDiv.innerHTML = html;
					const textContent = tempDiv.textContent || tempDiv.innerText || '';

					const source = synthSourceStore.createSource(
						projectId,
						url.split('/').pop() || url,
						url,
						`# ${url}\n\n${textContent.slice(0, 5000)}`
					);
					synthWorkspaceStore.openItem(source.id, 'source', column);
				} else {
					const source = synthSourceStore.createSource(
						projectId,
						url.split('/').pop() || url,
						url,
						`# ${url}\n\nFailed to fetch content from this URL (HTTP ${response.status}).`
					);
					synthWorkspaceStore.openItem(source.id, 'source', column);
				}
			} catch (error) {
				console.error('Failed to add URL:', url, error);
				const source = synthSourceStore.createSource(
					projectId,
					url.split('/').pop() || url,
					url,
					`# ${url}\n\nError fetching content: ${error instanceof Error ? error.message : String(error)}`
				);
				synthWorkspaceStore.openItem(source.id, 'source', column);
			}
		}
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	onMount(() => {
		inputRef?.focus();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
	onclick={handleBackdropClick}
>
	<div
		class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
		role="dialog"
		aria-modal="true"
		onkeydown={handleKeydown}
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-zinc-800 bg-zinc-800/50 px-4 py-3">
			<div class="flex items-center gap-2">
				<Globe class="h-5 w-5 text-blue-500" />
				<h3 class="font-semibold text-zinc-100">Add New Sources</h3>
			</div>
			<button
				onclick={onClose}
				class="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="space-y-8 overflow-y-auto p-6">
			<!-- URL List Section -->
			<section>
				<label
					for="urls"
					class="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500"
				>
					Direct URLs (one per line)
				</label>
				<div class="space-y-3">
					<textarea
						id="urls"
						bind:this={inputRef}
						bind:value={urlList}
						placeholder="https://example.com/article1&#10;https://example.com/article2"
						class="h-32 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500"
					></textarea>
					<div class="flex justify-end">
						<button
							onclick={handleAddUrls}
							disabled={!urlList.trim()}
							class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Link class="h-4 w-4" />
							Add URLs
						</button>
					</div>
				</div>
			</section>

			<div class="flex items-center gap-4 py-2">
				<div class="h-px flex-1 bg-zinc-800"></div>
				<span class="text-xs font-bold text-zinc-600">OR</span>
				<div class="h-px flex-1 bg-zinc-800"></div>
			</div>

			<!-- Web Search Section (Demo Only) -->
			<section class="pointer-events-none opacity-50">
				<div class="mb-2 flex items-center justify-between">
					<label
						for="search"
						class="block text-xs font-bold uppercase tracking-wider text-zinc-500"
					>
						Web Search (Demo Only)
					</label>
					<span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
						Coming Soon
					</span>
				</div>
				<div class="space-y-4">
					<div class="flex gap-2">
						<div class="relative flex-1">
							<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
							<input
								id="search"
								disabled
								placeholder="Search for research papers, articles..."
								class="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-10 pr-4 text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
							/>
						</div>
						<button
							disabled
							class="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-400"
						>
							Search
						</button>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>

