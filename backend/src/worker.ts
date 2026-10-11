// Cloudflare Worker entry. Secrets: TURSO_URL, TURSO_TOKEN, SESSION_SECRET, SETUP_TOKEN.
// Vars: ALLOWED_ORIGINS (comma-separated, e.g. https://you.github.io).
import { createClient } from '@libsql/client/web';
import { createApp, type App, type Env } from './app.ts';

/** Bindings of this Worker: wrangler.toml vars plus `wrangler secret` secrets. */
export interface WorkerEnv extends Env {
	TURSO_URL: string;
	TURSO_TOKEN: string;
}

let app: App | null = null;

export default {
	async fetch(request, env) {
		if (!app) {
			const db = createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN });
			app = createApp({ db, env });
		}
		return app.fetch(request, { ip: request.headers.get('CF-Connecting-IP') });
	},
} satisfies ExportedHandler<WorkerEnv>;
