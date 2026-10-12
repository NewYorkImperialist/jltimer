// 8. load: cold page load (fresh profile, localhost, no network cost) and the JS bundle sizes (raw + gzip).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { openPage, m } from '../lib.mjs';

const BUNDLES = ['cstimer.js', 'twisty.js', 'jlthemes.js', 'jlfx.js'];

export default {
	name: 'load',
	quick: true,
	about: 'Desktop 1280x800, fresh browser context (cold cache) per run; bundle sizes from dist/local/js',
	async run(env) {
		const { page, errors, close } = await openPage(env, { settle: 0 });
		const t = await page.evaluate(() => {
			const nav = performance.getEntriesByType('navigation')[0];
			return { dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, ready: window.__readyAt };
		});
		await close();
		const out = [
			m('load.domContentLoaded', t.dcl, 'ms', 'navigation start -> DOMContentLoaded end'),
			m('load.loadEvent', t.load, 'ms', 'navigation start -> load event end'),
			m('load.timerReady', t.ready, 'ms', 'navigation start -> timer ready (kernel + time list rendered)'),
			m('load.pageErrors', errors.length, 'errors', 'uncaught page errors'),
		];
		let totalGz = 0;
		for (const f of BUNDLES) {
			const buf = fs.readFileSync(path.join(env.root, 'js', f));
			const gz = zlib.gzipSync(buf, { level: 9 }).length;
			totalGz += gz;
			const id = f.replace('.js', '');
			out.push(m(`load.bundle.${id}.kb`, buf.length / 1024, 'KiB', `${f} size`), m(`load.bundle.${id}.gzipKb`, gz / 1024, 'KiB', `${f} gzip -9 size`));
		}
		out.push(m('load.bundle.total.gzipKb', totalGz / 1024, 'KiB', 'all four bundles, gzip -9'));
		return out;
	},
};
