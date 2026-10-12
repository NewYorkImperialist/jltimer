// 5. pb-celebration: cost of the new-best celebration (pbfx.js). A real PB via the 'time' signal: start cost and
//    frame gaps while it plays; then the test hook jlPbFx.preview() and a key press: it must stop drawing at once.
import { openPage, sendKey, sleep, quantile, max, frameGaps, m } from '../lib.mjs';

export async function pbCelebration(env, opts) {
	const { page, cdp, errors, close } = await openPage(env, { input: 'v', ...opts });
	const p = opts.prefix;
	const out = [];
	await page.evaluate(() => { for (const t of [15000, 14000, 13000, 12500, 13500, 14200]) kernel.pushSignal('time', ['', 0, [0, t]]); });
	await sleep(800);
	// the celebration starts in a setTimeout(0) queued by the 'timestd' listener during the push: a timeout queued
	// right after the push runs after it, so the gap = push + celebration start
	const start = await page.evaluate(() => new Promise((resolve) => {
		window.__resetB();
		const t0 = performance.now();
		kernel.pushSignal('time', ['', 0, [0, 11230]]);
		const t1 = performance.now();
		setTimeout(() => resolve({ push: t1 - t0, start: performance.now() - t1, active: jlPbFx.active(), t0 }), 0);
	}));
	await sleep(2800);
	const B = await page.evaluate(() => window.__B);
	const gaps = frameGaps(B.frames, start.t0, start.t0 + 2700);
	const script = B.cbs.filter((c) => c[5]).map((c) => c[2] - c[1]);
	out.push(
		m(`${p}.started`, start.active ? 1 : 0, 'bool', 'a PB solve starts the celebration'),
		m(`${p}.startCost`, start.start, 'ms', 'celebration start (main thread, after the solve is stored)'),
		m(`${p}.pushCost`, start.push, 'ms', 'storing the PB solve (time signal, sync part)'),
		m(`${p}.frameGapP95`, quantile(gaps, 0.95), 'ms', 'frame gap p95 while it plays'),
		m(`${p}.frameGapMax`, max(gaps), 'ms', 'frame gap max while it plays (includes the start)'),
		m(`${p}.scriptP95`, quantile(script, 0.95), 'ms', 'script time per celebration frame, p95'),
		m(`${p}.framesDrawn`, B.pb.length, 'frames', 'celebration frames drawn'),
	);
	// cut by a key press: preview, wait 400 ms, press a key; count celebration frames drawn after the key
	await page.evaluate(() => {
		window.__resetB();
		window.__cut = null;
		window.__onKey = (e) => {
			const ts = e.timeStamp;
			window.__onKey = null;
			const poll = () => { if (!jlPbFx.active()) window.__cut = performance.now() - ts; else requestAnimationFrame(poll); };
			setTimeout(poll, 0); // after this key event has been dispatched to every listener
		};
		jlPbFx.preview();
	});
	await sleep(400);
	sendKey(cdp, 'x');
	await sleep(400);
	const cut = await page.evaluate(() => {
		const key = window.__B.keys[window.__B.keys.length - 1];
		return { cut: window.__cut, after: key ? window.__B.pb.filter((t) => t > key.ts).length : null, before: window.__B.pb.length };
	});
	out.push(
		m(`${p}.cutLatency`, cut.cut, 'ms', 'key press -> celebration stopped (key event.timeStamp based)'),
		m(`${p}.framesAfterKey`, cut.before > 3 ? cut.after : null, 'frames', 'celebration frames drawn after the key press'),
		m(`${p}.pageErrors`, errors.length, 'errors', 'uncaught page errors'),
	);
	await close();
	return out;
}

export default {
	name: 'pb-celebration',
	quick: true,
	about: 'Desktop 1280x800, empty session + 6 solves, then a PB single/ao5',
	async run(env) {
		return pbCelebration(env, { prefix: 'pb-celebration' });
	},
};
