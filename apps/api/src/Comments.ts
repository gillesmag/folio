import {
	Comment,
	CommentInput,
	CommentNotFound,
	Forbidden,
	type CommentId,
	type DocumentId,
	type UserId
} from '@folio/contract';
import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient, SqlModel, SqlSchema } from 'effect/unstable/sql';
import { shortId } from './Ids.ts';

export class Comments extends Context.Service<
	Comments,
	{
		list(documentId: DocumentId): Effect.Effect<Array<Comment>>;
		get(id: CommentId): Effect.Effect<Comment, CommentNotFound>;
		create(author: UserId, documentId: DocumentId, input: CommentInput): Effect.Effect<Comment>;
		/** `actor` must be the comment author or the document owner. */
		setResolved(
			actor: UserId,
			documentOwner: UserId,
			id: CommentId,
			resolved: boolean
		): Effect.Effect<Comment, CommentNotFound | Forbidden>;
		remove(
			actor: UserId,
			documentOwner: UserId,
			id: CommentId
		): Effect.Effect<void, CommentNotFound | Forbidden>;
	}
>()('folio/api/Comments') {
	static readonly layer = Layer.effect(
		Comments,
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const repo = yield* SqlModel.makeRepository(Comment, {
				tableName: 'comment',
				spanPrefix: 'Comments',
				idColumn: 'id'
			});

			const byDocument = SqlSchema.findAll({
				Request: Schema.String,
				Result: Comment,
				execute: (documentId) =>
					sql`SELECT * FROM comment WHERE documentId = ${documentId} ORDER BY createdAt ASC`
			});

			const list = Effect.fn('Comments.list')((documentId: DocumentId) =>
				byDocument(documentId).pipe(Effect.orDie)
			);

			const get = Effect.fn('Comments.get')((id: CommentId) =>
				repo.findById(id).pipe(
					Effect.catchTags({
						NoSuchElementError: () => new CommentNotFound({ id }),
						SchemaError: Effect.die,
						SqlError: Effect.die
					})
				)
			);

			const create = Effect.fn('Comments.create')(function* (
				author: UserId,
				documentId: DocumentId,
				input: CommentInput
			) {
				const id = yield* shortId;
				const row = yield* Comment.insert
					.makeEffect({
						id: id as CommentId,
						documentId,
						authorId: author,
						blockId: input.blockId ?? null,
						body: input.body,
						resolved: false
					})
					.pipe(Effect.orDie);
				return yield* repo.insert(row).pipe(Effect.orDie);
			});

			const authorize = Effect.fn('Comments.authorize')(function* (
				actor: UserId,
				documentOwner: UserId,
				id: CommentId
			) {
				const comment = yield* get(id);
				if (comment.authorId !== actor && documentOwner !== actor) {
					return yield* new Forbidden({ message: 'Not allowed to modify this comment' });
				}
				return comment;
			});

			const setResolved = Effect.fn('Comments.setResolved')(function* (
				actor: UserId,
				documentOwner: UserId,
				id: CommentId,
				resolved: boolean
			) {
				const existing = yield* authorize(actor, documentOwner, id);
				const row = yield* Comment.update
					.makeEffect({
						id: existing.id,
						documentId: existing.documentId,
						authorId: existing.authorId,
						blockId: existing.blockId,
						body: existing.body,
						resolved
					})
					.pipe(Effect.orDie);
				return yield* repo.update(row).pipe(Effect.orDie);
			});

			const remove = Effect.fn('Comments.remove')(function* (
				actor: UserId,
				documentOwner: UserId,
				id: CommentId
			) {
				yield* authorize(actor, documentOwner, id);
				yield* repo.delete(id).pipe(Effect.orDie);
			});

			return Comments.of({ list, get, create, setResolved, remove });
		})
	);
}
