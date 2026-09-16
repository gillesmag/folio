import { readFileSync } from 'node:fs';
import { afterAll, expect, test } from 'vitest';
import { createTestHarness, unstable_splitSqlQuery } from 'wrangler';

const server = createTestHarness({
	workers: [
		{
			configPath: './wrangler.jsonc',
			secrets: {
				BETTER_AUTH_SECRET: 'folio-migration-test-secret-at-least-32-characters',
				GOOGLE_CLIENT_ID: 'test',
				GOOGLE_CLIENT_SECRET: 'test'
			}
		}
	]
});
afterAll(async () => {
	await server.close();
});

test('migrate existing organizations, memberships, invitations, and document assignments to Better Auth', async () => {
	await server.listen();
	const worker = server.getWorker<Env>();
	const { DB: db, DOCS } = await worker.getEnv();
	const migrate = async (name: string) => {
		const statements = unstable_splitSqlQuery(
			readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
		);
		await db.batch(statements.map((sql) => db.prepare(sql)));
	};
	for (const name of [
		'0001_init.sql',
		'0002_rate_limit.sql',
		'0003_bodies_in_r2.sql',
		'0004_organizations.sql'
	])
		await migrate(name);
	for (const user of ['owner', 'member', 'invitee']) {
		await db
			.prepare(
				'INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)'
			)
			.bind(user, user, `${user}@example.com`, Date.now(), Date.now())
			.run();
		await db
			.prepare(
				'INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(user, user, `migration-${user}`, Date.now() + 86400_000, Date.now(), Date.now())
			.run();
	}
	await db
		.prepare(
			"INSERT INTO organization (id, name, slug, creatorId) VALUES ('org_legacy', 'Legacy', 'legacy', 'owner')"
		)
		.run();
	await db
		.prepare(
			"INSERT INTO organization_member (organizationId, userId) VALUES ('org_legacy', 'member')"
		)
		.run();
	await db
		.prepare(
			"INSERT INTO organization_invitation (id, organizationId, email, expiresAt) VALUES ('legacy-invite', 'org_legacy', 'invitee@example.com', ?)"
		)
		.bind(new Date(Date.now() + 86400_000).toISOString())
		.run();
	const timestamp = new Date().toISOString();
	for (const [id, organizationId] of [
		['shared', 'org_legacy'],
		['personal', null]
	]) {
		await db
			.prepare(
				'INSERT INTO document (id, ownerId, organizationId, title, visibility, version, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
			)
			.bind(id, 'member', organizationId, id, 'private', timestamp, timestamp)
			.run();
		await DOCS.put(
			`docs/${id}/1.json`,
			JSON.stringify({
				source: '# Existing',
				html: '<h1>Existing</h1>',
				meta: { toc: [], frontmatter: {}, hasMath: false, hasMermaid: false, blockCount: 1 }
			})
		);
	}
	await migrate('0005_better_auth_organizations.sql');
	expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
	expect(
		(
			await db
				.prepare(
					"SELECT name FROM sqlite_master WHERE name IN ('organization_member', 'organization_invitation')"
				)
				.all()
		).results
	).toEqual([]);
	expect(
		(await db.prepare('SELECT userId, role FROM member ORDER BY userId').all()).results
	).toEqual([
		{ userId: 'member', role: 'member' },
		{ userId: 'owner', role: 'owner' }
	]);

	const call = async (user: string, path: string, body?: unknown) => {
		const res = await worker.fetch(path, {
			method: body === undefined ? 'GET' : 'POST',
			headers: { authorization: `Bearer migration-${user}`, 'content-type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		});
		const text = await res.text();
		expect(res.status, text).toBe(200);
		return JSON.parse(text);
	};
	expect((await call('owner', '/auth/organization/list'))[0]).toMatchObject({
		id: 'org_legacy',
		creatorId: 'owner',
		slug: 'legacy'
	});
	expect(await call('owner', '/api/documents/shared')).toMatchObject({
		ownerId: 'member',
		organizationId: 'org_legacy',
		source: '# Existing',
		version: 1
	});
	expect(await call('member', '/api/documents/personal')).toMatchObject({
		ownerId: 'member',
		organizationId: null,
		source: '# Existing'
	});
	const [invitation] = await call('invitee', '/auth/organization/list-user-invitations');
	expect(invitation.id).toBe('legacy-invite');
	await call('invitee', '/auth/organization/accept-invitation', { invitationId: invitation.id });
	await call('invitee', '/api/documents/shared');
	await call('member', '/auth/organization/leave', { organizationId: 'org_legacy' });
	expect(await call('member', '/api/documents/shared')).toMatchObject({
		ownerId: 'member',
		organizationId: null
	});
}, 60_000);
