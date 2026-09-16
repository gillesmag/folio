import { fail, redirect } from '@sveltejs/kit';
import { authClient, authData } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, '/login?next=/settings/organizations');
	const orgs = authClient(event).organization;
	const [organizations, invitations] = await Promise.all([orgs.list(), orgs.listUserInvitations()]);
	const pending =
		invitations.error?.code === 'EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION'
			? []
			: authData(invitations);
	return {
		organizations: authData(organizations),
		invitations: pending.filter((i) => new Date(i.expiresAt).getTime() > Date.now())
	};
};

export const actions: Actions = {
	create: async (event) => {
		const form = await event.request.formData();
		const raw = {
			name: String(form.get('name') ?? '').trim(),
			slug: String(form.get('slug') ?? '')
				.trim()
				.toLowerCase()
		};
		const result = await authClient(event).organization.create({
			...raw,
			keepCurrentActiveOrganization: true
		});
		if (result.error) return fail(result.error.status, { message: result.error.message, ...raw });
		redirect(303, `/settings/organizations/${result.data.id}`);
	},
	accept: async (event) => {
		const form = await event.request.formData();
		const result = await authClient(event).organization.acceptInvitation({
			invitationId: String(form.get('id') ?? '')
		});
		if (result.error) return fail(result.error.status, { message: result.error.message });
		return { ok: true };
	},
	decline: async (event) => {
		const form = await event.request.formData();
		const result = await authClient(event).organization.rejectInvitation({
			invitationId: String(form.get('id') ?? '')
		});
		if (result.error) return fail(result.error.status, { message: result.error.message });
		return { ok: true };
	}
};
