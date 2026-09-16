<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	let { data, form } = $props();
	const isCreator = $derived(data.organization.creatorId === data.user?.id);
</script>

<svelte:head><title>{data.organization.name} · Folio</title></svelte:head>

<section class="mx-auto max-w-2xl space-y-8">
	<div>
		<a href="/settings/organizations" class="text-muted-foreground text-sm hover:underline"
			>Organizations</a
		>
		<h1 class="mt-3 text-xl font-semibold">{data.organization.name}</h1>
		<p class="text-muted-foreground mt-2 text-sm">
			Upload with <code>folio push file.md --org {data.organization.slug}</code>
		</p>
		<p class="text-muted-foreground mt-1 text-xs">
			Organization ID: <code>{data.organization.id}</code>
		</p>
	</div>
	{#if form?.message}<p role="alert" class="text-destructive text-sm">{form.message}</p>{/if}
	{#if isCreator}
		<form method="post" action="?/invite" use:enhance class="space-y-2">
			<Label for="invite-email">Invite by email</Label>
			<div class="flex gap-2">
				<Input
					id="invite-email"
					name="email"
					type="email"
					required
					maxlength={254}
					placeholder="colleague@example.com"
				/><Button type="submit">Invite</Button>
			</div>
			<p class="text-muted-foreground text-xs">
				Ask them to sign in and open Organizations to accept. Invitations expire after 7 days. No
				email is sent.
			</p>
			{#if form?.invited}<p role="status" class="text-sm">
					Invitation ready for {form.invited}.
				</p>{/if}
		</form>
	{/if}
	<div>
		<h2 class="mb-2 font-medium">Members</h2>
		<ul class="divide-y">
			{#each data.members as member (member.id)}
				<li class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{member.user.name}</p>
						<p class="text-muted-foreground truncate text-xs">{member.user.email}</p>
					</div>
					{#if member.userId === data.organization.creatorId}<Badge variant="outline">Creator</Badge
						>
					{:else if isCreator || member.userId === data.user?.id}
						<form
							method="post"
							action={member.userId === data.user?.id ? '?/leave' : '?/removeMember'}
							use:enhance
						>
							<input type="hidden" name="memberId" value={member.id} /><Button
								type="submit"
								variant="ghost"
								size="sm">{member.userId === data.user?.id ? 'Leave' : 'Remove'}</Button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="text-muted-foreground mt-3 text-xs">
			When someone leaves or is removed, their documents move to Personal.
		</p>
	</div>
	{#if data.invitations.length}
		<div>
			<h2 class="mb-2 font-medium">Pending invitations</h2>
			<ul class="divide-y">
				{#each data.invitations as invitation (invitation.id)}
					<li class="flex items-center gap-3 py-3">
						<span class="min-w-0 flex-1 truncate text-sm">{invitation.email}</span>
						<form method="post" action="?/cancelInvitation" use:enhance>
							<input type="hidden" name="id" value={invitation.id} /><Button
								type="submit"
								variant="ghost"
								size="sm">Cancel</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
