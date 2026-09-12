import { Schema } from 'effect';

export const UserId = Schema.String.pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

export const DocumentId = Schema.String.pipe(Schema.brand('DocumentId'));
export type DocumentId = typeof DocumentId.Type;

export const CommentId = Schema.String.pipe(Schema.brand('CommentId'));
export type CommentId = typeof CommentId.Type;
