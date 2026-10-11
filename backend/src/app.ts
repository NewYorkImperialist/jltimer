// jlTimer personal backup API. Platform-neutral: runs as a Cloudflare Worker (src/worker.ts)
// or under Node for local development and tests (src/dev-server.mjs, via Node's type stripping).
// Keep to erasable TypeScript (no enums, namespaces or parameter properties) so Node can run it as is.
//
// Single user. Login is a move sequence turned on jlTimer's virtual cube; the browser
// stretches it with PBKDF2 and sends only the derived key. Snapshots are gzip-compressed
// in the browser, so the API never parses or compresses large payloads (Workers free plan: 10 ms CPU).

import type { Client, InArgs, ResultSet } from '@libsql/client';
import schemaSql from './schema.ts';

// ---------- types ----------

/** Worker vars and secrets the app reads (see wrangler.toml). */
export interface Env {
	/** comma-separated list of allowed jlTimer origins */
	ALLOWED_ORIGINS?: string;
	/** HMAC key for device tokens and hashed IPs, 32+ characters */
	SESSION_SECRET?: string;
	/** one-time token for the first login setup; unset afterwards */
	SETUP_TOKEN?: string;
}

/** The only part of the libSQL client the app uses. */
export type Db = Pick<Client, 'execute'>;

export interface AppOptions {
	db: Db;
	env: Env;
	now?: () => number;
}

/** Per-request facts the platform knows and the Request doesn't carry. */
export interface RequestContext {
	ip?: string | null;
}

export interface App {
	fetch(req: Request, ctx?: RequestContext): Promise<Response>;
	migrate(): Promise<void>;
}

type JsonBody = Record<string, unknown>;
type Headers_ = Record<string, string>;

/** Login credential as sent by the browser (setup, recover, change). */
interface CredentialInput {
	salt: string;
	iterations: number;
	key: string; // hex PBKDF2 output; only its SHA-256 is stored
	fp: { salt: string; len: number; tag: number };
}

// database rows (columns as in schema.ts; integers come back as numbers)
interface CredentialRow {
	id: number;
	salt: string;
	iterations: number;
	verifier: string;
	fp_salt: string;
	fp_len: number;
	fp_tag: number;
	updated_at: number;
}

interface DeviceRow {
	id: number;
	token_hash: string;
	name: string;
	created_at: number;
	last_seen: number;
	revoked_at: number | null;
}

interface SnapshotRow {
	id: number;
	created_at: number;
	kind: SnapshotKind;
	solves: number;
	bytes: number;
	sha256: string;
	data: ArrayBuffer;
}

interface AttemptRow {
	scope: string;
	window_start: number;
	count: number;
}

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

const SNAPSHOT_KINDS = ['auto', 'manual', 'before-restore'] as const;
type SnapshotKind = typeof SNAPSHOT_KINDS[number];
const isSnapshotKind = (s: string): s is SnapshotKind => (SNAPSHOT_KINDS as readonly string[]).includes(s);
const enc = new TextEncoder();

// ---------- crypto helpers ----------
const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

async function sha256hex(data: string | Uint8Array): Promise<string> {
	return hex(await crypto.subtle.digest('SHA-256', typeof data == 'string' ? enc.encode(data) : data));
}

async function hmacHex(secret: string, msg: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function randomToken(bytes = 32): string {
	const b = crypto.getRandomValues(new Uint8Array(bytes));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomRecoveryCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
	const b = crypto.getRandomValues(new Uint8Array(10));
	const s = [...b].map(x => alphabet[x % 32]).join('');
	return s.slice(0, 5) + '-' + s.slice(5);
}

const normCode = (code: unknown): string => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function safeEqual(x: unknown, y: unknown): boolean {
	const a = String(x), b = String(y);
	let diff = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return diff === 0;
}

// ---------- validation ----------
const isHex64 = (s: unknown): s is string => typeof s == 'string' && /^[0-9a-f]{64}$/.test(s);
const isSalt = (s: unknown): s is string => typeof s == 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);
const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n == 'number' && Number.isInteger(n) && n >= lo && n <= hi;

function validCredential(body: JsonBody): body is JsonBody & CredentialInput {
	const c = body as Partial<CredentialInput>;
	return !!c && isSalt(c.salt) && c.iterations === PBKDF2_ITERATIONS && isHex64(c.key) &&
		!!c.fp && isSalt(c.fp.salt) && isInt(c.fp.len, 1, 500) && isInt(c.fp.tag, 0, 4095);
}

