import { Authentication, CurrentUser, User, UserId } from '@folio/contract';
import { Effect, Layer, Option } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import { AuthService } from './Auth.ts';

/**
 * Resolves the caller from whatever credential the request carries: the session
 * cookie (browser, proxied through the web app), a bearer session token (CLI)
 * or an API key (agents). Better Auth handles all three inside getSession.
 */
export const AuthenticationLayer = Layer.effect(
	Authentication,
	Effect.gen(function* () {
		const auth = yield* AuthService;

		const resolve = Effect.fn('Authentication.resolve')(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const headers = new Headers();
			for (const [k, v] of Object.entries(request.headers)) headers.set(k, v);
			const result = yield* Effect.tryPromise(() => auth.make().api.getSession({ headers })).pipe(
				Effect.catch((e) => Effect.logWarning('getSession failed', e).pipe(Effect.as(null)))
			);
			if (!result) return Option.none<User>();
			return Option.some(
				new User({
					id: UserId.make(result.user.id),
					name: result.user.name,
					email: result.user.email,
					image: result.user.image ?? null
				})
			);
		});

		return Authentication.of((httpEffect) =>
			Effect.flatMap(resolve(), (user) => Effect.provideService(httpEffect, CurrentUser, user))
		);
	})
);
