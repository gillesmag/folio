import {
	Conflict,
	Forbidden,
	OrganizationNotFound,
	type Invitation,
	type Organization,
	type OrganizationDetails,
	type OrganizationId,
	type OrganizationInput,
	type UserId
} from '@folio/contract';
import { Context, Effect, Layer } from 'effect';
import { Bindings } from './Bindings.ts';
import { shortId } from './Ids.ts';

type OrgError = OrganizationNotFound | Forbidden | Conflict;

export class Organizations extends Context.Service<
	Organizations,
	{
		list(user: UserId): Effect.Effect<Organization[]>;
		resolve(
			user: UserId,
			selector: string
		): Effect.Effect<OrganizationId | null, OrganizationNotFound>;
		isMember(user: UserId, id: OrganizationId): Effect.Effect<boolean>;
		create(user: UserId, input: OrganizationInput): Effect.Effect<Organization, Conflict>;
		details(
			user: UserId,
			id: OrganizationId
		): Effect.Effect<OrganizationDetails, OrganizationNotFound>;
		invitations(user: UserId): Effect.Effect<Invitation[]>;
		invite(user: UserId, id: OrganizationId, email: string): Effect.Effect<void, OrgError>;
		accept(user: UserId, id: string): Effect.Effect<void, OrganizationNotFound>;
		cancelInvitation(user: UserId, id: string): Effect.Effect<void, OrganizationNotFound>;
		removeMember(
			user: UserId,
			id: OrganizationId,
			member: UserId
		): Effect.Effect<void, OrganizationNotFound | Forbidden>;
	}
