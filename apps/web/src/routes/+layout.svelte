<script lang="ts">
	import '../app.css';
	import '@folio/render/styles.css';
	import type { Component } from 'svelte';
	import AppHeader from '$lib/components/app-header.svelte';

	let { data, children } = $props();

	// The palette (cmdk + dialog) is the heaviest UI on the page and rarely needed
	// on first paint, so it is fetched the first time it is requested and kept.
	let paletteOpen = $state(false);
	let Palette = $state<Component<{ open: boolean; user: typeof data.user }> | null>(null);
	const openPalette = async () => {
		Palette ??= (await import('$lib/components/command-palette.svelte')).default;
		paletteOpen = true;
	};
	const onkeydown = (e: KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			if (Palette) paletteOpen = !paletteOpen;
			else void openPalette();
		}
	};
</script>

<svelte:head>
	<title>Folio</title>
</svelte:head>

<svelte:window {onkeydown} />

<div class="flex min-h-svh flex-col">
	<AppHeader user={data.user} onOpenPalette={openPalette} />
	<main class="mx-auto w-full max-w-[88rem] flex-1 px-4 py-6 sm:px-6">
		{@render children()}
	</main>
</div>

{#if Palette}
	<Palette bind:open={paletteOpen} user={data.user} />
{/if}
