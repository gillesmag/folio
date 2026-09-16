import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';

const server = createTestHarness({
	workers: [
		{
			configPath: './wrangler.jsonc',
			secrets: {
				BETTER_AUTH_SECRET: 'folio-test-secret-with-at-least-32-characters',
				GOOGLE_CLIENT_ID: 'test',
				GOOGLE_CLIENT_SECRET: 'test'
			}
		}
	]
});
const worker = server.getWorker<Env>();
let db: D1Database;

async function request(user: string | null, path: string, method = 'GET', body?: unknown) {
	return worker.fetch(`/api${path}`, {
		method,
		headers: {
			...(user ? { Authorization: `Bearer test-token-${user}` } : {}),
			'content-type': 'application/json'
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
}
async function json(
	user: string | null,
	path: string,
	method = 'GET',
	body?: unknown,
	status = 200
) {
	const response = await request(user, path, method, body);
	const text = await response.text();
	expect(response.status, text).toBe(status);
	return text ? JSON.parse(text) : undefined;
}

beforeAll(async () => {
	await server.listen();
	await worker.applyD1Migrations('DB');
	({ DB: db } = await worker.getEnv());
}, 60_000);
beforeEach(async () => {
	await db.prepare('DELETE FROM user').run();
	for (const user of ['alice', 'bob', 'carol', 'unverified']) {
		await db
			.prepare(
				'INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(
				user,
				user,
				`${user}@example.com`,
				user === 'unverified' ? 0 : 1,
				Date.now(),
				Date.now()
			)
			.run();
		await db
			.prepare(
				'INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(
				`session-${user}`,
				user,
				`test-token-${user}`,
				Date.now() + 86400_000,
				Date.now(),
				Date.now()
			)
			.run();
	}
}, 60_000);
afterAll(async () => {
	await server.close();
});

test('organization sharing, ownership, invitations, and Personal defaults', async () => {
	await json(null, '/organizations', 'GET', undefined, 401);
	const org = await json('alice', '/organizations', 'POST', { name: 'Acme', slug: 'acme' }, 201);
	await json('alice', '/organizations', 'POST', { name: 'Second', slug: 'second' }, 409);
	await json('bob', '/organizations', 'POST', { name: 'Duplicate', slug: 'acme' }, 409);
	await json('bob', '/organizations', 'POST', { name: 'Reserved', slug: 'personal' }, 409);
	const other = await json(
		'carol',
		'/organizations',
		'POST',
		{ name: 'Other', slug: 'other' },
		201
	);
	expect(await json('bob', '/organizations')).toEqual([]);
	await json('bob', `/organizations/${org.id}`, 'GET', undefined, 404);
	await json(
		'bob',
		`/organizations/${org.id}/invitations`,
		'POST',
		{ email: 'carol@example.com' },
		404
	);
	await json(
		'alice',
		`/organizations/${org.id}/invitations`,
		'POST',
		{ email: 'bob@example.com' },
		204
	);
	const [invitation] = await json('bob', '/organizations/invitations');
	await json('carol', `/organizations/invitations/${invitation.id}/accept`, 'POST', undefined, 404);
	await json('bob', `/organizations/invitations/${invitation.id}/accept`, 'POST', undefined, 204);
	expect(await json('bob', '/organizations/invitations')).toEqual([]);
	expect((await json('bob', '/organizations')).map((o: { id: string }) => o.id)).toEqual([org.id]);
	const bobsOrg = await json(
		'bob',
		'/organizations',
		'POST',
		{ name: 'Bob team', slug: 'bob-team' },
		201
	);
	expect((await json('bob', '/organizations')).length).toBe(2);
	await json(
		'bob',
		`/organizations/${org.id}/invitations`,
		'POST',
		{ email: 'carol@example.com' },
		403
	);
	await json(
		'alice',
		`/organizations/${org.id}/invitations`,
		'POST',
		{ email: 'bob@example.com' },
		409
	);

	const personal = await json('alice', '/documents', 'POST', { source: '# Personal' }, 201);
	expect(personal.organizationId).toBeNull();
	await json('bob', `/documents/${personal.id}`, 'GET', undefined, 404);
	const shared = await json(
		'alice',
		'/documents',
		'POST',
		{ source: '# Shared', organization: org.slug },
		201
	);
	expect(shared.organizationId).toBe(org.id);
	expect(shared.ownerId).toBe('alice');
	await json(null, `/documents/${shared.id}`, 'GET', undefined, 404);
	await json('carol', `/documents/${shared.id}`, 'GET', undefined, 404);
	await json('carol', '/documents', 'POST', { source: '# No', organization: org.id }, 404);
	await json('alice', '/documents', 'POST', { source: '# No', organization: 'missing' }, 404);
	await json('alice', `/documents/${shared.id}`, 'PATCH', { organization: other.id }, 404);
	expect((await json('bob', '/documents')).map((d: { id: string }) => d.id)).toEqual([shared.id]);
	expect((await json('bob', `/documents/${shared.id}`)).source).toBe('# Shared');
	await json('bob', `/documents/${shared.id}`, 'PATCH', { organization: bobsOrg.id }, 403);
	await json('bob', `/documents/${shared.id}`, 'PUT', { source: '# No' }, 403);
	await json('bob', `/documents/${shared.id}`, 'DELETE', undefined, 403);
	const comment = await json(
		'bob',
		`/documents/${shared.id}/comments`,
		'POST',
		{ body: 'Team feedback' },
		201
	);
	expect((await json('alice', `/documents/${shared.id}/comments`))[0].id).toBe(comment.id);
	await json('carol', `/documents/${shared.id}/comments`, 'GET', undefined, 404);
	await json('carol', `/documents/${shared.id}/comments`, 'POST', { body: 'No' }, 404);
	await json('alice', `/documents/${shared.id}`, 'PUT', { source: '# Edited' });
	expect((await json('bob', `/documents/${shared.id}`)).organizationId).toBe(org.id);
	const moved = await json('alice', `/documents/${shared.id}`, 'PATCH', {
		organization: 'personal'
	});
	expect(moved.ownerId).toBe('alice');
	expect(moved.organizationId).toBeNull();
	await json('bob', `/documents/${shared.id}`, 'GET', undefined, 404);
	await json('bob', `/documents/${shared.id}/comments`, 'GET', undefined, 404);
	await json('bob', `/comments/${comment.id}`, 'PATCH', { resolved: true }, 404);
	await json('bob', `/comments/${comment.id}`, 'DELETE', undefined, 404);
	expect(await json('bob', '/documents')).toEqual([]);
	await json('alice', `/documents/${shared.id}`, 'PATCH', { organization: org.id });
	await json('bob', `/documents/${shared.id}`);
	await json(
		'carol',
		`/organizations/${other.id}/invitations`,
		'POST',
		{ email: 'alice@example.com' },
		204
	);
	const [otherInvitation] = await json('alice', '/organizations/invitations');
	await json(
		'alice',
		`/organizations/invitations/${otherInvitation.id}/accept`,
		'POST',
		undefined,
		204
	);
	const transferred = await json('alice', `/documents/${shared.id}`, 'PATCH', {
		organization: other.slug
	});
	expect(transferred.organizationId).toBe(other.id);
	expect(transferred.ownerId).toBe('alice');
	await json('bob', `/documents/${shared.id}`, 'GET', undefined, 404);
	await json('carol', `/documents/${shared.id}`);
	await json('alice', `/documents/${shared.id}`, 'PATCH', { organization: org.id });
	await json('carol', `/documents/${shared.id}`, 'GET', undefined, 404);
	const bobDoc = await json(
		'bob',
		'/documents',
		'POST',
		{ source: '# Bob owns this', organization: org.id },
		201
	);
	await json('alice', `/documents/${bobDoc.id}`, 'PATCH', { title: 'No' }, 403);
	await json('alice', `/organizations/${org.id}/members/alice`, 'DELETE', undefined, 403);
	await json('alice', `/organizations/${org.id}/members/bob`, 'DELETE', undefined, 204);
	await json('bob', `/documents/${shared.id}`, 'GET', undefined, 404);
	expect((await json('bob', `/documents/${bobDoc.id}`)).organizationId).toBeNull();
	expect((await json('bob', `/documents/${bobDoc.id}`)).ownerId).toBe('bob');
	await json('alice', `/documents/${bobDoc.id}`, 'GET', undefined, 404);
	await json('alice', `/documents/${shared.id}`, 'PATCH', { visibility: 'unlisted' });
	await json(null, `/documents/${shared.id}`);
	await json('alice', `/documents/${shared.id}`, 'PATCH', { visibility: 'private' });
	await json(null, `/documents/${shared.id}`, 'GET', undefined, 404);
}, 60_000);

test('invitation expiry, cancellation, verified email, and self-departure', async () => {
	const org = await json('alice', '/organizations', 'POST', { name: 'Acme', slug: 'acme' }, 201);
	for (const user of ['bob', 'carol', 'unverified']) {
		await json(
			'alice',
			`/organizations/${org.id}/invitations`,
			'POST',
			{ email: `${user}@example.com` },
			204
		);
	}
	const invitations = (await json('alice', `/organizations/${org.id}`)).invitations;
	const unverified = invitations.find(
		(i: { email: string }) => i.email === 'unverified@example.com'
	);
	expect(await json('unverified', '/organizations/invitations')).toEqual([]);
	await json(
		'unverified',
		`/organizations/invitations/${unverified.id}/accept`,
		'POST',
		undefined,
		404
	);
	const bob = invitations.find((i: { email: string }) => i.email === 'bob@example.com');
	await db
		.prepare('UPDATE organization_invitation SET expiresAt = ? WHERE id = ?')
		.bind('2000-01-01T00:00:00.000Z', bob.id)
		.run();
	await json('bob', `/organizations/invitations/${bob.id}/accept`, 'POST', undefined, 404);
	await json(
		'alice',
		`/organizations/${org.id}/invitations`,
		'POST',
		{ email: 'BOB@example.com' },
		204
	);
	const [renewed] = await json('bob', '/organizations/invitations');
	await json('bob', `/organizations/invitations/${renewed.id}/accept`, 'POST', undefined, 204);
	await json('bob', `/organizations/${org.id}/members/bob`, 'DELETE', undefined, 204);
	const carol = invitations.find((i: { email: string }) => i.email === 'carol@example.com');
	await json('bob', `/organizations/invitations/${carol.id}`, 'DELETE', undefined, 404);
	await json('alice', `/organizations/invitations/${carol.id}`, 'DELETE', undefined, 204);
	await json('carol', `/organizations/invitations/${carol.id}/accept`, 'POST', undefined, 404);
});

test('concurrent organization creation still permits at most one', async () => {
	const responses = await Promise.all(
		['one', 'two'].map((slug) =>
			request('unverified', '/organizations', 'POST', { name: slug, slug })
		)
	);
	expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
});
