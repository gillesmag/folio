<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	let { data, form } = $props();
</script>

<svelte:head><title>API keys · Folio</title></svelte:head>

<section class="mx-auto max-w-2xl">
	<h1 class="text-xl font-semibold">API keys</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		Agents authenticate with the <code>x-api-key</code> header, or by setting
		<code>FOLIO_API_KEY</code> for the CLI.
	</p>

	{#if form?.created}
		<div class="mt-4 rounded-md border p-3 text-sm">
			<div class="font-medium">Key for “{form.name}”. Copy it now; it will not be shown again.</div>
			<pre class="bg-muted mt-2 overflow-x-auto rounded p-2">{form.created}</pre>
		</div>
	{/if}

	<form method="post" action="?/create" use:enhance class="mt-6 flex gap-2">
		<Input name="name" placeholder="Key name, e.g. claude-code" class="flex-1" />
		<Button type="submit">Create key</Button>
	</form>
	{#if form?.message}<p class="text-destructive mt-2 text-sm">{form.message}</p>{/if}

	<ul class="mt-6 divide-y text-sm">
		{#each data.keys as k (k.id)}
			<li class="flex items-center gap-3 py-2">
				<span class="flex-1 font-medium">{k.name ?? 'unnamed'}</span>
				<code class="text-muted-foreground">{k.prefix ?? ''}{k.start ?? ''}…</code>
				<span class="text-muted-foreground text-xs"
					>{new Date(k.createdAt).toLocaleDateString()}</span
				>
				<form method="post" action="?/revoke" use:enhance>
					<input type="hidden" name="id" value={k.id} />
					<Button type="submit" variant="ghost" size="sm">Revoke</Button>
				</form>
			</li>
		{:else}
			<li class="text-muted-foreground py-2">No keys yet.</li>
		{/each}
	</ul>
</section>
