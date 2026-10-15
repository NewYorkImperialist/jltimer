// @ts-check
"use strict";

// jlTimer Super Floppy (event "sfl"): random-state scrambler. The geometry is lib/puzzlefloppy.js.
//
// A uniform random state of the 3,041,280 is picked (never solved) and solved optimally by IDA*; the scramble is the
// inverse of that solution, in R F L B quarter / half turns (a half turn counts as one move, as in Jaap Scherphuis's
// analysis, jaapsch.net/puzzles/floppy2.htm). The rules setting (Options > scramble > "Super Floppy rules", prop
// sflMode) picks official or imitation: official solutions never turn a side that holds no corner, which the official
// puzzle blocks, and their inverse doesn't either (a side holding a corner keeps it while it turns); imitation
// scrambles may turn bare edges and are a bit shorter. God's number: official 15, imitation 13; the scrambles are
// optimal, so never longer. The IDA* heuristic is the largest of six exact distance tables of projections (corner
// locations x the orientations of two edges; one table for an adjacent and one for an opposite pair, used for all
// pairs through the puzzle's 4-fold symmetry): 2 x 331,776 bytes per rules set, built with the move tables on the first
// scramble of a rules set (about 40 ms in the browser, 20 ms for the second set); a solve then takes ~0.02 ms.
//
// The scrambler id is "sfl" for official rules and "sfli" for imitation rules; the menu entry is always "sfl" and
// scramble/scramble.js points it at "sfli" (alias, like 444wca -> 444m) when the setting is imitation, so cached
// scrambles from the worker are always of the chosen rules.
var superFloppy = (function() {
	var LOCS = puzzleFloppy.LOCS;
	var SIDES = puzzleFloppy.SIDES;

	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	function cross(a, b) {
		return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	}

	function same(a, b) {
		return a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
	}

	// a clockwise quarter turn about the face with outward normal n (as in lib/puzzlefloppy.js)
	function quarter(v, n) {
		var d = dot(n, v);
		return [
			d * n[0] + v[1] * n[2] - v[2] * n[1],
			d * n[1] + v[2] * n[0] - v[0] * n[2],
			d * n[2] + v[0] * n[1] - v[1] * n[0]
		];
	}

	function locIdx(v) {
		for (var i = 0; i < LOCS.length; i++) {
			if (same(LOCS[i], v)) {
				return i;
			}
		}
		return -1;
	}

	// Abstract state: the locations of corners 0..3 (index c = l0 + 12 l1 + 144 l2 + 1728 l3, 12^4 slots of which
	// 11880 are valid) and the edge orientations (o = e0 + 4 e1 + 16 e2 + 64 e3, clockwise quarter turns of the R F L
	// B edges); state index = c * 256 + o. Move m = 3 s + k: side s (R F L B), k = 0 clockwise, 1 half, 2 anticlockwise.
	var NC = 20736;
	var SOLVED_C = 0 + 12 * 1 + 144 * 2 + 1728 * 3;
	var tabs = null; // shared move tables
	var prun = {}; // pruning tables per mode ('o' official, 'i' imitation)

	function cornersOf(c) {
		return [c % 12, ~~(c / 12) % 12, ~~(c / 144) % 12, ~~(c / 1728)];
	}

	function cornerIdx(loc) {
		return loc[0] + 12 * loc[1] + 144 * loc[2] + 1728 * loc[3];
	}

	function initTabs() {
		if (tabs) {
			return tabs;
		}
		var lperm = []; // lperm[s][l]: location l after a clockwise quarter of side s
		for (var s = 0; s < 4; s++) {
			lperm[s] = [];
			for (var l = 0; l < 12; l++) {
				lperm[s][l] = dot(LOCS[l], SIDES[s]) == 1 ? locIdx(quarter(LOCS[l], SIDES[s])) : l;
			}
		}
		var yperm = []; // a y rotation (seen from the top, clockwise): R -> F -> L -> B, corner homes 0 -> 1 -> 2 -> 3
		for (var l = 0; l < 12; l++) {
			yperm[l] = locIdx(quarter(LOCS[l], [0, 1, 0]));
		}
		// per location: where each of the 12 moves takes it, which sides it is on, where y^j takes it
		var lmv = [], onSide = [], ypow = [];
		for (var l = 0; l < 12; l++) {
			for (var s = 0; s < 4; s++) {
				var l2 = l;
				for (var k = 0; k < 3; k++) {
					l2 = lperm[s][l2];
					lmv[(s * 3 + k) * 12 + l] = l2;
				}
				onSide[s * 12 + l] = dot(LOCS[l], SIDES[s]) == 1 ? 1 : 0;
			}
			for (var j = 0, l2 = l; j < 4; j++, l2 = yperm[l2]) {
				ypow[j * 12 + l] = l2;
			}
		}
		var cmv = new Uint16Array(NC * 12);
		var valid = new Uint8Array(NC);
		var hasC = new Uint8Array(NC * 4);
		var sym = [new Uint16Array(NC), new Uint16Array(NC), new Uint16Array(NC), new Uint16Array(NC)];
		var loc = [0, 0, 0, 0], out = [0, 0, 0, 0];
		for (var c = 0; c < NC; c++) {
			loc[0] = c % 12;
			loc[1] = ~~(c / 12) % 12;
			loc[2] = ~~(c / 144) % 12;
			loc[3] = ~~(c / 1728);
			valid[c] = loc[0] != loc[1] && loc[0] != loc[2] && loc[0] != loc[3] && loc[1] != loc[2] && loc[1] != loc[3] && loc[2] != loc[3] ? 1 : 0;
			if (!valid[c]) {
				continue; // two corners in one place: never reached
			}
			for (var m = 0; m < 12; m++) {
				var base = m * 12;
				cmv[c * 12 + m] = lmv[base + loc[0]] + 12 * lmv[base + loc[1]] + 144 * lmv[base + loc[2]] + 1728 * lmv[base + loc[3]];
			}
			for (var s = 0; s < 4; s++) {
				hasC[c * 4 + s] = onSide[s * 12 + loc[0]] | onSide[s * 12 + loc[1]] | onSide[s * 12 + loc[2]] | onSide[s * 12 + loc[3]];
			}
			// sym[k]: the state seen after turning the puzzle by y^-k (side s + k becomes side s, corner i + k corner i)
			for (var k = 0; k < 4; k++) {
				var yb = ((4 - k) % 4) * 12;
				for (var i = 0; i < 4; i++) {
					out[(i - k + 4) % 4] = ypow[yb + loc[i]];
				}
				sym[k][c] = cornerIdx(out);
			}
		}
		tabs = { cmv: cmv, valid: valid, hasC: hasC, sym: sym };
		return tabs;
	}

	// apply move m to state index x (no legality check)
	function moveIdx(x, m) {
		var t = initTabs();
		var s = ~~(m / 3), k = m % 3;
		var c = x >> 8, o = x & 255, sh = 2 * s;
		return (t.cmv[c * 12 + m] << 8) | (o & ~(3 << sh)) | ((((o >> sh) & 3) + k + 1) & 3) << sh;
	}

	function legalIdx(x, m, official) {
		return !official || initTabs().hasC[(x >> 8) * 4 + ~~(m / 3)] == 1;
	}

	// exact distance tables of the projection (corners, orientations of edges 0 and b): b = 1 adjacent, 2 opposite;
	// breadth-first over a queue, so every state is expanded once
	function pairTable(official, b) {
		var t = initTabs();
		var T = new Uint8Array(NC * 16).fill(255);
		var queue = new Int32Array(11880 * 16);
		var head = 0, tail = 0;
		T[SOLVED_C * 16] = 0;
		queue[tail++] = SOLVED_C * 16;
		while (head < tail) {
			var i = queue[head++];
			var d = T[i] + 1;
			var c = i >> 4, e0 = i & 3, eb = i >> 2 & 3;
			for (var s = 0; s < 4; s++) {
				if (official && !t.hasC[c * 4 + s]) {
					continue;
				}
				for (var k = 0; k < 3; k++) {
					var j = t.cmv[c * 12 + s * 3 + k] * 16 + (s == 0 ? (e0 + k + 1) & 3 : e0) + 4 * (s == b ? (eb + k + 1) & 3 : eb);
					if (T[j] == 255) {
						T[j] = d;
						queue[tail++] = j;
					}
				}
			}
		}
		return T;
	}

	function getPrun(official) {
		var key = official ? 'o' : 'i';
		if (!prun[key]) {
			prun[key] = [pairTable(official, 1), pairTable(official, 2)];
		}
		return prun[key];
	}

	// a lower bound on the distance: the largest of the 6 edge-pair projections (4 adjacent, 2 opposite)
	function heur(P, sym, c, o) {
		var m = 0;
		for (var k = 0; k < 4; k++) {
			var sc = sym[k][c] * 16;
			var ek = o >> 2 * k & 3;
			var v = P[0][sc + ek + 4 * (o >> 2 * ((k + 1) & 3) & 3)];
			if (v > m) {
				m = v;
			}
			if (k < 2) {
				v = P[1][sc + ek + 4 * (o >> 2 * (k + 2) & 3)];
				if (v > m) {
					m = v;
				}
			}
		}
		return m;
	}

	/**
	 * an optimal solution of state index x (moves 3 s + k, each legal in turn under the chosen rules)
	 * @param {number} x
	 * @param {boolean} official
	 * @returns {number[]}
	 */
	function solveIdx(x, official) {
		var t = initTabs();
		var P = getPrun(official);
		var sol = [];

		function search(c, o, g, bound, last) {
			var h = heur(P, t.sym, c, o);
			if (g + h > bound) {
				return false;
			}
			if (h == 0) {
				return c == SOLVED_C && o == 0;
			}
			for (var s = 0; s < 4; s++) {
				// one turn per side in a row; opposite sides commute, so only in one order
				if (s == last || (s ^ 2) == last && s < last || official && !t.hasC[c * 4 + s]) {
					continue;
				}
				var sh = 2 * s, eo = o >> sh & 3, ob = o & ~(3 << sh);
				for (var k = 0; k < 3; k++) {
					sol.push(s * 3 + k);
					if (search(t.cmv[c * 12 + s * 3 + k], ob | ((eo + k + 1) & 3) << sh, g + 1, bound, s)) {
						return true;
					}
					sol.pop();
				}
			}
			return false;
		}
		for (var bound = 0; bound < 30; bound++) {
			if (search(x >> 8, x & 255, 0, bound, -1)) {
				return sol;
			}
		}
		return [];
	}

	/**
	 * a uniform random state other than solved
	 * @param {(n: number) => number} rn uniform integer in [0, n)
	 */
	function randomIdx(rn) {
		var t = initTabs();
		while (true) {
			var c = rn(NC);
			var x = c << 8 | rn(256);
			if (t.valid[c] && x != SOLVED_C << 8) {
				return x;
			}
		}
	}

	function moveName(m) {
		return 'RFLB'.charAt(~~(m / 3)) + ['', '2', "'"][m % 3];
	}

	/**
	 * random-state Super Floppy scramble: the inverse of an optimal solution of a uniform random unsolved state. Under
	 * official rules every turn of it is legal on the official puzzle (a side holding a corner keeps it while turning,
	 * so the inverse of a legal solution is legal too).
	 * @param {(n: number) => number} rn
	 * @param {boolean} official
	 */
	function scramble(rn, official) {
		var sol = solveIdx(randomIdx(rn), official);
		var ret = [];
		for (var i = sol.length - 1; i >= 0; i--) {
			var m = sol[i];
			ret.push(moveName(m - m % 3 + 2 - m % 3));
		}
		return ret.join(' ');
	}

	/**
	 * the abstract state index of a Super Floppy (seen from its centre, so any whole-puzzle orientation), or -1
	 * @param {any} st
	 */
	function toIdx(st) {
		var c = st.p[0];
		var az = cross(c.ax, c.ay);
		var local = function(v) {
			return [dot(v, c.ax), dot(v, c.ay), dot(v, az)];
		};
		var loc = [];
		for (var i = 0; i < 4; i++) {
			loc[i] = locIdx(local(st.p[5 + i].pos));
		}
		var o = 0;
		for (var e = 0; e < 4; e++) {
			var ay = local(st.p[1 + e].ay);
			var v = [0, 1, 0];
			var k = 0;
			while (k < 4 && !same(v, ay)) {
				v = quarter(v, SIDES[e]);
				k++;
			}
			if (k == 4) {
				return -1;
			}
			o |= k << 2 * e;
		}
		return cornerIdx(loc) << 8 | o;
	}

	/**
	 * exact distance of every state (for verification against Jaap's tables; about 0.5 s, not used at run time)
	 * @param {boolean} official
	 */
	function godTable(official) {
		var N = NC * 256;
		var dist = new Uint8Array(N).fill(255);
		dist[SOLVED_C << 8] = 0;
		var cnt = [1];
		for (var d = 0, n = 1; n; d++) {
			n = 0;
			for (var i = 0; i < N; i++) {
				if (dist[i] != d) {
					continue;
				}
				for (var m = 0; m < 12; m++) {
					if (legalIdx(i, m, official)) {
						var j = moveIdx(i, m);
						if (dist[j] == 255) {
							dist[j] = d + 1;
							n++;
						}
					}
				}
			}
			n && cnt.push(n);
		}
		return { dist: dist, count: cnt };
	}

	return {
		scramble: scramble,
		solve: solveIdx,
		randomIdx: randomIdx,
		moveIdx: moveIdx,
		legalIdx: legalIdx,
		moveName: moveName,
		toIdx: toIdx,
		godTable: godTable,
		cornersOf: cornersOf,
		SOLVED: SOLVED_C << 8
	};
})();

scrMgr.reg('sfl', function() {
	return superFloppy.scramble(mathlib.rn, true);
});
scrMgr.reg('sfli', function() {
	return superFloppy.scramble(mathlib.rn, false);
});
