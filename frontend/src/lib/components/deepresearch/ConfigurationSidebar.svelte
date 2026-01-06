<script lang="ts">
	import { 
		X, 
		Settings, 
		Key, 
		Wrench, 
		Database,
		Save,
		RotateCcw,
		Eye,
		EyeOff
	} from '@lucide/svelte';
	import { agentsStore } from '$lib/stores/agents.svelte';
	import { apiKeysStore, API_KEY_CONFIGS } from '$lib/stores/apiKeys.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
	}

	let { open, onClose }: Props = $props();

	// Tab state
	type Tab = 'general' | 'keys' | 'advanced';
	let activeTab = $state<Tab>('general');

	// Form state
	let agentUrl = $state(settingsStore.agentUrl);
	let backendUrl = $state(settingsStore.backendUrl);
	
	// API key visibility
	let visibleKeys = $state<Set<string>>(new Set());

	// Local copy of API keys for editing
	let localApiKeys = $state<Record<string, string>>({});

	// Initialize local keys when sidebar opens
	$effect(() => {
		if (open) {
			localApiKeys = { ...apiKeysStore.apiKeys };
			agentUrl = settingsStore.agentUrl;
			backendUrl = settingsStore.backendUrl;
		}
	});

	function toggleKeyVisibility(key: string) {
		if (visibleKeys.has(key)) {
			visibleKeys.delete(key);
			visibleKeys = new Set(visibleKeys);
		} else {
			visibleKeys.add(key);
			visibleKeys = new Set(visibleKeys);
		}
	}

	function handleSaveKeys() {
		apiKeysStore.setKeys(localApiKeys);
	}

	function handleSaveUrls() {
		settingsStore.setAgentUrl(agentUrl);
		settingsStore.setBackendUrl(backendUrl);
	}

	function handleResetConfig() {
		if (agentsStore.selectedAgentId) {
			agentsStore.resetAgentConfig(agentsStore.selectedAgentId);
		}
	}

	function handleClose() {
		onClose?.();
	}
</script>

