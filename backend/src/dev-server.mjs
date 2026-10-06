// Local development server: the same app as the Worker, with a local SQLite file instead of Turso.
// Usage: node src/dev-server.mjs   (env: PORT, DB_FILE, ALLOWED_ORIGINS, SESSION_SECRET, SETUP_TOKEN)
import http from 'node:http';
import { createClient } from '@libsql/client';
import { createApp } from './app.js';

const PORT = +(process.env.PORT || 8787);
const env = {
	ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:8090',
	SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-session-secret-change-me-0123456789',
	SETUP_TOKEN: process.env.SETUP_TOKEN || 'dev-setup',
};
const db = createClient({ url: 'file:' + (process.env.DB_FILE || 'dev.db') });
const app = createApp({ db, env });

http.createServer(async (req, res) => {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const request = new Request('http://localhost:' + PORT + req.url, {
		method: req.method,
		headers: req.headers,
		body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body,
	});
	const response = await app.fetch(request, { ip: req.socket.remoteAddress });
	res.writeHead(response.status, Object.fromEntries(response.headers));
	res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`jlTimer API (dev) on http://localhost:${PORT}  setup token: ${env.SETUP_TOKEN}`));
