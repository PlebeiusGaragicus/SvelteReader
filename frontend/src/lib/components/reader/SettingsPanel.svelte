<script lang="ts">
	import { X } from '@lucide/svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();
</script>

<div class="absolute inset-y-0 right-0 top-[53px] z-10 w-72 border-l border-border bg-card shadow-lg">
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
