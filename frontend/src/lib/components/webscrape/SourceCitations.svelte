<script lang="ts">
	import { ExternalLink, FileText } from '@lucide/svelte';

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
			return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
		} catch {
			return '';
		}
	}
</script>

{#if sources.length > 0}
	<div class="mt-4 pt-4 border-t border-border">
		<h4 class="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
			<FileText class="h-4 w-4" />
			Sources ({sources.length})
		</h4>
		
		{#if compact}
			<!-- Compact horizontal list -->
			<div class="flex flex-wrap gap-2">
				{#each sources as source}
					<a
						href={source.url}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
						title={source.title}
					>
					<img
						src={getFavicon(source.url)}
						alt=""
						class="h-3.5 w-3.5 rounded-sm"
						onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
					/>
						<span class="font-medium">[{source.index}]</span>
						<span class="max-w-[120px] truncate">{getDomain(source.url)}</span>
					</a>
				{/each}
			</div>
		{:else}
			<!-- Detailed card list -->
			<div class="space-y-2">
				{#each sources as source}
					<a
						href={source.url}
						target="_blank"
						rel="noopener noreferrer"
						class="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-all hover:border-cyan-500/50 hover:shadow-sm"
					>
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium text-muted-foreground">
							{source.index}
						</div>
						
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
							<img
								src={getFavicon(source.url)}
								alt=""
								class="h-4 w-4 rounded-sm"
								onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
							/>
								<span class="text-xs text-muted-foreground">{getDomain(source.url)}</span>
								<ExternalLink class="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
							</div>
							<h5 class="font-medium text-sm mt-1 line-clamp-1 group-hover:text-cyan-500 transition-colors">
								{source.title}
							</h5>
							{#if source.snippet}
								<p class="text-xs text-muted-foreground mt-1 line-clamp-2">
									{source.snippet}
								</p>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}

