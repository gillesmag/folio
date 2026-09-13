'use client';

import { createOpenAPIPage } from 'fumadocs-openapi/ui';

// API requests belong on the user's Folio origin. The docs are a static site.
export const OpenAPIPage = createOpenAPIPage({ playground: { enabled: false } });
