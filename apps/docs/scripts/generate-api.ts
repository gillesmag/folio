import { mkdir, rm, writeFile } from 'node:fs/promises';
import { Api } from '@folio/contract';
import { OpenApi } from 'effect/unstable/httpapi';
import { generateFiles } from 'fumadocs-openapi';
import { openapi } from '../lib/openapi';

const schema = OpenApi.fromApi(Api);
await mkdir('public', { recursive: true });
await writeFile('public/openapi.json', JSON.stringify(schema, null, 2) + '\n');

// This directory contains only generated pages. Remove obsolete endpoints too.
await rm('content/docs/api/endpoints', { recursive: true, force: true });
await generateFiles({
	input: openapi,
	output: 'content/docs/api/endpoints',
	per: 'operation',
	name: function (entry) {
		if (entry.type !== 'operation') throw new Error('Expected an API operation');
		const operation = this.fromExtractedOperation(entry.item)?.operation;
		if (!operation?.operationId) throw new Error('Missing operation ID');
		entry.info.title = operation.operationId;
		entry.info.description = `${entry.item.method.toUpperCase()} ${entry.item.path}`;
		return operation.operationId.replaceAll('.', '-');
	},
	includeDescription: false,
	beforeWrite(files) {
		for (const file of files) {
			file.content +=
				'\n\nCode samples use `https://example.com` as a placeholder for your Folio web origin. See [authentication and access rules](/docs/api/authentication) for required credentials.\n';
		}
	},
	addGeneratedComment: 'Generated from packages/contract. Run pnpm --filter @folio/docs generate.'
});
await writeFile(
	'content/docs/api/endpoints/meta.json',
	JSON.stringify({ title: 'Endpoints' }) + '\n'
);

// OpenAPI UI components have no plain Markdown body. Export the operation and
// every referenced schema so agents receive the same details as the website.
const markdown: Record<string, string> = {};
for (const [path, item] of Object.entries(schema.paths)) {
	for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
		const operation = item[method];
		if (!operation?.operationId) continue;
		const definitions: Record<string, unknown> = {};
		function collectRefs(value: unknown): void {
			if (!value || typeof value !== 'object') return;
			for (const [key, child] of Object.entries(value)) {
				if (
					key === '$ref' &&
					typeof child === 'string' &&
					child.startsWith('#/components/schemas/')
				) {
					const name = child.slice('#/components/schemas/'.length);
					if (!(name in definitions)) {
						const definition = schema.components.schemas[name];
						if (!definition) throw new Error(`Missing schema: ${name}`);
						definitions[name] = definition;
						collectRefs(definition);
					}
				} else collectRefs(child);
			}
		}
		collectRefs(operation);
		const url = `/docs/api/endpoints/${operation.operationId.replaceAll('.', '-')}`;
		markdown[url] =
			`# ${method.toUpperCase()} ${path}\n\nOperation: ${operation.operationId}\n\nSee [authentication and access rules](/docs/api/authentication).\n\n## Operation schema\n\n\`\`\`json\n${JSON.stringify(operation, null, 2)}\n\`\`\`\n\n## Referenced schemas\n\n\`\`\`json\n${JSON.stringify({ components: { schemas: definitions } }, null, 2)}\n\`\`\`\n`;
	}
}
await mkdir('generated', { recursive: true });
await writeFile('generated/api-markdown.json', JSON.stringify(markdown, null, 2) + '\n');
