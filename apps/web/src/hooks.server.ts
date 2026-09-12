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
	if (event.request.headers.get('cookie')?.includes('session_token')) {
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

	return resolve(event);
};
