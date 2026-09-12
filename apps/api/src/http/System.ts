import { Api } from '@folio/contract';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { requireUser } from './shared.ts';

export const SystemHandlers = HttpApiBuilder.group(
	Api,
	'system',
	Effect.fn(function* (handlers) {
		return handlers.handleAll({
			health: () => Effect.void,
			me: () => requireUser
		});
	})
);
