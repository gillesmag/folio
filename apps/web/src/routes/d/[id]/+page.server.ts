import { CommentInput, DocumentId, DocumentPatch } from '@folio/contract';
import { fail, redirect } from '@sveltejs/kit';
import { Effect, Schema } from 'effect';
import { client, run, toJson } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const id = DocumentId.make(event.params.id);
	const [document, comments] = await run(
		event,
		Effect.flatMap(client(event), (c) =>
			Effect.all(
				[c.documents.get({ params: { id } }), c.comments.list({ params: { documentId: id } })],
				{
					concurrency: 2
				}
			)
		)
	);
	return { document: toJson.document(document), comments: toJson.comments(comments) };
};

const decodeComment = Schema.decodeUnknownEffect(CommentInput);
const decodePatch = Schema.decodeUnknownEffect(DocumentPatch);

export const actions: Actions = {
	comment: async (event) => {
		if (!event.locals.user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		const form = await event.request.formData();
		const body = String(form.get('body') ?? '').trim();
		const blockId = String(form.get('blockId') ?? '').trim() || null;
		if (!body) return fail(400, { message: 'Comment is empty' });
		await run(
			event,
			Effect.gen(function* () {
				const payload = yield* decodeComment({ body, blockId }).pipe(Effect.orDie);
				const c = yield* client(event);
				return yield* c.comments.create({
					params: { documentId: DocumentId.make(event.params.id) },
					payload
				});
			})
		);
		return { ok: true };
	},
	resolve: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const resolved = form.get('resolved') === 'true';
		await run(
			event,
			Effect.flatMap(client(event), (c) =>
				c.comments.resolve({ params: { id: id as never }, payload: { resolved } })
			)
		);
		return { ok: true };
	},
	visibility: async (event) => {
		const form = await event.request.formData();
		const visibility = String(form.get('visibility') ?? 'private');
		await run(
			event,
			Effect.gen(function* () {
				// Class schemas encode from instances, so the payload is decoded first rather than passed as a literal.
				const payload = yield* decodePatch({ visibility }).pipe(Effect.orDie);
				const c = yield* client(event);
				return yield* c.documents.update({
					params: { id: DocumentId.make(event.params.id) },
					payload
				});
			})
		);
		return { ok: true };
	},
	delete: async (event) => {
		await run(
			event,
			Effect.flatMap(client(event), (c) =>
				c.documents.remove({ params: { id: DocumentId.make(event.params.id) } })
			)
		);
		redirect(303, '/');
	}
};
