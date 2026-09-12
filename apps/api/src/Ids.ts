import { Effect } from 'effect';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 12 chars of base62 from the Web Crypto CSPRNG: short enough for URLs, ~71 bits of entropy. */
export const shortId = Effect.sync(() => {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	let out = '';
	for (const b of bytes) out += alphabet[b % alphabet.length];
	return out;
});
