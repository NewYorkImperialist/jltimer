// 3. cube-render-cost: main-thread time of the cube's animation frame callback per sticker style and on 4x4, while
//    turning continuously (40 keys/s, so a turn is always animating); and redraws while idle (must be 0).
import { openPage, findScene, playSchedule, press, sleep, quantile, max, m } from '../lib.mjs';

const CASES = [
	{ id: 'classic', label: 'Classic 3x3', props: { jlCubeStyle: 'classic' } },
	{ id: 'glossy', label: 'Glossy 3x3', props: { jlCubeStyle: 'glossy' } },
	{ id: 'soft', label: 'Soft 3x3', props: { jlCubeStyle: 'soft' } },
	{ id: '444', label: 'Classic 4x4', props: { jlCubeStyle: 'classic', scrType: '444wca' } },
];

/** cube callbacks [start, end] while turning; idle cube callbacks after everything settled */
export async function turnCost(page, cdp, ms = 2500, tps = 40) {
	await press(cdp, ' ');
	await sleep(600);
	await page.evaluate(() => window.__resetB());
	const n = Math.round(ms / 1000 * tps);
	const keys = [], times = [];
	for (let i = 0; i < n; i++) { keys.push('ijkf'[i % 4]); times.push(i * 1000 / tps); }
	await playSchedule(cdp, keys, times);
	await sleep(400);
	const cb = await page.evaluate(() => window.__B.cbs.filter((c) => c[3]).map((c) => c[2] - c[1]));
	await press(cdp, 'Escape');
	await sleep(1200);
	await page.evaluate(() => window.__resetB());
	await sleep(2000);
	const idle = await page.evaluate(() => window.__B.cbs.filter((c) => c[3]).length);
	return { p95: quantile(cb, 0.95), max: max(cb), n: cb.length, idle };
}

export default {
	name: 'cube-render-cost',
	quick: true,
	about: 'Desktop 1280x800 @1x; cube animateLoop rAF callback duration while turning at 40 keys/s',
	async run(env) {
		const { page, cdp, errors, close } = await openPage(env, { input: 'v' });
		const out = [];
		for (const c of env.quick ? CASES.filter((x) => x.id == 'glossy') : CASES) {
			await page.evaluate((props) => { for (const k in props) kernel.setProp(k, props[k]); }, c.props);
			await sleep(c.props.scrType ? 1500 : 500);
			await findScene(page);
			const r = await turnCost(page, cdp);
			out.push(
				m(`cube-render-cost.${c.id}.frameCbP95`, r.p95, 'ms', `${c.label}: cube frame callback p95`),
				m(`cube-render-cost.${c.id}.frameCbMax`, r.max, 'ms', `${c.label}: cube frame callback max`),
				m(`cube-render-cost.${c.id}.idleRedraws`, r.idle, 'frames', `${c.label}: cube redraws during 2 s idle`),
			);
		}
		out.push(m('cube-render-cost.pageErrors', errors.length, 'errors', 'uncaught page errors'));
		await close();
		return out;
	},
};
