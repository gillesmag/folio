import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
	title: { default: 'Folio documentation', template: '%s | Folio' },
	description:
		'Publish Markdown, collect comments, and work with agents. Usage guides, CLI and API reference, and Cloudflare self-hosting for Folio.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				<RootProvider search={{ options: { type: 'static' } }}>{children}</RootProvider>
			</body>
		</html>
	);
}
