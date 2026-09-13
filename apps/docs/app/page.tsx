import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { ArrowRight, BookOpen, Cloud, Code, Terminal } from 'lucide-react';
import { baseOptions } from '@/lib/layout.shared';

const sections = [
	{
		title: 'Use Folio',
		description: 'Publish your first document, share a link, and collect feedback.',
		href: '/docs/quickstart',
		icon: BookOpen
	},
	{
		title: 'CLI reference',
		description: 'Push from your terminal. Pull source and read comments from scripts.',
		href: '/docs/cli',
		icon: Terminal
	},
	{
		title: 'API reference',
		description: 'Create documents and manage comments with HTTP requests.',
		href: '/docs/api',
		icon: Code
	},
	{
		title: 'Host on Cloudflare',
		description: 'Deploy your own instance with Workers, D1, and R2.',
		href: '/docs/self-hosting/cloudflare',
		icon: Cloud
	}
];

export default function HomePage() {
	return (
		<HomeLayout {...baseOptions}>
			<main className="mx-auto w-full max-w-5xl px-6 py-16 md:py-24">
				<p className="text-fd-muted-foreground mb-5 text-sm font-medium tracking-widest uppercase">
					Folio documentation
				</p>
				<h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
					A home for your Markdown.
				</h1>
				<p className="text-fd-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
					Publish documents with code, math, and diagrams. Share a link, comment on a block, and
					bring your agents into the same workflow.
				</p>
				<Link
					href="/docs/quickstart"
					className="bg-fd-primary text-fd-primary-foreground mt-8 inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium"
				>
					Publish your first document <ArrowRight className="size-4" />
				</Link>
				<div className="mt-16 grid gap-4 sm:grid-cols-2">
					{sections.map(({ title, description, href, icon: Icon }) => (
						<Link
							key={href}
							href={href}
							className="border-fd-border hover:bg-fd-accent rounded-xl border p-6 transition-colors"
						>
							<Icon className="text-fd-muted-foreground mb-4 size-5" />
							<h2 className="font-semibold">{title}</h2>
							<p className="text-fd-muted-foreground mt-2 text-sm leading-relaxed">{description}</p>
						</Link>
					))}
				</div>
				<p className="text-fd-muted-foreground mt-10 text-sm">
					Working with an agent? Read{' '}
					<a className="underline underline-offset-4" href="/llms.txt">
						llms.txt
					</a>{' '}
					or{' '}
					<a className="underline underline-offset-4" href="/llms-full.txt">
						the full Markdown documentation
					</a>
					.
				</p>
			</main>
		</HomeLayout>
	);
}
