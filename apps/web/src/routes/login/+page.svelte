<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	let { data, form } = $props();
</script>

<section class="mx-auto max-w-sm py-16 text-center">
	<h1 class="text-xl font-semibold">Sign in</h1>
	<form method="post" action="?/google" class="mt-6">
		<input type="hidden" name="next" value={data.next} />
		<Button type="submit" class="w-full">Continue with Google</Button>
	</form>
	{#if form?.message}
		<p class="text-destructive mt-4 text-sm">{form.message}</p>
	{/if}
</section>
