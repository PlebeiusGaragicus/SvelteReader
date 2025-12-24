/**
 * Agent Tools Service - Client-Side Tool Execution
 * 
 * This service executes tools requested by the LangGraph agent locally in the browser.
 * The agent calls tools via LangGraph's interrupt mechanism, and this service
 * handles the actual execution using EPUB data and vector search.
 * 
 * Tools:
 * - get_chapter: Returns full chapter text
 * - search_book: Semantic search across the book
 */

import { epubService } from './epubService';
import { vectorService } from './vectorService';
import { indexingStore } from '$lib/stores/indexing.svelte';
import type { ToolCall, ToolResult } from './langgraph';

// Maximum characters for chapter content to prevent token overflow
const MAX_CHAPTER_CHARS = 50000;

/**
 * Execute a tool call locally and return the result.
 * 
 * @param toolCall - The tool call from the agent
 * @param bookId - The current book's ID (SHA-256)
 * @returns Tool result with the output or error
 */
export async function executeToolCall(
	toolCall: ToolCall,
	bookId: string
): Promise<ToolResult> {
	console.log(`[AgentTools] ========================================`);
	console.log(`[AgentTools] Executing tool: ${toolCall.name}`);
	console.log(`[AgentTools] Tool ID: ${toolCall.id}`);
	console.log(`[AgentTools] Book ID: ${bookId}`);
	console.log(`[AgentTools] Args:`, JSON.stringify(toolCall.args, null, 2));
	console.log(`[AgentTools] ========================================`);
	
	try {
		let result: ToolResult;
		
		switch (toolCall.name) {
			case 'get_chapter':
				result = await executeGetChapter(toolCall.id, toolCall.args);
				break;
			
			case 'search_book':
				result = await executeSearchBook(toolCall.id, toolCall.args, bookId);
				break;
			
			case 'get_current_page':
				result = await executeGetCurrentPage(toolCall.id);
				break;
			
			default:
				console.warn(`[AgentTools] Unknown tool: ${toolCall.name}`);
				result = {
					id: toolCall.id,
					result: null,
					error: `Unknown tool: ${toolCall.name}`
				};
		}
		
		logToolResult(toolCall.name, result);
		return result;
	} catch (error) {
		console.error(`[AgentTools] ========================================`);
		console.error(`[AgentTools] ERROR executing ${toolCall.name}:`, error);
		console.error(`[AgentTools] ========================================`);
		return {
			id: toolCall.id,
			result: null,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

// Helper to log tool results
function logToolResult(toolName: string, result: ToolResult): void {
	console.log(`[AgentTools] ========================================`);
	console.log(`[AgentTools] Tool ${toolName} completed`);
	console.log(`[AgentTools] Result ID: ${result.id}`);
	if (result.error) {
		console.log(`[AgentTools] Error: ${result.error}`);
	} else {
		const resultStr = typeof result.result === 'string' 
			? result.result 
			: JSON.stringify(result.result);
		console.log(`[AgentTools] Result preview: ${resultStr.slice(0, 300)}${resultStr.length > 300 ? '...' : ''}`);
	}
	console.log(`[AgentTools] ========================================`);
}

/**
 * Get information about what the user is currently reading.
 */
async function executeGetCurrentPage(toolCallId: string): Promise<ToolResult> {
	try {
		const pageInfo = await epubService.getCurrentPageInfo();
		
		if (!pageInfo) {
			return {
				id: toolCallId,
				result: null,
				error: 'Could not determine current reading position. The book may not be fully loaded.',
			};
		}
		
		const lines: string[] = [];
		
		if (pageInfo.chapterTitle) {
			lines.push(`Current Chapter: "${pageInfo.chapterTitle}"`);
			if (pageInfo.chapterId) {
				lines.push(`Chapter ID: ${pageInfo.chapterId}`);
			}
		}
		
		lines.push(`Reading Progress: ${pageInfo.percentage}% through the book`);
		
		if (pageInfo.visibleText) {
			lines.push('');
			lines.push('--- Text visible on current page ---');
			lines.push(pageInfo.visibleText);
			lines.push('--- End of visible text ---');
		}
		
		return {
			id: toolCallId,
			result: lines.join('\n'),
		};
	} catch (error) {
		console.error('[AgentTools] Error in executeGetCurrentPage:', error);
		return {
			id: toolCallId,
			result: null,
			error: error instanceof Error ? error.message : 'Failed to get current page',
		};
	}
}

/**
 * Get the full text of a chapter.
 */
async function executeGetChapter(
	toolCallId: string,
	args: Record<string, unknown>
): Promise<ToolResult> {
	const chapterId = args.chapter_id as string;
	
	console.log('[AgentTools] executeGetChapter called with:', { chapterId, args });
	
	if (!chapterId) {
		return {
			id: toolCallId,
			result: null,
			error: 'chapter_id argument is required. Use get_table_of_contents() first to find valid chapter IDs.',
		};
	}
	
	try {
		console.log('[AgentTools] Calling epubService.getChapterText...');
		let text = await epubService.getChapterText(chapterId);
		console.log('[AgentTools] Got chapter text, length:', text.length);
		
		// Truncate if too long
		let truncated = false;
		if (text.length > MAX_CHAPTER_CHARS) {
			text = text.slice(0, MAX_CHAPTER_CHARS);
			truncated = true;
		}
		
		const result = truncated
			? `${text}\n\n[Content truncated at ${MAX_CHAPTER_CHARS} characters. Use search_book() to find specific content, or get_chapter() with a more specific chapter ID.]`
			: text;
		
		return {
			id: toolCallId,
			result,
		};
	} catch (error) {
		console.error('[AgentTools] Error in executeGetChapter:', error);
		return {
			id: toolCallId,
			result: null,
			error: error instanceof Error ? error.message : 'Failed to load chapter',
		};
	}
}

/**
 * Wait for indexing to complete if it's in progress.
 * Returns true if indexing completed successfully, false otherwise.
 */
async function waitForIndexing(timeoutMs: number = 30000): Promise<boolean> {
	const startTime = Date.now();
	
	while (indexingStore.isIndexing) {
		if (Date.now() - startTime > timeoutMs) {
			console.warn('[AgentTools] Timed out waiting for indexing');
			return false;
		}
		// Wait a bit before checking again
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	
	return indexingStore.isReady;
}

/**
 * Semantic search across the book with multiple queries for better coverage.
 */
async function executeSearchBook(
	toolCallId: string,
	args: Record<string, unknown>,
	bookId: string
): Promise<ToolResult> {
	// Support both new multi-query format and legacy single query
	let queries: string[] = [];
	if (Array.isArray(args.queries)) {
		queries = args.queries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
	} else if (typeof args.query === 'string' && args.query.trim()) {
		// Legacy single query support
		queries = [args.query.trim()];
	}
	
	const topK = Math.min((args.top_k as number) || 5, 10);
	
	if (queries.length === 0) {
		return {
			id: toolCallId,
			result: null,
			error: 'queries argument is required for search_book. Provide 2-4 search queries like ["main themes", "author\'s argument", "key concepts"].',
		};
	}
	
	console.log('[AgentTools] Executing search with queries:', queries);
	
	try {
		// Check if book is indexed
		let isIndexed = vectorService.isBookIndexed(bookId);
		
		// If not indexed but indexing is in progress, wait for it
		if (!isIndexed && indexingStore.isIndexing && indexingStore.bookId === bookId) {
			console.log('[AgentTools] Indexing in progress, waiting...');
			const completed = await waitForIndexing();
			if (completed) {
				isIndexed = true;
				console.log('[AgentTools] Indexing completed, proceeding with search');
			}
		}
		
		if (!isIndexed) {
			// Check one more time in case it finished
			isIndexed = vectorService.isBookIndexed(bookId);
		}
		
		if (!isIndexed) {
			// Still not indexed - indexing may have failed or not started
			console.log('[AgentTools] Book not indexed and no indexing in progress');
			return {
				id: toolCallId,
				result: null,
				error: 'The book has not been indexed for search yet. The book is being indexed in the background - please try search_book() again in a moment, or use get_chapter() to read specific chapters directly.',
			};
		}
		
		// Execute all queries and collect results
		const allResults: Array<{ 
			query: string; 
			chapter: string; 
			chapterId: string;
			text: string; 
			score: number;
			startOffset?: number;
			endOffset?: number;
		}> = [];
		
		for (const query of queries) {
			const results = await vectorService.search(query, bookId, topK);
			results.forEach(r => {
				allResults.push({ 
					query, 
					chapter: r.chapter, 
					chapterId: r.chapterId,
					text: r.text, 
					score: r.score,
					startOffset: r.startOffset,
					endOffset: r.endOffset,
				});
			});
		}
		
		if (allResults.length === 0) {
			return {
				id: toolCallId,
				result: `No passages found for any of the search queries: ${queries.map(q => `"${q}"`).join(', ')}. Try different keywords or use get_chapter() to read specific chapters directly.`,
			};
		}
		
		// Deduplicate by text content (keep highest scoring)
		const seen = new Map<string, typeof allResults[0]>();
		for (const r of allResults) {
			const key = r.text.slice(0, 200); // Use first 200 chars as key
			const existing = seen.get(key);
			if (!existing || r.score > existing.score) {
				seen.set(key, r);
			}
		}
		
		// Sort by score descending and take top results
		const dedupedResults = Array.from(seen.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, Math.min(15, topK * queries.length));
		
		// Format results for the agent with citation metadata
		// Include chapter ID and text excerpt for clickable citations
		const formatted = dedupedResults.map((r, i) => {
			// Include position info for precise navigation
			const positionInfo = r.startOffset !== undefined 
				? `, Position: chars ${r.startOffset}-${r.endOffset}` 
				: '';
			return `[Result ${i + 1}] (Chapter: "${r.chapter}" [${r.chapterId}]${positionInfo}, Score: ${r.score.toFixed(2)})\n${r.text}`;
		}).join('\n\n---\n\n');
		
		return {
			id: toolCallId,
			result: `Search results for ${queries.length} queries (${queries.map(q => `"${q}"`).join(', ')}):\n\n${formatted}`,
		};
	} catch (error) {
		console.error('[AgentTools] Search failed:', error);
		return {
			id: toolCallId,
			result: null,
			error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Try using get_chapter() to read chapters directly.`,
		};
	}
}

/**
 * Index a book on-demand if not already indexed.
 * Returns true if indexing succeeded or book was already indexed.
 */
async function indexBookOnDemand(bookId: string): Promise<boolean> {
	try {
		// Get all chapters from the current book
		const chapters = await epubService.getAllChaptersText();
		
		if (chapters.length === 0) {
			console.warn('[AgentTools] No chapters to index');
			return false;
		}
		
		console.log(`[AgentTools] Indexing ${chapters.length} chapters...`);
		
		await vectorService.indexBook(bookId, chapters, (progress) => {
			console.log(`[AgentTools] Indexing progress: ${(progress * 100).toFixed(0)}%`);
		});
		
		console.log('[AgentTools] Book indexed successfully');
		return true;
	} catch (error) {
		console.error('[AgentTools] Failed to index book:', error);
		return false;
	}
}

/**
 * Pre-index a book (called when opening a book or starting chat).
 * First checks memory and persistent storage before re-indexing.
 * This runs in the background to prepare for search.
 */
export async function ensureBookIndexed(
	bookId: string,
	onProgress?: (progress: number) => void
): Promise<boolean> {
	// Check memory first
	if (vectorService.isBookIndexed(bookId)) {
		console.log('[AgentTools] Book already indexed in memory');
		return true;
	}
	
	// Try to load from persistent storage
	const loadedFromStorage = await vectorService.loadIndexFromStorage(bookId);
	if (loadedFromStorage) {
		console.log('[AgentTools] Loaded index from persistent storage');
		return true;
	}
	
	// Need to index from scratch
	try {
		console.log('[AgentTools] No persisted index found, extracting chapters...');
		const chapters = await epubService.getAllChaptersText();
		
		if (chapters.length === 0) {
			console.warn('[AgentTools] No chapters to index');
			return false;
		}
		
		await vectorService.indexBook(bookId, chapters, onProgress);
		return true;
	} catch (error) {
		console.error('[AgentTools] Failed to index book:', error);
		return false;
	}
}

