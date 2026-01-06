<script lang="ts">
	import { X, ExternalLink, FileText, Globe, Download, Copy, Check } from '@lucide/svelte';
	import { MarkdownRenderer } from '$lib/components/chat';
	import type { CitedSource } from './SourcesSidebar.svelte';

	interface Props {
		source: CitedSource | null;
		open: boolean;
		onClose?: () => void;
	}

	let { source, open, onClose }: Props = $props();

	let copied = $state(false);

	function handleClose() {
		onClose?.();
	}

	function handleCopyContent() {
		if (source?.content) {
			navigator.clipboard.writeText(source.content);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	function getDomain(url: string): string {
		try {
			return new URL(url).hostname.replace('www.', '');
		} catch {
			return url;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && source}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
		onclick={handleClose}
		aria-label="Close source viewer"
	></button>

	<!-- Modal -->
	<div class="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-zinc-800 px-4 py-3 flex-shrink-0">
			<div class="flex items-center gap-3 min-w-0 flex-1">
				{#if source.favicon}
					<img 
						src={source.favicon} 
						alt="" 
						class="h-5 w-5 rounded flex-shrink-0"
						onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
					/>
				{:else if source.type === 'pdf' || source.type === 'file'}
					<FileText class="h-5 w-5 text-zinc-500 flex-shrink-0" />
				{:else}
					<Globe class="h-5 w-5 text-zinc-500 flex-shrink-0" />
				{/if}

				<div class="min-w-0 flex-1">
					<h2 class="text-sm font-semibold text-zinc-100 truncate">
						{source.title}
					</h2>
					<a
						href={source.url}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-zinc-500 hover:text-cyan-400 flex items-center gap-1 truncate"
					>
						{getDomain(source.url)}
						<ExternalLink class="h-3 w-3 flex-shrink-0" />
					</a>
				</div>
			</div>

			<div class="flex items-center gap-2 flex-shrink-0">
				{#if source.content}
					<button
						onclick={handleCopyContent}
						class="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
					>
						{#if copied}
							<Check class="h-3.5 w-3.5 text-green-500" />
							<span>Copied</span>
						{:else}
							<Copy class="h-3.5 w-3.5" />
							<span>Copy</span>
						{/if}
					</button>
				{/if}

				<a
					href={source.url}
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
				>
					<ExternalLink class="h-3.5 w-3.5" />
					<span>Open</span>
				</a>

				<button
					onclick={handleClose}
					class="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto">
			{#if source.screenshotUrl}
				<!-- Screenshot view -->
				<div class="p-4">
					<img
						src={source.screenshotUrl}
						alt="Screenshot of {source.title}"
						class="w-full rounded-lg border border-zinc-800"
					/>
				</div>
			{:else if source.pdfUrl}
				<!-- PDF embed -->
				<iframe
					src={source.pdfUrl}
					title={source.title}
					class="w-full h-full"
				></iframe>
			{:else if source.content}
				<!-- Markdown content -->
				<div class="p-6">
					<div class="prose prose-invert prose-sm max-w-none">
						<MarkdownRenderer content={source.content} />
					</div>
				</div>
			{:else}
				<!-- No content available -->
				<div class="flex flex-col items-center justify-center h-full py-20 text-center">
					<Globe class="h-16 w-16 text-zinc-700 mb-4" />
					<p class="text-zinc-500 mb-4">
						Content preview not available
					</p>
					<a
						href={source.url}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
					>
						<ExternalLink class="h-4 w-4" />
						View Original
					</a>
				</div>
			{/if}
		</div>
	</div>
{/if}

