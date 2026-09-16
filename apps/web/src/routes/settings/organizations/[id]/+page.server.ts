import { InvitationInput, OrganizationId, UserId } from '@folio/contract';
import { fail, redirect } from '@sveltejs/kit';
import { Effect, Schema } from 'effect';
import { client, run } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	return run(
		event,
		Effect.flatMap(client(event), (c) =>
			c.organizations.details({ params: { id: OrganizationId.make(event.params.id) } })
		)
	);
};

export const actions: Actions = {
	invite: async (event) => {
		const form = await event.request.formData();
		const decoded = Schema.decodeUnknownExit(InvitationInput)({
			email: String(form.get('email') ?? '')
				.trim()
				.toLowerCase()
		});
		if (decoded._tag === 'Failure') return fail(400, { message: 'Enter a valid email address' });
		const result = await run(
			event,
			Effect.flatMap(client(event), (c) =>
				c.organizations.invite({
					params: { id: OrganizationId.make(event.params.id) },
					payload: decoded.value
				})
			).pipe(
				Effect.as({ ok: true }),
				Effect.catchTag('Conflict', (e) => Effect.succeed({ message: e.message }))
			)
		);
		if ('message' in result) return fail(409, result);
		return { invited: decoded.value.email };
	},
	cancelInvitation: async (event) => {
		const form = await event.request.formData();
		await run(
			event,
			Effect.flatMap(client(event), (c) =>
				c.organizations.cancelInvitation({ params: { id: String(form.get('id') ?? '') } })
			)
		);
		return { ok: true };
	},
	removeMember: async (event) => {
		const form = await event.request.formData();
		const userId = UserId.make(String(form.get('userId') ?? ''));
		await run(
			event,
			Effect.flatMap(client(event), (c) =>
				c.organizations.removeMember({
					params: { id: OrganizationId.make(event.params.id), userId }
				})
			)
		);
		if (userId === event.locals.user?.id) redirect(303, '/settings/organizations');
		return { ok: true };
	}
};
