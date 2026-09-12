import { defaultSchema, type Options } from 'rehype-sanitize';

/**
 * Runs before KaTeX and Shiki, so it only has to police what markdown itself can
 * produce (links, images, tables, task lists). Raw HTML is disabled at parse
 * time, so nothing else reaches this point.
 */
export const sanitizeSchema: Options = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]],
		pre: [...(defaultSchema.attributes?.pre ?? []), ['className', 'mermaid']],
		div: [...(defaultSchema.attributes?.div ?? []), ['className', /^math/]],
		span: [...(defaultSchema.attributes?.span ?? []), ['className', /^math/]],
		input: [...(defaultSchema.attributes?.input ?? []), 'checked', 'disabled', ['type', 'checkbox']]
	},
	clobberPrefix: ''
};