{#if open}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		onclick={handleClose}
		aria-label="Close configuration"
	></button>

	<!-- Sidebar -->
	<div class="fixed top-0 right-0 z-50 h-full w-80 border-l border-zinc-800 bg-zinc-950 shadow-xl flex flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
			<div class="flex items-center gap-2">
				<Settings class="h-5 w-5 text-zinc-400" />
				<h2 class="text-sm font-semibold text-zinc-100">Configuration</h2>
			</div>
			<button
				onclick={handleClose}
				class="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- Tabs -->
		<div class="flex border-b border-zinc-800">
			<button
				onclick={() => activeTab = 'general'}
				class="flex-1 px-4 py-2 text-xs font-medium transition-colors
					{activeTab === 'general' 
						? 'text-zinc-100 border-b-2 border-primary' 
						: 'text-zinc-500 hover:text-zinc-300'}"
			>
				General
			</button>
			<button
				onclick={() => activeTab = 'keys'}
				class="flex-1 px-4 py-2 text-xs font-medium transition-colors
					{activeTab === 'keys' 
						? 'text-zinc-100 border-b-2 border-primary' 
						: 'text-zinc-500 hover:text-zinc-300'}"
			>
				API Keys
			</button>
			<button
				onclick={() => activeTab = 'advanced'}
				class="flex-1 px-4 py-2 text-xs font-medium transition-colors
					{activeTab === 'advanced' 
						? 'text-zinc-100 border-b-2 border-primary' 
						: 'text-zinc-500 hover:text-zinc-300'}"
			>
				Advanced
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-4">
			{#if activeTab === 'general'}
				<!-- General Settings -->
				<div class="space-y-4">
					<div>
						<h3 class="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
							<Wrench class="h-3.5 w-3.5" />
							Agent Settings
						</h3>

						{#if agentsStore.selectedAgent}
							<div class="space-y-3">
								<div class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
									<div class="text-sm font-medium text-zinc-200">
										{agentsStore.selectedAgent.name}
									</div>
									{#if agentsStore.selectedAgent.description}
										<p class="text-xs text-zinc-500 mt-1">
											{agentsStore.selectedAgent.description}
										</p>
									{/if}
								</div>

								<!-- Model selection (placeholder) -->
								<div>
									<label class="block text-xs font-medium text-zinc-400 mb-1">Model</label>
									<select class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary">
										<option value="gpt-4.1">GPT-4.1 (Default)</option>
										<option value="gpt-4.1-mini">GPT-4.1 Mini</option>
										<option value="claude-sonnet-4">Claude Sonnet 4</option>
										<option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
									</select>
								</div>

								<!-- Search API (placeholder) -->
								<div>
									<label class="block text-xs font-medium text-zinc-400 mb-1">Search API</label>
									<select class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary">
										<option value="tavily">Tavily (Default)</option>
										<option value="searxng">SearXNG</option>
										<option value="duckduckgo">DuckDuckGo</option>
									</select>
								</div>

								<!-- Max iterations -->
								<div>
									<label class="block text-xs font-medium text-zinc-400 mb-1">Max Research Iterations</label>
									<input
										type="number"
										min="1"
										max="10"
										value="5"
										class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary"
									/>
								</div>
							</div>
						{:else}
							<p class="text-sm text-zinc-500">No agent selected</p>
						{/if}
					</div>
				</div>

			{:else if activeTab === 'keys'}
				<!-- API Keys -->
				<div class="space-y-4">
					<div>
						<h3 class="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
							<Key class="h-3.5 w-3.5" />
							API Keys
						</h3>
						<p class="text-xs text-zinc-500 mb-4">
							Provide your own API keys for external services. Keys are stored locally and passed to agents at runtime.
						</p>

						<div class="space-y-3">
							{#each API_KEY_CONFIGS as config (config.key)}
								<div>
									<label class="block text-xs font-medium text-zinc-400 mb-1">
										{config.label}
									</label>
									<div class="relative">
										<input
											type={visibleKeys.has(config.key) ? 'text' : 'password'}
											bind:value={localApiKeys[config.key]}
											placeholder={config.placeholder}
											class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary"
										/>
										<button
											onclick={() => toggleKeyVisibility(config.key)}
											class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
										>
											{#if visibleKeys.has(config.key)}
												<EyeOff class="h-4 w-4" />
											{:else}
												<Eye class="h-4 w-4" />
											{/if}
										</button>
									</div>
									<p class="text-[10px] text-zinc-600 mt-1">{config.description}</p>
								</div>
							{/each}
						</div>

						<button
							onclick={handleSaveKeys}
							class="mt-4 w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
						>
							<Save class="h-4 w-4" />
							Save API Keys
						</button>
					</div>
				</div>

			{:else if activeTab === 'advanced'}
				<!-- Advanced Settings -->
				<div class="space-y-4">
					<div>
						<h3 class="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
							<Database class="h-3.5 w-3.5" />
							Server URLs
						</h3>

						<div class="space-y-3">
							<div>
								<label class="block text-xs font-medium text-zinc-400 mb-1">LangGraph Agent URL</label>
								<input
									type="text"
									bind:value={agentUrl}
									placeholder="http://localhost:2024"
									class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>

							<div>
								<label class="block text-xs font-medium text-zinc-400 mb-1">Backend URL</label>
								<input
									type="text"
									bind:value={backendUrl}
									placeholder="http://localhost:8000"
									class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary"
								/>
							</div>

							<button
								onclick={handleSaveUrls}
								class="w-full flex items-center justify-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
							>
								<Save class="h-4 w-4" />
								Save URLs
							</button>
						</div>
					</div>

					<div class="pt-4 border-t border-zinc-800">
						<button
							onclick={handleResetConfig}
							class="w-full flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
						>
							<RotateCcw class="h-4 w-4" />
							Reset Agent Config
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

