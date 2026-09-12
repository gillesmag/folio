import { Schema } from 'effect';
import { UserId } from './ids.ts';

/** The subset of the Better Auth user row that the API exposes. */
export class User extends Schema.Class<User>('folio/User')({
	id: UserId,
	name: Schema.String,
	email: Schema.String,
	image: Schema.NullOr(Schema.String)
}) {}
