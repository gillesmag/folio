import {
	Document,
	DocumentBody,
	DocumentInput,
	DocumentNotFound,
	DocumentPatch,
	DocumentRow,
	DocumentSummary,
	Forbidden,
	type DocumentId,
	type User,
	type UserId
} from '@folio/contract';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { SqlClient, SqlModel, SqlSchema } from 'effect/unstable/sql';
import { Bodies } from './Bodies.ts';
import { EdgeCache } from './EdgeCache.ts';
import { shortId } from './Ids.ts';
import { Render } from './Render.ts';

/** Whether `user` may read `doc`. Private documents are owner-only; the rest are link-visible. */
export const canRead = (doc: { ownerId: UserId; visibility: string }, user: Option.Option<User>) =>
	doc.visibility !== 'private' || Option.exists(user, (u) => u.id === doc.ownerId);

const join = (row: DocumentRow, body: DocumentBody) =>
	new Document({
		id: row.id,
		ownerId: row.ownerId,
		title: row.title,
		visibility: row.visibility,
		version: row.version,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		source: body.source,
		html: body.html,
		meta: body.meta
	});

export class Documents extends Context.Service<
	Documents,
	{
		list(owner: UserId): Effect.Effect<Array<DocumentSummary>>;
		/** Index row only: one small D1 read. Callers enforce visibility with `canRead`. */
		head(id: DocumentId): Effect.Effect<DocumentRow, DocumentNotFound>;
		/** Row plus current body, served from the edge cache when warm. */
		get(id: DocumentId): Effect.Effect<Document, DocumentNotFound>;
		create(owner: UserId, input: DocumentInput): Effect.Effect<Document>;
		replace(
			actor: UserId,
			id: DocumentId,
			input: DocumentInput
		): Effect.Effect<Document, DocumentNotFound | Forbidden>;
		update(
			actor: UserId,
			id: DocumentId,
			patch: DocumentPatch
		): Effect.Effect<Document, DocumentNotFound | Forbidden>;
		remove(actor: UserId, id: DocumentId): Effect.Effect<void, DocumentNotFound | Forbidden>;
	}
>()('folio/api/Documents') {
	static readonly layer = Layer.effect(
		Documents,
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const bodies = yield* Bodies;
			const cache = yield* EdgeCache;
			const renderer = yield* Render;
			const repo = yield* SqlModel.makeRepository(DocumentRow, {
				tableName: 'document',
				spanPrefix: 'Documents',
				idColumn: 'id'
			});

			const listByOwner = SqlSchema.findAll({
				Request: Schema.String,
				Result: DocumentSummary,
				execute: (owner) =>
					sql`SELECT id, ownerId, title, visibility, version, createdAt, updatedAt
					    FROM document WHERE ownerId = ${owner} ORDER BY updatedAt DESC`
			});

			const list = Effect.fn('Documents.list')((owner: UserId) =>
				listByOwner(owner).pipe(Effect.orDie)
			);

			const head = Effect.fn('Documents.head')((id: DocumentId) =>
				repo.findById(id).pipe(
					Effect.catchTags({
						NoSuchElementError: () => new DocumentNotFound({ id }),
						SchemaError: Effect.die,
						SqlError: Effect.die
					})
				)
			);

			/** Edge cache, then R2. A body missing from R2 for a live row is a bug, so it dies. */
			const body = Effect.fn('Documents.body')(function* (row: DocumentRow) {
				const cached = yield* cache.get(row.id, row.version);
				if (Option.isSome(cached)) return cached.value;
				const stored = yield* bodies.get(row.id, row.version);
				if (Option.isNone(stored)) {
					return yield* Effect.die(new Error(`body missing for ${row.id} v${row.version}`));
				}
				yield* cache.put(row.id, row.version, stored.value);
				return stored.value;
			});

			const get = Effect.fn('Documents.get')(function* (id: DocumentId) {
				const row = yield* head(id);
				return join(row, yield* body(row));
			});

			const render = Effect.fn('Documents.render')(function* (
				source: string,
				title: string | undefined
			) {
				const r = yield* renderer.render(source);
				return {
					title: title?.trim() || r.title || 'Untitled',
					body: new DocumentBody({
						source,
						html: r.html,
						meta: {
							toc: r.toc,
							frontmatter: r.frontmatter,
							hasMath: r.hasMath,
							hasMermaid: r.hasMermaid,
							blockCount: r.blockCount
						}
					})
				};
			});

			const create = Effect.fn('Documents.create')(function* (owner: UserId, input: DocumentInput) {
				const id = (yield* shortId) as DocumentId;
				const rendered = yield* render(input.source, input.title);
				// Body first: an orphaned object is harmless, a row without a body is not.
				yield* bodies.put(id, 1, rendered.body);
				const row = yield* DocumentRow.insert
					.makeEffect({
						id,
						ownerId: owner,
						title: rendered.title,
						visibility: input.visibility ?? 'private',
						version: 1
					})
					.pipe(Effect.orDie);
				const saved = yield* repo.insert(row).pipe(Effect.orDie);
				yield* cache.put(id, 1, rendered.body);
				return join(saved, rendered.body);
			});

			const requireOwner = Effect.fn('Documents.requireOwner')(function* (
				actor: UserId,
				id: DocumentId
			) {
				const row = yield* head(id);
				if (row.ownerId !== actor) {
					return yield* new Forbidden({ message: 'Only the owner can modify this document' });
				}
				return row;
			});

			const write = Effect.fn('Documents.write')(function* (
				existing: DocumentRow,
				next: {
					title?: string | undefined;
					source?: string | undefined;
					visibility?: DocumentRow['visibility'] | undefined;
				}
			) {
				const version = existing.version + 1;
				let title = existing.title;
				let current: DocumentBody;
				if (next.source !== undefined) {
					// New content: re-render, and derive the title unless one was given.
					const rendered = yield* render(next.source, next.title);
					title = rendered.title;
					current = rendered.body;
				} else {
					current = yield* body(existing);
					if (next.title?.trim()) title = next.title.trim();
				}
				// Every write is a new version so cached readers are never wrong.
				yield* bodies.put(existing.id, version, current);
				const row = yield* DocumentRow.update
					.makeEffect({
						id: existing.id,
						ownerId: existing.ownerId,
						title,
						visibility: next.visibility ?? existing.visibility,
						version
					})
					.pipe(Effect.orDie);
				const saved = yield* repo.update(row).pipe(Effect.orDie);
				yield* cache.put(existing.id, version, current);
				return join(saved, current);
			});

			const replace = Effect.fn('Documents.replace')(function* (
				actor: UserId,
				id: DocumentId,
				input: DocumentInput
			) {
				const existing = yield* requireOwner(actor, id);
				return yield* write(existing, {
					title: input.title,
					source: input.source,
					visibility: input.visibility
				});
			});

			const update = Effect.fn('Documents.update')(function* (
				actor: UserId,
				id: DocumentId,
				patch: DocumentPatch
			) {
				const existing = yield* requireOwner(actor, id);
				return yield* write(existing, patch);
			});

			const remove = Effect.fn('Documents.remove')(function* (actor: UserId, id: DocumentId) {
				yield* requireOwner(actor, id);
				yield* sql`DELETE FROM comment WHERE documentId = ${id}`.pipe(Effect.orDie);
				yield* repo.delete(id).pipe(Effect.orDie);
				yield* bodies.removeAll(id);
			});

			return Documents.of({ list, head, get, create, replace, update, remove });
		})
	);
}
