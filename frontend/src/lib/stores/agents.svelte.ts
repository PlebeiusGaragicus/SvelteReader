/**
 * Agents Store - Multi-agent selection and configuration state
 * 
 * Manages available agents from LangGraph deployments and tracks the currently selected agent.
 * Follows patterns from Open Agent Platform.
 */

import { browser } from '$app/environment';
import { Client } from '@langchain/langgraph-sdk';
import { settingsStore } from './settings.svelte';

// =============================================================================
// TYPES
// =============================================================================

export interface Agent {
	id: string;                    // assistant_id from LangGraph
	name: string;
	description?: string;
	graphId: string;               // The graph this agent is based on
	deploymentUrl: string;         // URL of the LangGraph deployment
	metadata?: Record<string, unknown>;
	config?: Record<string, unknown>;
	createdAt?: string;
	updatedAt?: string;
}

export interface AgentConfig {
	// General settings
	model?: string;
	temperature?: number;
	maxTokens?: number;
	
	// Search settings
	searchApi?: 'tavily' | 'searxng' | 'duckduckgo' | 'native';
	maxSearchResults?: number;
	
	// Research settings
	maxResearchIterations?: number;
	enableClarification?: boolean;
	
	// Custom configurable fields
	[key: string]: unknown;
}

// =============================================================================
// STORAGE
// =============================================================================

const AGENTS_STORAGE_KEY = 'sveltereader-agents';
const SELECTED_AGENT_KEY = 'sveltereader-selected-agent';
const CONFIG_STORAGE_KEY = 'sveltereader-agent-configs';

