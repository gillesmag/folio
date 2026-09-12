import type { User } from '@folio/contract';

declare global {
	namespace App {
		/** Plain JSON shape of the signed-in user, safe for SvelteKit's data serialization. */
		type SessionUser = typeof User.Encoded;
		interface Locals {
			user: SessionUser | null;
		}
		interface Platform {
			env?: {
				API?: Fetcher;
			};
		}
	}
}

export {};
