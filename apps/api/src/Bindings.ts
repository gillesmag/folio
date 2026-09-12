import { Context, Layer } from 'effect';

/** The Worker's bindings and vars, provided once per isolate. */
export class Bindings extends Context.Service<Bindings, Env>()('folio/api/Bindings') {
	static readonly fromEnv = (env: Env) => Layer.succeed(Bindings, env);
}
