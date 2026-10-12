// 2. timing-accuracy: recorded times vs the keys' own event.timeStamp, idle and with an injected 30 ms busy task.
//    Virtual cube: scripted solves of a known scramble (move log, timer start, timer stop, solve time vs schedule).
//    Keyboard timer (input 't'): hold Space, release = start, Space = stop.
import { openPage, playSchedule, keyDown, keyUp, sleep, rng, max, startBusy, stopBusy, m } from '../lib.mjs';

const KEY = { "R": 'i', "R'": 'k', "U": 'j', "U'": 'f', "F": 'h', "F'": 'g', "L": 'd', "L'": 'e', "D": 's', "D'": 'l', "B": 'w', "B'": 'o' };
// the 'time' signal: [penalty, ms] from the keyboard timer, ['', 0, [penalty, ms], date, [moveLog, puzzle]] from the virtual cube
const recTime = (rec) => typeof rec[0] == 'number' ? rec[1] : rec[2][1];
const inv = (mv) => mv.endsWith("'") ? mv[0] : mv + "'";
function scramble(seed, n) {
	const rnd = rng(seed);
	const out = [];
	let last = '';
	while (out.length < n) {
		const f = 'RUFLDB'[Math.floor(rnd() * 6)];
		if (f == last) continue;
		last = f;
		out.push(f + (rnd() < 0.5 ? "'" : ''));
	}
	return out;
}

async function virtualSolves(page, cdp, nSolves) {
	const res = { moveErr: [], startErr: [], stopErr: [], schedErr: [], wrong: 0 };
	for (let s = 0; s < nSolves; s++) {
		const sol = scramble(1000 + s, 25).reverse().map(inv);
		await page.evaluate((scr) => kernel.pushSignal('scramble', ['333', scr, 0]), scramble(1000 + s, 25).join(' '));
		await sleep(300);
		await keyDown(cdp, ' ');
		await keyUp(cdp, ' ');
		await sleep(500);
		await page.evaluate(() => { window.__resetB(); window.__rec = []; });
		const rnd = rng(7 + s);
		const times = [];
		let t = 0;
		for (let i = 0; i < sol.length; i++) { times.push(t); t += 1000 / 12 * (0.5 + rnd()); }
		await playSchedule(cdp, sol.map((mv) => KEY[mv]), times);
		await sleep(1200);
		const r = await page.evaluate(() => ({ keys: window.__B.keys.map((k) => k.ts), rec: window.__rec[0], start: window.__start }));
		if (!r.rec || r.keys.length != sol.length) { res.wrong++; continue; }
		const log = r.rec[4][0].split(' ').map((x) => x.split('@'));
		if (log.map((x) => x[0]).join(' ') != sol.join(' ')) res.wrong++;
		const k0 = r.keys[0], kN = r.keys[r.keys.length - 1];
		// move@ms offsets vs the keys' timestamps relative to the first key (the format stores whole ms)
		log.forEach((x, i) => res.moveErr.push(Math.abs(+x[1] - (Math.floor(r.keys[i]) - Math.floor(k0)))));
		res.startErr.push(Math.abs(r.start - k0));
		res.stopErr.push(Math.abs(r.start + recTime(r.rec) - kN));
		res.schedErr.push(Math.abs(recTime(r.rec) - (times[times.length - 1] - times[0])));
	}
	return res;
}

async function keyboardSolves(page, cdp, n) {
	const res = { startErr: [], stopErr: [], missed: 0 };
	for (let s = 0; s < n; s++) {
		await page.evaluate(() => { window.__rec = []; window.__ups = []; });
		await keyDown(cdp, ' ');
		await sleep(650); // > hold time (0.3 s)
		await keyUp(cdp, ' ');
		await sleep(900 + 137 * s);
		await keyDown(cdp, ' ');
		await sleep(80);
		await keyUp(cdp, ' ');
		await sleep(700);
		const r = await page.evaluate(() => ({ ups: window.__ups, downs: window.__B.keys.filter((k) => k.code == 32).map((k) => k.ts), rec: window.__rec[0], start: window.__start }));
		if (!r.rec || r.ups.length < 1 || r.downs.length < 2) { res.missed++; continue; }
		const up = r.ups[0], stop = r.downs[r.downs.length - 1];
		res.startErr.push(Math.abs(r.start - up));
		res.stopErr.push(Math.abs(r.start + recTime(r.rec) - stop));
		await sleep(400);
	}
	return res;
}

