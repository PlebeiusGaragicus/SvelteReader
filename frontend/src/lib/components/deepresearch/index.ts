// Deep Research Components
// Renamed from webscrape to deepresearch

// New Deep Research components
export { default as ResearchProgress } from './ResearchProgress.svelte';
export { default as TaskTracker } from './TaskTracker.svelte';
export { default as ClarificationInput } from './ClarificationInput.svelte';

// Core components with new names
export { default as DeepResearchInput } from './WebSearchInput.svelte';
export { default as DeepResearchChat } from './WebSearchChat.svelte';
export { default as ResearchInputBar } from './ResearchInputBar.svelte';

// Shared components
export { default as DiscoveryCard } from './DiscoveryCard.svelte';
export { default as DiscoveryFeed } from './DiscoveryFeed.svelte';
export { default as SourceCitations } from './SourceCitations.svelte';
export { default as ChatSidebar } from './ChatSidebar.svelte';
export { default as RelatedQuestions } from './RelatedQuestions.svelte';

// Agent and configuration components
export { default as AgentSelector } from './AgentSelector.svelte';
export { default as ConfigurationSidebar } from './ConfigurationSidebar.svelte';
export { default as ToolCallDisplay } from './ToolCallDisplay.svelte';

// Sources sidebar components
export { default as SourcesSidebar, type CitedSource } from './SourcesSidebar.svelte';
export { default as SourceModal } from './SourceModal.svelte';

// Legacy aliases for backward compatibility
export { default as WebSearchInput } from './WebSearchInput.svelte';
export { default as WebSearchChat } from './WebSearchChat.svelte';
