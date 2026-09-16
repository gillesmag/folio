import { OrganizationInput } from '@folio/contract';
import { fail, redirect } from '@sveltejs/kit';
import { Effect, Schema } from 'effect';
import { client, run } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, '/login?next=/settings/organizations');
	return run(
		event,
		Effect.flatMap(client(event), (c) =>
			Effect.all({
				organizations: c.organizations.list(),
				invitations: c.organizations.invitations()
			})
		)
	);
};

export const actions: Actions = {
	create: async (event) => {
		const form = await event.request.formData();
		const raw = {
			name: String(form.get('name') ?? '').trim(),
			slug: String(form.get('slug') ?? '')
				.trim()
				.toLowerCase()
		};
		const decoded = Schema.decodeUnknownExit(OrganizationInput)(raw);
		if (decoded._tag === 'Failure')
			return fail(400, {
				message: 'Enter a name and a slug of 2–48 lowercase letters, numbers, or single hyphens.',
				...raw
			});
		const result = await run(
			event,
			Effect.flatMap(client(event), (c) => c.organizations.create({ payload: decoded.value })).pipe(
				Effect.catchTag('Conflict', (e) => Effect.succeed({ message: e.message }))
			)
		);
		if ('message' in result) return fail(409, { message: result.message, ...raw });
		redirect(303, `/settings/organizations/${result.id}`);
	},
	accept: async (event) => {
		const form = await event.request.formData();
		await run(
			event,
			Effect.flatMap(client(event), (c) =>
				c.organizations.accept({ params: { id: String(form.get('id') ?? '') } })
			)
		);
		return { ok: true };
	},
	decline: async (event) => {
		const form = await event.request.formData();
		await run(
			event,
			Effect.flatMap(client(event), (c) =>
				c.organizations.cancelInvitation({ params: { id: String(form.get('id') ?? '') } })
			)
		);
		return { ok: true };
	}
};
