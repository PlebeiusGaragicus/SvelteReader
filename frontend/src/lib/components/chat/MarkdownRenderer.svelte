<script lang="ts">
	import { epubService } from '$lib/services/epubService';

	interface Props {
		content: string;
		onCitationClick?: (chapterId: string, searchText: string) => void;
	}

	let { content, onCitationClick }: Props = $props();

	// Citation regex: [[chapter_id|"quoted text"]] or [[chapter_id|'quoted text']] or [[chapter_id|text]]
	const CITATION_REGEX = /\[\[([^\]|]+)\|"([^"]+)"\]\]|\[\[([^\]|]+)\|'([^']+)'\]\]|\[\[([^\]|]+)\|([^\]]+)\]\]/g;

	// Simple markdown parsing for common patterns
	// For production, consider using a library like marked or remark
	
	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Encode text for use in data attributes (base64 to avoid escaping issues)
	 */
	function encodeForDataAttr(text: string): string {
		return btoa(encodeURIComponent(text));
	}

	/**
	 * Decode text from data attribute
	 */
	function decodeFromDataAttr(encoded: string): string {
		try {
			return decodeURIComponent(atob(encoded));
		} catch {
			return encoded;
		}
	}

	/**
	 * Parse citations and replace with clickable elements.
	 * Must be called BEFORE escapeHtml to properly match the citation syntax.
	 */
	function parseCitations(text: string): string {
		return text.replace(CITATION_REGEX, (match, id1, quote1, id2, quote2, id3, quote3) => {
			const chapterId = id1 || id2 || id3;
			const quotedText = quote1 || quote2 || quote3;
			
			// Use base64 encoding for data attributes to avoid escaping issues
			const encodedChapter = encodeForDataAttr(chapterId.trim());
			const encodedText = encodeForDataAttr(quotedText.trim());
			
			// Truncate display text and escape for HTML display
			const displayText = quotedText.length > 60 ? quotedText.slice(0, 57) + '...' : quotedText;
			const safeDisplayText = displayText
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			
			return `<button class="citation-link inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-sm text-primary hover:bg-primary/20 transition-colors cursor-pointer border-0" data-citation-chapter="${encodedChapter}" data-citation-text="${encodedText}" type="button"><svg class="h-3 w-3 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg><span class="italic">"${safeDisplayText}"</span></button>`;
		});
	}

	function parseInlineMarkdown(text: string): string {
		// Parse citations FIRST on raw text, before any escaping
		let result = parseCitations(text);
		
		// Now escape everything except the citation buttons we just inserted
		// Split by citation buttons, escape the text parts, rejoin
		const parts = result.split(/(<button class="citation-link[^>]*>.*?<\/button>)/g);
		result = parts.map(part => {
			if (part.startsWith('<button class="citation-link')) {
				return part; // Keep citation buttons as-is
			}
			return escapeHtml(part);
		}).join('');
		
		return result
			// Bold: **text** or __text__
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/__(.+?)__/g, '<strong>$1</strong>')
			// Italic: *text* or _text_
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			.replace(/_(.+?)_/g, '<em>$1</em>')
			// Inline code: `code`
			.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">$1</code>')
			// Links: [text](url)
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline">$1</a>');
	}

	/**
	 * Handle clicks on citation buttons
	 */
	function handleClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const citationButton = target.closest('.citation-link') as HTMLElement | null;
		
		if (citationButton) {
			const encodedChapter = citationButton.dataset.citationChapter;
			const encodedText = citationButton.dataset.citationText;
			
			if (encodedChapter && encodedText) {
				event.preventDefault();
				event.stopPropagation();
				
				// Decode the base64 encoded data
				const chapterId = decodeFromDataAttr(encodedChapter);
				const searchText = decodeFromDataAttr(encodedText);
				
				console.log('[MarkdownRenderer] Citation clicked:', { chapterId, searchText: searchText.slice(0, 50) });
				
				if (onCitationClick) {
					onCitationClick(chapterId, searchText);
				} else {
					// Default behavior: use epubService directly
					epubService.navigateToPassage(chapterId, searchText).then(result => {
						if (result) {
							console.log('[MarkdownRenderer] Navigated to passage:', result);
						} else {
							console.warn('[MarkdownRenderer] Failed to navigate to passage');
						}
					});
				}
			}
		}
	}

	const parsedContent = $derived(() => {
		const lines = content.split('\n');
		const result: string[] = [];
		let inCodeBlock = false;
		let codeBlockContent: string[] = [];
		let codeBlockLang = '';

		for (const line of lines) {
			// Code block start/end
			if (line.startsWith('```')) {
				if (inCodeBlock) {
					// End code block
					result.push(
						`<pre class="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-4"><code class="text-sm text-zinc-100">${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`
					);
					codeBlockContent = [];
					inCodeBlock = false;
				} else {
					// Start code block
					codeBlockLang = line.slice(3).trim();
					inCodeBlock = true;
				}
				continue;
			}

			if (inCodeBlock) {
				codeBlockContent.push(line);
				continue;
			}

			// Headers (parseInlineMarkdown handles escaping internally now)
			if (line.startsWith('### ')) {
				result.push(`<h3 class="mt-4 mb-2 text-base font-semibold">${parseInlineMarkdown(line.slice(4))}</h3>`);
				continue;
			}
			if (line.startsWith('## ')) {
				result.push(`<h2 class="mt-4 mb-2 text-lg font-semibold">${parseInlineMarkdown(line.slice(3))}</h2>`);
				continue;
			}
			if (line.startsWith('# ')) {
				result.push(`<h1 class="mt-4 mb-2 text-xl font-bold">${parseInlineMarkdown(line.slice(2))}</h1>`);
				continue;
			}

			// Unordered list items
			if (line.match(/^[\-\*]\s/)) {
				result.push(`<li class="ml-4 list-disc">${parseInlineMarkdown(line.slice(2))}</li>`);
				continue;
			}

			// Ordered list items
			const orderedMatch = line.match(/^(\d+)\.\s(.+)/);
			if (orderedMatch) {
				result.push(`<li class="ml-4 list-decimal">${parseInlineMarkdown(orderedMatch[2])}</li>`);
				continue;
			}

			// Blockquote
			if (line.startsWith('> ')) {
				result.push(`<blockquote class="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground">${parseInlineMarkdown(line.slice(2))}</blockquote>`);
				continue;
			}

			// Horizontal rule
			if (line.match(/^[\-\*_]{3,}$/)) {
				result.push('<hr class="my-4 border-border" />');
				continue;
			}

			// Empty line
			if (line.trim() === '') {
				result.push('<br />');
				continue;
			}

			// Regular paragraph
			result.push(`<p class="my-1">${parseInlineMarkdown(line)}</p>`);
		}

		// Handle unclosed code block
		if (inCodeBlock && codeBlockContent.length > 0) {
			result.push(
				`<pre class="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-4"><code class="text-sm text-zinc-100">${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`
			);
		}

		return result.join('');
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div 
	class="prose prose-sm max-w-none text-sm dark:prose-invert"
	onclick={handleClick}
	role="presentation"
>
	{@html parsedContent()}
</div>
