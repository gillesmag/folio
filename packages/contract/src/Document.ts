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

/** Metadata produced by the render pipeline, stored next to the HTML. */
export const RenderMeta = Schema.Struct({
	toc: Schema.Array(TocEntry),
	frontmatter: Schema.Record(Schema.String, Schema.Unknown),
	hasMath: Schema.Boolean,
	hasMermaid: Schema.Boolean,
	blockCount: Schema.Int
});
export type RenderMeta = typeof RenderMeta.Type;

/**
 * The index row in D1: who owns the document, what it is called, who may see
 * it, and which version is current. Bodies live in R2 under the version.
 */
export class DocumentRow extends Model.Class<DocumentRow>('folio/DocumentRow')({
	id: DocumentId,
	ownerId: UserId,
	title: Schema.String,
	visibility: Visibility,
	version: Schema.Int,
	createdAt: Model.DateTimeInsert,
	updatedAt: Model.DateTimeUpdate
}) {}

/** One immutable version of a document's content, stored as a JSON object in R2. */
export class DocumentBody extends Schema.Class<DocumentBody>('folio/DocumentBody')({
	source: Schema.String,
	html: Schema.String,
	meta: RenderMeta
}) {}

/** What the API returns: the index row joined with the current body. */
export class Document extends Schema.Class<Document>('folio/Document')({
	id: DocumentId,
	ownerId: UserId,
	title: Schema.String,
	visibility: Visibility,
	version: Schema.Int,
	createdAt: Schema.DateTimeUtcFromString,
	updatedAt: Schema.DateTimeUtcFromString,
	source: Schema.String,
	html: Schema.String,
	meta: RenderMeta
}) {}

/** Listing rows omit the body entirely. */
export class DocumentSummary extends Schema.Class<DocumentSummary>('folio/DocumentSummary')({
	id: DocumentId,
	ownerId: UserId,
	title: Schema.String,
	visibility: Visibility,
	version: Schema.Int,
	createdAt: Schema.DateTimeUtcFromString,
	updatedAt: Schema.DateTimeUtcFromString
}) {}

/** Bounds cap render CPU and keep a version object comfortably small. */
export const Title = Schema.String.check(Schema.isMaxLength(300));
export const Source = Schema.String.check(Schema.isMaxLength(300_000));

export class DocumentInput extends Schema.Class<DocumentInput>('folio/DocumentInput')({
	/** Optional; falls back to frontmatter title, then first heading, then "Untitled". */
	title: Schema.optional(Title),
	source: Source,
	visibility: Schema.optional(Visibility)
}) {}

export class DocumentPatch extends Schema.Class<DocumentPatch>('folio/DocumentPatch')({
	title: Schema.optional(Title),
	source: Schema.optional(Source),
	visibility: Schema.optional(Visibility)
}) {}
