import { render, type Rendered } from '@folio/render';
import { Context, Effect, Layer } from 'effect';

export class Render extends Context.Service<
	Render,
	{
		render(markdown: string): Effect.Effect<Rendered>;
	}
>()('folio/api/Render') {
	static readonly layer = Layer.succeed(
		Render,
		Render.of({
			// A render failure is a bug in the pipeline, not a user error, so it is a defect.
			render: (markdown) => Effect.promise(() => render(markdown))
		})
	);
}
