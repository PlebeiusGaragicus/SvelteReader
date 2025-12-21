<script lang="ts">
	import { onMount } from 'svelte';
	import { X, Cloud, CloudOff } from '@lucide/svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();
	let panelElement: HTMLDivElement;
	
	// Local state bound to settings store
	let autoPublish = $state(settingsStore.autoPublishAnnotations);
	
	function handleAutoPublishChange(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		autoPublish = checked;
		settingsStore.setAutoPublishAnnotations(checked);
	}

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

<div bind:this={panelElement} class="settings-panel absolute inset-y-0 right-0 top-[53px] z-10 w-72 border-l border-border bg-card text-card-foreground shadow-lg" style="background-color: var(--card); color: var(--card-foreground);">
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
	<div class="p-4 space-y-6">
		<!-- Nostr Sync Settings -->
		<div class="space-y-3">
			<h3 class="text-sm font-medium flex items-center gap-2">
				{#if autoPublish}
					<Cloud class="h-4 w-4 text-blue-500" />
				{:else}
					<CloudOff class="h-4 w-4 text-muted-foreground" />
				{/if}
				Nostr Sync
			</h3>
			
			<label class="flex items-center justify-between cursor-pointer">
				<div class="space-y-0.5">
					<span class="text-sm">Auto-publish annotations</span>
					<p class="text-xs text-muted-foreground">
						Sync highlights and notes to Nostr relays
					</p>
				</div>
				<input
					type="checkbox"
					checked={autoPublish}
					onchange={handleAutoPublishChange}
					class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
				/>
			</label>
		</div>

		<hr class="border-border" />

		<!-- Placeholder for future settings -->
		<div class="space-y-3">
			<h3 class="text-sm font-medium">Reader</h3>
			<p class="text-xs text-muted-foreground">Font size, theme, and other reader settings coming soon</p>
		</div>
	</div>
</div>