async function hooks(page) {
	await page.evaluate(() => {
		window.__rec = []; window.__ups = [];
		kernel.regListener('metrics', 'time', (s, v) => window.__rec.push(JSON.parse(JSON.stringify(v))));
		// timer.getStartTime() at the moment the timer starts running
		kernel.regListener('metrics', 'timerStatus', (s, v) => { if (v > 0) window.__start = timer.getStartTime(); });
		window.addEventListener('keyup', (e) => { if (e.keyCode == 32) window.__ups.push(e.timeStamp); }, true);
		kernel.setProp('useIns', 'n');
	});
}

export default {
	name: 'timing-accuracy',
	quick: true,
	about: 'Scripted 25-move virtual solves at ~12 tps and keyboard-timer solves; errors are |recorded - event.timeStamp|',
	async run(env) {
		const out = [];
		const nV = env.quick ? 1 : 3, nK = env.quick ? 2 : 5;
		const lbl = (busy) => busy ? 'with a 30 ms busy task every 100 ms' : 'idle main thread';
		const v = await openPage(env, { input: 'v' });
		await hooks(v.page);
		for (const busy of [0, 30]) {
			const tag = busy ? 'busy30' : 'idle';
			if (busy) await startBusy(v.page, busy);
			const r = await virtualSolves(v.page, v.cdp, nV);
			if (busy) await stopBusy(v.page);
			// vs the script only when idle: with the busy task, CDP's own input delivery jitters by up to its length
			if (!busy) out.push(m('timing-accuracy.virtual.idle.solveVsScriptMax', max(r.schedErr), 'ms', 'virtual, idle main thread: solve time vs scripted key times, max'));
			out.push(
				m(`timing-accuracy.virtual.${tag}.moveLogErrMax`, max(r.moveErr), 'ms', `virtual, ${lbl(busy)}: |logged move time - key event.timeStamp| max`),
				m(`timing-accuracy.virtual.${tag}.startErrMax`, max(r.startErr), 'ms', `virtual, ${lbl(busy)}: timer start vs first turn key, max`),
				m(`timing-accuracy.virtual.${tag}.stopErrMax`, max(r.stopErr), 'ms', `virtual, ${lbl(busy)}: timer stop vs solving key, max`),
				m(`timing-accuracy.virtual.${tag}.wrongSolves`, r.wrong, 'solves', `virtual, ${lbl(busy)}: solves recorded wrongly / not at all`),
			);
		}
		await v.close();
		const k = await openPage(env, { input: 't' });
		await hooks(k.page);
		await k.page.mouse.click(640, 400).catch(() => {});
		for (const busy of [0, 30]) {
			const tag = busy ? 'busy30' : 'idle';
			if (busy) await startBusy(k.page, busy);
			const kr = await keyboardSolves(k.page, k.cdp, nK);
			if (busy) await stopBusy(k.page);
			out.push(
				m(`timing-accuracy.keyboard.${tag}.startErrMax`, max(kr.startErr), 'ms', `keyboard timer, ${lbl(busy)}: start vs Space keyup event.timeStamp, max`),
				m(`timing-accuracy.keyboard.${tag}.stopErrMax`, max(kr.stopErr), 'ms', `keyboard timer, ${lbl(busy)}: stop vs Space keydown event.timeStamp, max`),
				m(`timing-accuracy.keyboard.${tag}.missed`, kr.missed, 'solves', `keyboard timer, ${lbl(busy)}: solves not recorded`),
			);
		}
		await k.close();
		out.push(m('timing-accuracy.pageErrors', v.errors.length + k.errors.length, 'errors', 'uncaught page errors'));
		return out;
	},
};
