import { markdownUrl, source } from '@/lib/source';

export const dynamic = 'force-static';

export function GET() {
	const pages = source.getPages().sort((a, b) => a.url.localeCompare(b.url));
	const index = pages
		.map((page) => `- [${page.data.title}](${markdownUrl(page)}): ${page.data.description ?? ''}`)
		.join('\n');
	return new Response(
		`# Folio\n\n> Publish Markdown documents, read rich content, and comment on blocks through the web app, CLI, or API.\n\nUse the Folio web app origin for API calls. The documentation site does not host your documents or API.\n\n## Documentation\n\n${index}\n\n## Additional resources\n\n- [All documentation](/llms-full.txt): Complete Markdown content.\n- [OpenAPI schema](/openapi.json): Generated from the Folio API contract.\n`,
		{
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		}
	);
}
