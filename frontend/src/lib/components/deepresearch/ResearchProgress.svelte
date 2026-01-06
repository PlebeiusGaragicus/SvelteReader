<script lang="ts">
	import { Loader2, CheckCircle, Circle, Search, Brain, FileText, MessageSquare } from '@lucide/svelte';

	interface Props {
		phase: 'idle' | 'clarifying' | 'planning' | 'researching' | 'synthesizing' | 'complete';
		researchIterations?: number;
		maxIterations?: number;
		activeResearchTopics?: string[];
	}

	let {
		phase = 'idle',
		researchIterations = 0,
		maxIterations = 5,
		activeResearchTopics = [],
	}: Props = $props();

	const phases = [
		{ id: 'clarifying', label: 'Clarifying', icon: MessageSquare },
		{ id: 'planning', label: 'Planning', icon: Brain },
		{ id: 'researching', label: 'Researching', icon: Search },
		{ id: 'synthesizing', label: 'Synthesizing', icon: FileText },
		{ id: 'complete', label: 'Complete', icon: CheckCircle },
	] as const;

	function getPhaseIndex(p: typeof phase): number {
		if (p === 'idle') return -1;
		return phases.findIndex(ph => ph.id === p);
	}

	const currentPhaseIndex = $derived(getPhaseIndex(phase));
	const currentPhaseInfo = $derived(currentPhaseIndex >= 0 ? phases[currentPhaseIndex] : null);

	function getPhaseStatus(phaseId: string, idx: number): 'pending' | 'active' | 'completed' {
		if (currentPhaseIndex < 0) return 'pending';
		if (idx < currentPhaseIndex) return 'completed';
		if (idx === currentPhaseIndex) return 'active';
		return 'pending';
	}
</script>

{#if phase !== 'idle' && phase !== 'complete'}
	<div class="rounded-xl border border-border bg-card/50 p-4 backdrop-blur-sm">
		<!-- Phase Progress Bar -->
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-sm font-medium text-foreground">Research Progress</h3>
			{#if researchIterations > 0}
				<span class="text-xs text-muted-foreground">
					Iteration {researchIterations}/{maxIterations}
				</span>
			{/if}
		</div>
		
		<!-- Phase Steps -->
		<div class="flex items-center gap-1">
			{#each phases as phaseItem, idx (phaseItem.id)}
				{@const status = getPhaseStatus(phaseItem.id, idx)}
				{@const Icon = phaseItem.icon}
				
				<div class="flex items-center gap-1">
					<!-- Step Circle -->
					<div 
						class="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300
							{status === 'completed' ? 'bg-green-500/20 text-green-500' : ''}
							{status === 'active' ? 'bg-cyan-500/20 text-cyan-500 ring-2 ring-cyan-500/50' : ''}
							{status === 'pending' ? 'bg-muted text-muted-foreground' : ''}"
					>
						{#if status === 'completed'}
							<CheckCircle class="w-4 h-4" />
						{:else if status === 'active'}
							<Loader2 class="w-4 h-4 animate-spin" />
						{:else}
							<Circle class="w-4 h-4" />
						{/if}
					</div>
					
					<!-- Connector Line -->
					{#if idx < phases.length - 1}
						<div 
							class="h-0.5 w-6 transition-all duration-300
								{status === 'completed' ? 'bg-green-500/50' : 'bg-muted'}"
						></div>
					{/if}
				</div>
			{/each}
		</div>
		
		<!-- Current Phase Label -->
		{#if currentPhaseInfo}
			<div class="mt-3 flex items-center gap-2">
				<Loader2 class="w-4 h-4 animate-spin text-cyan-500" />
				<span class="text-sm text-muted-foreground">
					{currentPhaseInfo.label}...
				</span>
			</div>
		{/if}
		
		<!-- Active Research Topics -->
		{#if activeResearchTopics.length > 0 && phase === 'researching'}
			<div class="mt-4 pt-3 border-t border-border">
				<p class="text-xs text-muted-foreground mb-2">Active Research:</p>
				<div class="flex flex-col gap-1.5">
					{#each activeResearchTopics as topic, i}
						<div class="flex items-center gap-2 text-sm">
							<div class="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
							<span class="text-foreground/80 truncate">{topic}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

