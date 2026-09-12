import {
	Document,
	DocumentInput,
	DocumentNotFound,
	DocumentPatch,
	DocumentSummary,
	Forbidden,
	type DocumentId,
	type User,
	type UserId
} from '@folio/contract';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { SqlClient, SqlModel, SqlSchema } from 'effect/unstable/sql';
import { Cache } from './Cache.ts';
import { shortId } from './Ids.ts';
import { Render } from './Render.ts';

const cacheKey = (id: DocumentId) => `doc:${id}`;
const encodeJson = Schema.encodeSync(Schema.toCodecJson(Document.json));
const decodeJson = Schema.decodeUnknownSync(Schema.toCodecJson(Document.json));

/** Whether `user` may read `doc`. Private documents are owner-only; the rest are link-visible. */
export const canRead = (doc: { ownerId: UserId; visibility: string }, user: Option.Option<User>) =>
	doc.visibility !== 'private' || Option.exists(user, (u) => u.id === doc.ownerId);

export class Documents extends Context.Service<
	Documents,
	{
		list(owner: UserId): Effect.Effect<Array<DocumentSummary>>;
		/** Cached read. Callers enforce visibility with `canRead`. */
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
			const cache = yield* Cache;
			const renderer = yield* Render;
			const repo = yield* SqlModel.makeRepository(Document, {
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

			const load = Effect.fn('Documents.load')((id: DocumentId) =>
				repo.findById(id).pipe(
					Effect.catchTags({
						NoSuchElementError: () => new DocumentNotFound({ id }),
						SchemaError: Effect.die,
						SqlError: Effect.die
					})
				)
			);

			const get = Effect.fn('Documents.get')(function* (id: DocumentId) {
				const hit = yield* cache.get(cacheKey(id));
				if (hit !== null) {
					const parsed = Effect.try(() => decodeJson(JSON.parse(hit)));
					const doc = yield* parsed.pipe(Effect.option);
					if (Option.isSome(doc)) return new Document(doc.value);
				}
				const doc = yield* load(id);
				yield* cache.put(cacheKey(id), JSON.stringify(encodeJson(doc)));
				return doc;
			});

			const renderInput = Effect.fn('Documents.render')(function* (
				source: string,
				title: string | undefined
			) {
				const r = yield* renderer.render(source);
				return {
					html: r.html,
					title: title?.trim() || r.title || 'Untitled',
					meta: {
						toc: r.toc,
						frontmatter: r.frontmatter,
						hasMath: r.hasMath,
						hasMermaid: r.hasMermaid,
						blockCount: r.blockCount
					}
				};
			});

			const create = Effect.fn('Documents.create')(function* (owner: UserId, input: DocumentInput) {
				const id = yield* shortId;
				const rendered = yield* renderInput(input.source, input.title);
				const row = yield* Document.insert
					.makeEffect({
						id: id as DocumentId,
						ownerId: owner,
						source: input.source,
						visibility: input.visibility ?? 'private',
						version: 1,
						...rendered
					})
					.pipe(Effect.orDie);
				return yield* repo.insert(row).pipe(Effect.orDie);
			});

			const requireOwner = Effect.fn('Documents.requireOwner')(function* (
				actor: UserId,
				id: DocumentId
			) {
				const doc = yield* load(id);
				if (doc.ownerId !== actor) {
					return yield* new Forbidden({ message: 'Only the owner can modify this document' });
				}
				return doc;
			});

			const write = Effect.fn('Documents.write')(function* (
				existing: Document,
				next: {
					title?: string | undefined;
					source?: string | undefined;
					visibility?: Document['visibility'] | undefined;
				}
			) {
				const sourceChanged = next.source !== undefined && next.source !== existing.source;
				const source = next.source ?? existing.source;
				const rendered =
					sourceChanged || next.title !== undefined
						? yield* renderInput(source, next.title ?? (sourceChanged ? undefined : existing.title))
						: { html: existing.html, title: existing.title, meta: existing.meta };
				const row = yield* Document.update
					.makeEffect({
						id: existing.id,
						ownerId: existing.ownerId,
						source,
						visibility: next.visibility ?? existing.visibility,
						version: existing.version + 1,
						...rendered
					})
					.pipe(Effect.orDie);
				const saved = yield* repo.update(row).pipe(Effect.orDie);
				yield* cache.remove(cacheKey(existing.id));
				return saved;
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
				yield* cache.remove(cacheKey(id));
			});

			return Documents.of({ list, get, create, replace, update, remove });
		})
	);
}
