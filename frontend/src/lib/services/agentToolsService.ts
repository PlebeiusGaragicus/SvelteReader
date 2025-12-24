/**
 * Agent Tools Service - Client-Side Tool Execution
 * 
 * This service executes tools requested by the LangGraph agent locally in the browser.
 * The agent calls tools via LangGraph's interrupt mechanism, and this service
 * handles the actual execution using EPUB data and vector search.
 * 
 * Tools:
 * - get_table_of_contents: Returns book structure
 * - get_book_metadata: Returns title, author, page count
 * - get_chapter: Returns full chapter text
 * - search_book: Semantic search across the book
 */

import { epubService } from './epubService';
import { vectorService } from './vectorService';
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
			case 'get_table_of_contents':
				result = await executeGetTableOfContents(toolCall.id);
				break;
			
			case 'get_book_metadata':
				result = executeGetBookMetadata(toolCall.id);
				break;
			
			case 'get_chapter':
				result = await executeGetChapter(toolCall.id, toolCall.args);
				break;
			
			case 'search_book':
				result = await executeSearchBook(toolCall.id, toolCall.args, bookId);
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
 * Get the table of contents formatted for the agent.
 */
async function executeGetTableOfContents(toolCallId: string): Promise<ToolResult> {
	const toc = await epubService.getTableOfContentsForAgent();
	
	if (!toc || toc.length === 0) {
		return {
			id: toolCallId,
			result: 'No table of contents available for this book.',
		};
	}
	
	// Format as readable text for the agent
	const formatted = toc.map(item => {
		const indent = '  '.repeat(item.level);
		return `${indent}- ${item.title} (id: ${item.id})`;
	}).join('\n');
	
	return {
		id: toolCallId,
		result: `Table of Contents:\n\n${formatted}\n\nUse get_chapter(chapter_id) with one of the IDs above to retrieve chapter content.`,
	};
}

/**
 * Get book metadata.
 */
function executeGetBookMetadata(toolCallId: string): ToolResult {
	const metadata = epubService.getMetadata();
	
	if (!metadata) {
		return {
			id: toolCallId,
			result: null,
			error: 'No book is currently loaded.',
		};
	}
	
	return {
		id: toolCallId,
		result: `Book Metadata:
- Title: ${metadata.title}
- Author: ${metadata.author}
- Total Pages: ~${metadata.totalPages}`,
	};
}

/**
 * Get the full text of a chapter.
 */
async function executeGetChapter(
	toolCallId: string,
	args: Record<string, unknown>
): Promise<ToolResult> {
	const chapterId = args.chapter_id as string;
	
	if (!chapterId) {
		return {
			id: toolCallId,
			result: null,
			error: 'chapter_id argument is required. Use get_table_of_contents() first to find valid chapter IDs.',
		};
	}
	
	try {
		let text = await epubService.getChapterText(chapterId);
		
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
		return {
			id: toolCallId,
			result: null,
			error: error instanceof Error ? error.message : 'Failed to load chapter',
		};
	}
}

/**
 * Semantic search across the book.
 */
async function executeSearchBook(
	toolCallId: string,
	args: Record<string, unknown>,
	bookId: string
): Promise<ToolResult> {
	const query = args.query as string;
	const topK = Math.min((args.top_k as number) || 5, 20);
	
	if (!query) {
		return {
			id: toolCallId,
			result: null,
			error: 'query argument is required for search_book.',
		};
	}
	
	try {
		// Check if book is indexed
		const isIndexed = vectorService.isBookIndexed(bookId);
		
		if (!isIndexed) {
			// Try to index the book on-demand
			console.log('[AgentTools] Book not indexed, attempting to index...');
			const indexed = await indexBookOnDemand(bookId);
			
			if (!indexed) {
				return {
					id: toolCallId,
					result: 'The book has not been indexed for search yet. Please wait while indexing completes, or try again later.',
				};
			}
		}
		
		const results = await vectorService.search(query, bookId, topK);
		
		if (results.length === 0) {
			return {
				id: toolCallId,
				result: `No results found for "${query}". Try a different search query.`,
			};
		}
		
		// Format results for the agent
		const formatted = results.map((r, i) => 
			`[Result ${i + 1}] (Chapter: ${r.chapter}, Score: ${r.score.toFixed(2)})\n${r.text}`
		).join('\n\n---\n\n');
		
		return {
			id: toolCallId,
			result: `Search results for "${query}":\n\n${formatted}`,
		};
	} catch (error) {
		console.error('[AgentTools] Search failed:', error);
		return {
			id: toolCallId,
			result: null,
			error: error instanceof Error ? error.message : 'Search failed',
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
 * This runs in the background to prepare for search.
 */
export async function ensureBookIndexed(
	bookId: string,
	onProgress?: (progress: number) => void
): Promise<boolean> {
	if (vectorService.isBookIndexed(bookId)) {
		console.log('[AgentTools] Book already indexed');
		return true;
	}
	
	try {
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

