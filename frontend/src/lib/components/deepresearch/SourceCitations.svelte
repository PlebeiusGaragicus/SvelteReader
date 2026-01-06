<script lang="ts">
	import { ExternalLink, FileText, X, BookCopy } from '@lucide/svelte';

	interface Source {
		index: number;
		title: string;
		url: string;
		snippet?: string;
	}

	interface Props {
		sources: Source[];
		compact?: boolean;
	}

	let { sources, compact = false }: Props = $props();

	// Modal state for "View X more" sources
	let showAllModal = $state(false);

	// Show first 3 sources in grid, rest in modal
	const visibleSources = $derived(sources.slice(0, 3));
	const remainingSources = $derived(sources.slice(3));
	const hasMore = $derived(remainingSources.length > 0);

	function getDomain(url: string): string {
		try {
			const parsed = new URL(url);
			return parsed.hostname.replace('www.', '');
		} catch {
			return url;
		}
	}

	function getFavicon(url: string): string {
		try {
			const parsed = new URL(url);
			return `https://s2.googleusercontent.com/s2/favicons?domain_url=${parsed.origin}&sz=32`;
		} catch {
			return '';
		}
	}

	function closeModal() {
		showAllModal = false;
	}

	function openModal() {
		showAllModal = true;
	}
</script>

{#if sources.length > 0}
	<div class="space-y-2">
		<!-- Header -->
		<div class="flex items-center gap-2">
			<BookCopy class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-medium text-muted-foreground">Sources</span>
		</div>
		
		{#if compact}
			<!-- Compact: inline badges -->
			<div class="flex flex-wrap gap-1.5">
				{#each sources.slice(0, 5) as source, i}
					<a
						href={source.url}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
						title={source.title}
					>
						<img
							src={getFavicon(source.url)}
							alt=""
							class="h-3.5 w-3.5 rounded-sm"
							onerror={(e) => {
								const img = e.currentTarget as HTMLImageElement;
								img.style.display = 'none';
							}}
						/>
						<span class="font-medium">{source.index}</span>
						<span class="max-w-[80px] truncate">{getDomain(source.url)}</span>
					</a>
				{/each}
				{#if sources.length > 5}
					<span class="text-xs text-muted-foreground/70 px-2 py-1">
						+{sources.length - 5} more
					</span>
				{/if}
			</div>
		{:else}
			<!-- Grid layout like Perplexica -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
				{#each visibleSources as source, i}
					<a
						href={source.url}
						target="_blank"
						rel="noopener noreferrer"
						class="group flex flex-col gap-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors p-3"
					>
						<!-- Title (truncated) -->
						<p class="text-xs font-medium line-clamp-1 group-hover:text-cyan-500 transition-colors">
							{source.title || getDomain(source.url)}
						</p>
						
						<!-- Domain and index -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-1.5">
								<img
									src={getFavicon(source.url)}
									alt=""
									class="h-4 w-4 rounded-sm"
									onerror={(e) => {
										const img = e.currentTarget as HTMLImageElement;
										img.style.display = 'none';
									}}
								/>
								<span class="text-xs text-muted-foreground truncate max-w-[80px]">
									{getDomain(source.url)}
								</span>
							</div>
							<div class="flex items-center gap-1 text-xs text-muted-foreground/70">
								<span class="h-1 w-1 rounded-full bg-muted-foreground/50"></span>
								<span>{source.index}</span>
							</div>
						</div>
					</a>
				{/each}
				
				<!-- "View X more" button -->
				{#if hasMore}
					<button
						onclick={openModal}
						class="flex flex-col gap-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors p-3"
					>
						<!-- Stacked favicons preview -->
						<div class="flex items-center gap-0.5">
							{#each remainingSources.slice(0, 3) as source}
								<img
									src={getFavicon(source.url)}
									alt=""
									class="h-4 w-4 rounded-sm -ml-1 first:ml-0 ring-1 ring-background"
									onerror={(e) => {
										const img = e.currentTarget as HTMLImageElement;
										img.style.display = 'none';
									}}
								/>
							{/each}
						</div>
						<p class="text-xs text-muted-foreground">
							View {remainingSources.length} more
						</p>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Modal for all sources -->
	{#if showAllModal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div 
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
			onclick={closeModal}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div 
				class="w-full max-w-lg mx-4 bg-background border border-border rounded-2xl shadow-xl overflow-hidden"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Modal header -->
				<div class="flex items-center justify-between px-6 py-4 border-b border-border">
					<h3 class="text-lg font-semibold">Sources</h3>
					<button
						onclick={closeModal}
						class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
					>
						<X class="h-5 w-5" />
					</button>
				</div>
				
				<!-- Modal content -->
				<div class="px-6 py-4 max-h-[60vh] overflow-y-auto">
					<div class="grid grid-cols-2 gap-3">
						{#each sources as source, i}
							<a
								href={source.url}
								target="_blank"
								rel="noopener noreferrer"
								class="group flex flex-col gap-2 rounded-lg bg-muted/50 border border-border hover:border-cyan-500/50 transition-colors p-3"
							>
								<!-- Title -->
								<p class="text-sm font-medium line-clamp-2 group-hover:text-cyan-500 transition-colors">
									{source.title || getDomain(source.url)}
								</p>
								
								<!-- Domain and index -->
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-1.5">
										<img
											src={getFavicon(source.url)}
											alt=""
											class="h-4 w-4 rounded-sm"
											onerror={(e) => {
												const img = e.currentTarget as HTMLImageElement;
												img.style.display = 'none';
											}}
										/>
										<span class="text-xs text-muted-foreground truncate max-w-[100px]">
											{getDomain(source.url)}
										</span>
									</div>
									<div class="flex items-center gap-1 text-xs text-muted-foreground/70">
										<span class="h-1 w-1 rounded-full bg-muted-foreground/50"></span>
										<span>{source.index}</span>
									</div>
								</div>
							</a>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}
