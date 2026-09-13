import { docs } from '../.source/server';
import { openapiPlugin } from 'fumadocs-openapi/server';
import apiMarkdown from '../generated/api-markdown.json';
import { loader } from 'fumadocs-core/source';

export const source = loader({
	baseUrl: '/docs',
	source: docs.toFumadocsSource(),
	plugins: [openapiPlugin()]
});

export function markdownUrl(page: { slugs: string[] }) {
	return `/markdown/${[...page.slugs, 'index.md'].join('/')}`;
}

export async function pageMarkdown(page: ReturnType<typeof source.getPages>[number]) {
	const reference = (apiMarkdown as Record<string, string>)[page.url];
	if (reference) return reference;
	return `# ${page.data.title}\n\n${page.data.description ?? ''}\n\n${await page.data.getText('processed')}`;
}
