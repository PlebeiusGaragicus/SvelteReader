<script lang="ts">
	import { CheckCircle, Circle, Clock, ChevronDown, ChevronUp } from '@lucide/svelte';

	interface TodoItem {
		id?: string;
		content: string;
		status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
	}

	interface Props {
		todos: TodoItem[];
		collapsed?: boolean;
		onToggle?: () => void;
	}

	let {
		todos = [],
		collapsed = false,
		onToggle,
	}: Props = $props();

	// Group todos by status
	const groupedTodos = $derived({
		in_progress: todos.filter(t => t.status === 'in_progress'),
		pending: todos.filter(t => t.status === 'pending'),
		completed: todos.filter(t => t.status === 'completed'),
	});

	const activeTask = $derived(groupedTodos.in_progress[0]);
	const totalTasks = $derived(todos.filter(t => t.status !== 'cancelled').length);
	const completedCount = $derived(groupedTodos.completed.length);
	const isAllComplete = $derived(totalTasks > 0 && completedCount === totalTasks);

	function getStatusIcon(status: TodoItem['status']) {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'in_progress':
				return Clock;
			default:
				return Circle;
		}
	}

	function getStatusColor(status: TodoItem['status']): string {
		switch (status) {
			case 'completed':
				return 'text-green-500';
			case 'in_progress':
				return 'text-yellow-500';
			default:
				return 'text-muted-foreground';
		}
	}
</script>

{#if todos.length > 0}
	<div class="border border-border rounded-lg bg-muted/30 overflow-hidden">
		<!-- Collapsed Header -->
		<button
			type="button"
			onclick={() => onToggle?.()}
			class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
		>
			{#if isAllComplete}
				<CheckCircle class="w-4 h-4 text-green-500 shrink-0" />
				<span class="text-sm font-medium">All tasks completed</span>
			{:else if activeTask}
				<Clock class="w-4 h-4 text-yellow-500 shrink-0 animate-pulse" />
				<span class="text-sm text-muted-foreground">
					Task {completedCount + 1} of {totalTasks}
				</span>
				<span class="text-sm truncate flex-1">{activeTask.content}</span>
			{:else}
				<Circle class="w-4 h-4 text-muted-foreground shrink-0" />
				<span class="text-sm text-muted-foreground">
					{completedCount} of {totalTasks} tasks
				</span>
			{/if}
			
			<div class="ml-auto">
				{#if collapsed}
					<ChevronDown class="w-4 h-4 text-muted-foreground" />
				{:else}
					<ChevronUp class="w-4 h-4 text-muted-foreground" />
				{/if}
			</div>
		</button>
		
		<!-- Expanded Task List -->
		{#if !collapsed}
			<div class="border-t border-border px-4 py-3 space-y-4">
				{#each Object.entries(groupedTodos) as [status, tasks]}
					{#if tasks.length > 0}
						<div>
							<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
								{status === 'in_progress' ? 'In Progress' : status === 'pending' ? 'Pending' : 'Completed'}
							</h4>
							<div class="space-y-2">
								{#each tasks as task, i (task.id ?? `${status}-${i}`)}
									{@const Icon = getStatusIcon(task.status)}
									<div class="flex items-start gap-2">
										<Icon class="w-4 h-4 mt-0.5 shrink-0 {getStatusColor(task.status)}" />
										<span class="text-sm {task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'}">
											{task.content}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/if}

