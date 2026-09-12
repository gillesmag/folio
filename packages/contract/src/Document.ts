import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { DocumentId, UserId } from './ids.ts';

export const Visibility = Schema.Literals(['private', 'unlisted', 'public']);
export type Visibility = typeof Visibility.Type;

export const TocEntry = Schema.Struct({
	depth: Schema.Int,
	id: Schema.String,
	text: Schema.String
});

/** Metadata produced by the render pipeline, stored as JSON next to the HTML. */
export const RenderMeta = Schema.Struct({
	toc: Schema.Array(TocEntry),
	frontmatter: Schema.Record(Schema.String, Schema.Unknown),
	hasMath: Schema.Boolean,
	hasMermaid: Schema.Boolean,
	blockCount: Schema.Int
});
export type RenderMeta = typeof RenderMeta.Type;

/**
 * One field declaration drives the database row (`Document`, `.insert`,
 * `.update`) and the API response (`Document.json`). Create and update payloads
 * are hand-written below because they are looser than the row.
 */
export class Document extends Model.Class<Document>('folio/Document')({
	id: DocumentId,
	ownerId: UserId,
	title: Schema.String,
	visibility: Visibility,
	source: Schema.String,
	html: Schema.String,
	meta: Model.JsonFromString(RenderMeta),
	version: Schema.Int,
	createdAt: Model.DateTimeInsert,
	updatedAt: Model.DateTimeUpdate
}) {}

/** Listing rows omit the heavy source and HTML columns. */
export class DocumentSummary extends Schema.Class<DocumentSummary>('folio/DocumentSummary')({
	id: DocumentId,
	ownerId: UserId,
	title: Schema.String,
	visibility: Visibility,
	version: Schema.Int,
	createdAt: Schema.DateTimeUtcFromString,
	updatedAt: Schema.DateTimeUtcFromString
}) {}

export class DocumentInput extends Schema.Class<DocumentInput>('folio/DocumentInput')({
	/** Optional; falls back to frontmatter title, then first heading, then "Untitled". */
	title: Schema.optional(Schema.String),
	source: Schema.String,
	visibility: Schema.optional(Visibility)
}) {}

export class DocumentPatch extends Schema.Class<DocumentPatch>('folio/DocumentPatch')({
	title: Schema.optional(Schema.String),
	source: Schema.optional(Schema.String),
	visibility: Schema.optional(Visibility)
}) {}
