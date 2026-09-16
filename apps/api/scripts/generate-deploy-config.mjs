import { chmod, readFile, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';

const sourceUrl = new URL('../wrangler.jsonc', import.meta.url);
const outputUrl = new URL('../wrangler.generated.json', import.meta.url);
const envUrl = new URL('../.env', import.meta.url);

try {
	loadEnvFile(envUrl);
} catch (error) {
	if (error?.code !== 'ENOENT') throw error;
}

const required = (name) => {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(
			`Missing ${name}. Set it in apps/api/.env for local deploys or in the Cloudflare build variables.`
		);
	}
	return value;
};

const databaseId = required('D1_DATABASE_ID');
if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(databaseId)) {
	throw new Error('D1_DATABASE_ID must be a UUID.');
}

const appUrlValue = required('APP_URL');
let appUrl;
try {
	appUrl = new URL(appUrlValue);
} catch {
	throw new Error('APP_URL must be an absolute URL.');
}

const localHttp =
	appUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname);
if (
	appUrl.origin !== appUrlValue ||
	(appUrl.protocol !== 'https:' && !localHttp) ||
	appUrl.username ||
	appUrl.password
) {
	throw new Error(
		'APP_URL must be an HTTPS origin without credentials, a path, or a trailing slash (HTTP is allowed for localhost).'
	);
}

const config = JSON.parse(await readFile(sourceUrl, 'utf8'));
const database = config.d1_databases?.find(({ binding }) => binding === 'DB');
if (!database) throw new Error('wrangler.jsonc is missing the DB binding.');

database.database_id = databaseId;
config.vars = { ...config.vars, APP_URL: appUrl.origin };

await writeFile(outputUrl, `${JSON.stringify(config, null, '\t')}\n`, { mode: 0o600 });
await chmod(outputUrl, 0o600);
console.log('Generated ignored deployment config: apps/api/wrangler.generated.json');
