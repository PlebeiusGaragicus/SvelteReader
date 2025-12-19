<script lang="ts">
	interface Props {
		content: string;
	}

	let { content }: Props = $props();

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

	function parseInlineMarkdown(text: string): string {
		return text
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

			// Headers
			if (line.startsWith('### ')) {
				result.push(`<h3 class="mt-4 mb-2 text-base font-semibold">${parseInlineMarkdown(escapeHtml(line.slice(4)))}</h3>`);
				continue;
			}
			if (line.startsWith('## ')) {
				result.push(`<h2 class="mt-4 mb-2 text-lg font-semibold">${parseInlineMarkdown(escapeHtml(line.slice(3)))}</h2>`);
				continue;
			}
			if (line.startsWith('# ')) {
				result.push(`<h1 class="mt-4 mb-2 text-xl font-bold">${parseInlineMarkdown(escapeHtml(line.slice(2)))}</h1>`);
				continue;
			}

			// Unordered list items
			if (line.match(/^[\-\*]\s/)) {
				result.push(`<li class="ml-4 list-disc">${parseInlineMarkdown(escapeHtml(line.slice(2)))}</li>`);
				continue;
			}

			// Ordered list items
			const orderedMatch = line.match(/^(\d+)\.\s(.+)/);
			if (orderedMatch) {
				result.push(`<li class="ml-4 list-decimal">${parseInlineMarkdown(escapeHtml(orderedMatch[2]))}</li>`);
				continue;
			}

			// Blockquote
			if (line.startsWith('> ')) {
				result.push(`<blockquote class="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground">${parseInlineMarkdown(escapeHtml(line.slice(2)))}</blockquote>`);
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
			result.push(`<p class="my-1">${parseInlineMarkdown(escapeHtml(line))}</p>`);
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

<div class="prose prose-sm max-w-none text-sm dark:prose-invert">
	{@html parsedContent()}
</div>
