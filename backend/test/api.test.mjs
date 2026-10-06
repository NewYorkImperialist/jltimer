// End-to-end tests of the backup API, including an attack checklist.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { gzipSync } from 'node:zlib';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, LIMITS, PBKDF2_ITERATIONS } from '../src/app.js';

const ORIGIN = 'https://jl.example';
const enc = new TextEncoder();

function setup() {
	const dir = mkdtempSync(join(tmpdir(), 'jltapi-'));
	const db = createClient({ url: 'file:' + join(dir, 't.db') });
	const clock = { t: Date.UTC(2026, 9, 5, 12) };
	const app = createApp({
		db, now: () => clock.t,
		env: { ALLOWED_ORIGINS: ORIGIN, SESSION_SECRET: 'test-secret-0123456789-0123456789-abcdef', SETUP_TOKEN: 'setup-123' },
	});
	async function call(method, path, { body, token, origin = ORIGIN, ip = '1.1.1.1', raw, headers = {} } = {}) {
		const h = { ...headers };
		if (origin) h.Origin = origin;
		if (token) h.Authorization = 'Bearer ' + token;
		let b;
		if (raw) { b = raw; h['Content-Type'] = 'application/octet-stream'; h['Content-Length'] = String(raw.length); }
		else if (body !== undefined) { b = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
		const res = await app.fetch(new Request('https://api.test' + path, { method, headers: h, body: b }), { ip });
		const ct = res.headers.get('Content-Type') || '';
		if (res.status == 204) return { status: 204, headers: res.headers, body: null };
		return { status: res.status, headers: res.headers, body: ct.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
	}
	return { app, call, clock };
}

// what the browser does: PBKDF2(normalized moves, salt)
const keyCache = new Map();
async function deriveKey(moves, salt) {
	const id = moves + '|' + salt;
	if (keyCache.has(id)) return keyCache.get(id);
	const base = await crypto.subtle.importKey('raw', enc.encode(moves), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS }, base, 256);
	const key = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
	keyCache.set(id, key);
	return key;
}

const ALG = "R U R' F2 D L' B U2 R' D' F L2 B' U R D2";
const ALG2 = "F R U' L2 D B' R2 U F' L D2 B U' R' F2 D'";
const SALT = 'salt_salt_salt_salt1';
const SALT2 = 'salt_salt_salt_salt2';
const FP = { salt: 'fpsalt_fpsalt_fpsalt', len: 16, tag: 1234 };

async function credential(moves = ALG, salt = SALT) {
	return { salt, iterations: PBKDF2_ITERATIONS, key: await deriveKey(moves, salt), fp: FP };
}

async function setUp(call) {
	const r = await call('POST', '/setup', { body: { setupToken: 'setup-123', device: 'laptop', ...(await credential()) } });
	assert.equal(r.status, 200, JSON.stringify(r.body));
	return r.body;
}

const gz = s => new Uint8Array(gzipSync(Buffer.from(s)));

test('health and CORS', async () => {
	const { call } = setup();
	const ok = await call('GET', '/health');
	assert.equal(ok.status, 200);
	assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
	const pre = await call('OPTIONS', '/login');
	assert.equal(pre.status, 204);
	assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
	const evil = await call('GET', '/health', { origin: 'https://evil.example' });
	assert.equal(evil.status, 403, 'other websites are refused');
	assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);
});

