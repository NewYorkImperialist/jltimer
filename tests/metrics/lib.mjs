// Shared helpers for the metric suite: static server, Chrome, page setup, instrumentation, key injection, stats.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import pw from 'playwright-core';

const { chromium, devices } = pw;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- statistics ----------
/** nearest-rank quantile of the finite values in a (null when empty) */
export function quantile(a, p) {
	const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
	if (!s.length) return null;
	return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
}
export const median = (a) => quantile(a, 0.5);
export const max = (a) => quantile(a, 1);
export const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));

// ---------- static server for dist/local (port range 8310-8319) ----------
const MIME = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
	'.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};
export async function serve(root, ports) {
	const server = http.createServer((req, res) => {
		let p = decodeURIComponent((req.url || '/').split('?')[0]);
		if (p.endsWith('/')) p += 'index.html';
		const file = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
		if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
		fs.readFile(file, (err, buf) => {
			if (err) { res.writeHead(404); res.end('not found'); return; }
			res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
			res.end(buf);
		});
	});
	for (const port of ports) {
		const ok = await new Promise((resolve) => {
			server.once('error', () => resolve(false));
			server.listen(port, '127.0.0.1', () => resolve(true));
		});
		if (ok) return { server, port, url: `http://localhost:${port}/` };
	}
	throw new Error(`no free port in ${ports[0]}-${ports[ports.length - 1]}`);
}

