import { Api, DocumentNotFound, Forbidden, CurrentUser } from '@folio/contract';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { canRead, Documents } from '../Documents.ts';
import { requireUser } from './shared.ts';

export const DocumentsHandlers = HttpApiBuilder.group(
	Api,
	'documents',
	Effect.fn(function* (handlers) {
		const documents = yield* Documents;
		return handlers.handleAll({
			list: () => Effect.flatMap(requireUser, (user) => documents.list(user.id)),
			get: Effect.fn(function* ({ params }) {
				const user = yield* CurrentUser;
				const doc = yield* documents.get(params.id);
				if (!canRead(doc, user)) {
					// Do not reveal that a private document exists.
					return yield* new DocumentNotFound({ id: params.id });
				}
				return doc;
			}),
			create: ({ payload }) =>
				Effect.flatMap(requireUser, (user) => documents.create(user.id, payload)),
			replace: ({ params, payload }) =>
				Effect.flatMap(requireUser, (user) => documents.replace(user.id, params.id, payload)),
			update: ({ params, payload }) =>
				Effect.flatMap(requireUser, (user) => documents.update(user.id, params.id, payload)),
			remove: ({ params }) =>
				Effect.flatMap(requireUser, (user) => documents.remove(user.id, params.id))
		});
	})
);

export type { Forbidden };
