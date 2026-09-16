<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	let { data, form } = $props();
	const createdOrganization = $derived(
		data.organizations.some((o) => o.creatorId === data.user?.id)
	);
</script>

<svelte:head><title>Organizations · Folio</title></svelte:head>

<section class="mx-auto max-w-2xl space-y-8">
	<div>
		<h1 class="text-xl font-semibold">Organizations</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Share documents with your organization. You can create one organization and join others.
		</p>
	</div>
	{#if form?.message}<p role="alert" class="text-destructive text-sm">{form.message}</p>{/if}
	{#if data.invitations.length}
		<section class="space-y-3">
			<h2 class="font-medium">Invitations</h2>
			{#each data.invitations as invitation (invitation.id)}
				<div class="flex flex-wrap items-center gap-2 rounded-lg border p-4">
					<div class="min-w-0 flex-1">
						<p class="font-medium">{invitation.organizationName}</p>
						<p class="text-muted-foreground text-xs">
							Expires {new Date(invitation.expiresAt).toLocaleDateString()}
						</p>
					</div>
					<form method="post" action="?/decline" use:enhance>
						<input type="hidden" name="id" value={invitation.id} /><Button
							type="submit"
							variant="ghost"
							size="sm">Decline</Button
						>
					</form>
					<form method="post" action="?/accept" use:enhance>
						<input type="hidden" name="id" value={invitation.id} /><Button type="submit" size="sm"
							>Join</Button
						>
					</form>
				</div>
			{/each}
		</section>
	{/if}
	<div class="divide-y rounded-lg border">
		<div class="p-4">
			<p class="font-medium">Personal</p>
			<p class="text-muted-foreground mt-1 text-sm">
				Your default space. Private documents here are visible only to you.
			</p>
		</div>
		{#each data.organizations as org (org.id)}
			<a
				href="/settings/organizations/{org.id}"
				class="hover:bg-muted/50 flex items-center gap-3 p-4"
			>
				<div class="min-w-0 flex-1">
					<p class="truncate font-medium">{org.name}</p>
					<p class="text-muted-foreground text-sm">{org.slug}</p>
				</div>
				<Badge variant="outline">{org.creatorId === data.user?.id ? 'Creator' : 'Member'}</Badge>
			</a>
		{/each}
	</div>
	{#if !createdOrganization}
		<form method="post" action="?/create" use:enhance class="space-y-4">
			<h2 class="font-medium">Create an organization</h2>
			<div class="space-y-2">
				<Label for="org-name">Name</Label><Input
					id="org-name"
					name="name"
					required
					maxlength={80}
					placeholder="Acme"
					value={form && 'name' in form ? form.name : ''}
				/>
			</div>
			<div class="space-y-2">
				<Label for="org-slug">Slug</Label><Input
					id="org-slug"
					name="slug"
					required
					minlength={2}
					maxlength={48}
					pattern="[a-z0-9]+(-[a-z0-9]+)*"
					placeholder="acme"
					value={form && 'slug' in form ? form.slug : ''}
				/>
				<p class="text-muted-foreground text-xs">
					A unique name you can use with <code>folio push --org acme</code>.
				</p>
			</div>
			<Button type="submit">Create organization</Button>
		</form>
	{/if}
	<p class="text-muted-foreground text-sm">
		Invited by someone? Sign in with the invited email address to see the invitation here.
	</p>
</section>
