<script lang="ts">
	import { 
		PanelRight, 
		PanelRightClose, 
		ExternalLink, 
		FileText, 
		Globe,
		ChevronRight,
		ChevronDown,
		X
	} from '@lucide/svelte';

	// Types for cited sources (to be populated by future integration)
	export interface CitedSource {
		id: string;
		title: string;
		url: string;
		favicon?: string;
		content?: string;
		pdfUrl?: string;
		screenshotUrl?: string;
		citedInMessageId: string;
		type: 'web' | 'pdf' | 'file';
	}

	interface Props {
		sources: CitedSource[];
		collapsed?: boolean;
		onToggleCollapse?: () => void;
		onSelectSource?: (source: CitedSource) => void;
	}

	let { 
		sources = [],
		collapsed = true,
		onToggleCollapse,
		onSelectSource
	}: Props = $props();

	// Section expansion
	let sourcesExpanded = $state(true);

	// Group sources by type
	const groupedSources = $derived.by(() => {
		const webSources = sources.filter(s => s.type === 'web');
		const fileSources = sources.filter(s => s.type === 'file' || s.type === 'pdf');
		return { web: webSources, files: fileSources };
	});

	function getSourceIcon(source: CitedSource) {
		if (source.type === 'pdf') return FileText;
		if (source.type === 'file') return FileText;
		return Globe;
	}

	function getDomain(url: string): string {
		try {
			return new URL(url).hostname.replace('www.', '');
		} catch {
			return url;
		}
	}

	function handleSourceClick(source: CitedSource) {
		onSelectSource?.(source);
	}
</script>

<!-- Sources Sidebar -->
<div class="relative flex h-full">
	{#if collapsed}
		<!-- Collapsed state -->
		<div class="flex h-full w-12 flex-col items-center border-l border-zinc-800 bg-zinc-950 py-2">
			<button
				onclick={onToggleCollapse}
				class="rounded p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
				title="Show sources"
			>
				<PanelRight class="h-5 w-5" />
			</button>
			
			{#if sources.length > 0}
				<div class="mt-4 flex flex-col items-center gap-1">
					<span class="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-400">
						{sources.length}
					</span>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Expanded state -->
		<div class="flex h-full w-64 flex-col border-l border-zinc-800 bg-zinc-950">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
				<span class="text-sm font-medium text-zinc-400">Sources</span>
				<button
					onclick={onToggleCollapse}
					class="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
					title="Hide sources"
				>
					<PanelRightClose class="h-4 w-4" />
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto">
				{#if sources.length === 0}
					<!-- Empty state -->
					<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
						<Globe class="h-10 w-10 text-zinc-700 mb-3" />
						<p class="text-xs text-zinc-500">
							Sources cited by the agent will appear here
						</p>
					</div>
				{:else}
					<!-- Sources section -->
					<div class="p-2">
						<button
							onclick={() => sourcesExpanded = !sourcesExpanded}
							class="flex w-full items-center gap-2 px-2 py-1.5 text-zinc-400 transition-colors hover:text-zinc-100"
						>
							{#if sourcesExpanded}
								<ChevronDown class="h-3.5 w-3.5" />
							{:else}
								<ChevronRight class="h-3.5 w-3.5" />
							{/if}
							<span class="text-xs font-semibold uppercase tracking-wider">
								Cited Sources ({sources.length})
							</span>
						</button>

						{#if sourcesExpanded}
							<div class="mt-1 space-y-1">
								{#each sources as source (source.id)}
									{@const Icon = getSourceIcon(source)}
									<button
										onclick={() => handleSourceClick(source)}
										class="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-800/50"
									>
										<!-- Favicon or icon -->
										<div class="flex-shrink-0 mt-0.5">
											{#if source.favicon}
												<img 
													src={source.favicon} 
													alt="" 
													class="h-4 w-4 rounded"
													onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
												/>
											{:else}
												<Icon class="h-4 w-4 text-zinc-500" />
											{/if}
										</div>

										<!-- Content -->
										<div class="flex-1 min-w-0">
											<p class="text-xs font-medium text-zinc-300 line-clamp-2 group-hover:text-zinc-100">
												{source.title}
											</p>
											<p class="text-[10px] text-zinc-600 truncate mt-0.5">
												{getDomain(source.url)}
											</p>
										</div>

										<!-- External link -->
										<a
											href={source.url}
											target="_blank"
											rel="noopener noreferrer"
											onclick={(e) => e.stopPropagation()}
											class="flex-shrink-0 p-1 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all"
										>
											<ExternalLink class="h-3 w-3" />
										</a>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			{#if sources.length > 0}
				<div class="border-t border-zinc-800 px-3 py-2">
					<p class="text-[10px] text-zinc-600">
						Click a source to view details
					</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

