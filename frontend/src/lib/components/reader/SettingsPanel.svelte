<script lang="ts">
	import { onMount } from 'svelte';
	import { X, Minus, Plus, Type, RotateCcw } from '@lucide/svelte';
	import { useSettingsStore, type FontFamily } from '$lib/stores/settings.svelte';

	interface Props {
		onClose: () => void;
		onSettingsChange?: () => void;
	}

	let { onClose, onSettingsChange }: Props = $props();
	let panelElement: HTMLDivElement;
	const settings = useSettingsStore();

	const fontOptions: { value: FontFamily; label: string; style: string }[] = [
		{ value: 'original', label: 'Original', style: 'inherit' },
		{ value: 'georgia', label: 'Georgia', style: 'Georgia, serif' },
		{ value: 'palatino', label: 'Palatino', style: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
		{ value: 'times', label: 'Times', style: '"Times New Roman", Times, serif' },
		{ value: 'helvetica', label: 'Helvetica', style: 'Helvetica, Arial, sans-serif' },
		{ value: 'verdana', label: 'Verdana', style: 'Verdana, Geneva, sans-serif' },
	];

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (panelElement && !panelElement.contains(event.target as Node)) {
			onClose();
		}
	}

	function handleFontSizeDecrease() {
		settings.decreaseFontSize();
		onSettingsChange?.();
	}

	function handleFontSizeIncrease() {
		settings.increaseFontSize();
		onSettingsChange?.();
	}

	function handleFontFamilyChange(family: FontFamily) {
		settings.setFontFamily(family);
		onSettingsChange?.();
	}

	function handleReset() {
		settings.reset();
		onSettingsChange?.();
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
		<h2 class="font-semibold">Reader Settings</h2>
		<button
			onclick={onClose}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
			aria-label="Close settings"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<div class="p-4 space-y-6">
		<!-- Text Size -->
		<div class="space-y-3">
			<h3 class="text-sm font-medium flex items-center gap-2">
				<Type class="h-4 w-4" />
				Text Size
			</h3>
			
			<div class="flex items-center justify-between gap-3">
				<button
					onclick={handleFontSizeDecrease}
					disabled={settings.fontSize <= 50}
					class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
					aria-label="Decrease font size"
				>
					<Minus class="h-4 w-4" />
				</button>
				
				<div class="flex-1 text-center">
					<span class="text-lg font-medium tabular-nums">{settings.fontSize}%</span>
				</div>
				
				<button
					onclick={handleFontSizeIncrease}
					disabled={settings.fontSize >= 200}
					class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
					aria-label="Increase font size"
				>
					<Plus class="h-4 w-4" />
				</button>
			</div>
		</div>

		<hr class="border-border" />

		<!-- Font Family -->
		<div class="space-y-3">
			<h3 class="text-sm font-medium">Font</h3>
			
			<div class="grid grid-cols-1 gap-2">
				{#each fontOptions as font}
					<button
						onclick={() => handleFontFamilyChange(font.value)}
						class="flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors {settings.fontFamily === font.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}"
					>
						<span 
							class="text-sm"
							style="font-family: {font.style}"
						>
							{font.label}
						</span>
						{#if settings.fontFamily === font.value}
							<span class="h-2 w-2 rounded-full bg-primary"></span>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<hr class="border-border" />

		<!-- Reset -->
		<button
			onclick={handleReset}
			class="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
		>
			<RotateCcw class="h-4 w-4" />
			Reset to Defaults
		</button>
	</div>
</div>
