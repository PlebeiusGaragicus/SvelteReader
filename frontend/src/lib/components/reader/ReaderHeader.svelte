<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, List, Highlighter, Bot, Settings } from '@lucide/svelte';
	import SyncStatusButton from './SyncStatusButton.svelte';

	interface Props {
		title: string;
		showTOC: boolean;
		showAnnotations: boolean;
		showAIChat: boolean;
		showSettings: boolean;
		onToggleTOC: () => void;
		onToggleAnnotations: () => void;
		onToggleAIChat: () => void;
		onToggleSettings: () => void;
	}

	let {
		title,
		showTOC,
		showAnnotations,
		showAIChat,
		showSettings,
		onToggleTOC,
		onToggleAnnotations,
		onToggleAIChat,
		onToggleSettings
	}: Props = $props();
</script>

<header class="flex items-center justify-between border-b border-border px-4 py-2">
	<div class="flex items-center gap-2">
		<button
			onclick={() => goto('/')}
			class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
			aria-label="Back to library"
		>
			<ArrowLeft class="h-5 w-5" />
		</button>
		<button
			onclick={onToggleTOC}
			class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showTOC ? 'bg-accent' : ''}"
			aria-label="Table of contents"
		>
			<List class="h-5 w-5" />
		</button>
	</div>

	<span class="text-sm font-medium">{title}</span>

	<div class="flex items-center gap-2">
		<button
			onclick={onToggleAnnotations}
			class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showAnnotations ? 'bg-accent' : ''}"
			aria-label="Annotations"
		>
			<Highlighter class="h-5 w-5" />
		</button>
		<button
			onclick={onToggleAIChat}
			class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showAIChat ? 'bg-accent text-blue-500' : ''}"
			aria-label="AI Chat"
		>
			<Bot class="h-5 w-5" />
		</button>
		<SyncStatusButton />
		<button
			onclick={onToggleSettings}
			class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showSettings ? 'bg-accent' : ''}"
			aria-label="Settings"
		>
			<Settings class="h-5 w-5" />
		</button>
	</div>
</header>
