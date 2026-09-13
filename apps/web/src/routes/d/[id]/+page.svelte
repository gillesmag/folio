<script lang="ts">
	import { enhance } from '$app/forms';
	import { mode } from 'mode-watcher';
	import { commentMode } from '$lib/comment-mode.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Dialog from '$lib/components/ui/dialog';
	// Bundled with hashed URL and fonts, so math never depends on a third-party CDN.
	import katexCss from 'katex/dist/katex.min.css?url';

	let { data, form } = $props();
	const doc = $derived(data.document);
	const isOwner = $derived(data.user?.id === doc.ownerId);
	const canComment = $derived(data.user !== null);
	let anchor = $state<string | null>(null);
	let article = $state<HTMLElement | null>(null);
	let activeHeading = $state<string | null>(null);
	let commentsSection = $state<HTMLElement | null>(null);
	// The diagram shown enlarged (its markup and width/height ratio), or null while the viewer is closed.
	let enlarged = $state<{ html: string; ratio: number } | null>(null);

	// Every document opens with comments hidden, including when moving from one document to another.
	$effect(() => {
		void doc.id;
		commentMode.open = false;
		return () => {
			commentMode.open = false;
		};
	});
	// Leaving comment mode drops the block selection so nothing stays highlighted.
	$effect(() => {
		if (!commentMode.open) anchor = null;
	});
	// Below the lg breakpoint the comments sit under the article, so bring them into view when switched on.
	$effect(() => {
		if (commentsSection && !window.matchMedia('(min-width: 64rem)').matches) {
			commentsSection.scrollIntoView({ block: 'start', behavior: 'smooth' });
		}
	});

	// The document usually opens with the same h1 as its title; do not print it twice.
	const first = $derived(doc.meta.toc[0]);
	const showTitle = $derived(!(first && first.depth === 1 && first.text === doc.title));
	const tocEntries = $derived(showTitle ? doc.meta.toc : doc.meta.toc.slice(1));
	const updated = $derived(
		new Date(String(doc.updatedAt)).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		})
	);

	// Clicking a block targets the comment form at it. Plain event delegation, no per-block handlers.
	const onArticleClick = (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		const selecting = commentMode.open && canComment;
		// A rendered diagram opens enlarged: always from its corner button, and on a
		// plain click unless that click is selecting the block for a comment.
		const diagram = target.closest<HTMLElement>('pre.mermaid');
		if (diagram && (target.closest('.mermaid-expand') || !selecting)) {
			const svg = diagram.querySelector('svg');
			if (svg) {
				const box = svg.viewBox.baseVal;
				const rect = svg.getBoundingClientRect();
				const ratio = box.width && box.height ? box.width / box.height : rect.width / rect.height;
				enlarged = { html: svg.outerHTML, ratio };
			}
			return;
		}
		if (!selecting) return;
		if (target.closest('a, input, button, summary')) return;
		const block = target.closest<HTMLElement>('[data-block-id]');
		if (!block) return;
		anchor = anchor === block.dataset.blockId ? null : (block.dataset.blockId ?? null);
	};

	const commentsByBlock = $derived(
		data.comments.reduce<Record<string, number>>((acc, c) => {
			if (c.blockId && !c.resolved) acc[c.blockId] = (acc[c.blockId] ?? 0) + 1;
			return acc;
		}, {})
	);

	// Selected block highlight and per-block open-comment counts live on the DOM,
	// since the HTML itself comes from the server as one string. Both only show in comment mode.
	$effect(() => {
		if (!article) return;
		for (const el of article.querySelectorAll<HTMLElement>('[data-block-id]')) {
			const id = el.dataset.blockId ?? '';
			el.classList.toggle('selected', id === anchor);
			const n = commentMode.open ? commentsByBlock[id] : undefined;
			if (n) el.dataset.comments = String(n);
			else delete el.dataset.comments;
		}
	});

	// Track which section is on screen for the table of contents.
	$effect(() => {
		if (!article || tocEntries.length < 2) return;
		const headings = tocEntries
			.map((t) => document.getElementById(t.id))
			.filter((el): el is HTMLElement => el !== null);
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target.id);
				if (visible.length) activeHeading = visible[0] ?? null;
			},
			{ rootMargin: '-10% 0px -75% 0px', threshold: 0 }
		);
		for (const h of headings) observer.observe(h);
		return () => observer.disconnect();
	});

	// Mermaid is only fetched for documents that contain a diagram. Each block is
	// rendered on its own, so one that fails to parse cannot poison the next, and
	// a failed block shows its source instead of vanishing. The diagram theme
	// follows the colour mode, so a mode change renders every diagram again from
	// the source kept on the node.
	// Added to every rendered diagram; the article's click handler opens the viewer from it.
	const expandButton =
		'<button type="button" class="mermaid-expand" aria-label="Enlarge diagram" title="Enlarge">' +
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg></button>';
	let mermaidRun = 0;
	$effect(() => {
		if (!doc.meta.hasMermaid || !article) return;
		const theme = mode.current === 'dark' ? 'dark' : 'neutral';
		const run = ++mermaidRun;
		const nodes = article.querySelectorAll<HTMLElement>('pre.mermaid');
		import('mermaid').then(async ({ default: mermaid }) => {
			if (run !== mermaidRun) return;
			// SVG text labels only: no HTML (and so no images or anchors) can appear inside a node.
			mermaid.initialize({
				startOnLoad: false,
				theme,
				securityLevel: 'strict',
				flowchart: { htmlLabels: false },
				class: { htmlLabels: false },
				// Quoted labels still go through Mermaid's HTML path; forbid anything that loads or navigates.
				dompurifyConfig: {
					FORBID_TAGS: [
						'img',
						'a',
						'video',
						'audio',
						'iframe',
						'object',
						'embed',
						'form',
						'input',
						'style',
						'svg',
						'math'
					],
					ALLOW_DATA_ATTR: false
				}
			});
			let i = 0;
			for (const node of nodes) {
				if (run !== mermaidRun) return;
				const source = (node.dataset.source ??= node.textContent ?? '');
				try {
					const { svg } = await mermaid.render(`folio-mermaid-${run}-${i++}`, source, node);
					node.innerHTML = svg + expandButton;
					node.classList.remove('mermaid-failed');
					node.removeAttribute('title');
				} catch {
					node.textContent = source;
					node.classList.add('mermaid-failed');
					node.setAttribute('title', 'This diagram could not be rendered');
				}
			}
		});
	});

	const jumpTo = (blockId: string) => {
		anchor = blockId;
		article
			?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	};
