import { User } from '@folio/contract';
import type { Handle } from '@sveltejs/kit';
import { Schema } from 'effect';
import { apiFetch, proxy } from '$lib/server/api';

// Decode validates the API payload; encode turns the class instance back into a plain object.
const decodeUser = Schema.decodeUnknownSync(User);
const encodeUser = Schema.encodeSync(User);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// The browser talks to one origin. API and auth traffic is handed to the API
	// Worker verbatim so cookies stay first-party.
	if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
		return proxy(event);
	}

	event.locals.user = null;
	const hasSession = event.request.headers.get('cookie')?.includes('session_token') ?? false;

	// Anonymous views of a document page are cached whole at the edge for a
	// minute. Private documents never reach a 200 for anonymous callers, so only
	// public and unlisted pages ever enter the cache.
	const pageCache =
		!hasSession && event.request.method === 'GET' && /^\/d\/[A-Za-z0-9]+$/.test(pathname)
			? edgeCache(event)
			: null;
	if (pageCache) {
		const hit = await pageCache.match();
		if (hit) return hit;
	}

	if (hasSession) {
		const res = await apiFetch(
			event,
			new Request('http://api/api/me', {
				headers: { cookie: event.request.headers.get('cookie')! }
			})
		);
		if (res.ok) {
			try {
				event.locals.user = encodeUser(decodeUser(await res.json()));
			} catch {
				event.locals.user = null;
			}
		}
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	if (pageCache && response.status === 200) pageCache.store(response);
	return response;
};

/**
 * Whole-page cache for anonymous document views, backed by the Cloudflare Cache
 * API. Absent outside the Workers runtime (vite dev), in which case it is a no-op.
 */
const edgeCache = (event: Parameters<Handle>[0]['event']) => {
	const context = event.platform?.context;
	// The Workers runtime exposes `caches.default`; the DOM typings do not know it.
	const store = (globalThis as { caches?: { default?: Cache } }).caches?.default;
	if (!store || !context) return null;
	const key = new Request(event.url.toString(), { method: 'GET' });
	return {
		// The runtime marks served entries with `CF-Cache-Status: HIT`.
		match: () => store.match(key).catch(() => undefined),
		store: (response: Response) => {
			const copy = new Response(response.clone().body, response);
			copy.headers.set('cache-control', 'public, s-maxage=60');
			context.waitUntil(store.put(key, copy).catch(() => {}));
		}
	};
};
