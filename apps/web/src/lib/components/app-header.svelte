<script lang="ts">
	import { toggleMode } from 'mode-watcher';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';

	let { user, onOpenPalette }: { user: App.SessionUser | null; onOpenPalette: () => void } =
		$props();
</script>

<header class="border-b">
	<div class="mx-auto flex h-12 w-full max-w-[88rem] items-center gap-3 px-4 sm:px-6">
		<a href="/" class="font-semibold tracking-tight">Folio</a>
		<div class="flex-1"></div>
		<Button variant="outline" size="sm" class="text-muted-foreground gap-2" onclick={onOpenPalette}>
			<span class="hidden sm:inline">Search or jump to…</span>
			<Kbd>⌘K</Kbd>
		</Button>
		<!-- Both icons are in the markup and CSS picks one, so SSR and hydration agree without knowing the mode. -->
		<Button variant="ghost" size="icon-sm" onclick={toggleMode} aria-label="Toggle dark mode">
			<SunIcon class="dark:hidden" />
			<MoonIcon class="hidden dark:block" />
		</Button>
		{#if user}
			<Button href="/new" size="sm">New</Button>
			<!-- A native disclosure: no JS, no floating-ui, closes on outside click via the backdrop. -->
			<details class="relative">
				<summary
					class="bg-muted flex size-8 cursor-pointer list-none items-center justify-center rounded-full text-xs font-medium uppercase select-none [&::-webkit-details-marker]:hidden"
				>
					{user.name.slice(0, 1)}
				</summary>
				<div
					class="bg-popover text-popover-foreground absolute right-0 z-20 mt-2 w-56 rounded-md border p-1 text-sm shadow-md"
				>
					<div class="px-2 py-1.5">
						<div class="font-medium">{user.name}</div>
						<div class="text-muted-foreground text-xs">{user.email}</div>
					</div>
					<div class="bg-border my-1 h-px"></div>
					<a href="/settings/keys" class="hover:bg-accent block rounded-sm px-2 py-1.5">API keys</a>
					<a href="/api/docs" class="hover:bg-accent block rounded-sm px-2 py-1.5">API reference</a>
					<div class="bg-border my-1 h-px"></div>
					<form method="post" action="/logout">
						<button class="hover:bg-accent block w-full rounded-sm px-2 py-1.5 text-left"
							>Sign out</button
						>
					</form>
				</div>
			</details>
		{:else}
			<Button href="/login" size="sm">Sign in</Button>
		{/if}
	</div>
</header>
