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
	return worker.fetch(path, {
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
const org = (user: string, slug: string, extra = {}) =>
	json(user, '/auth/organization/create', 'POST', { name: slug, slug, ...extra });
const invite = (user: string, organizationId: string, email: string, extra = {}) =>
	json(user, '/auth/organization/invite-member', 'POST', {
		organizationId,
		email,
		role: 'member',
		...extra
	});
const accept = (user: string, invitationId: string) =>
	json(user, '/auth/organization/accept-invitation', 'POST', { invitationId });
const details = (user: string, id: string) =>
	json(user, `/auth/organization/get-full-organization?organizationId=${id}`);
const createDocument = (user: string, organization?: string) =>
	json(user, '/api/documents', 'POST', { source: '# Notes', organization }, 201);

beforeAll(async () => {
	await server.listen();
	await worker.applyD1Migrations('DB');
	({ DB: db } = await worker.getEnv());
}, 60_000);
beforeEach(async () => {
	await db.prepare('DELETE FROM user').run();
	await db.prepare('DELETE FROM rateLimit').run();
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
});
afterAll(async () => {
	await server.close();
});

test('API keys can manage organizations and upload documents to them', async () => {
	const { key } = await json('alice', '/auth/api-key/create', 'POST', { name: 'Agent' });
	const headers = { 'x-api-key': key, 'content-type': 'application/json' };
	const created = await worker.fetch('/auth/organization/create', {
		method: 'POST',
		headers,
		body: JSON.stringify({ name: 'Acme', slug: 'acme' })
	});
	expect(created.status, await created.clone().text()).toBe(200);
	const organization = (await created.json()) as { id: string; slug: string };
	const listed = await worker.fetch('/auth/organization/list', { headers });
	expect(await listed.json()).toMatchObject([{ id: organization.id }]);
	const uploaded = await worker.fetch('/api/documents', {
		method: 'POST',
		headers,
		body: JSON.stringify({ source: '# Agent notes', organization: organization.slug })
	});
	expect(uploaded.status).toBe(201);
	expect(await uploaded.json()).toMatchObject({
		ownerId: 'alice',
		organizationId: organization.id
	});
});

test('Better Auth manages membership while Folio retains document ownership and Personal defaults', async () => {
	await json(null, '/auth/organization/list', 'GET', undefined, 401);
	const acme = await org('alice', 'acme', { creatorId: 'carol' });
	expect(acme.creatorId).toBe('alice');
	expect(acme.members).toMatchObject([{ userId: 'alice', role: 'owner' }]);
	await json('alice', '/auth/organization/create', 'POST', { name: 'Second', slug: 'second' }, 403);
	await json('bob', '/auth/organization/create', 'POST', { name: 'Duplicate', slug: 'acme' }, 400);
	await json(
		'bob',
		'/auth/organization/create',
		'POST',
		{ name: 'Reserved', slug: 'personal' },
		400
	);
	await json(
		'bob',
		`/auth/organization/get-full-organization?organizationId=${acme.id}`,
		'GET',
		undefined,
		403
	);
	await accept('bob', (await invite('alice', acme.id, 'bob@example.com')).id);
	const bobsOrg = await org('bob', 'bob-team');
	expect((await json('bob', '/auth/organization/list')).length).toBe(2);
	await json(
		'bob',
		'/auth/organization/invite-member',
		'POST',
		{ organizationId: acme.id, email: 'carol@example.com', role: 'member' },
		403
	);
	await json(
		'alice',
		'/auth/organization/invite-member',
		'POST',
		{ organizationId: acme.id, email: 'carol@example.com', role: 'owner' },
		400
	);
	await json(
		'alice',
		'/auth/organization/update-member-role',
		'POST',
		{ organizationId: acme.id, memberId: acme.members[0].id, role: 'member' },
		400
	);
	await json(
		'alice',
		'/auth/organization/update',
		'POST',
		{ organizationId: acme.id, data: { creatorId: 'carol' } },
		403
	);
	await json('alice', '/auth/organization/delete', 'POST', { organizationId: acme.id }, 404);

	// Creating and accepting an organization sets an active organization in Better Auth.
	// That session setting must never become the upload destination.
	const personal = await createDocument('alice');
	expect(personal.organizationId).toBeNull();
	await json('bob', `/api/documents/${personal.id}`, 'GET', undefined, 404);
	const shared = await createDocument('alice', acme.slug);
	expect(shared.organizationId).toBe(acme.id);
	expect(shared.ownerId).toBe('alice');
	await json(null, `/api/documents/${shared.id}`, 'GET', undefined, 404);
	await json('carol', `/api/documents/${shared.id}`, 'GET', undefined, 404);
	await json('carol', '/api/documents', 'POST', { source: '# No', organization: acme.id }, 404);
	await json('alice', '/api/documents', 'POST', { source: '# No', organization: 'missing' }, 404);
	expect((await json('bob', '/api/documents')).map((d: { id: string }) => d.id)).toEqual([
		shared.id
	]);
	await json('bob', `/api/documents/${shared.id}`);
	await json('bob', `/api/documents/${shared.id}`, 'PATCH', { organization: bobsOrg.id }, 403);
	await json('bob', `/api/documents/${shared.id}`, 'PUT', { source: '# No' }, 403);
	await json('bob', `/api/documents/${shared.id}`, 'DELETE', undefined, 403);
	const comment = await json(
		'bob',
		`/api/documents/${shared.id}/comments`,
		'POST',
		{ body: 'Team feedback' },
		201
	);
	await json('carol', `/api/documents/${shared.id}/comments`, 'GET', undefined, 404);
	await json('alice', `/api/documents/${shared.id}`, 'PUT', { source: '# Edited' });
	expect((await json('bob', `/api/documents/${shared.id}`)).organizationId).toBe(acme.id);
	const moved = await json('alice', `/api/documents/${shared.id}`, 'PATCH', {
		organization: 'personal'
	});
	expect(moved.ownerId).toBe('alice');
	expect(moved.organizationId).toBeNull();
	await json('bob', `/api/documents/${shared.id}`, 'GET', undefined, 404);
	await json('bob', `/api/documents/${shared.id}/comments`, 'GET', undefined, 404);
	await json('bob', `/api/comments/${comment.id}`, 'PATCH', { resolved: true }, 404);
	await json('bob', `/api/comments/${comment.id}`, 'DELETE', undefined, 404);
	expect(await json('bob', '/api/documents')).toEqual([]);
	await accept('alice', (await invite('bob', bobsOrg.id, 'alice@example.com')).id);
	const transferred = await json('alice', `/api/documents/${shared.id}`, 'PATCH', {
		organization: bobsOrg.id
	});
	expect(transferred.ownerId).toBe('alice');
	expect(transferred.organizationId).toBe(bobsOrg.id);
	await json('alice', `/api/documents/${shared.id}`, 'PATCH', { organization: acme.id });

	const bobDoc = await createDocument('bob', acme.id);
	await json('alice', `/api/documents/${bobDoc.id}`, 'PATCH', { title: 'No' }, 403);
	await json('alice', '/auth/organization/leave', 'POST', { organizationId: acme.id }, 400);
	const bobMember = (await details('alice', acme.id)).members.find(
		(m: { userId: string }) => m.userId === 'bob'
	);
	await json('alice', '/auth/organization/remove-member', 'POST', {
		organizationId: acme.id,
		memberIdOrEmail: bobMember.id
	});
	await json('bob', `/api/documents/${shared.id}`, 'GET', undefined, 404);
	expect((await json('bob', `/api/documents/${bobDoc.id}`)).organizationId).toBeNull();
	await json('alice', `/api/documents/${bobDoc.id}`, 'GET', undefined, 404);
	await json('alice', `/api/documents/${shared.id}`, 'PATCH', { visibility: 'unlisted' });
	await json(null, `/api/documents/${shared.id}`);
	await json('alice', `/api/documents/${shared.id}`, 'PATCH', { visibility: 'private' });
	await json(null, `/api/documents/${shared.id}`, 'GET', undefined, 404);
}, 60_000);

test('native invitations enforce verified recipients, expiration, cancellation, and departure', async () => {
	const acme = await org('alice', 'acme');
	const bob = await invite('alice', acme.id, 'bob@example.com');
	const carol = await invite('alice', acme.id, 'carol@example.com');
	const unverified = await invite('alice', acme.id, 'unverified@example.com');
	await json(
		'carol',
		'/auth/organization/accept-invitation',
		'POST',
		{ invitationId: bob.id },
		403
	);
	await json('unverified', '/auth/organization/list-user-invitations', 'GET', undefined, 403);
	await json(
		'unverified',
		'/auth/organization/accept-invitation',
		'POST',
		{ invitationId: unverified.id },
		403
	);
	await db
		.prepare('UPDATE invitation SET expiresAt = ? WHERE id = ?')
		.bind(Date.now() - 1000, bob.id)
		.run();
	await json('bob', '/auth/organization/accept-invitation', 'POST', { invitationId: bob.id }, 400);
	const renewed = await invite('alice', acme.id, 'BOB@example.com', { resend: true });
	await accept('bob', renewed.id);
	expect(
		(await json('bob', '/auth/organization/list-user-invitations')).every(
			(i: { expiresAt: string }) => new Date(i.expiresAt).getTime() <= Date.now()
		)
	).toBe(true);
	const bobDoc = await createDocument('bob', acme.id);
	await json('bob', '/auth/organization/leave', 'POST', { organizationId: acme.id });
	expect((await json('bob', `/api/documents/${bobDoc.id}`)).organizationId).toBeNull();
	await json('alice', `/api/documents/${bobDoc.id}`, 'GET', undefined, 404);
	await json(
		'bob',
		'/auth/organization/cancel-invitation',
		'POST',
		{ invitationId: carol.id },
		400
	);
	await json('alice', '/auth/organization/cancel-invitation', 'POST', { invitationId: carol.id });
	await json(
		'carol',
		'/auth/organization/accept-invitation',
		'POST',
		{ invitationId: carol.id },
		400
	);
	const declined = await invite('alice', acme.id, 'carol@example.com');
	await json('carol', '/auth/organization/reject-invitation', 'POST', {
		invitationId: declined.id
	});
	expect(await json('carol', '/auth/organization/list-user-invitations')).toEqual([]);
});

test('the database enforces one creation even for concurrent plugin requests', async () => {
	const responses = await Promise.all(
		['one', 'two'].map((slug) =>
			request('alice', '/auth/organization/create', 'POST', { name: slug, slug })
		)
	);
	expect(responses.filter((r) => r.ok)).toHaveLength(1);
	expect(
		(await db.prepare("SELECT id FROM organization WHERE creatorId = 'alice'").all()).results
	).toHaveLength(1);
	expect(await json('alice', '/auth/organization/list')).toHaveLength(1);
});
