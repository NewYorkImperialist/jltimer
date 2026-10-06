// jlTimer personal backup API. Platform-neutral: runs as a Cloudflare Worker (src/worker.js)
// or under Node for local development and tests (src/dev-server.mjs).
//
// Single user. Login is a move sequence turned on jlTimer's virtual cube; the browser
// stretches it with PBKDF2 and sends only the derived key. Snapshots are gzip-compressed
// in the browser, so the API never parses or compresses large payloads (Workers free plan: 10 ms CPU).

import schemaSql from './schema.js';

export const PBKDF2_ITERATIONS = 600000;

export const LIMITS = {
	ipFails: 5, // failed logins per IP per window
	ipWindowMs: 15 * 60 * 1000,
	globalFails: 50, // failed logins from everywhere per window
	globalWindowMs: 60 * 60 * 1000,
	maxSnapshotBytes: 10 * 1024 * 1024, // compressed
	maxJsonBytes: 16 * 1024,
	uploadGapMs: 60 * 1000,
	keepNewest: 30,
	keepMonths: 12,
	recoveryCodes: 8,
};

const SNAPSHOT_KINDS = ['auto', 'manual', 'before-restore'];
const enc = new TextEncoder();

// ---------- crypto helpers ----------
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

async function sha256hex(data) {
	return hex(await crypto.subtle.digest('SHA-256', typeof data == 'string' ? enc.encode(data) : data));
}