// ---------- Chrome ----------
export const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export function chromePath() {
	const p = process.env.CHROME || DEFAULT_CHROME;
	if (!fs.existsSync(p)) {
		throw new Error(`Chrome not found at "${p}". Install Google Chrome or set CHROME=/path/to/chrome (any Chromium build works).`);
	}
	return p;
}
export async function launch() {
	return chromium.launch({ executablePath: chromePath(), headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
}

// ---------- in-page instrumentation (runs before any page script) ----------
// __B.keys: keydown event.timeStamp + handler time; __B.cbs: every rAF callback [ts, start, end, isCube, drewPetals, drewPb];
// __B.frames: independent rAF loop; cube move listener (logged ts / start / end of each turn) via a TwistyScene wrapper;
// __B.draws: clearRect on the petal canvas / PB canvas = one frame drawn by that animation.
function instrument() {
	const W = window;
	W.__B = {};
	const B = W.__B;
	W.__resetB = function() {
		Object.assign(B, { keys: [], frames: [], cbs: [], longs: [], added: [], started: [], ended: [], first: {}, endDraw: {}, depth: [], petal: [], pb: [], afterKey: [] });
	};
	W.__resetB();
	W.addEventListener('keydown', function(e) {
		B.keys.push({ ts: e.timeStamp, h: performance.now(), code: e.keyCode });
		if (W.__onKey) W.__onKey(e);
	}, true);
	let inCb = null;
	const clr = CanvasRenderingContext2D.prototype.clearRect;
	CanvasRenderingContext2D.prototype.clearRect = function() {
		const c = this.canvas;
		if (c.id == 'jltheme-anim') { B.petal.push(performance.now()); if (inCb) inCb.p = 1; } else if (c.classList && c.classList.contains('jlpb')) { B.pb.push(performance.now()); if (inCb) inCb.b = 1; }
		return clr.apply(this, arguments);
	};
	const nraf = W.requestAnimationFrame.bind(W);
	W.__nraf = nraf;
	W.requestAnimationFrame = function(fn, el) {
		return nraf(function(ts) {
			const s = performance.now();
			const mark = inCb = { p: 0, b: 0 };
			try {
				fn(ts);
			} finally {
				inCb = null;
				const e = performance.now();
				const tw = el instanceof HTMLCanvasElement;
				B.cbs.push([ts, s, e, tw ? 1 : 0, mark.p, mark.b]);
				if (tw && W.__scene) W.__afterAnim(ts, e);
			}
		});
	};
	(function loop(ts) { B.frames.push(ts); nraf(loop); })();
	try {
		new PerformanceObserver((l) => l.getEntries().forEach((x) => B.longs.push([x.startTime, x.duration]))).observe({ entryTypes: ['longtask'] });
	} catch (e) {}
	W.__afterAnim = function(ts, e) {
		const anim = W.__scene.animState();
		const n = anim.length;
		const sc = B.started.length;
		for (let i = 0; i < n; i++) {
			const idx = sc - n + i;
			if (anim[i].progress > 0 && !(idx in B.first)) B.first[idx] = e;
		}
		for (let k = 0; k < B.ended.length; k++) {
			if (!(k in B.endDraw)) B.endDraw[k] = e;
			if (!(k in B.first)) B.first[k] = e;
		}
	};
	// first moment the timer UI is ready (kernel + stats list rendered)
	const t = setInterval(function() {
		if (W.kernel && W.$ && W.$('#stats .stattl').length) { W.__readyAt = performance.now(); clearInterval(t); }
	}, 5);
	let tw;
	Object.defineProperty(W, 'twistyjs', {
		configurable: true,
		get: function() { return tw; },
		set: function(v) {
			tw = v;
			const T = v.TwistyScene;
			v.TwistyScene = function() {
				T.call(this);
				const scene = this;
				W.__scenes = (W.__scenes || []).concat([scene]);
				scene.addMoveListener(function(move, step, ts) {
					if (W.__scene !== scene) return;
					const now = performance.now();
					if (step == 0) B.added.push([ts, now]);
					else if (step == 1) B.started.push(now);
					else B.ended.push(now);
					B.depth.push([now, B.added.length - B.ended.length]);
				});
			};
		}
	});
}

const IGNORE_ERR = /CORS|ERR_FAILED|Failed to load|jltimer-api|net::/;

/**
 * Opens the timer in a fresh context.
 * opts: device ('iPhone 13'), viewport, dpr, throttle (CPU rate, applied after load), props {}, input ('v'|'t'),
 *       data (true: load the real/synthetic data set), reducedMotion
 */
export async function openPage(env, opts = {}) {
	const ctxOpts = opts.device ? { ...devices[opts.device] } : { viewport: opts.viewport || { width: 1280, height: 800 }, deviceScaleFactor: opts.dpr || 1 };
	if (opts.reducedMotion) ctxOpts.reducedMotion = 'reduce';
	const ctx = await env.browser.newContext(ctxOpts);
	// no network outside the local server (the cloud backup API etc.): deterministic and offline
	await ctx.route((u) => !/^http:\/\/localhost:/.test(u.href), (r) => r.abort());
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => { if (!IGNORE_ERR.test(String(e))) errors.push(String(e.stack || e)); });
	page.on('dialog', (d) => d.accept(d.type() == 'prompt' ? '1' : undefined).catch(() => {}));
	await page.addInitScript(instrument);
	await page.goto(env.url);
	await page.waitForFunction(() => window.kernel && $('#stats .stattl').length, null, { timeout: 60000 });
	await sleep(2000);
	if (opts.data) await loadData(page, env.data);
	const input = opts.input || null;
	await page.evaluate(([input, props]) => {
		if (input) kernel.setProp('input', input);
		for (const k in props) kernel.setProp(k, props[k]);
	}, [input, opts.props || {}]);
	if (input == 'v') await findScene(page);
	await sleep(opts.settle == null ? 1000 : opts.settle);
	const cdp = await ctx.newCDPSession(page);
	if (opts.throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle });
	return { ctx, page, cdp, errors, close: () => ctx.close() };
}

/** (re)binds the instrumentation to the virtual cube currently shown in the timer area */
export async function findScene(page) {
	await page.waitForFunction(() => (window.__scenes || []).some((s) => $.contains(document.getElementById('container'), s.getDomElement())), null, { timeout: 30000 });
	await page.evaluate(() => { window.__scene = window.__scenes.filter((s) => $.contains(document.getElementById('container'), s.getDomElement())).pop(); });
}

