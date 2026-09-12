import { Effect } from 'effect';
import { client, run, toJson } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) return { documents: null };
	const documents = await run(
		event,
		Effect.flatMap(client(event), (c) => c.documents.list())
	);
	return { documents: toJson.documents(documents) };
};
