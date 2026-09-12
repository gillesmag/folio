import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Shiki and KaTeX emit inline style attributes; Mermaid injects a <style>.
					'style-src': ['self', 'unsafe-inline'],
					'font-src': ['self', 'data:'],
					// Markdown may embed images from anywhere.
					'img-src': ['https:', 'data:', 'blob:'],
					'connect-src': ['self'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'object-src': ['none'],
					// Sign-in posts here, then redirects to Google's consent screen.
					'form-action': ['self', 'https://accounts.google.com']
				}
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.ts']
	}
});
