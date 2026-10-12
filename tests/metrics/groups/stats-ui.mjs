// 7. stats-ui: PLL stats dialog first open (cold reconstruction of the whole session), time list jump to the
//    bottom (renders the rows there), deleting a solve near the bottom.
import { openPage, sleep, lagStart, lagStop, m } from '../lib.mjs';

export default {
	name: 'stats-ui',
	quick: false,
	about: 'Desktop 1280x800, the data set\'s virtual-cube session loaded',
	async run(env) {
		const { page, errors, close } = await openPage(env, { data: true, settle: 500 });
		const out = [];
		// PLL stats, first open
		await page.evaluate(lagStart);
		const t0 = Date.now();
		await page.evaluate(() => { kernel.setProp('algStatScope', 's'); algStat.showDialog('PLL'); });
		await page.waitForFunction(() => /solves/.test($('.dialog .jlas-full .jlas-sum').first().text()), null, { timeout: 180000, polling: 20 });
		const pllMs = Date.now() - t0;
		const pllLag = await page.evaluate(lagStop);
		const cases = await page.evaluate(() => $('.dialog .jlas-full tbody tr').length);
		out.push(
			m('stats-ui.pllFirstOpenMs', pllMs, 'ms', 'PLL stats first open (cold, whole session)'),
			m('stats-ui.pllLongestBlock', pllLag, 'ms', 'longest main-thread block during the first open'),
			m('stats-ui.pllCases', cases, 'rows', 'PLL case rows shown'),
		);
		await page.evaluate(() => kernel.hideDialog());
		await sleep(500);
		// time list: jump to the bottom of the session (all rows get rendered)
		const jump = await page.evaluate(async () => {
			const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // work + its rendering done
			const e = $('#stats .myscroll')[0];
			const t = performance.now();
			e.scrollTop = e.scrollHeight;
			e.dispatchEvent(new Event('scroll'));
			const sync = performance.now() - t;
			await twoFrames();
			return { sync, total: performance.now() - t, rows: $('#stats .myscroll table tr[data]').length };
		});
		await sleep(600);
		out.push(
			m('stats-ui.jumpBottomMs', jump.total, 'ms', 'time list: jump to the bottom, until rendered'),
			m('stats-ui.jumpBottomSyncMs', jump.sync, 'ms', 'time list: jump to the bottom, scroll handler (sync)'),
		);
		// delete a solve near the bottom (dialog confirm stubbed so only the app's own work is timed)
		const idx = Math.min(300, env.data.n - 1);
		await page.evaluate(async (idx) => {
			const e = $('#stats .myscroll')[0];
			if (!$(`#stats tr[data="${idx}"]`).length) {
				// windowed list (only the rows near the view exist): scroll near the row by the row height first
				const rh = $('#stats .myscroll tr[data]')[0].getBoundingClientRect().height;
				e.scrollTop = e.scrollHeight - (idx + 1) * rh - 100;
				e.dispatchEvent(new Event('scroll'));
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			}
			e.scrollTop = $(`#stats tr[data="${idx}"]`)[0].offsetTop - 100;
		}, idx);
		await sleep(300);
		await page.click(`#stats tr[data="${idx}"] td.times >> nth=0`);
		await sleep(700);
		const del = await page.evaluate(async () => {
			const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // work + its rendering done
			const conf = $.confirm, prm = $.prompt;
			$.confirm = () => true;
			$.prompt = () => '1';
			const n0 = stats.getTimesStatsTable().timesLen;
			const btn = $('.dialog .click, .dialog span, .dialog input').filter(function() { return $.trim($(this).val() || $(this).text()) == 'X'; }).first();
			const t = performance.now();
			btn.click();
			const sync = performance.now() - t;
			await twoFrames();
			const total = performance.now() - t;
			$.confirm = conf;
			$.prompt = prm;
			return { sync, total, deleted: n0 - stats.getTimesStatsTable().timesLen, found: btn.length };
		});
		out.push(
			m('stats-ui.deleteAtBottomMs', del.found ? del.total : null, 'ms', 'delete a solve near the bottom of the list, until rendered'),
			m('stats-ui.deleteAtBottomSyncMs', del.found ? del.sync : null, 'ms', 'delete a solve near the bottom, sync part'),
			m('stats-ui.deleted', del.deleted, 'solves', 'solves removed by the delete'),
			m('stats-ui.pageErrors', errors.length, 'errors', 'uncaught page errors'),
		);
		await close();
		return out;
	},
};
