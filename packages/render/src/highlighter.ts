import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// Hand-picked language set. Each entry is a lazy import so the Worker bundle
// only carries the grammars we ship, and the JS regex engine avoids Oniguruma WASM.
const langs = [
	import('@shikijs/langs/typescript'),
	import('@shikijs/langs/tsx'),
	import('@shikijs/langs/javascript'),
	import('@shikijs/langs/jsx'),
	import('@shikijs/langs/json'),
	import('@shikijs/langs/jsonc'),
	import('@shikijs/langs/bash'),
	import('@shikijs/langs/python'),
	import('@shikijs/langs/rust'),
	import('@shikijs/langs/go'),
	import('@shikijs/langs/sql'),
	import('@shikijs/langs/yaml'),
	import('@shikijs/langs/toml'),
	import('@shikijs/langs/html'),
	import('@shikijs/langs/css'),
	import('@shikijs/langs/markdown'),
	import('@shikijs/langs/diff'),
	import('@shikijs/langs/dockerfile'),
	import('@shikijs/langs/swift'),
	import('@shikijs/langs/kotlin'),
	import('@shikijs/langs/java'),
	import('@shikijs/langs/c'),
	import('@shikijs/langs/cpp'),
	import('@shikijs/langs/csharp'),
	import('@shikijs/langs/ruby'),
	import('@shikijs/langs/php'),
	import('@shikijs/langs/xml'),
	import('@shikijs/langs/graphql'),
	import('@shikijs/langs/svelte'),
	import('@shikijs/langs/http')
];

let highlighter: Promise<HighlighterCore> | undefined;

/** Shared highlighter, created once per isolate. */
export const getHighlighter = (): Promise<HighlighterCore> => {
	highlighter ??= createHighlighterCore({
		themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
		langs,
		engine: createJavaScriptRegexEngine({ forgiving: true })
	});
	return highlighter;
};

export const themes = { light: 'github-light', dark: 'github-dark' } as const;
