import { OrganizationInput, organizationFields } from '@folio/contract';
import { APIError } from 'better-auth/api';
import { defaultAc, memberAc } from 'better-auth/plugins/organization/access';
import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { bearer, deviceAuthorization, organization } from 'better-auth/plugins';
import { Context, Effect, Layer, Schema } from 'effect';
import { Bindings } from './Bindings.ts';

/** Refuse to start with a weak or missing signing secret rather than fall back to a default. */
const requireSecret = (env: Env): string => {
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error('BETTER_AUTH_SECRET must be set to at least 32 characters');
	}
	return secret;
};

export const makeAuth = (env: Env) =>
	betterAuth({
		appName: 'Folio',
		// Better Auth phones home on init; in a sandboxed Worker that fetch can stall the first request.
		telemetry: { enabled: false },
		// The web app proxies /auth/* to this Worker, so the public origin is the app's.
		baseURL: env.APP_URL,
		basePath: '/auth',
		secret: requireSecret(env),
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
		// Auth endpoints (sign-in, device polling, key creation) are throttled per IP.
		// Worker memory is per isolate, so the counters live in D1 (see migration 0002).
		rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
		plugins: [
			organization({
				// The numeric option counts joined organizations too. Count only creations here.
				organizationLimit: async (user) =>
					(await env.DB.prepare('SELECT 1 FROM organization WHERE creatorId = ?')
						.bind(user.id)
						.first()) !== null,
				disableOrganizationDeletion: true,
				requireEmailVerificationOnInvitation: true,
				invitationExpiresIn: 7 * 86400,
				schema: { organization: { additionalFields: organizationFields } },
				roles: {
					owner: defaultAc.newRole({ member: ['delete'], invitation: ['create', 'cancel'] }),
					admin: memberAc,
					member: memberAc
				},
				organizationHooks: {
					beforeCreateOrganization: async ({ organization, user }) => {
						const input = Schema.decodeUnknownExit(OrganizationInput)(organization);
						if (input._tag === 'Failure')
							throw new APIError('BAD_REQUEST', {
								message:
									'Enter a name and a slug of 2–48 lowercase letters, numbers, or single hyphens. The slug personal is reserved.'
							});
						return {
							data: { name: input.value.name.trim(), slug: input.value.slug, creatorId: user.id }
						};
					},
					beforeCreateInvitation: async ({ invitation }) => {
						if (invitation.role !== 'member')
							throw new APIError('BAD_REQUEST', { message: 'Invite people with the member role' });
					}
				}
			}),
			// `Authorization: Bearer <session token>` for the CLI after the device flow.
			bearer(),
			// `x-api-key` for agents; enableSessionForAPIKeys makes getSession resolve the key's user.
			// The plugin's default per-key limit is 10 requests per day, which would break agents.
			apiKey({
				enableSessionForAPIKeys: true,
				defaultPrefix: 'folio_',
				rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 300 }
			}),
			deviceAuthorization({
				verificationUri: '/device',
				expiresIn: '10m',
				// Only our CLI may start a device flow.
				validateClient: (clientId) => clientId === 'folio-cli'
			})
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
