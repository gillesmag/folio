import { DocumentId, DocumentInput } from '@folio/contract';
import { error, fail, redirect } from '@sveltejs/kit';
import { Effect, Schema } from 'effect';
import { client, run, toJson } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	const document = await run(
		event,
		Effect.flatMap(client(event), (c) =>
			c.documents.get({ params: { id: DocumentId.make(event.params.id) } })
		)
	);
	if (document.ownerId !== event.locals.user.id)
		error(403, 'Only the owner can edit this document');
	return { document: toJson.document(document) };
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
		if (!raw.source.trim()) return fail(400, { message: 'The document is empty' });
		await run(
			event,
			Effect.gen(function* () {
				const payload = yield* decode(raw).pipe(Effect.orDie);
				const c = yield* client(event);
				return yield* c.documents.replace({
					params: { id: DocumentId.make(event.params.id) },
					payload
				});
			})
		);
		redirect(303, `/d/${event.params.id}`);
	}
};
