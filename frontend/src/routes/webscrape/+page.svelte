<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Globe, User, LogIn, Search, Newspaper, Sparkles } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { WebSearchInput, DiscoveryFeed } from '$lib/components/webscrape';

	let isSearching = $state(false);
	
	const isLoggedIn = $derived(cyphertap.isLoggedIn);

	// Ensure mode is set correctly when navigating to this page
	onMount(() => {
		if (modeStore.current !== 'webscrape') {
			modeStore.setMode('webscrape');
		}
	});

	function handleSearch(query: string) {
		isSearching = true;
		
		// TODO: Implement actual web search + synthesis
		// For now, show a toast and open a simple search
		toast.info(`Searching for: "${query}"`, {
			description: 'Web search integration coming soon!'
		});
		
		// Simulate search delay
		setTimeout(() => {
			isSearching = false;
		}, 1500);
	}
</script>

<div class="min-h-[calc(100vh-3.5rem)] px-4 py-8">
	{#if !isLoggedIn}
		<!-- Demo page for logged out users -->
		<div class="flex flex-col items-center justify-center py-16 text-center max-w-2xl mx-auto">
			<div class="relative mb-8">
				<Globe class="h-24 w-24 text-cyan-500" />
				<div class="absolute -bottom-2 -right-2 bg-primary text-primary-foreground rounded-full p-2">
					<LogIn class="h-4 w-4" />
				</div>
			</div>
			
			<h1 class="text-3xl font-bold mb-4">Web Scrape Mode</h1>
			<p class="text-lg text-muted-foreground mb-6">
				Search the web and get AI-synthesized answers with source citations.
			</p>
			
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 w-full">
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Search class="h-8 w-8 text-cyan-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Web Search</h3>
					<p class="text-xs text-muted-foreground">Search across the web for real-time information</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Sparkles class="h-8 w-8 text-yellow-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">AI Synthesis</h3>
					<p class="text-xs text-muted-foreground">Get AI-powered summaries with citations</p>
				</div>
				<div class="p-4 rounded-xl bg-secondary border border-border">
					<Newspaper class="h-8 w-8 text-green-500 mb-2 mx-auto" />
					<h3 class="font-medium mb-1">Discover</h3>
					<p class="text-xs text-muted-foreground">Explore trending news and events</p>
				</div>
			</div>
			
			<div class="flex flex-col items-center gap-3">
				<p class="text-muted-foreground">
					<User class="inline h-4 w-4 mr-1" />
					Log in with Nostr to access Web Scrape mode
				</p>
			</div>
		</div>
	{:else}
		<!-- Hero section with search -->
		<div class="flex flex-col items-center justify-center py-12 lg:py-20">
			<h1 class="text-3xl lg:text-4xl font-light text-center mb-8 text-muted-foreground">
				Search the web. <span class="text-foreground">Get answers.</span>
			</h1>
			
			<WebSearchInput 
				onSubmit={handleSearch} 
				isLoading={isSearching}
				placeholder="What would you like to know?"
			/>
		</div>

		<!-- Discovery feed -->
		<div class="max-w-screen-lg mx-auto mt-8">
			<DiscoveryFeed />
		</div>
	{/if}
</div>

