import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

export default withMDX({
	output: 'export',
	reactStrictMode: true,
	images: { unoptimized: true }
});