const deviceName = (s: unknown): string => String(s || 'device').replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) || 'device';

// ---------- app ----------
export function createApp({ db, env, now = () => Date.now() }: AppOptions): App {
	const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
	if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) {
		throw new Error('SESSION_SECRET must be set (32+ characters)');
	}
	const secret: string = env.SESSION_SECRET;
	const q = (sql: string, args: InArgs = []): Promise<ResultSet> => db.execute({ sql, args });
	/** Run a query and type its rows (the schema is ours, so the shape is known). */
	const rows = async <T>(sql: string, args: InArgs = []): Promise<T[]> => (await q(sql, args)).rows as unknown as T[];
	let ready: Promise<void> | null = null;

	function migrate(): Promise<void> {
		ready = ready || (async () => {
			const sql = schemaSql.replace(/--[^\n]*/g, ''); // the driver rejects comment-only fragments
			for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
				await q(stmt);
			}
		})();
		return ready;
	}

	function corsHeaders(origin: string | null): Headers_ {
		const h: Headers_ = {
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

	const reply = (origin: string | null, status: number, body: unknown, extra: Headers_ = {}): Response =>
		new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), ...extra } });

	async function readJson(req: Request): Promise<JsonBody | null> {
		const text = await req.text();
		if (text.length > LIMITS.maxJsonBytes) return null;
		try {
			const v = JSON.parse(text || '{}');
			return v && typeof v == 'object' && !Array.isArray(v) ? v as JsonBody : null;
		} catch {
			return null;
		}
	}

	// ----- rate limiting (failed logins) -----
	async function ipScope(ip: string | null | undefined): Promise<string> {
		return 'ip:' + (await hmacHex(secret, 'ip:' + (ip || 'unknown'))).slice(0, 32);
	}

	async function isBlocked(ip: string | null | undefined): Promise<boolean> {
		const t = now();
		const ipW = Math.floor(t / LIMITS.ipWindowMs) * LIMITS.ipWindowMs;
		const gW = Math.floor(t / LIMITS.globalWindowMs) * LIMITS.globalWindowMs;
		const r = await rows<Pick<AttemptRow, 'scope' | 'count'>>('SELECT scope, count FROM attempt WHERE (scope = ? AND window_start = ?) OR (scope = ? AND window_start = ?)',
			[await ipScope(ip), ipW, 'global', gW]);
		for (const row of r) {
			if (row.scope == 'global' ? row.count >= LIMITS.globalFails : row.count >= LIMITS.ipFails) {
				return true;
			}
		}
		return false;
	}

	async function recordFailure(ip: string | null | undefined): Promise<void> {
		const t = now();
		const ipW = Math.floor(t / LIMITS.ipWindowMs) * LIMITS.ipWindowMs;
		const gW = Math.floor(t / LIMITS.globalWindowMs) * LIMITS.globalWindowMs;
		const up = 'INSERT INTO attempt (scope, window_start, count) VALUES (?, ?, 1) ON CONFLICT(scope, window_start) DO UPDATE SET count = count + 1';
		await q(up, [await ipScope(ip), ipW]);
		await q(up, ['global', gW]);
		await q('DELETE FROM attempt WHERE window_start < ?', [t - 2 * 24 * 3600 * 1000]);
	}

	async function clearFailures(ip: string | null | undefined): Promise<void> {
		await q('DELETE FROM attempt WHERE scope = ?', [await ipScope(ip)]);
	}

	// ----- credential and devices -----
	async function getCredential(): Promise<CredentialRow | null> {
		const r = await rows<CredentialRow>('SELECT * FROM credential WHERE id = 1');
		return r[0] || null;
	}

	async function keyMatches(key: unknown): Promise<boolean> {
		const cred = await getCredential();
		return !!cred && isHex64(key) && safeEqual(await sha256hex(key), cred.verifier);
	}

	async function saveCredential(c: CredentialInput): Promise<void> {
		await q(`INSERT INTO credential (id, salt, iterations, verifier, fp_salt, fp_len, fp_tag, updated_at)
			VALUES (1, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET salt = excluded.salt, iterations = excluded.iterations, verifier = excluded.verifier,
			fp_salt = excluded.fp_salt, fp_len = excluded.fp_len, fp_tag = excluded.fp_tag, updated_at = excluded.updated_at`,
			[c.salt, c.iterations, await sha256hex(c.key), c.fp.salt, c.fp.len, c.fp.tag, now()]);
	}

	async function newRecoveryCodes(): Promise<string[]> {
		await q('DELETE FROM recovery');
		const codes: string[] = [];
		for (let i = 0; i < LIMITS.recoveryCodes; i++) {
			const code = randomRecoveryCode();
			codes.push(code);
			await q('INSERT INTO recovery (code_hash) VALUES (?)', [await sha256hex(normCode(code))]);
		}
		return codes;
	}

	async function newDevice(name: unknown): Promise<string> {
		const token = randomToken();
		const t = now();
		await q('INSERT INTO device (token_hash, name, created_at, last_seen) VALUES (?, ?, ?, ?)',
			[await hmacHex(secret, token), deviceName(name), t, t]);
		return token;
	}

	async function authDevice(req: Request): Promise<DeviceRow | null> {
		const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('Authorization') || '');
		if (!m) return null;
		const r = await rows<DeviceRow>('SELECT * FROM device WHERE token_hash = ? AND revoked_at IS NULL', [await hmacHex(secret, m[1])]);
		const dev = r[0];
		if (!dev) return null;
		if (now() - dev.last_seen > 10 * 60 * 1000) {
			await q('UPDATE device SET last_seen = ? WHERE id = ?', [now(), dev.id]);
		}
		return dev;
	}

	const revokeDevice = (id: number) => q('UPDATE device SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [now(), id]);
	const revokeAll = (exceptId?: number) => q('UPDATE device SET revoked_at = ? WHERE revoked_at IS NULL AND id != ?', [now(), exceptId || -1]);

	// ----- snapshots -----
	async function pruneSnapshots(): Promise<void> {
		const r = await rows<Pick<SnapshotRow, 'id' | 'created_at'>>('SELECT id, created_at FROM snapshot ORDER BY created_at DESC, id DESC');
		const keep = new Set<number>();
		const months = new Set<number>();
		const cutoff = now() - LIMITS.keepMonths * 31 * 24 * 3600 * 1000;
		r.forEach((row, i) => {
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
		for (const row of r) {
			if (!keep.has(row.id)) {
				await q('DELETE FROM snapshot WHERE id = ?', [row.id]);
			}
		}
	}

	// ----- routes -----
	async function route(req: Request, ctx: RequestContext): Promise<Response> {
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
		const send = (status: number, body: unknown, extra?: Headers_) => reply(origin, status, body, extra);

		if (method == 'GET' && path == '/health') {
			return send(200, { ok: true });
		}

		if (method == 'GET' && path == '/login/salt') {
			const cred = await getCredential();
			if (!cred) return send(200, { setup: true, iterations: PBKDF2_ITERATIONS });
			return send(200, { salt: cred.salt, iterations: Number(cred.iterations), fp: { salt: cred.fp_salt, len: Number(cred.fp_len), tag: Number(cred.fp_tag) } });
		}

		if (method == 'POST' && (path == '/setup' || path == '/login' || path == '/login/code' || path == '/recover')) {
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

			if (path == '/login/code') {
				// sign this device in with a one-time recovery code (e.g. a phone without a keyboard);
				// the move sequence and the other devices are left as they are
				if (!(await getCredential())) return send(404, { error: 'not set up' });
				const hash = await sha256hex(normCode(body.code));
				const c = await rows<{ code_hash: string }>('SELECT code_hash FROM recovery WHERE code_hash = ? AND used_at IS NULL', [hash]);
				if (!c[0]) {
					await recordFailure(ip);
					return send(401, { error: 'invalid' });
				}
				await q('UPDATE recovery SET used_at = ? WHERE code_hash = ?', [now(), hash]);
				await clearFailures(ip);
				const left = await rows<{ n: number }>('SELECT COUNT(*) AS n FROM recovery WHERE used_at IS NULL');
				return send(200, { token: await newDevice(body.device), codesLeft: Number(left[0].n) });
			}

			// /recover: one-time code, then a new move sequence; signs out every device
			const r = await rows<{ code_hash: string }>('SELECT code_hash FROM recovery WHERE code_hash = ? AND used_at IS NULL', [await sha256hex(normCode(body.code))]);
			if (!r[0] || !validCredential(body)) {
				await recordFailure(ip);
				return send(401, { error: 'invalid' });
			}
			await q('UPDATE recovery SET used_at = ? WHERE code_hash = ?', [now(), r[0].code_hash]);
			await saveCredential(body);
			await revokeAll();
			await clearFailures(ip);
			return send(200, { token: await newDevice(body.device) });
		}

		// everything below needs a signed-in device
		const dev = await authDevice(req);
		if (!dev) return send(401, { error: 'not signed in' });

		if (method == 'POST' && path == '/logout') {
			const body: JsonBody = await readJson(req) || {};
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
			const r = await rows<Pick<DeviceRow, 'id' | 'name' | 'created_at' | 'last_seen'>>('SELECT id, name, created_at, last_seen FROM device WHERE revoked_at IS NULL ORDER BY last_seen DESC');
			return send(200, { devices: r.map(d => ({ id: Number(d.id), name: d.name, created_at: Number(d.created_at), last_seen: Number(d.last_seen), current: d.id == dev.id })) });
		}

		let m = /^\/devices\/(\d+)\/revoke$/.exec(path);
		if (method == 'POST' && m) {
			await revokeDevice(+m[1]);
			return send(200, { ok: true });
		}

		if (method == 'POST' && path == '/snapshots') {
			const kind = url.searchParams.get('kind') || 'manual';
			const solves = parseInt(url.searchParams.get('solves') || '0', 10);
			if (!isSnapshotKind(kind) || !isInt(solves, 0, 1e8)) return send(400, { error: 'bad request' });
			const len = Number(req.headers.get('Content-Length')) || 0; // Number(null) == 0, as +null
			if (len > LIMITS.maxSnapshotBytes) return send(413, { error: 'snapshot too large' });
			const data = new Uint8Array(await req.arrayBuffer());
			if (data.length > LIMITS.maxSnapshotBytes) return send(413, { error: 'snapshot too large' });
			if (data.length < 18 || data[0] != 0x1f || data[1] != 0x8b) return send(400, { error: 'expected gzip data' });
			if (kind != 'before-restore') {
				const last = await rows<Pick<SnapshotRow, 'created_at'>>("SELECT created_at FROM snapshot WHERE kind != 'before-restore' ORDER BY created_at DESC LIMIT 1");
				if (last[0] && now() - Number(last[0].created_at) < LIMITS.uploadGapMs) {
					return send(429, { error: 'backed up less than a minute ago' });
				}
			}
			const sha = await sha256hex(data);
			const r = await rows<Pick<SnapshotRow, 'id'>>('INSERT INTO snapshot (created_at, kind, solves, bytes, sha256, data) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
				[now(), kind, solves, data.length, sha, data]);
			await pruneSnapshots();
			return send(200, { id: Number(r[0].id), sha256: sha });
		}

		if (method == 'GET' && path == '/snapshots') {
			const r = await rows<Omit<SnapshotRow, 'data'>>('SELECT id, created_at, kind, solves, bytes, sha256 FROM snapshot ORDER BY created_at DESC, id DESC');
			return send(200, { snapshots: r.map(s => ({ id: Number(s.id), created_at: Number(s.created_at), kind: s.kind, solves: Number(s.solves), bytes: Number(s.bytes), sha256: s.sha256 })) });
		}

		m = /^\/snapshots\/(\d+)$/.exec(path);
		if (method == 'GET' && m) {
			const r = await rows<Pick<SnapshotRow, 'data' | 'sha256'>>('SELECT data, sha256 FROM snapshot WHERE id = ?', [+m[1]]);
			if (!r[0]) return send(404, { error: 'not found' });
			const data: ArrayBuffer | ArrayLike<number> = r[0].data;
			return new Response(data instanceof ArrayBuffer ? data : new Uint8Array(data), {
				status: 200,
				headers: { ...corsHeaders(origin), 'Content-Type': 'application/gzip', 'X-Snapshot-Sha256': r[0].sha256, 'Access-Control-Expose-Headers': 'X-Snapshot-Sha256' },
			});
		}

		return send(404, { error: 'not found' });
	}

	async function fetch(req: Request, ctx: RequestContext = {}): Promise<Response> {
		try {
			await migrate();
			return await route(req, ctx);
		} catch (e) {
			console.error('[jltimer-api]', e && (e as Error).message);
			return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: corsHeaders(req.headers.get('Origin')) });
		}
	}

	return { fetch, migrate };
}
