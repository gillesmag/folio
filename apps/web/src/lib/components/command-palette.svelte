<script lang="ts">
	import type { DocumentSummary } from '@folio/contract';
	import { goto } from '$app/navigation';
	import { resetMode, setMode } from 'mode-watcher';
	import * as Command from '$lib/components/ui/command';

	let { open = $bindable(false), user }: { open: boolean; user: App.SessionUser | null } = $props();

	let docs = $state<DocumentSummary[] | null>(null);
	let loading = $state(false);

	// Documents are fetched the first time the palette opens, never on page load.
	$effect(() => {
		if (open && user && docs === null && !loading) {
			loading = true;
			fetch('/api/documents')
				.then((r) => (r.ok ? r.json() : []))
				.then((list: DocumentSummary[]) => (docs = list))
				.catch(() => (docs = []))
				.finally(() => (loading = false));
		}
	});

	const go = (href: string) => {
		open = false;
		goto(href);
	};
	const appearance = (apply: () => void) => {
		open = false;
		apply();
	};
</script>

<Command.Dialog bind:open title="Command palette" description="Search documents and actions">
	<Command.Input placeholder="Type a command or search…" />
	<Command.List>
		<Command.Empty>No results.</Command.Empty>
		<Command.Group heading="Actions">
			{#if user}
				<Command.Item onSelect={() => go('/new')}>New document</Command.Item>
				<Command.Item onSelect={() => go('/')}>My documents</Command.Item>
				<Command.Item onSelect={() => go('/settings/keys')}>API keys</Command.Item>
			{:else}
				<Command.Item onSelect={() => go('/login')}>Sign in</Command.Item>
			{/if}
			<Command.Item onSelect={() => go('/api/docs')}>API reference</Command.Item>
		</Command.Group>
		<Command.Separator />
		<Command.Group heading="Appearance">
			<Command.Item value="light theme" onSelect={() => appearance(() => setMode('light'))}
				>Light</Command.Item
			>
			<Command.Item value="dark theme" onSelect={() => appearance(() => setMode('dark'))}
				>Dark</Command.Item
			>
			<Command.Item value="system theme" onSelect={() => appearance(resetMode)}>System</Command.Item
			>
		</Command.Group>
		{#if user}
			<Command.Separator />
			<Command.Group heading="Documents">
				{#if loading}
					<Command.Loading>Loading…</Command.Loading>
				{/if}
				{#each docs ?? [] as doc (doc.id)}
					<Command.Item value={`${doc.title} ${doc.id}`} onSelect={() => go(`/d/${doc.id}`)}>
						<span class="truncate">{doc.title}</span>
						<span class="text-muted-foreground ml-auto text-xs">{doc.visibility}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>