async function hmacHex(secret, msg) {
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function randomToken(bytes = 32) {
	const b = crypto.getRandomValues(new Uint8Array(bytes));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomRecoveryCode() {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
	const b = crypto.getRandomValues(new Uint8Array(10));
	const s = [...b].map(x => alphabet[x % 32]).join('');
	return s.slice(0, 5) + '-' + s.slice(5);
}

const normCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function safeEqual(a, b) {
	a = String(a); b = String(b);
	let diff = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return diff === 0;
}

// ---------- validation ----------
const isHex64 = s => typeof s == 'string' && /^[0-9a-f]{64}$/.test(s);
const isSalt = s => typeof s == 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

function validCredential(c) {
	return c && isSalt(c.salt) && c.iterations === PBKDF2_ITERATIONS && isHex64(c.key) &&
		c.fp && isSalt(c.fp.salt) && isInt(c.fp.len, 1, 500) && isInt(c.fp.tag, 0, 4095);
}

const deviceName = s => String(s || 'device').replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) || 'device';

// ---------- app ----------
export function createApp({ db, env, now = () => Date.now() }) {
	const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
	if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) {
		throw new Error('SESSION_SECRET must be set (32+ characters)');
	}
	const q = (sql, args = []) => db.execute({ sql, args });
	let ready = null;

	function migrate() {
		ready = ready || (async () => {
			const sql = schemaSql.replace(/--[^\n]*/g, ''); // the driver rejects comment-only fragments
			for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
				await q(stmt);
			}
		})();
		return ready;
	}

	function corsHeaders(origin) {
		const h = {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff',
		};
		if (origin && allowed.includes(origin)) {
			Object.assign(h, {
				'Access-Control-Allow-Origin': origin,
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Authorization, Content-Type',
				'Access-Control-Max-Age': '600',
				'Vary': 'Origin',
			});
		}
		return h;
	}

	const reply = (origin, status, body, extra = {}) =>
		new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), ...extra } });

	async function readJson(req) {
		const text = await req.text();
		if (text.length > LIMITS.maxJsonBytes) return null;
		try {
			const v = JSON.parse(text || '{}');
			return v && typeof v == 'object' && !Array.isArray(v) ? v : null;
		} catch (e) {
			return null;
		}
	}

	// ----- rate limiting (failed logins) -----
	async function ipScope(ip) {
		return 'ip:' + (await hmacHex(env.SESSION_SECRET, 'ip:' + (ip || 'unknown'))).slice(0, 32);
	}

	async function isBlocked(ip) {
		const t = now();
		const ipW = Math.floor(t / LIMITS.ipWindowMs) * LIMITS.ipWindowMs;
		const gW = Math.floor(t / LIMITS.globalWindowMs) * LIMITS.globalWindowMs;
		const r = await q('SELECT scope, count FROM attempt WHERE (scope = ? AND window_start = ?) OR (scope = ? AND window_start = ?)',
			[await ipScope(ip), ipW, 'global', gW]);
		for (const row of r.rows) {
			if (row.scope == 'global' ? row.count >= LIMITS.globalFails : row.count >= LIMITS.ipFails) {
				return true;
			}
		}
		return false;
	}

	async function recordFailure(ip) {
		const t = now();
		const ipW = Math.floor(t / LIMITS.ipWindowMs) * LIMITS.ipWindowMs;
		const gW = Math.floor(t / LIMITS.globalWindowMs) * LIMITS.globalWindowMs;
		const up = 'INSERT INTO attempt (scope, window_start, count) VALUES (?, ?, 1) ON CONFLICT(scope, window_start) DO UPDATE SET count = count + 1';
		await q(up, [await ipScope(ip), ipW]);
		await q(up, ['global', gW]);
		await q('DELETE FROM attempt WHERE window_start < ?', [t - 2 * 24 * 3600 * 1000]);
	}

	async function clearFailures(ip) {
		await q('DELETE FROM attempt WHERE scope = ?', [await ipScope(ip)]);
	}

	// ----- credential and devices -----
	async function getCredential() {
		const r = await q('SELECT * FROM credential WHERE id = 1');
		return r.rows[0] || null;
	}

	async function keyMatches(key) {
		const cred = await getCredential();
		return !!cred && isHex64(key) && safeEqual(await sha256hex(key), cred.verifier);
	}

	async function saveCredential(c) {
		await q(`INSERT INTO credential (id, salt, iterations, verifier, fp_salt, fp_len, fp_tag, updated_at)
			VALUES (1, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET salt = excluded.salt, iterations = excluded.iterations, verifier = excluded.verifier,
			fp_salt = excluded.fp_salt, fp_len = excluded.fp_len, fp_tag = excluded.fp_tag, updated_at = excluded.updated_at`,
			[c.salt, c.iterations, await sha256hex(c.key), c.fp.salt, c.fp.len, c.fp.tag, now()]);
	}

	async function newRecoveryCodes() {
		await q('DELETE FROM recovery');
		const codes = [];
		for (let i = 0; i < LIMITS.recoveryCodes; i++) {
			const code = randomRecoveryCode();
			codes.push(code);
			await q('INSERT INTO recovery (code_hash) VALUES (?)', [await sha256hex(normCode(code))]);
		}
		return codes;
	}

	async function newDevice(name) {
		const token = randomToken();
		const t = now();
		await q('INSERT INTO device (token_hash, name, created_at, last_seen) VALUES (?, ?, ?, ?)',
			[await hmacHex(env.SESSION_SECRET, token), deviceName(name), t, t]);
		return token;
	}

	async function authDevice(req) {
		const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('Authorization') || '');
		if (!m) return null;
		const r = await q('SELECT * FROM device WHERE token_hash = ? AND revoked_at IS NULL', [await hmacHex(env.SESSION_SECRET, m[1])]);
		const dev = r.rows[0];
		if (!dev) return null;
		if (now() - dev.last_seen > 10 * 60 * 1000) {
			await q('UPDATE device SET last_seen = ? WHERE id = ?', [now(), dev.id]);
		}
		return dev;
	}

	const revokeDevice = id => q('UPDATE device SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [now(), id]);
	const revokeAll = exceptId => q('UPDATE device SET revoked_at = ? WHERE revoked_at IS NULL AND id != ?', [now(), exceptId || -1]);

	// ----- snapshots -----
	async function pruneSnapshots() {
		const r = await q('SELECT id, created_at FROM snapshot ORDER BY created_at DESC, id DESC');
		const keep = new Set();
		const months = new Set();
		const cutoff = now() - LIMITS.keepMonths * 31 * 24 * 3600 * 1000;
		r.rows.forEach((row, i) => {
			if (i < LIMITS.keepNewest) {
				keep.add(row.id);
				return;
			}
			const d = new Date(Number(row.created_at));
			const month = d.getUTCFullYear() * 12 + d.getUTCMonth();
			if (row.created_at >= cutoff && !months.has(month)) { // newest remaining snapshot of each month
				months.add(month);
				keep.add(row.id);
			}
		});
		for (const row of r.rows) {
			if (!keep.has(row.id)) {
				await q('DELETE FROM snapshot WHERE id = ?', [row.id]);
			}
		}
	}

	// ----- routes -----
	async function route(req, ctx) {
		const url = new URL(req.url);
		const path = url.pathname.replace(/\/+$/, '') || '/';
		const origin = req.headers.get('Origin');
		const method = req.method;
		const ip = ctx.ip;

		if (origin && !allowed.includes(origin)) {
			return reply(null, 403, { error: 'origin not allowed' });
		}
		if (method == 'OPTIONS') {
			const h = corsHeaders(origin);
			delete h['Content-Type'];
			return new Response(null, { status: 204, headers: h });
		}
		const send = (status, body, extra) => reply(origin, status, body, extra);

		if (method == 'GET' && path == '/health') {
			return send(200, { ok: true });
		}

		if (method == 'GET' && path == '/login/salt') {
			const cred = await getCredential();
			if (!cred) return send(200, { setup: true, iterations: PBKDF2_ITERATIONS });
			return send(200, { salt: cred.salt, iterations: Number(cred.iterations), fp: { salt: cred.fp_salt, len: Number(cred.fp_len), tag: Number(cred.fp_tag) } });
		}

		if (method == 'POST' && (path == '/setup' || path == '/login' || path == '/recover')) {
			if (await isBlocked(ip)) {
				return send(429, { error: 'too many attempts, try again later' });
			}
			const body = await readJson(req);
			if (!body) return send(400, { error: 'bad request' });

			if (path == '/setup') {
				if (!env.SETUP_TOKEN || !safeEqual(body.setupToken || '', env.SETUP_TOKEN)) {
					await recordFailure(ip);
					return send(401, { error: 'invalid' });
				}
				if (await getCredential()) return send(409, { error: 'already set up' });
				if (!validCredential(body)) return send(400, { error: 'bad credential' });
				await saveCredential(body);
				const recoveryCodes = await newRecoveryCodes();
				return send(200, { token: await newDevice(body.device), recoveryCodes });
			}

			if (path == '/login') {
				if (!(await getCredential())) return send(404, { error: 'not set up' });
				if (!(await keyMatches(body.key))) {
					await recordFailure(ip);
					return send(401, { error: 'invalid' });
				}
				await clearFailures(ip);
				return send(200, { token: await newDevice(body.device) });
			}

			// /recover: one-time code, then a new move sequence; signs out every device
			const r = await q('SELECT code_hash FROM recovery WHERE code_hash = ? AND used_at IS NULL', [await sha256hex(normCode(body.code))]);
			if (!r.rows[0] || !validCredential(body)) {
				await recordFailure(ip);
				return send(401, { error: 'invalid' });
			}
			await q('UPDATE recovery SET used_at = ? WHERE code_hash = ?', [now(), r.rows[0].code_hash]);
			await saveCredential(body);
			await revokeAll();
			await clearFailures(ip);
			return send(200, { token: await newDevice(body.device) });
		}

		// everything below needs a signed-in device
		const dev = await authDevice(req);
		if (!dev) return send(401, { error: 'not signed in' });

		if (method == 'POST' && path == '/logout') {
			const body = await readJson(req) || {};
			if (body.key !== undefined) { // logout by gesture: the sequence must match
				if (await isBlocked(ip)) return send(429, { error: 'too many attempts, try again later' });
				if (!(await keyMatches(body.key))) {
					await recordFailure(ip);
					return send(401, { error: 'invalid' });
				}
			}
			await revokeDevice(dev.id);
			return send(200, { ok: true });
		}

		if (method == 'POST' && path == '/credential') {
			const body = await readJson(req);
			if (await isBlocked(ip)) return send(429, { error: 'too many attempts, try again later' });
			if (!body || !(await keyMatches(body.currentKey))) { // a stolen device token alone can't change the login
				await recordFailure(ip);
				return send(401, { error: 'invalid' });
			}
			if (!validCredential(body)) return send(400, { error: 'bad credential' });
			await saveCredential(body);
			await revokeAll(dev.id);
			return send(200, { ok: true, recoveryCodes: await newRecoveryCodes() });
		}

		if (method == 'GET' && path == '/devices') {
			const r = await q('SELECT id, name, created_at, last_seen FROM device WHERE revoked_at IS NULL ORDER BY last_seen DESC');
			return send(200, { devices: r.rows.map(d => ({ id: Number(d.id), name: d.name, created_at: Number(d.created_at), last_seen: Number(d.last_seen), current: d.id == dev.id })) });
		}

		let m = /^\/devices\/(\d+)\/revoke$/.exec(path);
		if (method == 'POST' && m) {
			await revokeDevice(+m[1]);
			return send(200, { ok: true });
		}

		if (method == 'POST' && path == '/snapshots') {
			const kind = url.searchParams.get('kind') || 'manual';
			const solves = parseInt(url.searchParams.get('solves') || '0', 10);
			if (!SNAPSHOT_KINDS.includes(kind) || !isInt(solves, 0, 1e8)) return send(400, { error: 'bad request' });
			const len = +req.headers.get('Content-Length') || 0;
			if (len > LIMITS.maxSnapshotBytes) return send(413, { error: 'snapshot too large' });
			const data = new Uint8Array(await req.arrayBuffer());
			if (data.length > LIMITS.maxSnapshotBytes) return send(413, { error: 'snapshot too large' });
			if (data.length < 18 || data[0] != 0x1f || data[1] != 0x8b) return send(400, { error: 'expected gzip data' });
			if (kind != 'before-restore') {
				const last = await q("SELECT created_at FROM snapshot WHERE kind != 'before-restore' ORDER BY created_at DESC LIMIT 1");
				if (last.rows[0] && now() - Number(last.rows[0].created_at) < LIMITS.uploadGapMs) {
					return send(429, { error: 'backed up less than a minute ago' });
				}
			}
			const sha = await sha256hex(data);
			const r = await q('INSERT INTO snapshot (created_at, kind, solves, bytes, sha256, data) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
				[now(), kind, solves, data.length, sha, data]);
			await pruneSnapshots();
			return send(200, { id: Number(r.rows[0].id), sha256: sha });
		}

		if (method == 'GET' && path == '/snapshots') {
			const r = await q('SELECT id, created_at, kind, solves, bytes, sha256 FROM snapshot ORDER BY created_at DESC, id DESC');
			return send(200, { snapshots: r.rows.map(s => ({ id: Number(s.id), created_at: Number(s.created_at), kind: s.kind, solves: Number(s.solves), bytes: Number(s.bytes), sha256: s.sha256 })) });
		}

		m = /^\/snapshots\/(\d+)$/.exec(path);
		if (method == 'GET' && m) {
			const r = await q('SELECT data, sha256 FROM snapshot WHERE id = ?', [+m[1]]);
			if (!r.rows[0]) return send(404, { error: 'not found' });
			const data = r.rows[0].data;
			return new Response(data instanceof ArrayBuffer ? data : new Uint8Array(data), {
				status: 200,
				headers: { ...corsHeaders(origin), 'Content-Type': 'application/gzip', 'X-Snapshot-Sha256': r.rows[0].sha256, 'Access-Control-Expose-Headers': 'X-Snapshot-Sha256' },
			});
		}

		return send(404, { error: 'not found' });
	}

	async function fetch(req, ctx = {}) {
		try {
			await migrate();
			return await route(req, ctx);
		} catch (e) {
			console.error('[jltimer-api]', e && e.message);
			return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: corsHeaders(req.headers.get('Origin')) });
		}
	}

	return { fetch, migrate };
}
