import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const baseOptions: BaseLayoutProps = {
	nav: { title: 'Folio / docs' },
	links: [
		{ text: 'Guides', url: '/docs' },
		{ text: 'CLI', url: '/docs/cli' },
		{ text: 'API', url: '/docs/api' },
		{ text: 'Self-hosting', url: '/docs/self-hosting/cloudflare' }
	]
};
