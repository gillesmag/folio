import { fail, redirect } from '@sveltejs/kit';
import { authClient, authData } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	const { members, invitations, ...organization } = authData(
		await authClient(event).organization.getFullOrganization({
			query: { organizationId: event.params.id }
		})
	);
	return {
		organization,
		members,
		invitations:
			organization.creatorId === event.locals.user.id
				? invitations.filter(
						(i) => i.status === 'pending' && new Date(i.expiresAt).getTime() > Date.now()
					)
				: []
	};
};

export const actions: Actions = {
	invite: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const result = await authClient(event).organization.inviteMember({
			organizationId: event.params.id,
			email,
			role: 'member',
			resend: true
		});
		if (result.error) return fail(result.error.status, { message: result.error.message });
		return { invited: email };
	},
	cancelInvitation: async (event) => {
		const form = await event.request.formData();
		const result = await authClient(event).organization.cancelInvitation({
			invitationId: String(form.get('id') ?? '')
		});
		if (result.error) return fail(result.error.status, { message: result.error.message });
		return { ok: true };
	},
	removeMember: async (event) => {
		const form = await event.request.formData();
		const result = await authClient(event).organization.removeMember({
			organizationId: event.params.id,
			memberIdOrEmail: String(form.get('memberId') ?? '')
		});
		if (result.error) return fail(result.error.status, { message: result.error.message });
		return { ok: true };
	},
	leave: async (event) => {
		const result = await authClient(event).organization.leave({ organizationId: event.params.id });
		if (result.error) return fail(result.error.status, { message: result.error.message });
		redirect(303, '/settings/organizations');
	}
};
