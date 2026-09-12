import { fail, redirect } from '@sveltejs/kit';
import { authCall, forwardSetCookies, safeNext } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.user) redirect(303, next);
	return { next };
};

export const actions: Actions = {
	// Server-side: ask Better Auth for the Google redirect and bounce the browser there.
	google: async (event) => {
		const form = await event.request.formData();
		const res = await authCall(event, '/sign-in/social', {
			provider: 'google',
			callbackURL: safeNext(String(form.get('next') ?? '/'))
		});
		if (!res.ok) return fail(502, { message: 'Sign-in is unavailable right now' });
		const { url } = (await res.json()) as { url?: string };
		if (!url) return fail(502, { message: 'Sign-in is unavailable right now' });
		// Better Auth sets an OAuth state cookie on this response; carry it to the browser.
		forwardSetCookies(event, res);
		redirect(303, url);
	}
};
