import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import type { HighlighterGeneric } from 'shiki/core';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified, type Processor } from 'unified';
import { getHighlighter, themes } from './highlighter.ts';
import {
	emptyData,
	rehypeBlockIds,
	rehypeMermaid,
	rehypeToc,
	remarkDetectMath,
	remarkFrontmatterData,
	type RenderData,
	type TocEntry
} from './plugins.ts';
import { sanitizeSchema } from './sanitize.ts';

export type { RenderData, TocEntry };

export interface Rendered {
	readonly html: string;
	/** Title from frontmatter, else the first h1, else null. */
	readonly title: string | null;
	readonly frontmatter: Record<string, unknown>;
	readonly toc: readonly TocEntry[];
	readonly hasMath: boolean;
	readonly hasMermaid: boolean;
	readonly blockCount: number;
}

let processor: Promise<Processor<any, any, any, any, string>> | undefined;

const buildProcessor = async () => {
	const highlighter = await getHighlighter();
	return unified()
		.use(remarkParse)
		.use(remarkFrontmatter, ['yaml'])
		.use(remarkFrontmatterData)
		.use(remarkGfm)
		.use(remarkMath)
		.use(remarkDetectMath)
		.use(remarkRehype, { allowDangerousHtml: false })
		.use(rehypeSanitize, sanitizeSchema)
		.use(rehypeSlug)
		.use(rehypeToc)
		.use(rehypeMermaid)
		.use(rehypeKatex, { output: 'htmlAndMathml' })
		.use(rehypeShikiFromHighlighter, highlighter as unknown as HighlighterGeneric<any, any>, {
			themes,
			defaultColor: false,
			fallbackLanguage: 'text',
			onError: () => {}
		})
		.use(rehypeBlockIds)
		.use(rehypeStringify);
};

/** Render markdown to sanitized, highlighted HTML plus metadata. Safe to call concurrently. */
export async function render(markdown: string): Promise<Rendered> {
	processor ??= buildProcessor();
	const p = await processor;
	const data = emptyData();
	const file = await p.process({
		value: markdown,
		data: data as unknown as Record<string, unknown>
	});
	const fmTitle = data.frontmatter['title'];
	const title =
		typeof fmTitle === 'string' && fmTitle.trim().length > 0
			? fmTitle.trim()
			: (data.toc.find((t) => t.depth === 1)?.text ?? null);
	return {
		html: String(file),
		title,
		frontmatter: data.frontmatter,
		toc: data.toc,
		hasMath: data.hasMath,
		hasMermaid: data.hasMermaid,
		blockCount: data.blockCount
	};
}
