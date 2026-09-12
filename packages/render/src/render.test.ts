import { describe, expect, it } from 'vitest';
import { render } from './index.ts';

const sample = `---
title: Hello
tags: [a, b]
---

# Heading

Some *text* with $x^2$ and a [link](javascript:alert(1)).

\`\`\`ts
const x: number = 1;
\`\`\`

\`\`\`mermaid
graph TD; A-->B;
\`\`\`

- [ ] task
- [x] done

| a | b |
|---|---|
| 1 | 2 |
`;

describe('render', () => {
	it('renders markdown with metadata', async () => {
		const out = await render(sample);
		expect(out.title).toBe('Hello');
		expect(out.frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] });
		expect(out.toc).toEqual([{ depth: 1, id: 'heading', text: 'Heading' }]);
		expect(out.hasMath).toBe(true);
		expect(out.hasMermaid).toBe(true);
		expect(out.html).toContain('class="shiki');
		expect(out.html).toMatch(/<pre class="mermaid" data-block-id="[^"]+">graph TD; A-->B;/);
		expect(out.html).toContain('class="katex"');
		expect(out.html).not.toContain('javascript:');
		expect(out.html).toContain('data-block-id=');
		expect(out.blockCount).toBeGreaterThanOrEqual(6);
	});

	it('falls back to the first h1 for the title and strips raw html', async () => {
		const out = await render('# First\n\n<script>alert(1)</script>\n\ntext');
		expect(out.title).toBe('First');
		expect(out.html).not.toContain('<script');
	});

	it('gives duplicate blocks distinct ids', async () => {
		const out = await render('same\n\nsame\n\nsame');
		const ids = [...out.html.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
		expect(new Set(ids).size).toBe(3);
	});
});
