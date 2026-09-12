import { DocumentBody, type DocumentId } from '@folio/contract';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { Bindings } from './Bindings.ts';

const key = (id: DocumentId, version: number) => `docs/${id}/${version}.json`;
const encode = Schema.encodeSync(Schema.toCodecJson(DocumentBody));
const decode = Schema.decodeUnknownSync(Schema.toCodecJson(DocumentBody));

/**
 * Document bodies in R2, one immutable object per version. The version is part
 * of the key, so a write never disturbs a reader and nothing needs purging.
 */
export class Bodies extends Context.Service<
	Bodies,
	{
		get(id: DocumentId, version: number): Effect.Effect<Option.Option<DocumentBody>>;
		put(id: DocumentId, version: number, body: DocumentBody): Effect.Effect<void>;
		/** Removes every version of a document. */
		removeAll(id: DocumentId): Effect.Effect<void>;
	}
>()('folio/api/Bodies') {
	static readonly layer = Layer.effect(
		Bodies,
		Effect.gen(function* () {
			const { DOCS } = yield* Bindings;
			return Bodies.of({
				get: (id, version) =>
					Effect.promise(async () => {
						const object = await DOCS.get(key(id, version));
						if (!object) return Option.none();
						return Option.some(decode(await object.json()));
					}).pipe(Effect.withSpan('Bodies.get')),
				put: (id, version, body) =>
					Effect.promise(async () => {
						await DOCS.put(key(id, version), JSON.stringify(encode(body)), {
							httpMetadata: { contentType: 'application/json' }
						});
					}).pipe(Effect.withSpan('Bodies.put')),
				removeAll: (id) =>
					Effect.promise(async () => {
						let cursor: string | undefined;
						do {
							const page = await DOCS.list(
								cursor ? { prefix: `docs/${id}/`, cursor } : { prefix: `docs/${id}/` }
							);
							if (page.objects.length) await DOCS.delete(page.objects.map((o) => o.key));
							cursor = page.truncated ? page.cursor : undefined;
						} while (cursor);
					}).pipe(Effect.withSpan('Bodies.removeAll'))
			});
		})
	);
}
