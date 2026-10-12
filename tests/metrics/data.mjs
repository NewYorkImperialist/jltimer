// The data set for the real-data metrics: the user's csTimer/jlTimer export when present (JLTIMER_DATA), otherwise
// ~10k synthetic virtual-cube 3x3 solves with move logs (deterministic seed), so the suite runs anywhere.
import fs from 'node:fs';
import { rng } from './lib.mjs';

export const DEFAULT_DATA = '/Users/jaydenlin/Downloads/jltimer_noDNF_20261005_221253.txt';

/** @return {{text: string, session: number, n: number, source: string}} */
export function getData() {
	const file = process.env.JLTIMER_DATA || DEFAULT_DATA;
	if (file != 'synthetic' && fs.existsSync(file)) {
		const text = fs.readFileSync(file, 'utf8');
		const obj = JSON.parse(text);
		// the session with the most solves that carry move logs (the virtual-cube session)
		let best = 0, bestN = -1, bestLen = 0;
		for (const k of Object.keys(obj)) {
			const mm = /^session(\d+)$/.exec(k);
			if (!mm || !Array.isArray(obj[k])) continue;
			const withMoves = obj[k].filter((s) => s[4] && s[4][0]).length;
			if (withMoves > bestN) { bestN = withMoves; best = +mm[1]; bestLen = obj[k].length; }
		}
		return { text, session: best, n: bestLen, source: file };
	}
	const n = +(process.env.JLTIMER_SYNTH_N || 10000);
	return { text: JSON.stringify(synthesize(n)), session: 1, n, source: `synthetic (${n} solves, seed 20261011)` };
}

// ---------- synthetic CFOP solves ----------
// solution = cross + 4 F2L pairs (conjugates X U^k X' keep the cross) + a real OLL + a real PLL + AUF, and the
// scramble is its inverse, so the move log really solves the cube and the reconstruction finds every stage.
const OLL = [
	"R U R' U R U2 R'", "R U2 R' U' R U' R'", "F R U R' U' F'", "R U R' U' R' F R F'",
	"R U2 R2 U' R2 U' R2 U2 R", "R U2 R' U' R U R' U' R U' R'", "R2 D R' U2 R D' R' U2 R'",
];
const PLL = [
	"R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'",
	"R U R' F' R U R' U' R' F R2 U' R'", "F R U' R' U' R U R' F' R U R' U' R' F R F'",
	"R U' R' U' R U R D R' U' R D' R' U2 R'", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
	"R' F R' B2 R F' R' B2 R2", "R B' R F2 R' B R F2 R2", "R B' R' F R B R' F' R B R' F R B' R' F'",
	"R2 U2 R U2 R2 U2 R2 U2 R U2 R2", "R' U' R U' R U R U' R' U R U R2 U' R'", "L' U' L F L' U' L U L F' L2 U L",
	"R2 F R U R U' R' F' R U2 R' U2 R", "R2 U R' U R' U' R U' R2 D U' R' U R D'", "R' U' R U D' R2 U R' U R U' R U' R2 D",
	"R2 U' R U' R U R' U R2 D' U R U' R' D", "R U R' U' D R2 U' R U' R' U R' U R2 D'",
	"R U' R U R' D R D' R U' D R2 U R2 D' R2", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
	"R' U R U' R' F' U' F R U R' F R' F' R U' R",
];
const INSERT = ["R U R'", "R U' R'", "R U2 R'", "L' U' L", "L' U L", "F' U' F", "F U F'", "B U B'", "B' U' B", "R' U R", "L U L'"];
const SUF = ['', "'", '2'];
const inv = (mv) => mv.endsWith("'") ? mv[0] : mv.endsWith('2') ? mv : mv + "'";

function synthesize(n) {
	const rnd = rng(20261011);
	const pick = (a) => a[Math.floor(rnd() * a.length)];
	const solves = [];
	let date = 1771346999;
	for (let i = 0; i < n; i++) {
		const sol = [];
		const ts = [];
		let t = 0;
		const add = (alg, per, pause) => {
			t += pause;
			for (const mv of alg.split(' ').filter(Boolean)) {
				sol.push(mv);
				ts.push(Math.round(t));
				t += per * (0.6 + 0.8 * rnd());
			}
		};
		// cross: 6-8 moves, no two on the same face in a row
		let last = '';
		const cross = [];
		const nc = 6 + Math.floor(rnd() * 3);
		while (cross.length < nc) {
			const f = 'RUFLDB'[Math.floor(rnd() * 6)];
			if (f == last) continue;
			last = f;
			cross.push(f + pick(SUF));
		}
		add(cross.join(' '), 130, 0);
		for (let p = 0; p < 4; p++) {
			add((rnd() < 0.7 ? 'U' + pick(SUF) + ' ' : '') + pick(INSERT) + (rnd() < 0.6 ? ' U' + pick(SUF) + ' ' + pick(INSERT) : ''), 115, 250 + 450 * rnd());
		}
		add(pick(OLL), 95, 350 + 400 * rnd());
		if (rnd() > 1 / 36) add((rnd() < 0.75 ? 'U' + pick(SUF) + ' ' : '') + pick(PLL), 90, 400 + 500 * rnd());
		if (rnd() < 0.75) add('U' + pick(SUF), 100, 120);
		const time = ts[ts.length - 1] + 1;
		const scramble = sol.slice().reverse().map(inv).join(' ');
		const log = sol.map((mv, k) => mv + '@' + ts[k]).join(' ');
		solves.push([[0, time], scramble, '', date, [log, '333']]);
		date += 45 + Math.floor(rnd() * 120);
	}
	return {
		session1: solves,
		properties: { sessionData: JSON.stringify({ 1: { name: 1, opt: {}, rank: 1 } }), session: 1 },
	};
}
