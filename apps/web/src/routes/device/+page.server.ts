import { fail, redirect } from '@sveltejs/kit';
import { authCall } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return { userCode: url.searchParams.get('user_code') ?? '' };
};

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Better Auth only lets a user approve or deny a code they have first claimed,
 * which happens on the verify call. So every decision is verify then act.
 */
const claim = async (event: Parameters<Actions[string]>[0], userCode: string) => {
	const res = await authCall(event, `/device?user_code=${encodeURIComponent(userCode)}`);
	if (!res.ok) return null;
	return (await res.json()) as { status: string; client_id?: string };
};

const describe = async (res: Response, fallback: string) => {
	try {
		const body = (await res.json()) as { error_description?: string };
		return body.error_description ?? fallback;
	} catch {
		return fallback;
	}
};

export const actions: Actions = {
	approve: async (event) => {
		if (!event.locals.user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		const form = await event.request.formData();
		const userCode = normalize(String(form.get('user_code') ?? ''));
		const claimed = await claim(event, userCode);
		if (!claimed) return fail(400, { message: 'That code is invalid or expired', userCode });
		const res = await authCall(event, '/device/approve', { userCode });
		if (!res.ok) return fail(400, { message: await describe(res, 'Could not approve this code'), userCode });
		return { approved: true, client: claimed.client_id ?? null };
	},
	deny: async (event) => {
		if (!event.locals.user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		const form = await event.request.formData();
		const userCode = normalize(String(form.get('user_code') ?? ''));
		await claim(event, userCode);
		const res = await authCall(event, '/device/deny', { userCode });
		if (!res.ok) return fail(400, { message: await describe(res, 'Could not deny this code'), userCode });
		return { denied: true };
	}
};
