<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Markdown editor. Renders a plain textarea on the server and upgrades to
	 * CodeMirror on the client once its chunk has loaded, so the page is usable
	 * immediately and the editor bundle never ships to document viewers.
	 */
	let { value = $bindable(''), name }: { value: string; name: string } = $props();
	let host = $state<HTMLDivElement | null>(null);
	let upgraded = $state(false);

	onMount(() => {
		let view: { destroy(): void } | undefined;
		Promise.all([
			import('@codemirror/view'),
			import('@codemirror/state'),
			import('@codemirror/lang-markdown'),
			import('@codemirror/language')
		]).then(
			([
				{ EditorView, keymap, lineNumbers, highlightActiveLine },
				{ EditorState },
				{ markdown },
				{ defaultHighlightStyle, syntaxHighlighting }
			]) => {
				if (!host) return;
				view = new EditorView({
					parent: host,
					state: EditorState.create({
						doc: value,
						extensions: [
							lineNumbers(),
							highlightActiveLine(),
							EditorView.lineWrapping,
							markdown(),
							syntaxHighlighting(defaultHighlightStyle),
							keymap.of([]),
							EditorView.updateListener.of((u) => {
								if (u.docChanged) value = u.state.doc.toString();
							}),
							EditorView.theme({
								'&': { fontSize: '14px', minHeight: '60vh' },
								'.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
								'&.cm-focused': { outline: 'none' }
							})
						]
					})
				});
				upgraded = true;
			}
		);
		return () => view?.destroy();
	});
</script>

<!-- The textarea stays in the DOM (hidden once upgraded) so the form still submits `name`. -->
<textarea
	{name}
	bind:value
	rows={24}
	class="border-input bg-background w-full rounded-md border p-3 font-mono text-sm"
	class:sr-only={upgraded}
></textarea>
<div bind:this={host} class="border-input rounded-md border" class:hidden={!upgraded}></div>
