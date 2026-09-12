import { DocumentBody, type DocumentId } from '@folio/contract';
import { Context, Effect, Layer, Option, Schema } from 'effect';

const decode = Schema.decodeUnknownSync(Schema.toCodecJson(DocumentBody));
const encode = Schema.encodeSync(Schema.toCodecJson(DocumentBody));

/** Synthetic cache key. The host never resolves; the Cache API only needs a URL shape. */
const keyFor = (id: DocumentId, version: number) =>
	new Request(`https://folio.cache/doc/${id}/${version}`);

/**
 * The Cloudflare Cache API: a per-data-centre cache in front of R2. Entries are
 * keyed by version, so they can live for a year. Any failure degrades to a miss.
 */
export class EdgeCache extends Context.Service<
	EdgeCache,
	{
		get(id: DocumentId, version: number): Effect.Effect<Option.Option<DocumentBody>>;
		put(id: DocumentId, version: number, body: DocumentBody): Effect.Effect<void>;
	}
>()('folio/api/EdgeCache') {
	static readonly layer = Layer.succeed(
		EdgeCache,
		EdgeCache.of({
			get: (id, version) =>
				Effect.tryPromise(async () => {
					const hit = await caches.default.match(keyFor(id, version));
					if (!hit) return Option.none<DocumentBody>();
					return Option.some(decode(await hit.json()));
				}).pipe(
					Effect.catch((e) =>
						Effect.logWarning('cache read failed', e).pipe(Effect.as(Option.none<DocumentBody>()))
					),
					Effect.withSpan('EdgeCache.get')
				),
			put: (id, version, body) =>
				Effect.tryPromise(() =>
					caches.default.put(
						keyFor(id, version),
						new Response(JSON.stringify(encode(body)), {
							headers: {
								'content-type': 'application/json',
								'cache-control': 'public, max-age=31536000, immutable'
							}
						})
					)
				).pipe(
					Effect.catch((e) => Effect.logWarning('cache write failed', e)),
					Effect.withSpan('EdgeCache.put')
				)
		})
	);
}
