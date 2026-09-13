import { pageMarkdown, source } from '@/lib/source';

export const dynamic = 'force-static';

export async function GET() {
	const pages = source.getPages().sort((a, b) => a.url.localeCompare(b.url));
	const content = await Promise.all(pages.map(pageMarkdown));
	return new Response(content.join('\n\n---\n\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
}