</script>

<svelte:head>
	<title>{doc.title} · Folio</title>
	{#if doc.meta.hasMath}
		<link rel="stylesheet" href={katexCss} />
	{/if}
</svelte:head>

{#snippet toc()}
	{#if tocEntries.length > 1}
		<ul class="space-y-1 text-[0.8125rem] leading-snug">
			{#each tocEntries as h (h.id)}
				<li style="padding-left: {(h.depth - (showTitle ? 1 : 2)) * 0.75}rem">
					<a
						href="#{h.id}"
						class="text-muted-foreground hover:text-foreground line-clamp-2 block py-0.5 transition-colors"
						class:text-foreground={activeHeading === h.id}
						class:font-medium={activeHeading === h.id}
					>
						{h.text}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div
	class="mx-auto grid max-w-[88rem] gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[13rem_minmax(0,1fr)_18rem]"
>
	<!-- Contents: a left rail on wide screens, a disclosure above the text elsewhere. -->
	{#if tocEntries.length > 1}
		<nav class="hidden xl:block">
			<div class="sticky top-6">
				<div
					class="text-muted-foreground mb-2 text-[0.6875rem] font-semibold tracking-wider uppercase"
				>
					Contents
				</div>
				{@render toc()}
			</div>
		</nav>
		<details class="text-sm lg:hidden">
			<summary class="text-muted-foreground cursor-pointer select-none">Contents</summary>
			<div class="mt-2 border-l pl-3">{@render toc()}</div>
		</details>
	{:else}
		<div class="hidden xl:block"></div>
	{/if}

	<div class="mx-auto w-full max-w-[70ch] min-w-0 xl:pl-8">
		<header class="mb-8">
			{#if showTitle}
				<h1 class="text-[2.125rem] leading-tight font-semibold tracking-tight">{doc.title}</h1>
			{/if}
			<div
				class="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem]"
				class:mt-3={showTitle}
			>
				<Badge variant="outline" class="font-normal capitalize">{doc.visibility}</Badge>
				<span>Updated {updated}</span>
				<span>v{doc.version}</span>
				{#if isOwner}
					<span class="ml-auto flex items-center gap-2">
						<form method="post" action="?/visibility" use:enhance class="contents">
							<select
								name="visibility"
								class="border-input bg-background h-7 rounded-md border px-2 text-xs"
								value={doc.visibility}
								onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
							>
								<option value="private">Private</option>
								<option value="unlisted">Unlisted</option>
								<option value="public">Public</option>
							</select>
						</form>
						<Button href="/d/{doc.id}/edit" variant="outline" size="sm">Edit</Button>
					</span>
				{/if}
			</div>
		</header>

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
		<article
			bind:this={article}
			class="folio-doc"
			class:can-comment={commentMode.open && canComment}
			onclick={onArticleClick}
		>
			{@html doc.html}
		</article>
	</div>

	<Dialog.Root
		open={enlarged !== null}
		onOpenChange={(open) => {
			if (!open) enlarged = null;
		}}
	>
		<Dialog.Content
			class="w-max max-w-[calc(100vw-2rem)] gap-0 p-3 pt-12 sm:max-w-[calc(100vw-2rem)]"
		>
			<Dialog.Title class="sr-only">Diagram</Dialog.Title>
			<Dialog.Description class="sr-only">Enlarged view of the diagram</Dialog.Description>
			{#if enlarged}
				<!-- As large as the viewport allows in either direction, keeping the diagram's proportions. -->
				<div
					class="diagram-zoom"
					style="width: min(calc(100vw - 4rem), calc((100svh - 6rem) * {enlarged.ratio.toFixed(
						4
					)}))"
				>
					{@html enlarged.html}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Root>

	<aside
		class="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start lg:overflow-y-auto"
	>
		{#if tocEntries.length > 1}
			<div class="mb-6 hidden lg:block xl:hidden">
				<div
					class="text-muted-foreground mb-2 text-[0.6875rem] font-semibold tracking-wider uppercase"
				>
					Contents
				</div>
				{@render toc()}
			</div>
		{/if}

		{#if commentMode.open}
			<section bind:this={commentsSection} class="scroll-mt-6 text-sm">
				<div
					class="text-muted-foreground mb-2 text-[0.6875rem] font-semibold tracking-wider uppercase"
				>
					Comments · {data.comments.length}
				</div>
				{#if canComment}
					<form method="post" action="?/comment" use:enhance class="mb-4 flex flex-col gap-2">
						<input type="hidden" name="blockId" value={anchor ?? ''} />
						<Textarea
							name="body"
							rows={3}
							placeholder={anchor ? 'Comment on the selected block…' : 'Comment on the document…'}
						/>
						<div class="flex items-center gap-2">
							{#if anchor}
								<span class="text-muted-foreground text-xs">
									On a block ·
									<button type="button" class="underline" onclick={() => (anchor = null)}
										>clear</button
									>
								</span>
							{:else}
								<span class="text-muted-foreground text-xs">Click a paragraph to target it</span>
							{/if}
							<Button type="submit" size="sm" class="ml-auto">Post</Button>
						</div>
						{#if form?.message}<p class="text-destructive text-xs">{form.message}</p>{/if}
					</form>
				{:else}
					<p class="text-muted-foreground mb-4 text-xs">
						<a href="/login?next=/d/{doc.id}" class="underline">Sign in</a> to comment.
					</p>
				{/if}
				<ul class="space-y-2">
					{#each data.comments as c (c.id)}
						<li class="rounded-md border p-2.5" class:opacity-60={c.resolved}>
							{#if c.blockId}
								<button
									type="button"
									class="text-muted-foreground mb-1 block text-xs underline decoration-dotted underline-offset-2"
									onclick={() => jumpTo(c.blockId!)}
								>
									Jump to block
								</button>
							{/if}
							<p class="leading-relaxed whitespace-pre-wrap">{c.body}</p>
							<div class="text-muted-foreground mt-1.5 flex items-center gap-2 text-xs">
								<span
									>{new Date(String(c.createdAt)).toLocaleString(undefined, {
										dateStyle: 'medium',
										timeStyle: 'short'
									})}</span
								>
								{#if data.user && (data.user.id === c.authorId || isOwner)}
									<form method="post" action="?/resolve" use:enhance class="ml-auto">
										<input type="hidden" name="id" value={c.id} />
										<input type="hidden" name="resolved" value={String(!c.resolved)} />
										<button class="underline">{c.resolved ? 'Reopen' : 'Resolve'}</button>
									</form>
								{/if}
							</div>
						</li>
					{:else}
						<li class="text-muted-foreground text-xs">No comments yet.</li>
					{/each}
				</ul>
			</section>
		{/if}
	</aside>
</div>

<style>
	/* Rendered diagrams open enlarged on click, or from a corner button that shows on hover. */
	:global(.folio-doc pre.mermaid) {
		position: relative;
	}
	:global(.folio-doc pre.mermaid:not(.mermaid-failed)) {
		cursor: zoom-in;
	}
	:global(.folio-doc .mermaid-expand) {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.375rem;
		border: 1px solid var(--doc-border);
		background: var(--doc-surface);
		color: var(--doc-muted);
		opacity: 0;
		transition: opacity 120ms;
		cursor: pointer;
	}
	:global(.folio-doc pre.mermaid:hover .mermaid-expand),
	:global(.folio-doc .mermaid-expand:focus-visible) {
		opacity: 1;
	}
	@media (hover: none) {
		:global(.folio-doc .mermaid-expand) {
			opacity: 1;
		}
	}
	/* Mermaid pins an inline max-width on its SVG; the viewer fills its sized box instead. */
	:global(.diagram-zoom svg) {
		display: block;
		width: 100% !important;
		max-width: none !important;
		height: auto;
	}
</style>
