import {
	Api,
	Comment,
	Document,
	DocumentNotFound,
	DocumentSummary,
	Forbidden,
	Unauthorized
} from '@folio/contract';
import type { RequestEvent } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Cause, Effect, Layer, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { HttpApiClient } from 'effect/unstable/httpapi';

/** Where the API lives when no service binding is available (vite dev). */
const devApiUrl = () => env.API_URL ?? 'http://localhost:8787';

/**
 * Sends a request to the API Worker. In production this is the service binding
 * (an in-process call). In `vite dev` without a running binding, it falls back
 * to plain fetch against the local wrangler dev server.
 */
export const apiFetch = (event: RequestEvent, input: Request): Promise<Response> => {
	// Auth callbacks answer with a 302 plus Set-Cookie. The proxy must hand that
	// to the browser, not follow it, so redirects are always manual here.
	const request = new Request(input, { redirect: 'manual' });
	const binding = event.platform?.env?.API;
	if (binding) return binding.fetch(request);
	const url = new URL(request.url);
	const target = new URL(url.pathname + url.search, devApiUrl());
	return fetch(new Request(target, request));
};

/** Forward a browser request under /api or /auth to the API Worker unchanged. */
export const proxy = (event: RequestEvent): Promise<Response> => apiFetch(event, event.request);

const authHeaders = (event: RequestEvent): Record<string, string> => {
	const cookie = event.request.headers.get('cookie');
	return cookie ? { cookie } : {};
};

/** Typed API client for the current request. Cookies are forwarded so the API sees the session. */
export const client = (event: RequestEvent) =>
	HttpApiClient.make(Api, {
		baseUrl: 'http://api',
		transformClient: (c) =>
			c.pipe(HttpClient.mapRequest(HttpClientRequest.setHeaders(authHeaders(event))))
	}).pipe(
		Effect.provide(
			FetchHttpClient.layer.pipe(
				Layer.provide(
					Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
						apiFetch(event, new Request(input, init))
					)
				)
			)
		)
	);

/**
 * Runs an Effect that uses the API client and maps its typed errors to SvelteKit
 * responses: 401 becomes a redirect to sign-in, 403 and 404 become HTTP errors.
 */
export const run = async <A, E>(
	event: RequestEvent,
	effect: Effect.Effect<A, E, never>
): Promise<A> => {
	const exit = await Effect.runPromiseExit(effect);
	if (exit._tag === 'Success') return exit.value;
	const err = Cause.squash(exit.cause);
	if (err instanceof Unauthorized) {
		redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	}
	if (err instanceof Forbidden) error(403, err.message);
	if (err instanceof DocumentNotFound) error(404, 'Document not found');
	console.error('API call failed', err);
	error(502, 'The API is unavailable');
};

/** Raw call to a Better Auth endpoint with the caller's cookies, for server-side actions. */
export const authCall = async (
	event: RequestEvent,
	path: string,
	body?: unknown
): Promise<Response> => {
	const headers = new Headers({ ...authHeaders(event), origin: event.url.origin });
	if (body !== undefined) headers.set('content-type', 'application/json');
	return apiFetch(
		event,
		new Request(`http://api/auth${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers,
			body: body === undefined ? undefined : JSON.stringify(body)
		})
	);
};

/**
 * SvelteKit serializes load data with devalue, which rejects Effect's DateTime
 * values. Encode to the JSON wire shape (ISO strings) before returning from load.
 */
export const toJson = {
	document: Schema.encodeSync(Document.json),
	documents: Schema.encodeSync(Schema.Array(DocumentSummary)),
	comments: Schema.encodeSync(Schema.Array(Comment.json))
};

/**
 * Form actions cannot return a Response, so cookies set by Better Auth on a
 * server-side call (OAuth state, session) are re-issued through SvelteKit.
 */
export const forwardSetCookies = (event: RequestEvent, res: Response): void => {
	for (const raw of res.headers.getSetCookie?.() ?? []) {
		const [pair, ...attrs] = raw.split(';');
		const eq = pair?.indexOf('=') ?? -1;
		if (!pair || eq < 0) continue;
		const name = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		// Better Auth already URL-encodes values; SvelteKit must not encode them again.
		const opts: Parameters<typeof event.cookies.set>[2] = { path: '/', encode: (v) => v };
		for (const attr of attrs) {
			const [k, v] = attr.trim().split('=');
			switch (k?.toLowerCase()) {
				case 'path':
					opts.path = v ?? '/';
					break;
				case 'max-age':
					opts.maxAge = Number(v);
					break;
				case 'expires':
					opts.expires = new Date(v ?? '');
					break;
				case 'httponly':
					opts.httpOnly = true;
					break;
				case 'secure':
					opts.secure = true;
					break;
				case 'samesite':
					opts.sameSite = (v?.toLowerCase() ?? 'lax') as 'lax' | 'strict' | 'none';
					break;
			}
		}
		if (opts.maxAge !== undefined && opts.maxAge <= 0) event.cookies.delete(name, { path: opts.path ?? '/' });
		else event.cookies.set(name, value, opts);
	}
};
