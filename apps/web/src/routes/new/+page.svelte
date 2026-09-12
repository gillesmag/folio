<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	let { form } = $props();
</script>

<form method="post" use:enhance class="mx-auto flex max-w-3xl flex-col gap-3">
	<div class="flex gap-2">
		<Input name="title" placeholder="Title (optional)" class="flex-1" />
		<select name="visibility" class="border-input bg-background h-9 rounded-md border px-2 text-sm">
			<option value="private">Private</option>
			<option value="unlisted">Unlisted</option>
			<option value="public">Public</option>
		</select>
		<Button type="submit">Create</Button>
	</div>
	<Textarea name="source" rows={24} placeholder="# Write markdown…" class="font-mono text-sm" />
	{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
</form>
