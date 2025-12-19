<script lang="ts">
	import { onMount } from 'svelte';
	import { X, Highlighter, MessageSquare, Trash2 } from '@lucide/svelte';
	import type { Annotation, AnnotationColor, AnnotationType } from '$lib/types';

	interface Props {
		annotations: Annotation[];
		onClose: () => void;
		onDelete: (annotationId: string) => void;
		onNavigate: (annotation: Annotation) => void;
	}

	let { annotations, onClose, onDelete, onNavigate }: Props = $props();
	let panelElement: HTMLDivElement;

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (panelElement && !panelElement.contains(event.target as Node)) {
			onClose();
		}
	}

	onMount(() => {
		const timeout = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 100);
		
		return () => {
			clearTimeout(timeout);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function getColorClass(color: AnnotationColor, type: AnnotationType): string {
		if (type === 'note') {
			return 'bg-transparent border-green-500 border-2';
		} else if (type === 'ai-chat') {
			return 'bg-transparent border-blue-500 border-2';
		}
		
		const colors: Record<AnnotationColor, string> = {
			yellow: 'bg-yellow-200/50 border-yellow-400',
			green: 'bg-green-200/50 border-green-400',
			blue: 'bg-blue-200/50 border-blue-400',
			pink: 'bg-pink-200/50 border-pink-400'
		};
		return colors[color];
	}
</script>

<div bind:this={panelElement} class="annotations-panel absolute inset-y-0 right-0 top-[53px] z-10 w-80 border-l border-border bg-card shadow-lg">
	<div class="flex items-center justify-between border-b border-border p-4">
		<div>
			<h2 class="font-semibold">Annotations</h2>
			<p class="text-sm text-muted-foreground">
				{annotations.length} {annotations.length === 1 ? 'note' : 'notes'}
			</p>
		</div>
		<button
			onclick={onClose}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
			aria-label="Close annotations"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<div class="h-[calc(100%-5rem)] overflow-y-auto p-4">
		{#if annotations.length === 0}
			<div class="flex flex-col items-center justify-center py-8 text-center">
				<div class="mb-3 rounded-full bg-muted p-3">
					<Highlighter class="h-5 w-5 text-muted-foreground" />
				</div>
				<p class="text-sm text-muted-foreground">Highlight text to add annotations</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each annotations as annotation (annotation.id)}
					<div
						class="rounded-lg border {getColorClass(annotation.color, annotation.type)} p-3 transition-all hover:shadow-md cursor-pointer"
						onclick={() => onNavigate(annotation)}
						onkeydown={(e) => e.key === 'Enter' && onNavigate(annotation)}
						role="button"
						tabindex="0"
					>
						<p class="text-sm italic">"{annotation.text}"</p>
						{#if annotation.note}
							<div class="mt-2 flex items-start gap-2 border-t border-border/50 pt-2">
								<MessageSquare class="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
								<p class="text-sm text-muted-foreground">{annotation.note}</p>
							</div>
						{/if}
						<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
							<span>Page {annotation.page}</span>
							<button
								onclick={(e) => { e.stopPropagation(); onDelete(annotation.id); }}
								class="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
								aria-label="Delete annotation"
							>
								<Trash2 class="h-3 w-3" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
