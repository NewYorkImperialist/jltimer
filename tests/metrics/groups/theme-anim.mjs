// 4. theme-anim: the living sakura background (petal canvas). Script time per petal frame, frames drawn while a
//    solve is running (default "On, pause while timing": must be 0) and that it resumes afterwards.
import { openPage, press, sendKey, sleep, quantile, max, m } from '../lib.mjs';

/** petal frames drawn + script ms per petal frame over `ms` */
async function petalWindow(page, ms) {
	await page.evaluate(() => window.__resetB());
	await sleep(ms);
	return page.evaluate(() => {
		const cbs = window.__B.cbs.filter((c) => c[4]).map((c) => c[2] - c[1]);
		return { frames: window.__B.petal.length, cb: cbs };
	});
}

export async function themeAnim(env, opts) {
	const { page, cdp, errors, close } = await openPage(env, { input: 'v', ...opts });
	const out = [];
	const p = opts.prefix;
	await sleep(1000);
	const idle = await petalWindow(page, 3000);
	out.push(
		m(`${p}.scriptP95`, quantile(idle.cb, 0.95), 'ms', 'petal frame script time p95 (idle)'),
		m(`${p}.scriptMax`, max(idle.cb), 'ms', 'petal frame script time max (idle)'),
		m(`${p}.idleFps`, idle.frames / 3, 'fps', `petal frames/s while idle (${opts.device ? '30 fps on phones' : '60 fps desktop'})`),
	);
	// a virtual solve in progress: scramble + a few turns (the timer runs from the first turn)
	await press(cdp, ' ');
	await sleep(150);
	for (const ch of 'ijkf') { sendKey(cdp, ch); await sleep(80); }
	await sleep(100);
	const timing = await petalWindow(page, 2000);
	const running = await page.evaluate(() => timer.getCurTime() > 0);
	out.push(m(`${p}.framesWhileTiming`, running ? timing.frames : null, 'frames', 'petal frames drawn during 2 s of a running solve'));
	await press(cdp, 'Escape');
	await sleep(1500); // the next scramble is generated and the petals fade back in
	const after = await petalWindow(page, 2000);
	out.push(m(`${p}.resumeFps`, after.frames / 2, 'fps', 'petal frames/s after the solve ends (resumed)'));
	out.push(m(`${p}.pageErrors`, errors.length, 'errors', 'uncaught page errors'));
	await close();
	return out;
}

export default {
	name: 'theme-anim',
	quick: true,
	about: 'Sakura theme, desktop 1280x800 @2x (retina-sized petal canvas), Animated background = On, pause while timing',
	async run(env) {
		return themeAnim(env, { viewport: { width: 1280, height: 800 }, dpr: 2, prefix: 'theme-anim' });
	},
};
