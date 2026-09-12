<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import Editor from '$lib/components/editor.svelte';

	let { data, form } = $props();
	// svelte-ignore state_referenced_locally
	let source = $state(data.document.source);
</script>

<svelte:head><title>Edit · {data.document.title}</title></svelte:head>

<form method="post" use:enhance class="mx-auto flex max-w-4xl flex-col gap-3">
	<div class="flex gap-2">
		<Input name="title" value={data.document.title} class="flex-1" />
		<select
			name="visibility"
			class="border-input bg-background h-9 rounded-md border px-2 text-sm"
			value={data.document.visibility}
		>
			<option value="private">Private</option>
			<option value="unlisted">Unlisted</option>
			<option value="public">Public</option>
		</select>
		<Button href="/d/{data.document.id}" variant="ghost">Cancel</Button>
		<Button type="submit">Save</Button>
	</div>
	<Editor bind:value={source} name="source" />
	{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
</form>
