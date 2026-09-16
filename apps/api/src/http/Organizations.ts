import { Api } from '@folio/contract';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { Organizations } from '../Organizations.ts';
import { requireUser } from './shared.ts';

export const OrganizationsHandlers = HttpApiBuilder.group(
	Api,
	'organizations',
	Effect.fn(function* (handlers) {
		const orgs = yield* Organizations;
		return handlers.handleAll({
			list: () => Effect.flatMap(requireUser, (u) => orgs.list(u.id)),
			create: ({ payload }) => Effect.flatMap(requireUser, (u) => orgs.create(u.id, payload)),
			details: ({ params }) => Effect.flatMap(requireUser, (u) => orgs.details(u.id, params.id)),
			invitations: () => Effect.flatMap(requireUser, (u) => orgs.invitations(u.id)),
			invite: ({ params, payload }) =>
				Effect.flatMap(requireUser, (u) => orgs.invite(u.id, params.id, payload.email)),
			accept: ({ params }) => Effect.flatMap(requireUser, (u) => orgs.accept(u.id, params.id)),
			cancelInvitation: ({ params }) =>
				Effect.flatMap(requireUser, (u) => orgs.cancelInvitation(u.id, params.id)),
			removeMember: ({ params }) =>
				Effect.flatMap(requireUser, (u) => orgs.removeMember(u.id, params.id, params.userId))
		});
	})
);
