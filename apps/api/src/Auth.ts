import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { Context, Effect, Layer } from 'effect';
import { Bindings } from './Bindings.ts';

export const makeAuth = (env: Env) =>
	betterAuth({
		appName: 'Folio',
		// Better Auth phones home on init; in a sandboxed Worker that fetch can stall the first request.
		telemetry: { enabled: false },
		// The web app proxies /auth/* to this Worker, so the public origin is the app's.
		baseURL: env.APP_URL,
		basePath: '/auth',
		secret: env.BETTER_AUTH_SECRET,
		database: env.DB,
		trustedOrigins: [env.APP_URL],
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET
			}
		},
		session: {
			// Avoid a D1 round trip on every request; the signed cookie carries the session for 5 minutes.
			cookieCache: { enabled: true, maxAge: 5 * 60 }
		},
		plugins: [
			// `Authorization: Bearer <session token>` for the CLI after the device flow.
			bearer(),
			// `x-api-key` for agents; enableSessionForAPIKeys makes getSession resolve the key's user.
			apiKey({ enableSessionForAPIKeys: true, defaultPrefix: 'folio_' }),
			deviceAuthorization({ verificationUri: '/device' })
		]
	});

export type Auth = ReturnType<typeof makeAuth>;

/**
 * Better Auth starts async work (D1 access, context init) the first time an
 * instance is used. Workers tie that work to the request that started it, so an
 * instance created during one request stalls forever when awaited from another.
 * Construction is cheap, so every request gets its own instance.
 */
export class AuthService extends Context.Service<AuthService, { readonly make: () => Auth }>()(
	'folio/api/Auth'
) {
	static readonly layer = Layer.effect(
		AuthService,
		Effect.map(Bindings, (env) => AuthService.of({ make: () => makeAuth(env) }))
	);
}