export async function loadData(page, data) {
	await page.evaluate((text) => new Promise((resolve) => {
		let done = false;
		const fin = () => { if (!done) { done = true; resolve(); } };
		exportFunc.loadData(JSON.parse(text), true, fin);
		setTimeout(fin, 20000);
	}), data.text);
	await sleep(1500);
	await page.evaluate((s) => kernel.setProp('session', s), data.session);
	await page.waitForFunction((n) => stats.getTimesStatsTable().timesLen == n, data.n, { timeout: 60000, polling: 100 });
	await sleep(1500);
}

// ---------- key injection (CDP, through the browser's real input pipeline) ----------
function keyInfo(ch) {
	const special = { ';': [186, 'Semicolon'], ',': [188, 'Comma'], '.': [190, 'Period'], ' ': [32, 'Space'], Escape: [27, 'Escape'] };
	if (special[ch]) return { vk: special[ch][0], code: special[ch][1], key: ch };
	if (/^[0-9]$/.test(ch)) return { vk: ch.charCodeAt(0), code: 'Digit' + ch, key: ch };
	return { vk: ch.toUpperCase().charCodeAt(0), code: 'Key' + ch.toUpperCase(), key: ch };
}
/** fire-and-forget keyDown + keyUp, so a schedule does not wait for the page */
export function sendKey(cdp, ch) {
	const k = keyInfo(ch);
	const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk };
	cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch.length == 1 ? ch : undefined, ...base }).catch(() => {});
	cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }).catch(() => {});
}
export async function keyDown(cdp, ch) {
	const k = keyInfo(ch);
	await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk });
}
export async function keyUp(cdp, ch) {
	const k = keyInfo(ch);
	await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk });
}
export async function press(cdp, ch) {
	await keyDown(cdp, ch);
	await keyUp(cdp, ch);
}

/** deterministic LCG in [0, 1) */
export function rng(seed) {
	let s = seed >>> 0;
	return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** sends keys[i] at t0 + times[i] (ms) */
export async function playSchedule(cdp, keys, times) {
	const t0 = Date.now() + 20;
	for (let i = 0; i < keys.length; i++) {
		const at = t0 + times[i];
		while (Date.now() < at - 1) await sleep(Math.max(0, at - Date.now() - 1));
		sendKey(cdp, keys[i]);
	}
}

/** a 'ms' busy loop every 100 ms on the main thread (an injected heavy task) */
export async function startBusy(page, ms) {
	await page.evaluate((ms) => { window.__busy = setInterval(() => { const e = performance.now() + ms; while (performance.now() < e); }, 100); }, ms);
}
export async function stopBusy(page) {
	await page.evaluate(() => clearInterval(window.__busy));
}

/** frame gaps (ms) of the independent rAF loop between t0 and t1 (performance.now()) */
export function frameGaps(frames, t0, t1) {
	const fr = frames.filter((t) => t >= t0 && t <= t1);
	const g = [];
	for (let i = 1; i < fr.length; i++) g.push(fr[i] - fr[i - 1]);
	return g;
}
export const dropped = (gaps, period = 16.67) => gaps.reduce((a, g) => a + Math.max(0, Math.round(g / period) - 1), 0);

/** in-page: max gap of a 5 ms interval probe = the longest main-thread block */
export const lagStart = () => { window.__lag = { max: 0, last: performance.now() }; window.__lagT = setInterval(() => { const n = performance.now(); window.__lag.max = Math.max(window.__lag.max, n - window.__lag.last); window.__lag.last = n; }, 5); };
export const lagStop = () => { clearInterval(window.__lagT); return window.__lag.max; };

/** metric record */
export const m = (id, value, unit, label) => ({ id, value: value == null ? null : +(+value).toFixed(2), unit, label });
