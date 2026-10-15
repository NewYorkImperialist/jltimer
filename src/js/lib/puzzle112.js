// @ts-check
"use strict";

// jlTimer 1x1x2 and 1x1x1: the puzzle model shared by the 1x1x2 scrambler (scramble/utilscramble.js, event "112"),
// the scramble images (tools/image.js) and the virtual puzzles (twisty/twisty112.js, events "112" and "111").
//
// The model takes a height h: 2 for the 1x1x2 (the default), 1 for the 1x1x1. A 1x1x1 is one cubie centred at the
// origin with all six stickers; every move turns all of it (it has no other layer). It is a joke puzzle: any
// move solves it, which the virtual puzzle (twisty112.js) tracks; the model calls every 1x1x1 state solved.
//
// Two 1x1x1 cubies stacked along a "long axis" with one cut between them. Coordinates: a cubie is 2 units wide,
// the puzzle starts upright (long axis = y), top cubie centred at (0, 1, 0), bottom cubie at (0, -1, 0).
// Each cubie has five stickers (the face towards the cut is hidden); a sticker is stored as its colour (0..5 in
// URFDLB order), its cubie, its centre and its outward normal, all integer vectors.
//
// Moves use the 3x3 notation and are applied to whatever is on that side of the puzzle:
//   - a face turn (U, D, R, ...) turns the cubies whose centre is on that side (centre . normal >= 0). Along the
//     long axis that is one cubie, a real turn; across it the "layer" holds both cubies, so the turn is the whole
//     puzzle turning, exactly as it would be in your hand.
//   - x / y / z (and wide moves like r or u, which on a 1x1x2 are the whole puzzle) turn the whole puzzle.
// The state that matters is the relative turn of the top cubie against the bottom one: 0 (solved, in any
// whole-puzzle orientation), 1, 2 or 3 quarter turns.
var puzzle112 = (function() {
	var FACES = 'URFDLB';
	/** @type {number[][]} outward normals in URFDLB order */
	var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];


	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	// a quarter turn of v, clockwise when looking at the face whose outward normal is n:
	// a +90 degree turn about -n, i.e. v' = (n . v) n + v x n
	function quarter(v, n) {
		var d = dot(n, v);
		return [
			d * n[0] + v[1] * n[2] - v[2] * n[1],
			d * n[1] + v[2] * n[0] - v[0] * n[2],
			d * n[2] + v[0] * n[1] - v[1] * n[0]
		];
	}

	/**
	 * @param {number=} h height: 2 (1x1x2, default) or 1 (1x1x1)
	 * @returns {any}
	 */
	function solved(h) {
		var centers = h == 1 ? [[0, 0, 0]] : [[0, 1, 0], [0, -1, 0]]; // 0 = top cubie, 1 = bottom cubie
		var stickers = [];
		for (var c = 0; c < centers.length; c++) {
			for (var f = 0; f < 6; f++) {
				if (centers.length == 2 && f == (c == 0 ? 3 : 0)) {
					continue; // the face towards the cut
				}
				var n = NORMALS[f];
				stickers.push({
					col: f,
					cubie: c,
					pos: [centers[c][0] + n[0], centers[c][1] + n[1], centers[c][2] + n[2]],
					n: n.slice()
				});
			}
		}
		return { stickers: stickers, centers: centers };
	}

	/** @param {any} st */
	function clone(st) {
		return {
			stickers: st.stickers.map(function(s) {
				return { col: s.col, cubie: s.cubie, pos: s.pos.slice(), n: s.n.slice() };
			}),
			centers: st.centers.map(function(c) {
				return c.slice();
			})
		};
	}

	/**
	 * which cubies a move turns: [0], [1] or every cubie (the whole puzzle: [0, 1], or [0] on a 1x1x1)
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 */
	function layerOf(st, mv) {
		var all = st.centers.map(function(c, i) {
			return i;
		});
		if (mv.whole) {
			return all;
		}
		var n = NORMALS[FACES.indexOf(mv.face)];
		var ret = [];
		for (var c = 0; c < st.centers.length; c++) {
			if (dot(st.centers[c], n) >= 0) {
				ret.push(c);
			}
		}
		return ret;
	}

	/**
	 * true if the move changes the relative state (a real turn, not the whole puzzle turning)
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 */
	function isTurn(st, mv) {
		return layerOf(st, mv).length < st.centers.length && ((mv.pow % 4) + 4) % 4 != 0;
	}

	/**
	 * apply a move in place
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 */
	function apply(st, mv) {
		var f = FACES.indexOf(mv.face);
		if (f < 0) {
			return st;
		}
		var n = NORMALS[f];
		var layer = layerOf(st, mv);
		var q = ((mv.pow % 4) + 4) % 4;
		for (var k = 0; k < q; k++) {
			for (var i = 0; i < layer.length; i++) {
				st.centers[layer[i]] = quarter(st.centers[layer[i]], n);
			}
			for (var i = 0; i < st.stickers.length; i++) {
				var s = st.stickers[i];
				if (layer.indexOf(s.cubie) != -1) {
					s.pos = quarter(s.pos, n);
					s.n = quarter(s.n, n);
				}
			}
		}
		return st;
	}

	/**
	 * the long axis: the outward direction of the top cubie
	 * @param {any} st
	 */
	function longAxis(st) {
		return st.centers[0].slice();
	}

	function stickerOf(st, cubie, col) {
		for (var i = 0; i < st.stickers.length; i++) {
			if (st.stickers[i].cubie == cubie && st.stickers[i].col == col) {
				return st.stickers[i];
			}
		}
		return null;
	}

	/**
	 * the relative turn of the top cubie against the bottom one, in clockwise quarter turns seen from the top end
	 * (after U it is 1, after U2 2, after U' 3); 0 = solved
	 * @param {any} st
	 */
	function relState(st) {
		var a = longAxis(st);
		var nt = stickerOf(st, 0, 2).n; // the F-coloured stickers of both cubies
		var v = stickerOf(st, 1, 2).n;
		for (var k = 0; k < 4; k++) {
			if (v[0] == nt[0] && v[1] == nt[1] && v[2] == nt[2]) {
				return k;
			}
			v = quarter(v, a);
		}
		return -1;
	}

	/** @param {any} st */
	function isSolved(st) {
		return st.centers.length == 1 ? true : relState(st) == 0;
	}

	var POW = { '': 1, "'": -1, '2': 2, "2'": -2 };
	var WIDE = { 'x': 'R', 'y': 'U', 'z': 'F' };

	/**
	 * parse a move sequence; tokens that are not 1x1x2 moves are skipped. Slices (M, E, S) do nothing on a 1x1x2.
	 * @param {string} str
	 * @returns {Array<{face: string, pow: number, whole: boolean}>}
	 */
	function parse(str) {
		var ret = [];
		var toks = String(str || '').split(/\s+/);
		for (var i = 0; i < toks.length; i++) {
			var m = /^(\d*)([URFDLBurfdlbxyz])(w?)(2'|2|'|)$/.exec(toks[i]);
			if (!m) {
				continue;
			}
			var ch = m[2];
			if (WIDE[ch]) {
				ret.push({ face: WIDE[ch], pow: POW[m[4]], whole: true });
			} else if (ch == ch.toLowerCase() || m[3] || ~~m[1] >= 2) {
				ret.push({ face: ch.toUpperCase(), pow: POW[m[4]], whole: true });
			} else {
				ret.push({ face: ch, pow: POW[m[4]], whole: false });
			}
		}
		return ret;
	}

	/**
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 * @returns {string}
	 */
	function toStr(mv) {
		var p = ((mv.pow % 4) + 4) % 4;
		if (mv.whole) {
			var f = FACES.indexOf(mv.face);
			if (f >= 3) { // L, D, B rotations are x', y', z'
				p = (4 - p) % 4;
			}
			return 'yxz'.charAt(f % 3) + ['', '', '2', "'"][p];
		}
		return mv.face + ['', '', '2', "'"][p];
	}

	/**
	 * the state after a sequence, from solved
	 * @param {string} str
	 * @param {number=} h height (see solved)
	 */
	function run(str, h) {
		var st = solved(h);
		var mv = parse(str);
		for (var i = 0; i < mv.length; i++) {
			apply(st, mv[i]);
		}
		return st;
	}

	/**
	 * 1x1x2 random-state scramble: one of the three unsolved states, uniformly, as its shortest sequence (WCA style:
	 * a scramble is never solved). rn(n) returns a uniform integer in [0, n). (The 1x1x1 keeps csTimer's random
	 * x / y / z string, scramble/megascramble.js.)
	 * @param {(n: number) => number} rn
	 */
	function scramble(rn) {
		return ['U', 'U2', "U'"][rn(3)];
	}

	return {
		FACES: FACES,
		NORMALS: NORMALS,
		solved: solved,
		clone: clone,
		apply: apply,
		layerOf: layerOf,
		isTurn: isTurn,
		longAxis: longAxis,
		relState: relState,
		isSolved: isSolved,
		parse: parse,
		toStr: toStr,
		run: run,
		scramble: scramble
	};
})();
