<script lang="ts">
	import { ArrowRight, Loader2, Globe, FileText, Settings, Bot, ChevronDown } from '@lucide/svelte';
	import { agentsStore } from '$lib/stores/agents.svelte';
	import { Popover } from 'bits-ui';

	interface Props {
		onSubmit: (query: string) => void;
		isLoading?: boolean;
		disabled?: boolean;
		placeholder?: string;
		webSearchEnabled?: boolean;
		fileRagEnabled?: boolean;
		onWebSearchToggle?: (enabled: boolean) => void;
		onFileRagToggle?: (enabled: boolean) => void;
		onOpenSettings?: () => void;
	}

	let {
		onSubmit,
		isLoading = false,
		disabled = false,
		placeholder = 'Ask anything...',
		webSearchEnabled = true,
		fileRagEnabled = false,
		onWebSearchToggle,
		onFileRagToggle,
		onOpenSettings
	}: Props = $props();

	let query = $state('');
	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let agentPopoverOpen = $state(false);

	const canSubmit = $derived(query.trim().length > 0 && !isLoading && !disabled);

	function handleSubmit(e?: Event) {
		e?.preventDefault();
		if (!canSubmit) return;

		onSubmit(query.trim());
		query = '';
		
		if (textareaRef) {
			textareaRef.style.height = 'auto';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.isComposing) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function handleInput() {
		if (textareaRef) {
			textareaRef.style.height = 'auto';
			textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 150)}px`;
		}
	}

	function selectAgent(agentId: string, deploymentId: string) {
		agentsStore.selectAgent(agentId, deploymentId);
		agentPopoverOpen = false;
	}

	// Focus input on mount
	$effect(() => {
		if (textareaRef && !isLoading) {
			textareaRef.focus();
		}
	});
</script>

<form onsubmit={handleSubmit} class="w-full max-w-3xl mx-auto">
	<div class="flex flex-col bg-secondary rounded-2xl border border-border shadow-lg shadow-black/5 dark:shadow-black/20 transition-all duration-200 focus-within:border-cyan-500/50 focus-within:shadow-cyan-500/10">
		<!-- Textarea -->
		<textarea
			bind:this={textareaRef}
			bind:value={query}
			onkeydown={handleKeydown}
			oninput={handleInput}
			{placeholder}
			disabled={disabled || isLoading}
			rows={2}
			class="bg-transparent placeholder:text-muted-foreground/60 text-base resize-none focus:outline-none w-full max-h-36 leading-relaxed px-4 pt-4"
		></textarea>
		
		<!-- Controls Row -->
		<div class="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2">
			<!-- Agent Selector -->
			<Popover.Root bind:open={agentPopoverOpen}>
				<Popover.Trigger
					class="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
				>
					<Bot class="h-3.5 w-3.5" />
					<span class="max-w-24 truncate">
						{agentsStore.selectedAgent?.name || 'Select Agent'}
					</span>
					<ChevronDown class="h-3 w-3" />
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						side="top"
						align="start"
						sideOffset={8}
						class="z-50 w-56 rounded-lg border border-border bg-popover p-1 shadow-lg"
					>
						{#if agentsStore.loading}
							<div class="flex items-center justify-center p-3 text-sm text-muted-foreground">
								<Loader2 class="h-4 w-4 animate-spin mr-2" />
								Loading...
							</div>
						{:else if agentsStore.agents.length === 0}
							<div class="p-3 text-center text-sm text-muted-foreground">
								No agents available
							</div>
						{:else}
							<div class="max-h-48 overflow-y-auto">
								{#each agentsStore.agents as agent (agent.assistant_id)}
									<button
										type="button"
										onclick={() => selectAgent(agent.assistant_id, agent.deploymentId)}
										class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors
											{agentsStore.selectedAgentId === agent.assistant_id ? 'bg-primary/10 text-primary' : 'text-foreground'}"
									>
										<Bot class="h-4 w-4 shrink-0" />
										<span class="flex-1 truncate">{agent.name}</span>
									</button>
								{/each}
							</div>
						{/if}
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>

			<!-- Divider -->
			<div class="h-5 w-px bg-border"></div>

			<!-- Web Search Toggle -->
			<button
				type="button"
				onclick={() => onWebSearchToggle?.(!webSearchEnabled)}
				class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors
					{webSearchEnabled 
						? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' 
						: 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'}"
				title="Enable web search"
			>
				<Globe class="h-3.5 w-3.5" />
				<span>Web</span>
			</button>

			<!-- File RAG Toggle -->
			<button
				type="button"
				onclick={() => onFileRagToggle?.(!fileRagEnabled)}
				class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors
					{fileRagEnabled 
						? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30' 
						: 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'}"
				title="Enable file RAG"
			>
				<FileText class="h-3.5 w-3.5" />
				<span>Files</span>
			</button>

			<!-- Spacer -->
			<div class="flex-1"></div>

			<!-- Settings Button -->
			{#if onOpenSettings}
				<button
					type="button"
					onclick={onOpenSettings}
					class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
					title="Settings"
				>
					<Settings class="h-4 w-4" />
				</button>
			{/if}

			<!-- Submit Button -->
			<button
				type="submit"
				disabled={!canSubmit}
				class="inline-flex items-center justify-center rounded-full bg-cyan-500 text-white p-2.5 transition-all duration-200 hover:bg-cyan-400 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
			>
				{#if isLoading}
					<Loader2 class="h-5 w-5 animate-spin" />
				{:else}
					<ArrowRight class="h-5 w-5" />
				{/if}
			</button>
		</div>
	</div>
	
	<!-- Helper Text -->
	<div class="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
		<span>Press <kbd class="px-1 py-0.5 rounded bg-muted font-mono">Enter</kbd> to submit</span>
		<span>•</span>
		<span><kbd class="px-1 py-0.5 rounded bg-muted font-mono">Shift + Enter</kbd> for new line</span>
	</div>
</form>

