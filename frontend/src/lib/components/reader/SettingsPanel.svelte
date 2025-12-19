<script lang="ts">
	import { onMount } from 'svelte';
	import { X } from '@lucide/svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();
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
</script>

<div bind:this={panelElement} class="settings-panel absolute inset-y-0 right-0 top-[53px] z-10 w-72 border-l border-border bg-card text-card-foreground shadow-lg" style="background-color: hsl(var(--card)); color: hsl(var(--card-foreground));">
	<div class="flex items-center justify-between border-b border-border p-4">
		<h2 class="font-semibold">Settings</h2>
		<button
			onclick={onClose}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
			aria-label="Close settings"
		>
			<X class="h-4 w-4" />
		</button>
	</div>
	<div class="p-4">
		<p class="text-sm text-muted-foreground">Reader settings (font size, theme, etc.) coming soon</p>
	</div>
</div>
