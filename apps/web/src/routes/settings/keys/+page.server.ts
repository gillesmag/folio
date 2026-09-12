import { fail, redirect } from '@sveltejs/kit';
import { authCall } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

interface ApiKeyRow {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	createdAt: string;
	expiresAt: string | null;
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	const res = await authCall(event, '/api-key/list');
	const keys = res.ok ? ((await res.json()) as ApiKeyRow[]) : [];
	return { keys };
};

export const actions: Actions = {
	create: async (event) => {
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim() || 'agent';
		const res = await authCall(event, '/api-key/create', { name });
		if (!res.ok) return fail(400, { message: 'Could not create the key' });
		const { key } = (await res.json()) as { key: string };
		return { created: key, name };
	},
	revoke: async (event) => {
		const form = await event.request.formData();
		const keyId = String(form.get('id') ?? '');
		const res = await authCall(event, '/api-key/delete', { keyId });
		if (!res.ok) return fail(400, { message: 'Could not revoke the key' });
		return { revoked: true };
	}
};
