import { D1Client } from '@effect/sql-d1';
import { Api } from '@folio/contract';
import { Effect, Layer } from 'effect';
import { HttpEffect, HttpRouter, HttpServer } from 'effect/unstable/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/unstable/httpapi';
import { AuthService } from './Auth.ts';
import { AuthenticationLayer } from './Authentication.ts';
import { Bindings } from './Bindings.ts';
import { Bodies } from './Bodies.ts';
import { EdgeCache } from './EdgeCache.ts';
import { Comments } from './Comments.ts';
import { Documents } from './Documents.ts';
import { CommentsHandlers } from './http/Comments.ts';
import { DocumentsHandlers } from './http/Documents.ts';
import { SystemHandlers } from './http/System.ts';
import { Render } from './Render.ts';

const ApiRoutes = HttpApiBuilder.layer(Api, { openapiPath: '/api/openapi.json' }).pipe(
	Layer.provide([DocumentsHandlers, CommentsHandlers, SystemHandlers]),
	// The middleware is resolved both by the handlers and by the router build, so it is provided last.
	Layer.provide(AuthenticationLayer)
);

const DocsRoute = HttpApiScalar.layer(Api, { path: '/api/docs' });

/** Better Auth owns everything under /auth: sign-in, callbacks, sessions, API keys, device flow. */
const AuthRoutes = HttpRouter.use((router) =>
	Effect.gen(function* () {
		const auth = yield* AuthService;
		yield* router.add(
			'*',
			'/auth/*',
			HttpEffect.fromWebHandler((request) => auth.make().handler(request))
		);
	})
);

const makeAppLayer = (env: Env) => {
	const bindings = Bindings.fromEnv(env);
	const sql = D1Client.layer({ db: env.DB }).pipe(Layer.orDie);
	const services = Layer.mergeAll(Documents.layer, Comments.layer, AuthService.layer).pipe(
		Layer.provideMerge(Layer.mergeAll(Bodies.layer, EdgeCache.layer, Render.layer, sql)),
		Layer.provideMerge(bindings)
	);
	return Layer.mergeAll(ApiRoutes, DocsRoute, AuthRoutes).pipe(
		Layer.provide(services),
		Layer.provide(HttpServer.layerServices)
	);
};

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
	fetch(request, env) {
		// Bindings are stable for the life of the isolate, so the layer graph is built once.
		handler ??= HttpRouter.toWebHandler(makeAppLayer(env)).handler;
		return handler(request);
	}
} satisfies ExportedHandler<Env>;
