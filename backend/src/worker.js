// Cloudflare Worker entry. Secrets: TURSO_URL, TURSO_TOKEN, SESSION_SECRET, SETUP_TOKEN.
// Vars: ALLOWED_ORIGINS (comma-separated, e.g. https://you.github.io).
import { createClient } from '@libsql/client/web';
import { createApp } from './app.js';

let app = null;

export default {
	async fetch(request, env) {
		if (!app) {
			const db = createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN });
			app = createApp({ db, env });
		}
		return app.fetch(request, { ip: request.headers.get('CF-Connecting-IP') });
	},
};
