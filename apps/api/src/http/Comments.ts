import { Api, CurrentUser, DocumentNotFound } from '@folio/contract';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { Comments } from '../Comments.ts';
import { canRead, Documents } from '../Documents.ts';
import { requireUser } from './shared.ts';

export const CommentsHandlers = HttpApiBuilder.group(
	Api,
	'comments',
	Effect.fn(function* (handlers) {
		const documents = yield* Documents;
		const comments = yield* Comments;

		/** Load a document the current caller may read, hiding private ones as 404. */
		const readable = Effect.fn('Comments.readable')(function* (
			id: Parameters<typeof documents.get>[0]
		) {
			const user = yield* CurrentUser;
			const doc = yield* documents.get(id);
			if (!canRead(doc, user)) return yield* new DocumentNotFound({ id });
			return doc;
		});

		return handlers.handleAll({
			list: ({ params }) =>
				Effect.flatMap(readable(params.documentId), (doc) => comments.list(doc.id)),
			create: Effect.fn(function* ({ params, payload }) {
				const user = yield* requireUser;
				const doc = yield* readable(params.documentId);
				return yield* comments.create(user.id, doc.id, payload);
			}),
			resolve: Effect.fn(function* ({ params, payload }) {
				const user = yield* requireUser;
				const comment = yield* comments.get(params.id);
				const doc = yield* documents.get(comment.documentId).pipe(Effect.orDie);
				return yield* comments.setResolved(user.id, doc.ownerId, params.id, payload.resolved);
			}),
			remove: Effect.fn(function* ({ params }) {
				const user = yield* requireUser;
				const comment = yield* comments.get(params.id);
				const doc = yield* documents.get(comment.documentId).pipe(Effect.orDie);
				return yield* comments.remove(user.id, doc.ownerId, params.id);
			})
		});
	})
);
