<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { BookOpen, Globe, User, ArrowRight, Zap, Shield, Key } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';
	import { modeStore, MODES } from '$lib/stores/mode.svelte';

	const isLoggedIn = $derived(cyphertap.isLoggedIn);

	// If logged in, redirect to the current mode's page
	$effect(() => {
		if (isLoggedIn) {
			goto(modeStore.currentInfo.route);
		}
	});

	function navigateToMode(route: string) {
		goto(route);
	}

	const iconMap = {
		BookOpen,
		Globe
	} as const;

	function getIcon(iconName: string) {
		return iconMap[iconName as keyof typeof iconMap] || BookOpen;
	}
</script>

<div class="min-h-[calc(100vh-3.5rem)] flex flex-col">
	<!-- Hero Section -->
	<div class="flex-1 flex flex-col items-center justify-center px-4 py-16">
		<div class="text-center max-w-3xl mx-auto">
			<!-- Logo -->
			<div class="flex items-center justify-center gap-3 mb-6">
				<BookOpen class="h-12 w-12 text-cyan-500" />
				<h1 class="text-4xl lg:text-5xl font-bold">SvelteReader</h1>
			</div>
			
			<!-- Tagline -->
			<p class="text-xl lg:text-2xl text-muted-foreground mb-8">
				A Nostr-native platform for reading, learning, and discovering.
			</p>
			
			<!-- Login prompt -->
			<div class="bg-secondary/50 border border-border rounded-2xl p-6 mb-12 max-w-md mx-auto">
				<User class="h-10 w-10 text-cyan-500 mx-auto mb-4" />
				<h2 class="text-lg font-semibold mb-2">Log in to get started</h2>
				<p class="text-sm text-muted-foreground mb-4">
					Click the user icon in the top right to log in with your Nostr key.
				</p>
				<p class="text-xs text-muted-foreground">
					No account needed — just your Nostr identity.
				</p>
			</div>
			
			<!-- Mode cards -->
			<div class="mb-12">
				<h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
					Explore Modes
				</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
					{#each MODES as mode}
						{@const ModeIcon = getIcon(mode.icon)}
						<button
							onclick={() => navigateToMode(mode.route)}
							class="group flex items-start gap-4 p-5 rounded-xl bg-secondary border border-border text-left transition-all duration-200 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/5"
						>
							<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
								<ModeIcon class="h-6 w-6" />
							</div>
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<h4 class="font-semibold">{mode.name}</h4>
									<ArrowRight class="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
								</div>
								<p class="text-sm text-muted-foreground">{mode.description}</p>
							</div>
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
	
	<!-- Features Section -->
	<div class="border-t border-border bg-secondary/30 px-4 py-12">
		<div class="max-w-4xl mx-auto">
			<h3 class="text-center text-sm font-medium text-muted-foreground uppercase tracking-wide mb-8">
				Built on Freedom Tech
			</h3>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div class="text-center">
					<Key class="h-8 w-8 text-cyan-500 mx-auto mb-3" />
					<h4 class="font-medium mb-1">Nostr Identity</h4>
					<p class="text-sm text-muted-foreground">
						Your keys, your identity. No email or password required.
					</p>
				</div>
				<div class="text-center">
					<Zap class="h-8 w-8 text-yellow-500 mx-auto mb-3" />
					<h4 class="font-medium mb-1">Lightning Payments</h4>
					<p class="text-sm text-muted-foreground">
						Pay-per-use with ecash micropayments. No subscriptions.
					</p>
				</div>
				<div class="text-center">
					<Shield class="h-8 w-8 text-green-500 mx-auto mb-3" />
					<h4 class="font-medium mb-1">Self-Custody</h4>
					<p class="text-sm text-muted-foreground">
						Your data stays in your browser. You own everything.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
