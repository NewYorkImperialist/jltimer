// 9. phone: iPhone 13 emulation (390x664 @3x, touch) + 4x CPU throttling: a subset of cube-latency, theme-anim
//    and pb-celebration. Emulation is viewport/DPR/touch + a slower main thread only, not iPhone hardware or WebKit.
import { openPage } from '../lib.mjs';
import { burst, rows, warmup } from './cube-latency.mjs';
import { themeAnim } from './theme-anim.mjs';
import { pbCelebration } from './pb-celebration.mjs';

const PHONE = { device: 'iPhone 13', throttle: 4 };

export default {
	name: 'phone',
	quick: false,
	about: 'iPhone 13 emulation + 4x CPU throttle (virtual cube selected explicitly; phones default to the touch timer)',
	async run(env) {
		const out = [];
		const { page, cdp, errors, close } = await openPage(env, { input: 'v', ...PHONE });
		await warmup(page, cdp);
		for (const rate of [12, 'burst']) {
			const r = await burst(page, cdp, rate);
			const name = rate == 'burst' ? 'burst' : rate + 'tps';
			out.push(...rows('phone.cube.' + name, r, 'phone ' + (rate == 'burst' ? 'burst' : rate + ' tps')));
		}
		out.push({ id: 'phone.cube.pageErrors', value: errors.length, unit: 'errors', label: 'uncaught page errors' });
		await close();
		out.push(...await themeAnim(env, { ...PHONE, prefix: 'phone.theme' }));
		out.push(...await pbCelebration(env, { ...PHONE, prefix: 'phone.pb' }));
		return out;
	},
};
