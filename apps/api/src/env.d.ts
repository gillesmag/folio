// Secrets are not declared in wrangler.jsonc, so extend the generated Env here.
interface Env {
	BETTER_AUTH_SECRET: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
}
