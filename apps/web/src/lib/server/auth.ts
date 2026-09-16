import { organizationFields } from '@folio/contract';
import { createAuthClient } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';
import { error, type RequestEvent } from '@sveltejs/kit';
import { apiFetch, forwardSetCookies } from './api';

/** Better Auth's typed client, scoped to the current browser request and API binding. */
export const authClient = (event: RequestEvent) =>
	createAuthClient({
		baseURL: 'http://api',
		basePath: '/auth',
		plugins: [
			organizationClient({ schema: { organization: { additionalFields: organizationFields } } })
		],
		fetchOptions: {
			headers: { cookie: event.request.headers.get('cookie') ?? '', origin: event.url.origin },
			customFetchImpl: (input, init) => apiFetch(event, new Request(input, init)),
			onResponse: ({ response }) => {
				forwardSetCookies(event, response);
			}
		}
	});

export function authData<T>(result: {
	data: T | null;
	error: { status: number; message?: string } | null;
}): T {
	if (result.error)
		error(result.error.status, result.error.message ?? 'Unable to load organization');
	if (result.data === null) error(404, 'Organization not found');
	return result.data;
}