>()('folio/api/Organizations') {
	static readonly layer = Layer.effect(
		Organizations,
		Effect.gen(function* () {
			const { DB: db } = yield* Bindings;
			const missing = () =>
				new OrganizationNotFound({ message: 'Organization or invitation not found' });
			const list = (user: UserId) =>
				Effect.promise(async () => {
					const result = await db
						.prepare(
							`SELECT * FROM organization o
				WHERE creatorId = ? OR EXISTS (SELECT 1 FROM organization_member m
				WHERE m.organizationId = o.id AND m.userId = ?) ORDER BY name, id`
						)
						.bind(user, user)
						.all<Organization>();
					return result.results;
				});
			const resolve = Effect.fn('Organizations.resolve')(function* (
				user: UserId,
				selector: string
			) {
				if (selector === 'personal') return null;
				const org = (yield* list(user)).find((o) => o.id === selector || o.slug === selector);
				if (!org) return yield* missing();
				return org.id;
			});
			const isMember = (user: UserId, id: OrganizationId) =>
				Effect.map(list(user), (orgs) => orgs.some((o) => o.id === id));
			const create = Effect.fn('Organizations.create')(function* (
				user: UserId,
				input: OrganizationInput
			) {
				if (input.slug === 'personal')
					return yield* new Conflict({ message: 'The slug personal is reserved' });
				const id = `org_${yield* shortId}` as OrganizationId;
				const row = yield* Effect.promise(() =>
					db
						.prepare(
							`INSERT INTO organization (id, name, slug, creatorId)
				VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING *`
						)
						.bind(id, input.name.trim(), input.slug, user)
						.first<Organization>()
				);
				if (!row)
					return yield* new Conflict({
						message: 'You can create one organization. Its slug must be unique.'
					});
				return row;
			});
			const details = Effect.fn('Organizations.details')(function* (
				user: UserId,
				id: OrganizationId
			) {
				const organization = (yield* list(user)).find((o) => o.id === id);
				if (!organization) return yield* missing();
				return yield* Effect.promise(async () => {
					const members = await db
						.prepare(
							`SELECT id, name, email FROM user WHERE id = ?
					OR id IN (SELECT userId FROM organization_member WHERE organizationId = ?) ORDER BY name, id`
						)
						.bind(organization.creatorId, id)
						.all<OrganizationDetails['members'][number]>();
					const invitations =
						organization.creatorId === user
							? (
									await db
										.prepare(
											`SELECT i.*, o.name AS organizationName FROM organization_invitation i
						JOIN organization o ON o.id = i.organizationId WHERE o.id = ? AND i.expiresAt > ? ORDER BY i.email`
										)
										.bind(id, new Date().toISOString())
										.all<Invitation>()
								).results
							: [];
					return { organization, members: members.results, invitations };
				});
			});
			const requireCreator = Effect.fn(function* (user: UserId, id: OrganizationId) {
				const org = (yield* list(user)).find((o) => o.id === id);
				if (!org) return yield* missing();
				if (org.creatorId !== user)
					return yield* new Forbidden({
						message: 'Only the organization creator can manage members'
					});
				return org;
			});
			const invitations = (user: UserId) =>
				Effect.promise(
					async () =>
						(
							await db
								.prepare(
									`SELECT i.*, o.name AS organizationName FROM organization_invitation i
				JOIN organization o ON o.id = i.organizationId JOIN user u ON u.email = i.email COLLATE NOCASE
				WHERE u.id = ? AND u.emailVerified = 1 AND i.expiresAt > ? ORDER BY o.name`
								)
								.bind(user, new Date().toISOString())
								.all<Invitation>()
						).results
				);
			const invite = Effect.fn('Organizations.invite')(function* (
				user: UserId,
				id: OrganizationId,
				email: string
			) {
				yield* requireCreator(user, id);
				const existing = yield* details(user, id);
				if (existing.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
					return yield* new Conflict({ message: 'This person is already a member' });
				}
				const invitationId = yield* shortId;
				yield* Effect.promise(() =>
					db
						.prepare(
							`INSERT INTO organization_invitation (id, organizationId, email, expiresAt)
				VALUES (?, ?, ?, ?) ON CONFLICT (organizationId, email) DO UPDATE SET id = excluded.id, expiresAt = excluded.expiresAt`
						)
						.bind(
							invitationId,
							id,
							email.toLowerCase(),
							new Date(Date.now() + 7 * 86400_000).toISOString()
						)
						.run()
				);
			});
			const accept = Effect.fn('Organizations.accept')(function* (user: UserId, id: string) {
				const now = new Date().toISOString();
				// D1 batches are atomic. Both statements check the recipient, so a stale or stolen ID grants nothing.
				const results = yield* Effect.promise(() =>
					db.batch([
						db
							.prepare(
								`INSERT INTO organization_member (organizationId, userId)
					SELECT i.organizationId, u.id FROM organization_invitation i
					JOIN user u ON u.email = i.email COLLATE NOCASE
					WHERE i.id = ? AND u.id = ? AND u.emailVerified = 1 AND i.expiresAt > ?
					ON CONFLICT DO NOTHING`
							)
							.bind(id, user, now),
						db
							.prepare(
								`DELETE FROM organization_invitation WHERE id = ? AND email IN
					(SELECT email FROM user WHERE id = ? AND emailVerified = 1) AND expiresAt > ?`
							)
							.bind(id, user, now)
					])
				);
				if (!results[1]!.meta.changes) return yield* missing();
			});
			const cancelInvitation = Effect.fn('Organizations.cancelInvitation')(function* (
				user: UserId,
				id: string
			) {
				const result = yield* Effect.promise(() =>
					db
						.prepare(
							`DELETE FROM organization_invitation WHERE id = ? AND
				(organizationId IN (SELECT id FROM organization WHERE creatorId = ?) OR email IN
				(SELECT email FROM user WHERE id = ? AND emailVerified = 1))`
						)
						.bind(id, user, user)
						.run()
				);
				if (!result.meta.changes) return yield* missing();
			});
			const removeMember = Effect.fn('Organizations.removeMember')(function* (
				user: UserId,
				id: OrganizationId,
				member: UserId
			) {
				const org = (yield* list(user)).find((o) => o.id === id);
				if (!org) return yield* missing();
				if (member === org.creatorId)
					return yield* new Forbidden({ message: 'The creator cannot leave their organization' });
				if (user !== member) yield* requireCreator(user, id);
				// The departure trigger moves the member's documents to Personal in the same transaction.
				yield* Effect.promise(() =>
					db
						.prepare('DELETE FROM organization_member WHERE organizationId = ? AND userId = ?')
						.bind(id, member)
						.run()
				);
			});
			return Organizations.of({
				list,
				resolve,
				isMember,
				create,
				details,
				invitations,
				invite,
				accept,
				cancelInvitation,
				removeMember
			});
		})
	);
}
