<script lang="ts">
	import { ChevronDown, Bot, RefreshCw, Check } from '@lucide/svelte';
	import { agentsStore, type Agent } from '$lib/stores/agents.svelte';
	import { Popover } from 'bits-ui';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	let isOpen = $state(false);

	function handleSelectAgent(agent: Agent) {
		agentsStore.selectAgent(agent.id);
		isOpen = false;
	}

	async function handleRefresh() {
		await agentsStore.fetchAgents();
	}
</script>

<div class="flex items-center gap-2 {className}">
	<Popover.Root bind:open={isOpen}>
		<Popover.Trigger
			class="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary hover:border-border/80"
		>
			<Bot class="h-4 w-4 text-cyan-500" />
			<span class="max-w-[160px] truncate">
				{agentsStore.selectedAgent?.name ?? 'Select Agent'}
			</span>
			<ChevronDown class="h-4 w-4 text-muted-foreground" />
		</Popover.Trigger>

		<Popover.Portal>
			<Popover.Content
				side="bottom"
				align="start"
				sideOffset={5}
				class="z-50 w-64 rounded-lg border border-border bg-popover p-1 shadow-xl focus:outline-none"
			>
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-border px-3 py-2">
					<span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						Available Agents
					</span>
					<button
						onclick={handleRefresh}
						class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
						title="Refresh agents"
						disabled={agentsStore.loading}
					>
						<RefreshCw class="h-3.5 w-3.5 {agentsStore.loading ? 'animate-spin' : ''}" />
					</button>
				</div>

				<!-- Agent List -->
				<div class="max-h-64 overflow-y-auto py-1">
					{#if agentsStore.agents.length === 0}
						<div class="px-3 py-4 text-center text-xs text-muted-foreground">
							No agents available
						</div>
					{:else}
						{#each agentsStore.agents as agent (agent.id)}
							{@const isSelected = agentsStore.selectedAgentId === agent.id}
							<button
								onclick={() => handleSelectAgent(agent)}
								class="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors
									{isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'}"
							>
								<Bot class="h-4 w-4 mt-0.5 flex-shrink-0 {isSelected ? 'text-primary' : 'text-muted-foreground'}" />
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium truncate">{agent.name}</span>
										{#if isSelected}
											<Check class="h-3.5 w-3.5 text-primary flex-shrink-0" />
										{/if}
									</div>
									{#if agent.description}
										<p class="text-xs text-muted-foreground line-clamp-2 mt-0.5">
											{agent.description}
										</p>
									{/if}
								</div>
							</button>
						{/each}
					{/if}
				</div>

				{#if agentsStore.error}
					<div class="border-t border-border px-3 py-2">
						<p class="text-xs text-destructive">{agentsStore.error}</p>
					</div>
				{/if}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
</div>

