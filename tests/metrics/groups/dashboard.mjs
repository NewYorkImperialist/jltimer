// 6. dashboard: the stats dashboard over the full real-data session (or ~10k synthetic solves): cold compute,
//    the longest main-thread block while it computes, and reopening it (cached).
import { openPage, sleep, lagStart, lagStop, m } from '../lib.mjs';

async function measure(page, fn) {
	await page.evaluate(lagStart);
	const t0 = Date.now();
	await page.evaluate(fn);
	await page.waitForFunction(() => jlDash.isDone(), null, { timeout: 180000, polling: 20 });
	const ms = Date.now() - t0;
	const lag = await page.evaluate(lagStop);
	const n = await page.evaluate(() => (jlDash.lastResult() || {}).n);
	return { ms, lag, n };
}

export default {
	name: 'dashboard',
	quick: false,
	about: 'Desktop 1280x900, the data set\'s virtual-cube session, dashboard scope "this session", range "all"',
	async run(env) {
		const { page, errors, close } = await openPage(env, { data: true, viewport: { width: 1280, height: 900 }, settle: 500 });
		const cold = await measure(page, () => { kernel.setProp('jlDashScope', 's'); kernel.setProp('jlDashRange', 'all'); jlDash.showDialog(); });
		await page.evaluate(() => kernel.hideDialog());
		await sleep(400);
		const warm = await measure(page, () => jlDash.showDialog());
		await page.evaluate(() => kernel.hideDialog());
		await close();
		return [
			m('dashboard.coldMs', cold.ms, 'ms', `cold compute + render of ${env.data.n} solves (wall)`),
			m('dashboard.coldLongestBlock', cold.lag, 'ms', 'longest main-thread block while computing (5 ms probe)'),
			m('dashboard.reopenMs', warm.ms, 'ms', 'reopen (cached results)'),
			m('dashboard.reopenLongestBlock', warm.lag, 'ms', 'longest main-thread block on reopen'),
			m('dashboard.analyzedAll', cold.n == env.data.n ? 1 : 0, 'bool', 'the result covers every solve of the session'),
			m('dashboard.pageErrors', errors.length, 'errors', 'uncaught page errors'),
		];
	},
};
