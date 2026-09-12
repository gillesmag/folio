<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();
	const fmt = (iso: unknown) =>
		new Date(String(iso)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

{#if data.documents === null}
	<section class="mx-auto max-w-xl py-16 text-center">
		<h1 class="text-2xl font-semibold tracking-tight">Documents you and your agents push.</h1>
		<p class="text-muted-foreground mt-2">
			Private by default. Comments anchored to any block. Instant everywhere.
		</p>
		<Button href="/login" class="mt-6">Sign in with Google</Button>
	</section>
{:else if data.documents.length === 0}
	<section class="mx-auto max-w-xl py-16 text-center">
		<h1 class="text-xl font-semibold">No documents yet</h1>
		<p class="text-muted-foreground mt-2">Create one here, or push from the CLI:</p>
		<pre class="bg-muted mt-4 rounded-md p-3 text-left text-sm">folio push README.md</pre>
		<Button href="/new" class="mt-6">New document</Button>
	</section>
{:else}
	<ul class="mx-auto max-w-3xl divide-y">
		{#each data.documents as doc (doc.id)}
			<li>
				<a
					href="/d/{doc.id}"
					class="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-3"
				>
					<span class="flex-1 truncate font-medium">{doc.title}</span>
					<Badge variant="outline">{doc.visibility}</Badge>
					<span class="text-muted-foreground w-16 text-right text-xs">{fmt(doc.updatedAt)}</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}
