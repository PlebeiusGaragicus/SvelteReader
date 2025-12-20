<script lang="ts">
	import type { Message } from '@langchain/langgraph-sdk';

	interface Props {
		message: Message;
	}

	let { message }: Props = $props();

	const content = $derived(
		typeof message.content === 'string'
			? message.content
			: Array.isArray(message.content)
				? message.content
					.filter((c): c is { type: 'text'; text: string } => c.type === 'text')
					.map(c => c.text)
					.join('\n')
				: ''
	);

	const hasImages = $derived(
		Array.isArray(message.content) &&
		message.content.some(c => c.type === 'image_url')
	);

	const images = $derived(
		Array.isArray(message.content)
			? message.content
				.filter((c): c is { type: 'image_url'; image_url: { url: string } } => c.type === 'image_url')
				.map(c => c.image_url.url)
			: []
	);
</script>

<div class="flex justify-end">
	<div class="flex max-w-[85%] flex-col items-end gap-2">
		{#if hasImages}
			<div class="flex flex-wrap justify-end gap-2">
				{#each images as imageUrl}
					<img
						src={imageUrl}
						alt="Uploaded content"
						class="max-h-48 rounded-lg object-cover"
					/>
				{/each}
			</div>
		{/if}
		
		{#if content}
			<div class="rounded-2xl rounded-br-md bg-primary px-4 py-2 text-primary-foreground">
				<p class="whitespace-pre-wrap text-sm">{content}</p>
			</div>
		{/if}
	</div>
</div>
