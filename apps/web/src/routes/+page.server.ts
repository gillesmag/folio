import { Effect } from 'effect';
import { client, run, toJson } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) return { documents: null, organizations: [] };
	const { documents, organizations } = await run(
		event,
		Effect.flatMap(client(event), (c) =>
			Effect.all({ documents: c.documents.list(), organizations: c.organizations.list() })
		)
	);
	return { documents: toJson.documents(documents), organizations };
};
