import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from './index.ts';

const torture = readFileSync(new URL('../fixtures/torture.md', import.meta.url), 'utf8');

describe('torture document', () => {
	it('renders without throwing and keeps the metadata sane', async () => {
		const out = await render(torture);
		expect(out.title).toBe('Torture test: every edge the renderer should survive');
		expect(out.hasMath).toBe(true);
		expect(out.hasMermaid).toBe(true);
		expect(out.toc.length).toBeGreaterThan(15);
		// Three identical headings, three distinct ids.
		const ids = out.toc.filter((t) => t.text === 'Headings').map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.length).toBeGreaterThanOrEqual(3);
	});

	it('neutralises every injection attempt', async () => {
		const { html } = await render(torture);
		// Nothing executable survives, in markdown, raw HTML, KaTeX, or Mermaid source.
		expect(html).not.toMatch(/<script\b/i);
		expect(html).not.toMatch(/<iframe\b/i);
		expect(html).not.toMatch(/<object\b|<embed\b|<base\b|<meta\b|<form\b|<style\b/i);
		// Event handlers as attributes on elements (text mentioning `onerror=` is fine).
		expect(html).not.toMatch(/<[a-z]+[^>]*\son[a-z]+\s*=/i);
		expect(html).not.toMatch(/href="\s*(javascript|vbscript|data|file):/i);
		expect(html).not.toMatch(/src="\s*(javascript|data):/i);
		// Escaped text of the attempts should still be visible to the reader.
		expect(html).toMatch(/&#x3C;script>alert\(/);
	});

	it('gives every top-level block a unique id, including identical paragraphs', async () => {
		const { html, blockCount } = await render(torture);
		const ids = [...html.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
		expect(ids.length).toBe(blockCount);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