test('setup: needs the setup token, only once', async () => {
	const { call } = setup();
	assert.deepEqual((await call('GET', '/login/salt')).body.setup, true);
	const bad = await call('POST', '/setup', { body: { setupToken: 'wrong', ...(await credential()) } });
	assert.equal(bad.status, 401);
	const first = await setUp(call);
	assert.equal(first.recoveryCodes.length, LIMITS.recoveryCodes);
	assert.match(first.recoveryCodes[0], /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
	const again = await call('POST', '/setup', { body: { setupToken: 'setup-123', ...(await credential(ALG2)) } });
	assert.equal(again.status, 409, 'cannot take over an existing login');
	const salt = (await call('GET', '/login/salt')).body;
	assert.equal(salt.salt, SALT);
	assert.deepEqual(salt.fp, FP);
	assert.equal(salt.verifier, undefined, 'verifier is never exposed');
});

test('login with the right moves, refuse wrong ones', async () => {
	const { call } = setup();
	await setUp(call);
	const wrong = await call('POST', '/login', { body: { key: await deriveKey(ALG2, SALT) } });
	assert.equal(wrong.status, 401);
	const right = await call('POST', '/login', { body: { key: await deriveKey(ALG, SALT), device: 'phone' } });
	assert.equal(right.status, 200);
	const devs = await call('GET', '/devices', { token: right.body.token });
	assert.equal(devs.status, 200);
	assert.equal(devs.body.devices.length, 2);
	assert.ok(devs.body.devices.find(d => d.current && d.name == 'phone'));
});

test('attack: brute force is locked out per IP, then globally', async () => {
	const { call, clock } = setup();
	await setUp(call);
	const wrong = { key: 'a'.repeat(64) };
	for (let i = 0; i < LIMITS.ipFails; i++) assert.equal((await call('POST', '/login', { body: wrong })).status, 401);
	const right = { key: await deriveKey(ALG, SALT) };
	assert.equal((await call('POST', '/login', { body: right })).status, 429, 'locked even with the right key');
	assert.equal((await call('POST', '/login', { body: right, ip: '2.2.2.2' })).status, 200, 'other IPs unaffected');
	clock.t += LIMITS.ipWindowMs;
	assert.equal((await call('POST', '/login', { body: right })).status, 200, 'unlocks after the window');
	// global cap across many IPs
	clock.t += LIMITS.globalWindowMs;
	for (let i = 0; i < LIMITS.globalFails; i++) await call('POST', '/login', { body: wrong, ip: '10.0.' + (i >> 2) + '.' + i });
	assert.equal((await call('POST', '/login', { body: right, ip: '9.9.9.9' })).status, 429, 'global lockout');
});

test('attack: bad and revoked tokens are refused', async () => {
	const { call } = setup();
	const { token } = await setUp(call);
	assert.equal((await call('GET', '/snapshots')).status, 401, 'no token');
	assert.equal((await call('GET', '/snapshots', { token: 'x'.repeat(43) })).status, 401, 'made-up token');
	assert.equal((await call('GET', '/snapshots', { headers: { Authorization: "Bearer ' OR 1=1 --" } })).status, 401, 'injection in header');
	assert.equal((await call('GET', '/snapshots', { token })).status, 200);
	assert.equal((await call('POST', '/logout', { token, body: {} })).status, 200);
	assert.equal((await call('GET', '/snapshots', { token })).status, 401, 'revoked after logout');
});

test('logout by gesture requires the right moves', async () => {
	const { call } = setup();
	const { token } = await setUp(call);
	assert.equal((await call('POST', '/logout', { token, body: { key: await deriveKey(ALG2, SALT) } })).status, 401);
	assert.equal((await call('GET', '/devices', { token })).status, 200, 'still signed in after a wrong gesture');
	assert.equal((await call('POST', '/logout', { token, body: { key: await deriveKey(ALG, SALT) } })).status, 200);
	assert.equal((await call('GET', '/devices', { token })).status, 401);
});

test('changing the login needs the current moves, signs out other devices', async () => {
	const { call } = setup();
	const { token: a } = await setUp(call);
	const b = (await call('POST', '/login', { body: { key: await deriveKey(ALG, SALT) } })).body.token;
	const next = await credential(ALG2, SALT2);
	const stolen = await call('POST', '/credential', { token: b, body: { ...next, currentKey: 'b'.repeat(64) } });
	assert.equal(stolen.status, 401, 'a stolen device token alone cannot change the login');
	const ok = await call('POST', '/credential', { token: a, body: { ...next, currentKey: await deriveKey(ALG, SALT) } });
	assert.equal(ok.status, 200);
	assert.equal(ok.body.recoveryCodes.length, LIMITS.recoveryCodes);
	assert.equal((await call('GET', '/devices', { token: b })).status, 401, 'other device signed out');
	assert.equal((await call('GET', '/devices', { token: a })).status, 200, 'this device stays signed in');
	assert.equal((await call('POST', '/login', { body: { key: await deriveKey(ALG, SALT) } })).status, 401, 'old moves no longer work');
	assert.equal((await call('POST', '/login', { body: { key: await deriveKey(ALG2, SALT2) } })).status, 200);
});

test('recovery code: one use, resets the login, signs everything out', async () => {
	const { call } = setup();
	const { token, recoveryCodes } = await setUp(call);
	const next = await credential(ALG2, SALT2);
	assert.equal((await call('POST', '/recover', { body: { code: 'AAAAA-AAAAA', ...next } })).status, 401);
	const ok = await call('POST', '/recover', { body: { code: recoveryCodes[3].toLowerCase(), ...next } });
	assert.equal(ok.status, 200);
	assert.equal((await call('GET', '/devices', { token })).status, 401, 'old devices signed out');
	assert.equal((await call('GET', '/devices', { token: ok.body.token })).status, 200);
	assert.equal((await call('POST', '/recover', { body: { code: recoveryCodes[3], ...next } })).status, 401, 'code is single-use');
	assert.equal((await call('POST', '/login', { body: { key: await deriveKey(ALG2, SALT2) } })).status, 200);
});

test('snapshots: upload, list, download, limits', async () => {
	const { call, clock } = setup();
	const { token } = await setUp(call);
	const exportJson = JSON.stringify({ session1: [[[0, 12340], "R U R' U'", '', 1759665600, ["R@0 U@100", '333']]], properties: { sessionData: '{}' } });
	const data = gz(exportJson);
	assert.equal((await call('POST', '/snapshots?kind=auto&solves=1', { raw: data })).status, 401, 'needs sign-in');
	assert.equal((await call('POST', '/snapshots?kind=auto&solves=1', { token, raw: enc.encode('not gzip at all, plain text') })).status, 400);
	assert.equal((await call('POST', '/snapshots?kind=evil&solves=1', { token, raw: data })).status, 400);
	const big = new Uint8Array(LIMITS.maxSnapshotBytes + 1); big[0] = 0x1f; big[1] = 0x8b;
	assert.equal((await call('POST', '/snapshots?kind=manual&solves=1', { token, raw: big })).status, 413);
	const up = await call('POST', '/snapshots?kind=manual&solves=1', { token, raw: data });
	assert.equal(up.status, 200);
	assert.equal((await call('POST', '/snapshots?kind=auto&solves=1', { token, raw: data })).status, 429, 'one upload per minute');
	assert.equal((await call('POST', '/snapshots?kind=before-restore&solves=1', { token, raw: data })).status, 200, 'before-restore always allowed');
	clock.t += LIMITS.uploadGapMs;
	assert.equal((await call('POST', '/snapshots?kind=auto&solves=2', { token, raw: data })).status, 200);
	const list = await call('GET', '/snapshots', { token });
	assert.equal(list.body.snapshots.length, 3);
	assert.equal(list.body.snapshots[0].solves, 2, 'newest first');
	const dl = await call('GET', '/snapshots/' + up.body.id, { token });
	assert.equal(dl.status, 200);
	assert.deepEqual(dl.body, data, 'downloaded bytes are identical');
	assert.equal(dl.headers.get('X-Snapshot-Sha256'), up.body.sha256);
	assert.equal((await call('GET', '/snapshots/99999', { token })).status, 404);
	assert.equal((await call('GET', "/snapshots/1%20OR%201=1", { token })).status, 404, 'injection in path');
});

test('snapshots: pruning keeps newest 30 plus one per month', async () => {
	const { call, clock } = setup();
	const { token } = await setUp(call);
	const data = gz('{}');
	const start = clock.t;
	// one snapshot every 10 days for ~400 days, then 40 more within a day
	for (let i = 0; i < 40; i++) {
		clock.t = start + i * 10 * 24 * 3600 * 1000;
		assert.equal((await call('POST', '/snapshots?kind=auto&solves=' + i, { token, raw: data })).status, 200);
	}
	for (let i = 0; i < 40; i++) {
		clock.t += LIMITS.uploadGapMs;
		await call('POST', '/snapshots?kind=auto&solves=' + (100 + i), { token, raw: data });
	}
	const snaps = (await call('GET', '/snapshots', { token })).body.snapshots;
	const newest = snaps.slice(0, 30);
	assert.ok(newest.every(s => s.solves >= 110), 'newest 30 kept');
	const older = snaps.slice(30);
	const months = new Set(older.map(s => { const d = new Date(s.created_at); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }));
	assert.equal(months.size, older.length, 'at most one older snapshot per month');
	assert.ok(older.length >= 10 && older.length <= 13, 'about a year of monthly snapshots: ' + older.length);
});

test('attack: oversized or malformed JSON bodies', async () => {
	const { call } = setup();
	await setUp(call);
	const huge = { key: 'a'.repeat(64), pad: 'x'.repeat(LIMITS.maxJsonBytes) };
	assert.equal((await call('POST', '/login', { body: huge })).status, 400);
	const res = await call('POST', '/login', { headers: { 'Content-Type': 'application/json' }, raw: enc.encode('{not json') });
	assert.equal(res.status, 400);
	const sneaky = await call('POST', '/login', { body: { key: "' OR '1'='1" } });
	assert.equal(sneaky.status, 401, 'injection string is just a wrong key');
	const r = await call('POST', '/login', { body: { key: await deriveKey(ALG, SALT), device: "<script>x</script>'); DROP TABLE device;--" } });
	assert.equal(r.status, 200);
	const devs = await call('GET', '/devices', { token: r.body.token });
	assert.ok(devs.body.devices.every(d => !/[<>]/.test(d.name)), 'device names are sanitized');
});

test('startup refuses a weak session secret', () => {
	assert.throws(() => createApp({ db: {}, env: { SESSION_SECRET: 'short' } }));
});
