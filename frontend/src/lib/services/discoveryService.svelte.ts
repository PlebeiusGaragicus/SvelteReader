/**
 * Discovery Service - Handles fetching discovery/news content
 * 
 * Fetches from the FastAPI backend which proxies to SearXNG.
 */

import { settingsStore } from '$lib/stores/settings.svelte';

export interface DiscoveryItem {
	id: string;
	title: string;
	content: string;
	url: string;
	thumbnail: string;
	topic: string;
	publishedAt?: Date;
}

export type DiscoveryTopic = 'tech' | 'finance' | 'art' | 'sports' | 'entertainment';

export interface TopicInfo {
	key: DiscoveryTopic;
	display: string;
}

export const TOPICS: TopicInfo[] = [
	{ key: 'tech', display: 'Tech & Science' },
	{ key: 'finance', display: 'Finance' },
	{ key: 'art', display: 'Art & Culture' },
	{ key: 'sports', display: 'Sports' },
	{ key: 'entertainment', display: 'Entertainment' }
];


export interface FetchDiscoveryOptions {
	topic?: DiscoveryTopic;
	page?: number;
	limit?: number;
}

export interface FetchDiscoveryResult {
	items: DiscoveryItem[];
	hasMore: boolean;
	page: number;
}

/**
 * Fetch discovery items from backend API
 */
export async function fetchDiscoveryItems(
	options: FetchDiscoveryOptions = {}
): Promise<FetchDiscoveryResult> {
	const { topic = 'tech', page = 1, limit = 6 } = options;
	const backendUrl = settingsStore.backendUrl;
	
	const params = new URLSearchParams({
		topic,
		page: String(page),
		limit: String(limit)
	});
	
	const response = await fetch(`${backendUrl}/api/discover?${params}`);
	
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Backend error (${response.status}): ${errorText}`);
	}
	
	const data = await response.json();
	
	return {
		items: data.items.map((item: any) => ({
			...item,
			publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined
		})),
		hasMore: data.hasMore,
		page: data.page
	};
}

/**
 * Create a discovery store for managing infinite scroll state
 */
export function createDiscoveryStore() {
	let items = $state<DiscoveryItem[]>([]);
	let loading = $state(false);
	let hasMore = $state(true);
	let currentPage = $state(0);
	let activeTopic = $state<DiscoveryTopic | undefined>(undefined);
	let error = $state<string | null>(null);

	async function loadMore() {
		if (loading || !hasMore) return;
		
		loading = true;
		error = null;
		
		try {
			const result = await fetchDiscoveryItems({
				topic: activeTopic,
				page: currentPage + 1,
				limit: 6
			});
			
			items = [...items, ...result.items];
			hasMore = result.hasMore;
			currentPage = result.page;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load items';
			console.error('Failed to fetch discovery items:', e);
		} finally {
			loading = false;
		}
	}

	function setTopic(topic: DiscoveryTopic | undefined) {
		if (topic === activeTopic) return;
		
		activeTopic = topic;
		items = [];
		currentPage = 0;
		hasMore = true;
		loadMore();
	}

	function reset() {
		items = [];
		currentPage = 0;
		hasMore = true;
		error = null;
		loadMore();
	}

	return {
		get items() { return items; },
		get loading() { return loading; },
		get hasMore() { return hasMore; },
		get activeTopic() { return activeTopic; },
		get error() { return error; },
		loadMore,
		setTopic,
		reset
	};
}

