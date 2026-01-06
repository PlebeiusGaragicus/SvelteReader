<script lang="ts">
	import { Search, Globe, Brain, Lightbulb, Loader2, Check, X, ChevronDown, ChevronUp, Wrench } from '@lucide/svelte';

	interface ToolCallWithStatus {
		id: string;
		name: string;
		args: Record<string, unknown>;
		status: 'pending' | 'executing' | 'completed' | 'error';
		result?: { content: string };
	}

	interface Props {
		toolCall: ToolCallWithStatus;
	}

	let { toolCall }: Props = $props();

	let expanded = $state(false);

	function getToolDisplay(): { 
		icon: typeof Search; 
		label: string;
		detail?: string;
		color: string;
	} {
		switch (toolCall.name) {
			case 'web_search': {
				const queries = toolCall.args.queries as string[] | string;
				const queryText = Array.isArray(queries) ? queries[0] : queries;
				return { 
					icon: Search, 
					label: 'Web Search',
					detail: queryText ? `"${queryText}"` : undefined,
					color: 'text-cyan-500'
				};
			}
			case 'tavily_search': {
				const query = toolCall.args.query as string;
				return { 
					icon: Search, 
					label: 'Search',
					detail: query ? `"${query}"` : undefined,
					color: 'text-cyan-500'
				};
			}
			case 'scrape_url': {
				const url = toolCall.args.url as string;
				let domain = 'page';
				try {
					domain = url ? new URL(url).hostname.replace('www.', '') : 'page';
				} catch { /* ignore */ }
				return { 
					icon: Globe, 
					label: 'Reading',
					detail: domain,
					color: 'text-blue-500'
				};
			}
			case 'think_tool':
			case 'think': {
				const reflection = (toolCall.args.reflection || toolCall.args.thought || '') as string;
				return { 
					icon: Brain, 
					label: 'Thinking',
					detail: reflection.slice(0, 60) + (reflection.length > 60 ? '...' : ''),
					color: 'text-purple-500'
				};
			}
			case 'ConductResearch': {
				const topic = toolCall.args.research_topic as string;
				return { 
					icon: Lightbulb, 
					label: 'Researching',
					detail: topic ? topic.slice(0, 60) + (topic.length > 60 ? '...' : '') : undefined,
					color: 'text-yellow-500'
				};
			}
			default:
				return { 
					icon: Wrench, 
					label: toolCall.name.replace(/_/g, ' '),
					color: 'text-muted-foreground'
				};
		}
	}

	const display = $derived(getToolDisplay());
	const Icon = $derived(display.icon);
	const hasResult = $derived(!!toolCall.result?.content);
	const isExecuting = $derived(toolCall.status === 'pending' || toolCall.status === 'executing');
</script>

<div class="group rounded-lg border border-border/50 bg-muted/30 overflow-hidden transition-colors hover:border-border">
	<!-- Header -->
	<button
		onclick={() => { if (hasResult) expanded = !expanded; }}
		class="flex items-center gap-2 w-full px-3 py-2 text-left transition-colors
			{hasResult ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'}"
		disabled={!hasResult}
	>
		<!-- Status Icon -->
		<div class="flex-shrink-0">
			{#if isExecuting}
				<Loader2 class="h-4 w-4 animate-spin {display.color}" />
			{:else if toolCall.status === 'completed'}
				<Icon class="h-4 w-4 {display.color}" />
			{:else if toolCall.status === 'error'}
				<X class="h-4 w-4 text-destructive" />
			{:else}
				<Icon class="h-4 w-4 {display.color}" />
			{/if}
		</div>
		
		<!-- Label and Detail -->
		<div class="flex-1 min-w-0 flex items-center gap-2">
			<span class="text-xs font-medium text-foreground">{display.label}</span>
			{#if display.detail}
				<span class="text-xs text-muted-foreground truncate">{display.detail}</span>
			{/if}
		</div>
		
		<!-- Status Badge -->
		<div class="flex-shrink-0 flex items-center gap-2">
			{#if toolCall.status === 'completed'}
				<Check class="h-3.5 w-3.5 text-green-500" />
			{/if}
			
			{#if hasResult}
				{#if expanded}
					<ChevronUp class="h-3.5 w-3.5 text-muted-foreground" />
				{:else}
					<ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
				{/if}
			{/if}
		</div>
	</button>
	
	<!-- Expanded Content -->
	{#if expanded && toolCall.result?.content}
		<div class="border-t border-border/50 px-3 py-2 bg-background/50">
			<div class="max-h-40 overflow-y-auto">
				<pre class="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">{toolCall.result.content.slice(0, 1500)}{toolCall.result.content.length > 1500 ? '\n...(truncated)' : ''}</pre>
			</div>
		</div>
	{/if}
</div>
