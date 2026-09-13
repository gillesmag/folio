import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { OpenAPIPage } from '@/components/api-page';
import { openapi } from '@/lib/openapi';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import { markdownUrl, source } from '@/lib/source';

export const dynamicParams = false;

export function generateStaticParams() {
	return source.generateParams();
}

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props) {
	const page = source.getPage((await params).slug);
	if (!page) notFound();
	return { title: page.data.title, description: page.data.description };
}

export default async function Page({ params }: Props) {
	const page = source.getPage((await params).slug);
	if (!page) notFound();
	const MDX = page.data.body;
	return (
		<DocsPage toc={page.data.toc} full={page.data.full}>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<a
				className="text-fd-muted-foreground text-sm underline underline-offset-4"
				href={markdownUrl(page)}
			>
				View as Markdown
			</a>
			<DocsBody>
				<MDX
					components={getMDXComponents({
						OpenAPIPage: async (props) => (
							<OpenAPIPage {...await openapi.preloadOpenAPIPage(page)} {...props} />
						)
					})}
				/>
			</DocsBody>
		</DocsPage>
	);
}
