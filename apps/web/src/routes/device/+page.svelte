<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	let { data, form } = $props();
</script>

<section class="mx-auto max-w-sm py-16 text-center">
	{#if form?.approved}
		<h1 class="text-xl font-semibold">Device connected</h1>
		<p class="text-muted-foreground mt-2">You can close this tab and return to the terminal.</p>
	{:else if form?.denied}
		<h1 class="text-xl font-semibold">Request denied</h1>
	{:else}
		<h1 class="text-xl font-semibold">Connect a device</h1>
		{#if data.client}
			<p class="text-muted-foreground mt-2">
				<span class="text-foreground font-medium">{data.client}</span> is asking to act as you. Only approve
				a code you just saw in your own terminal.
			</p>
		{:else}
			<p class="text-muted-foreground mt-2">Enter the code shown in your terminal.</p>
		{/if}
		<form method="post" action="?/approve" class="mt-6 flex flex-col gap-3">
			<Input
				name="user_code"
				value={form?.userCode ?? data.userCode}
				placeholder="XXXX-XXXX"
				class="text-center font-mono text-lg tracking-widest uppercase"
				autocomplete="off"
			/>
			<Button type="submit">Approve</Button>
			<Button type="submit" formaction="?/deny" variant="ghost">Deny</Button>
			{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
		</form>
	{/if}
</section>
