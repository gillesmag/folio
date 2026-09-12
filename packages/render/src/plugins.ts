import type { Element, Root, RootContent } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { parse as parseYaml } from 'yaml';

export interface TocEntry {
	readonly depth: number;
	readonly id: string;
	readonly text: string;
}

export interface RenderData {
	[key: string]: unknown;
	frontmatter: Record<string, unknown>;
	toc: TocEntry[];
	hasMath: boolean;
	hasMermaid: boolean;
	blockCount: number;
}

/** Our per-render state lives on the vfile; the caller seeds it via `process({ data })`. */
export const dataOf = (file: VFile): RenderData => file.data as unknown as RenderData;

export const emptyData = (): RenderData => ({
	frontmatter: {},
	toc: [],
	hasMath: false,
	hasMermaid: false,
	blockCount: 0
});

/** remark: parse YAML frontmatter into file.data and drop it from the tree. */
export function remarkFrontmatterData() {
	return (tree: MdastRoot, file: VFile) => {
		const first = tree.children[0];
		if (first?.type === 'yaml') {
			try {
				const parsed = parseYaml(first.value);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					dataOf(file).frontmatter = parsed as Record<string, unknown>;
				}
			} catch {
				// Malformed frontmatter is ignored rather than failing the render.
			}
			tree.children.shift();
		}
	};
}

/** remark: record whether the document uses math so the client can lazy-load KaTeX CSS. */
export function remarkDetectMath() {
	return (tree: MdastRoot, file: VFile) => {
		visit(tree, (node) => {
			if (node.type === 'math' || node.type === 'inlineMath') dataOf(file).hasMath = true;
		});
	};
}

const isElement = (node: RootContent): node is Element => node.type === 'element';

/**
 * rehype: turn ```mermaid fences into <pre class="mermaid"> so the highlighter
 * skips them and the client can render them lazily.
 */
export function rehypeMermaid() {
	return (tree: Root, file: VFile) => {
		visit(tree, 'element', (node: Element) => {
			if (node.tagName !== 'pre') return;
			const code = node.children.find(
				(c): c is Element => c.type === 'element' && c.tagName === 'code'
			);
			if (!code) return;
			const classes = Array.isArray(code.properties?.className) ? code.properties.className : [];
			if (!classes.includes('language-mermaid')) return;
			dataOf(file).hasMermaid = true;
			node.properties = { className: ['mermaid'] };
			node.children = [{ type: 'text', value: toString(code) }];
		});
	};
}

/** rehype: collect a table of contents from h1–h4 that already carry slugs. */
export function rehypeToc() {
	return (tree: Root, file: VFile) => {
		const toc: TocEntry[] = [];
		visit(tree, 'element', (node: Element) => {
			const match = /^h([1-4])$/.exec(node.tagName);
			const id = node.properties?.id;
			if (!match || typeof id !== 'string') return;
			toc.push({ depth: Number(match[1]), id, text: toString(node).trim() });
		});
		dataOf(file).toc = toc;
	};
}

/** FNV-1a 32-bit, base36. Dependency-free and sync so it runs in the Worker hot path. */
const fnv1a = (input: string): string => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(36);
};

/**
 * rehype: stamp every top-level block with a stable `data-block-id` derived from
 * its text content. Comments attach to these ids and survive edits elsewhere in
 * the document. Duplicate content gets an ordinal suffix.
 */
export function rehypeBlockIds() {
	return (tree: Root, file: VFile) => {
		const seen = new Map<string, number>();
		let count = 0;
		// The Shiki plugin replaces code blocks with root fragments; flatten them
		// so every block is a direct element child of the document root.
		tree.children = tree.children.flatMap((node) =>
			(node as { type: string }).type === 'root' ? (node as unknown as Root).children : [node]
		);
		for (const node of tree.children) {
			if (!isElement(node)) continue;
			const base = fnv1a(node.tagName + '\n' + toString(node).trim());
			const n = (seen.get(base) ?? 0) + 1;
			seen.set(base, n);
			node.properties = { ...node.properties, dataBlockId: n === 1 ? base : `${base}-${n}` };
			count++;
		}
		dataOf(file).blockCount = count;
	};
}
