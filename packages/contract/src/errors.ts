import { Schema } from 'effect';

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{ httpApiStatus: 401 }
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
	'Forbidden',
	{ message: Schema.String },
	{ httpApiStatus: 403 }
) {}

export class DocumentNotFound extends Schema.TaggedError<DocumentNotFound>()(
	'DocumentNotFound',
	{ id: Schema.String },
	{ httpApiStatus: 404 }
) {}

export class CommentNotFound extends Schema.TaggedError<CommentNotFound>()(
	'CommentNotFound',
	{ id: Schema.String },
	{ httpApiStatus: 404 }
) {}