function loadAgentsFromStorage(): Agent[] {
	if (!browser) return [];
	try {
		const stored = localStorage.getItem(AGENTS_STORAGE_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

function saveAgentsToStorage(agents: Agent[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
	} catch (e) {
		console.error('Failed to save agents:', e);
	}
}

function loadSelectedAgentId(): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(SELECTED_AGENT_KEY);
	} catch {
		return null;
	}
}

function saveSelectedAgentId(agentId: string | null): void {
	if (!browser) return;
	try {
		if (agentId) {
			localStorage.setItem(SELECTED_AGENT_KEY, agentId);
		} else {
			localStorage.removeItem(SELECTED_AGENT_KEY);
		}
	} catch (e) {
		console.error('Failed to save selected agent:', e);
	}
}

function loadConfigsFromStorage(): Record<string, AgentConfig> {
	if (!browser) return {};
	try {
		const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
		return stored ? JSON.parse(stored) : {};
	} catch {
		return {};
	}
}

function saveConfigsToStorage(configs: Record<string, AgentConfig>): void {
	if (!browser) return;
	try {
		localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
	} catch (e) {
		console.error('Failed to save agent configs:', e);
	}
}

// =============================================================================
// STORE
// =============================================================================

function createAgentsStore() {
	// State
	let agents = $state<Agent[]>([]);
	let selectedAgentId = $state<string | null>(null);
	let configsByAgentId = $state<Record<string, AgentConfig>>({});
	let loading = $state(false);
	let error = $state<string | null>(null);
	let initialized = $state(false);

	// Derived
	const selectedAgent = $derived(
		agents.find(a => a.id === selectedAgentId) ?? null
	);

	const selectedAgentConfig = $derived(
		selectedAgentId ? configsByAgentId[selectedAgentId] ?? {} : {}
	);

	// Initialize from storage
	function initialize(): void {
		if (initialized || !browser) return;
		
		agents = loadAgentsFromStorage();
		selectedAgentId = loadSelectedAgentId();
		configsByAgentId = loadConfigsFromStorage();
		initialized = true;

		// If no agents loaded, add the default deepresearch agent
		if (agents.length === 0) {
			addDefaultAgents();
		}
	}

	// Add default agents
	function addDefaultAgents(): void {
		const defaultAgents: Agent[] = [
			{
				id: 'deepresearch',
				name: 'Deep Research',
				description: 'AI-powered deep research with parallel agents, strategic planning, and comprehensive reports',
				graphId: 'deepresearch',
				deploymentUrl: settingsStore.agentUrl,
			}
		];
		
		agents = defaultAgents;
		selectedAgentId = defaultAgents[0].id;
		saveAgentsToStorage(agents);
		saveSelectedAgentId(selectedAgentId);
	}

	// Fetch agents from LangGraph deployment
	async function fetchAgents(deploymentUrl?: string): Promise<void> {
		const url = deploymentUrl ?? settingsStore.agentUrl;
		loading = true;
		error = null;

		try {
			const client = new Client({ apiUrl: url });
			const assistants = await client.assistants.search({ limit: 100 });
			
			const fetchedAgents: Agent[] = assistants.map(a => ({
				id: a.assistant_id,
				name: a.name || a.assistant_id,
				description: (a.metadata as Record<string, string>)?.description,
				graphId: a.graph_id,
				deploymentUrl: url,
				metadata: a.metadata as Record<string, unknown>,
				config: a.config as Record<string, unknown>,
				createdAt: a.created_at,
				updatedAt: a.updated_at,
			}));

			// Merge with existing agents (keep agents from other deployments)
			const otherAgents = agents.filter(a => a.deploymentUrl !== url);
			agents = [...otherAgents, ...fetchedAgents];
			saveAgentsToStorage(agents);

			// Select first agent if none selected
			if (!selectedAgentId && agents.length > 0) {
				selectAgent(agents[0].id);
			}
		} catch (e) {
			error = (e as Error).message;
			console.error('[AgentsStore] Failed to fetch agents:', e);
		} finally {
			loading = false;
		}
	}

	// Select an agent
	function selectAgent(agentId: string): void {
		const agent = agents.find(a => a.id === agentId);
		if (agent) {
			selectedAgentId = agentId;
			saveSelectedAgentId(agentId);
		}
	}

	// Get config for an agent
	function getAgentConfig(agentId: string): AgentConfig {
		return configsByAgentId[agentId] ?? {};
	}

	// Update config for an agent
	function updateAgentConfig(agentId: string, config: Partial<AgentConfig>): void {
		configsByAgentId = {
			...configsByAgentId,
			[agentId]: {
				...configsByAgentId[agentId],
				...config,
			}
		};
		saveConfigsToStorage(configsByAgentId);
	}

	// Reset config for an agent
	function resetAgentConfig(agentId: string): void {
		const { [agentId]: _, ...rest } = configsByAgentId;
		configsByAgentId = rest;
		saveConfigsToStorage(configsByAgentId);
	}

	// Add a custom agent
	function addAgent(agent: Omit<Agent, 'id'>): Agent {
		const newAgent: Agent = {
			...agent,
			id: crypto.randomUUID(),
		};
		agents = [...agents, newAgent];
		saveAgentsToStorage(agents);
		return newAgent;
	}

	// Remove an agent
	function removeAgent(agentId: string): void {
		agents = agents.filter(a => a.id !== agentId);
		saveAgentsToStorage(agents);
		
		// Clear config
		const { [agentId]: _, ...rest } = configsByAgentId;
		configsByAgentId = rest;
		saveConfigsToStorage(configsByAgentId);
		
		// Select another agent if this was selected
		if (selectedAgentId === agentId) {
			selectedAgentId = agents[0]?.id ?? null;
			saveSelectedAgentId(selectedAgentId);
		}
	}

	// Reset store
	function reset(): void {
		agents = [];
		selectedAgentId = null;
		configsByAgentId = {};
		error = null;
		initialized = false;
		
		if (browser) {
			localStorage.removeItem(AGENTS_STORAGE_KEY);
			localStorage.removeItem(SELECTED_AGENT_KEY);
			localStorage.removeItem(CONFIG_STORAGE_KEY);
		}
	}

	// Auto-initialize in browser
	if (browser) {
		initialize();
	}

	return {
		// State getters
		get agents() { return agents; },
		get selectedAgentId() { return selectedAgentId; },
		get selectedAgent() { return selectedAgent; },
		get selectedAgentConfig() { return selectedAgentConfig; },
		get configsByAgentId() { return configsByAgentId; },
		get loading() { return loading; },
		get error() { return error; },
		get initialized() { return initialized; },
		
		// Methods
		initialize,
		fetchAgents,
		selectAgent,
		getAgentConfig,
		updateAgentConfig,
		resetAgentConfig,
		addAgent,
		removeAgent,
		reset,
	};
}

export const agentsStore = createAgentsStore();

