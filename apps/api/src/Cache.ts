import { Context, Effect, Layer } from 'effect';
import { Bindings } from './Bindings.ts';

/** Thin KV wrapper for rendered documents. Failures degrade to a cache miss. */
export class Cache extends Context.Service<
	Cache,
	{
		get(key: string): Effect.Effect<string | null>;
		put(key: string, value: string): Effect.Effect<void>;
		remove(key: string): Effect.Effect<void>;
	}
>()('folio/api/Cache') {
	static readonly layer = Layer.effect(
		Cache,
		Effect.gen(function* () {
			const { CACHE } = yield* Bindings;
			const swallow = <A>(fallback: A) =>
				Effect.catch((e: unknown) => Effect.logWarning('KV failed', e).pipe(Effect.as(fallback)));
			return Cache.of({
				get: (key) => Effect.tryPromise(() => CACHE.get(key, 'text')).pipe(swallow(null)),
				put: (key, value) =>
					Effect.tryPromise(() => CACHE.put(key, value, { expirationTtl: 60 * 60 * 24 * 30 })).pipe(
						swallow(undefined)
					),
				remove: (key) => Effect.tryPromise(() => CACHE.delete(key)).pipe(swallow(undefined))
			});
		})
	);
}
