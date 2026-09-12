import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { CommentId, DocumentId, UserId } from './ids.ts';

export class Comment extends Model.Class<Comment>('folio/Comment')({
	id: CommentId,
	documentId: DocumentId,
	authorId: UserId,
	/** `data-block-id` of the block this comment is anchored to, or null for the whole document. */
	blockId: Schema.NullOr(Schema.String),
	body: Schema.String,
	resolved: Model.BooleanSqlite,
	createdAt: Model.DateTimeInsert,
	updatedAt: Model.DateTimeUpdate
}) {}

export class CommentInput extends Schema.Class<CommentInput>('folio/CommentInput')({
	blockId: Schema.optional(Schema.NullOr(Schema.String)),
	body: Schema.NonEmptyString
}) {}
