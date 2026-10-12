// 1. cube-latency: virtual cube key -> drawn, at steady 8/12/15/20 tps and in finger-trick bursts.
import { openPage, playSchedule, press, sleep, rng, median, quantile, max, frameGaps, dropped, m } from '../lib.mjs';

// realistic key sequences in the default jlTimer keymap
const UA = 'ifijijifkfii';               // Ua perm  R U' R U R U R U' R' U' R2
const TPERM = 'ijkfkhiifkfijkg';         // T perm   R U R' U' R' F R2 U' R' U' R U R' F'
const F2L = ';ijkfkhig;fifjk;ijkaijijk'; // F2L-like with y / y' rotations
export const SEQ = (UA + TPERM + F2L + UA + TPERM).split('');

/** key times (ms from start): `rate` keys/s with +-35% jitter, or 'burst': groups of 4 keys 28 ms apart
 *  (~36 tps locally) separated by 220 ms pauses (~11 tps overall) - where moves queue up */
export function schedule(rate, n) {
	const rnd = rng(12345);
	const out = [];
	let t = 0;
	for (let i = 0; i < n; i++) {
		out.push(t);
		if (rate === 'burst') t += (i % 4 == 3) ? 220 : 28;
		else t += 1000 / rate * (0.65 + 0.7 * rnd());
	}
	return out;
}

/** one scramble + key sequence; returns the raw per-key measurements */
export async function burst(page, cdp, rate) {
	await press(cdp, ' '); // scramble (the virtual timer starts on the first turn)
	await sleep(400);
	await page.evaluate(() => window.__resetB());
	await sleep(100);
	await playSchedule(cdp, SEQ, schedule(rate, SEQ.length));
	await sleep(800);
	const B = await page.evaluate(() => window.__B);
	await press(cdp, 'Escape');
	await sleep(400);
	return analyze(B);
}

/** an unmeasured short run first: JIT, sprite and layer setup happen here, not in the first measured rate */
export async function warmup(page, cdp) {
	await press(cdp, ' ');
	await sleep(400);
	await playSchedule(cdp, SEQ.slice(0, 24), schedule(12, 24));
	await sleep(600);
	await press(cdp, 'Escape');
	await sleep(600);
}

export function analyze(B) {
	const keys = B.keys.filter((k) => k.code != 27 && k.code != 32);
	const n = Math.min(keys.length, B.added.length);
	const first = [], done = [], logErr = [];
	for (let i = 0; i < n; i++) {
		const ev = keys[i].ts;
		logErr.push(Math.abs(B.added[i][0] - ev));
		if (B.first[i] != null) first.push(B.first[i] - ev);
		if (B.endDraw[i] != null) done.push(B.endDraw[i] - ev);
	}
	let backlog = 0;
	for (const d of B.depth) backlog = Math.max(backlog, d[1]);
	const tA = keys.length ? keys[0].ts : 0, tB = keys.length ? keys[keys.length - 1].ts + 300 : 0;
	const gaps = frameGaps(B.frames, tA, tB);
	return {
		keys: keys.length, moves: B.added.length,
		firstMed: median(first), firstP95: quantile(first, 0.95),
		doneP95: quantile(done, 0.95), doneMax: max(done),
		lastLag: n && B.endDraw[n - 1] != null ? B.endDraw[n - 1] - keys[n - 1].ts : null,
		backlog, dropped: dropped(gaps), gapP95: quantile(gaps, 0.95), logErrMax: max(logErr),
		missed: keys.length - B.added.length,
	};
}

/** metric rows for one burst result; prefix e.g. 'cube-latency.12tps' */
export function rows(prefix, r, label) {
	return [
		m(prefix + '.firstDrawMed', r.firstMed, 'ms', `${label}: key -> first draw, median`),
		m(prefix + '.firstDrawP95', r.firstP95, 'ms', `${label}: key -> first draw, p95`),
		m(prefix + '.turnDoneP95', r.doneP95, 'ms', `${label}: key -> turn fully drawn, p95`),
		m(prefix + '.maxBacklog', r.backlog, 'moves', `${label}: max moves queued (incl. the turning one)`),
		m(prefix + '.lastKeyLag', r.lastLag, 'ms', `${label}: last key -> cube shows every move`),
		m(prefix + '.droppedFrames', r.dropped, 'frames', `${label}: dropped frames`),
		m(prefix + '.frameGapP95', r.gapP95, 'ms', `${label}: frame gap p95`),
		m(prefix + '.missedMoves', r.missed, 'moves', `${label}: keys that did not turn the cube`),
	];
}

export const RATES = [8, 12, 15, 20, 'burst'];
export const QUICK_RATES = [12, 'burst'];

export default {
	name: 'cube-latency',
	quick: true,
	about: 'Virtual cube, desktop 1280x800, default settings (sakura, petals paused while timing, classic stickers)',
	async run(env) {
		const { page, cdp, errors, close } = await openPage(env, { input: 'v' });
		const out = [];
		await warmup(page, cdp);
		for (const rate of env.quick ? QUICK_RATES : RATES) {
			const r = await burst(page, cdp, rate);
			const name = rate == 'burst' ? 'burst' : rate + 'tps';
			out.push(...rows('cube-latency.' + name, r, rate == 'burst' ? 'burst (4 keys @28 ms)' : rate + ' tps'));
		}
		out.push(m('cube-latency.pageErrors', errors.length, 'errors', 'uncaught page errors'));
		await close();
		return out;
	},
};
