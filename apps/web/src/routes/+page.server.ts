import { Effect } from 'effect';
import { client, run, toJson } from '$lib/server/api';
import { authClient, authData } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) return { documents: null, organizations: [] };
	const [documents, organizations] = await Promise.all([
		run(
			event,
			Effect.flatMap(client(event), (c) => c.documents.list())
		),
		authClient(event).organization.list()
	]);
	return { documents: toJson.documents(documents), organizations: authData(organizations) };
};
