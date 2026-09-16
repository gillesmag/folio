import { OrganizationNotFound, type OrganizationId, type UserId } from '@folio/contract';
import { Context, Effect, Layer } from 'effect';
import { Bindings } from './Bindings.ts';

/** Document access uses Better Auth's membership rows; organization management lives in its plugin. */
export class Organizations extends Context.Service<
	Organizations,
	{
		resolve(
			user: UserId,
			selector: string
		): Effect.Effect<OrganizationId | null, OrganizationNotFound>;
		isMember(user: UserId, id: OrganizationId): Effect.Effect<boolean>;
	}
>()('folio/api/Organizations') {
	static readonly layer = Layer.effect(
		Organizations,
		Effect.gen(function* () {
			const { DB: db } = yield* Bindings;
			const resolve = Effect.fn('Organizations.resolve')(function* (
				user: UserId,
				selector: string
			) {
				if (selector === 'personal') return null;
				const org = yield* Effect.promise(() =>
					db
						.prepare(
							`SELECT o.id FROM organization o
				JOIN member m ON m.organizationId = o.id
				WHERE m.userId = ? AND (o.id = ? OR o.slug = ?) ORDER BY (o.id = ?) DESC LIMIT 1`
						)
						.bind(user, selector, selector, selector)
						.first<{ id: OrganizationId }>()
				);
				if (!org) return yield* new OrganizationNotFound({ message: 'Organization not found' });
				return org.id;
			});
			const isMember = (user: UserId, id: OrganizationId) =>
				Effect.promise(
					async () =>
						(await db
							.prepare('SELECT 1 FROM member WHERE organizationId = ? AND userId = ?')
							.bind(id, user)
							.first()) !== null
				);
			return Organizations.of({ resolve, isMember });
		})
	);
}
