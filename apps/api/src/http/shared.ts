import { CurrentUser, Unauthorized, type User } from '@folio/contract';
import { Effect, Option } from 'effect';

/** Fails with 401 unless the Authentication middleware resolved a user. */
export const requireUser: Effect.Effect<User, Unauthorized, CurrentUser> = Effect.flatMap(
	CurrentUser,
	Option.match({
		onNone: () => new Unauthorized({ message: 'Sign in or provide an API key' }),
		onSome: Effect.succeed
	})
);
