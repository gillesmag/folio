import { DocumentInput } from '@folio/contract';
import { fail, redirect } from '@sveltejs/kit';
import { Effect, Schema } from 'effect';
import { client, run } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return {};
};

const decode = Schema.decodeUnknownEffect(DocumentInput);

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const raw = {
			title: String(form.get('title') ?? '').trim() || undefined,
			source: String(form.get('source') ?? ''),
			visibility: String(form.get('visibility') ?? 'private')
		};
		if (!raw.source.trim()) return fail(400, { message: 'Write something first' });
		const doc = await run(
			event,
			Effect.gen(function* () {
				const input = yield* decode(raw).pipe(Effect.orDie);
				const c = yield* client(event);
				return yield* c.documents.create({ payload: input });
			})
		);
		redirect(303, `/d/${doc.id}`);
	}
};
