import { redirect } from '@sveltejs/kit';
import { authCall, forwardSetCookies } from '$lib/server/api';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const res = await authCall(event, '/sign-out', {});
		forwardSetCookies(event, res);
		redirect(303, '/');
	}
};

export const load = () => redirect(303, '/');
