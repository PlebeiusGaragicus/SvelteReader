/**
 * Discovery Service - Handles fetching discovery/news content
 * 
 * This is a placeholder implementation with mock data.
 * Will be integrated with a real backend API later.
 */

export interface DiscoveryItem {
	id: string;
	title: string;
	content: string;
	url: string;
	thumbnail: string;
	topic: string;
	publishedAt: Date;
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

// Mock data for development
const MOCK_ITEMS: DiscoveryItem[] = [
	{
		id: '1',
		title: 'Bitcoin Reaches New All-Time High as Institutional Adoption Accelerates',
		content: 'Major financial institutions continue to embrace Bitcoin as a treasury reserve asset, driving unprecedented price action and mainstream adoption.',
		url: 'https://example.com/bitcoin-ath',
		thumbnail: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&q=80',
		topic: 'finance',
		publishedAt: new Date('2026-01-04T10:00:00')
	},
	{
		id: '2',
		title: 'Revolutionary AI Model Achieves Human-Level Reasoning',
		content: 'Researchers announce breakthrough in artificial general intelligence with a new model capable of complex multi-step reasoning across diverse domains.',
		url: 'https://example.com/ai-breakthrough',
		thumbnail: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80',
		topic: 'tech',
		publishedAt: new Date('2026-01-04T09:00:00')
	},
	{
		id: '3',
		title: 'Decentralized Social Networks See Explosive Growth',
		content: 'Nostr and other decentralized protocols are experiencing rapid user adoption as concerns over censorship and data privacy grow.',
		url: 'https://example.com/decentralized-social',
		thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80',
		topic: 'tech',
		publishedAt: new Date('2026-01-04T08:30:00')
	},
	{
		id: '4',
		title: 'Lightning Network Capacity Surpasses 10,000 BTC',
		content: 'The Bitcoin Lightning Network reaches a major milestone with over 10,000 BTC in channel capacity, enabling instant micropayments globally.',
		url: 'https://example.com/lightning-milestone',
		thumbnail: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&q=80',
		topic: 'finance',
		publishedAt: new Date('2026-01-04T07:45:00')
	},
	{
		id: '5',
		title: 'Open Source AI Models Challenge Proprietary Giants',
		content: 'Community-driven open source AI models are now matching or exceeding the capabilities of closed-source alternatives from major tech companies.',
		url: 'https://example.com/open-source-ai',
		thumbnail: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&q=80',
		topic: 'tech',
		publishedAt: new Date('2026-01-03T18:00:00')
	},
	{
		id: '6',
		title: 'Digital Art Renaissance: NFTs Find New Purpose',
		content: 'Beyond speculation, NFTs are enabling new forms of digital art ownership and artist compensation in the creative economy.',
		url: 'https://example.com/nft-art',
		thumbnail: 'https://images.unsplash.com/photo-1634973357973-f2ed2657db3c?w=800&q=80',
		topic: 'art',
		publishedAt: new Date('2026-01-03T16:00:00')
	},
	{
		id: '7',
		title: 'Privacy-Preserving Technology Gains Mainstream Adoption',
		content: 'Zero-knowledge proofs and homomorphic encryption are being integrated into consumer applications, protecting user data while enabling functionality.',
		url: 'https://example.com/privacy-tech',
		thumbnail: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&q=80',
		topic: 'tech',
		publishedAt: new Date('2026-01-03T14:00:00')
	},
	{
		id: '8',
		title: 'Esports Viewership Surpasses Traditional Sports',
		content: 'Global esports viewership numbers have overtaken traditional sports leagues for the first time, marking a generational shift in entertainment.',
		url: 'https://example.com/esports-milestone',
		thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80',
		topic: 'sports',
		publishedAt: new Date('2026-01-03T12:00:00')
	},
	{
		id: '9',
		title: 'Streaming Wars Heat Up with New Entrants',
		content: 'The entertainment streaming landscape continues to evolve as new players enter the market with innovative content strategies.',
		url: 'https://example.com/streaming-wars',
		thumbnail: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&q=80',
		topic: 'entertainment',
		publishedAt: new Date('2026-01-03T10:00:00')
	},
	{
		id: '10',
		title: 'Central Banks Explore Bitcoin Reserves',
		content: 'Several central banks are now publicly considering Bitcoin as part of their reserve strategy, following the example of smaller nations.',
		url: 'https://example.com/central-bank-btc',
		thumbnail: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&q=80',
		topic: 'finance',
		publishedAt: new Date('2026-01-02T20:00:00')
	},
	{
		id: '11',
		title: 'Virtual Reality Art Galleries Democratize Access',
		content: 'Museums and galleries worldwide are creating immersive VR experiences, making art accessible to anyone with a headset.',
		url: 'https://example.com/vr-art',
		thumbnail: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
		topic: 'art',
		publishedAt: new Date('2026-01-02T18:00:00')
	},
	{
		id: '12',
		title: 'Autonomous Vehicles Transform Urban Sports',
		content: 'Self-driving car technology is enabling new forms of urban mobility sports and changing how athletes train in cities.',
		url: 'https://example.com/av-sports',
		thumbnail: 'https://images.unsplash.com/photo-1558618047-f4b511ca0f1e?w=800&q=80',
		topic: 'sports',
		publishedAt: new Date('2026-01-02T16:00:00')
	}
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
 * Fetch discovery items with optional filtering and pagination
 * Currently returns mock data; will integrate with backend API
 */
export async function fetchDiscoveryItems(
	options: FetchDiscoveryOptions = {}
): Promise<FetchDiscoveryResult> {
	const { topic, page = 1, limit = 6 } = options;
	
	// Simulate network delay
	await new Promise(resolve => setTimeout(resolve, 500));
	
	// Filter by topic if specified
	let filtered = topic 
		? MOCK_ITEMS.filter(item => item.topic === topic)
		: MOCK_ITEMS;
	
	// Paginate
	const startIndex = (page - 1) * limit;
	const endIndex = startIndex + limit;
	const items = filtered.slice(startIndex, endIndex);
	
	return {
		items,
		hasMore: endIndex < filtered.length,
		page
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

