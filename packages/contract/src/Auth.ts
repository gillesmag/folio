import { Context, Option } from 'effect';
import { HttpApiMiddleware } from 'effect/unstable/httpapi';
import type { User } from './User.ts';

/**
 * The caller, if any. Resolved from a session cookie, a bearer session token
 * (CLI device flow) or an API key (agents). Public documents are readable
 * without one, so this is an Option rather than a hard requirement.
 */
export class CurrentUser extends Context.Service<CurrentUser, Option.Option<User>>()(
	'folio/CurrentUser'
) {}

export class Authentication extends HttpApiMiddleware.Service<
	Authentication,
	{ provides: CurrentUser; requires: never }
>()('folio/Authentication') {}
