<script lang="ts">
	import { Popover } from 'bits-ui';
	import { BookOpen, Globe, ChevronDown, Check, Sparkles } from '@lucide/svelte';
	import { modeStore, type AppMode } from '$lib/stores/mode.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { Component } from 'svelte';

	let open = $state(false);

	const iconMap: Record<string, Component<{ class?: string }>> = {
		BookOpen,
		Globe
	};

	// Check if we're on the home page
	const isHomePage = $derived($page.url.pathname === '/');

	function handleModeSelect(mode: AppMode) {
		modeStore.setMode(mode);
		open = false;
		const modeInfo = modeStore.getModeInfo(mode);
		goto(modeInfo.route);
	}

	function getIcon(iconName: string): Component<{ class?: string }> {
		return iconMap[iconName] || BookOpen;
	}

	const CurrentIcon = $derived(getIcon(modeStore.currentInfo.icon));
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground {isHomePage ? 'animate-pulse ring-2 ring-cyan-500/50 ring-offset-2 ring-offset-background' : ''}"
	>
		{#if isHomePage}
			<Sparkles class="h-4 w-4 text-cyan-500" />
			<span class="text-cyan-500">Select a mode</span>
		{:else}
			<CurrentIcon class="h-4 w-4" />
			<span class="hidden sm:inline">{modeStore.currentInfo.name}</span>
		{/if}
		<ChevronDown class="h-3 w-3 opacity-60" />
	</Popover.Trigger>
	
	<Popover.Portal>
		<Popover.Content
			class="bg-popover text-popover-foreground z-50 w-64 rounded-xl border border-border p-2 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
			sideOffset={8}
			align="start"
		>
			<div class="mb-2 px-2 py-1.5">
				<p class="text-xs font-medium text-muted-foreground">Switch Mode</p>
			</div>
			
		{#each modeStore.modes as mode}
			{@const ModeIcon = getIcon(mode.icon)}
			{@const isActive = !isHomePage && modeStore.current === mode.id}
			<button
				onclick={() => handleModeSelect(mode.id)}
				class="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted {isActive ? 'bg-muted/50' : ''}"
			>
				<div class="flex h-9 w-9 items-center justify-center rounded-lg {isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">
					<ModeIcon class="h-4 w-4" />
				</div>
				<div class="flex-1">
					<p class="text-sm font-medium">{mode.name}</p>
					<p class="text-xs text-muted-foreground">{mode.description}</p>
				</div>
				{#if isActive}
					<Check class="h-4 w-4 text-primary" />
				{/if}
			</button>
		{/each}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

