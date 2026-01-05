<script lang="ts">
	import { Layers3, CornerDownRight, Plus, Loader2 } from '@lucide/svelte';

	interface Props {
		suggestions: string[];
		onSelectSuggestion: (suggestion: string) => void;
		isLoading?: boolean;
	}

	let { suggestions, onSelectSuggestion, isLoading = false }: Props = $props();
</script>

{#if suggestions.length > 0}
	<div class="mt-6">
		<!-- Header -->
		<div class="flex items-center gap-2 mb-3">
			<Layers3 class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-medium text-muted-foreground">Related</span>
		</div>
		
		<!-- Suggestions list -->
		<div class="space-y-0">
			{#each suggestions as suggestion, i}
				<div>
					<!-- Divider -->
					<div class="h-px bg-border/50"></div>
					
					<!-- Suggestion button -->
					<button
						onclick={() => onSelectSuggestion(suggestion)}
						disabled={isLoading}
						class="group w-full py-3 text-left transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-start gap-3">
								<CornerDownRight 
									class="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-cyan-500 transition-colors duration-200 flex-shrink-0" 
								/>
								<p class="text-sm text-muted-foreground group-hover:text-cyan-500 transition-colors duration-200 leading-relaxed">
									{suggestion}
								</p>
							</div>
							<Plus 
								class="h-4 w-4 text-muted-foreground/50 group-hover:text-cyan-500 transition-colors duration-200 flex-shrink-0" 
							/>
						</div>
					</button>
				</div>
			{/each}
		</div>
	</div>
{:else if isLoading}
	<div class="mt-6">
		<div class="flex items-center gap-2 mb-3">
			<Layers3 class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-medium text-muted-foreground">Related</span>
		</div>
		<div class="flex items-center gap-2 py-3 text-sm text-muted-foreground">
			<Loader2 class="h-4 w-4 animate-spin" />
			<span>Generating suggestions...</span>
		</div>
	</div>
{/if}

