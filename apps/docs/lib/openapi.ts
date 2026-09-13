import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({ input: { folio: './public/openapi.json' } });
