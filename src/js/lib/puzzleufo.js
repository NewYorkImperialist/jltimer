// @ts-check
"use strict";

// jlTimer Rubik's Ufo (Special > UFO > "Jaap style", event "ufo"). The model shared by the scramble image
// (tools/image.js) and the virtual puzzle (twisty/twistyufo.js).
//
// csTimer's "ufo" scrambler (scramble/megascramble.js, unchanged) is Jaap Scherphuis's Rubik's Ufo scrambler
// (jaapsch.net/scramble_ufo.htm, puzzle page jaapsch.net/puzzles/rubufo.htm) with his moves A B C and U1..U5 written
// U, U2, U3, U2', U'. The Rubik's Ufo is a flying saucer of two disks with six 60-degree segments each: the disks turn
// against each other in sixths, and any half of the puzzle can be given a 180-degree twist that swaps three segments
// of the top disk with three of the bottom. The segments have colours along their sides; solved = every two adjacent
// segments match (one top disk of light grey segments, one of dark grey, the seam colours lined up).
//
// Jaap's notation (scrambler help): hold the puzzle with the yellow seam at the front, light grey on top. B turns
// over the right hand half, split at the yellow seam (front-back); A splits at the pink seam at the front right, C at
// the red seam at the front left; U<n> turns the top disk n sixths clockwise. The bottom disk never turns in his
// scrambles (the red-blue segment at the bottom left never moves).
//
// Positions (Jaap's numbering): top 0..5, bottom 6..11. Angles phi are measured from the front towards the right
// (clockwise seen from below): top segment i is centred at 60i - 150, bottom segment j at 210 + 60(j - 6); so top 3
// is front-right, top 4 right, bottom 7 left. Segment k has seam colours k mod 6 and k mod 6 + 1 on its low-angle and
// high-angle side while in its own disk (colours 0..5: light green, light blue, red, yellow, pink, brown); turned over
// into the other disk the two swap. The state is the segment at each position (orientation follows: a segment is
// upside down exactly when it is in the other disk).
//
// Moves are [type, amount]:
//   ['U', k] top disk k sixths clockwise seen from above; ['D', k] bottom disk k sixths clockwise seen from below
//   ['A' | 'B' | 'C', +-1] the 180-degree twist (the sign only picks the animation's direction)
//   ['y', k] the whole puzzle k sixths clockwise seen from above; ['x' | 'z', +-1] turned over about the left-right
//   (x) or front-back (z) axis (x2 / z2)
var puzzleUfo = (function() {
	/** @type {Object<string, number>} the seam angle each twist splits at */
	var TWIST = { 'A': 60, 'B': 0, 'C': 300 };

	function mod(a, n) {
		return ((a % n) + n) % n;
	}

	/** @param {number} p */
	function angleOf(p) {
		return p < 6 ? 60 * p - 150 : 210 + 60 * (p - 6);
	}

	/**
	 * the position in disk top / bottom at angle phi
	 * @param {boolean} top
	 * @param {number} phi
	 */
	function posAt(top, phi) {
		return top ? mod(Math.round((phi + 150) / 60), 6) : 6 + mod(Math.round((phi - 210) / 60), 6);
	}

	/**
	 * true if the angle lies in the half of the puzzle a twist at seam s turns over (from s to s + 180)
	 * @param {number} phi
	 * @param {number} s
	 */
	function inHalf(phi, s) {
		var d = mod(phi - s, 360);
		return d > 0 && d < 180;
	}

	/**
	 * where a move takes the segment at position p (p itself if it doesn't move it)
	 * @param {any[]} mv
	 * @param {number} p
	 */
	function mapPos(mv, p) {
		var top = p < 6, phi = angleOf(p), t = mv[0], k = mv[1];
		if (t == 'U') {
			return top ? posAt(true, phi - 60 * k) : p;
		} else if (t == 'D') {
			return top ? p : posAt(false, phi + 60 * k);
		} else if (t == 'y') {
			return posAt(top, phi - 60 * k);
		} else if (t == 'z') {
			return posAt(!top, -phi);
		} else if (t == 'x') {
			return posAt(!top, 180 - phi);
		} else if (t in TWIST) {
			var s = TWIST[t];
			return inHalf(phi, s) ? posAt(!top, 2 * s + 180 - phi) : p;
		}
		return p;
	}

	/** the solved puzzle: segment p at position p */
	function solved() {
		var ret = [];
		for (var i = 0; i < 12; i++) {
			ret.push(i);
		}
		return ret;
	}

	/**
	 * apply a move in place
	 * @param {number[]} st
	 * @param {any[]} mv
	 */
	function apply(st, mv) {
		var old = st.slice();
		for (var p = 0; p < 12; p++) {
			st[mapPos(mv, p)] = old[p];
		}
		return st;
	}

	/**
	 * the segments a move turns (by segment)
	 * @param {number[]} st
	 * @param {any[]} mv
	 */
	function moving(st, mv) {
		var ret = [];
		for (var p = 0; p < 12; p++) {
			if (mapPos(mv, p) != p || mv[0] == 'y' || mv[0] == 'x' || mv[0] == 'z' ||
				mv[0] == 'U' && p < 6 || mv[0] == 'D' && p >= 6) {
				ret.push(st[p]);
			}
		}
		return ret;
	}

	/** @param {any[]} mv */
	function isRotation(mv) {
		return mv[0] == 'y' || mv[0] == 'x' || mv[0] == 'z';
	}

	// the 12 whole-puzzle orientations of the solved puzzle
	var SOLVED = (function() {
		var ret = [];
		for (var f = 0; f < 2; f++) {
			for (var k = 0; k < 6; k++) {
				var st = solved();
				if (f) {
					apply(st, ['z', 1]);
				}
				apply(st, ['y', k]);
				ret.push(st.join());
			}
		}
		return ret;
	})();

	/**
	 * solved in any whole-puzzle orientation
	 * @param {number[]} st
	 */
	function isSolved(st) {
		return SOLVED.indexOf(st.join()) >= 0;
	}

	/**
	 * the seam colours of the segment at position p: [low-angle side, high-angle side]
	 * @param {number[]} st
	 * @param {number} p
	 */
	function sideColours(st, p) {
		var k = st[p];
		var c = [k % 6, (k + 1) % 6];
		return (k < 6) == (p < 6) ? c : [c[1], c[0]];
	}

	/**
	 * parse a sequence: A B C, U U' U2 U2' U3 (or Jaap's U1..U5), the same for D and y, x2 z2. Unknown tokens are
	 * skipped.
	 * @param {string} str
	 * @returns {any[][]}
	 */
	function parse(str) {
		var ret = [];
		var toks = String(str || '').split(/\s+/);
		for (var i = 0; i < toks.length; i++) {
			var m = /^([UDy])(\d?)('?)$/.exec(toks[i]);
			if (m) {
				var k = (m[2] === '' ? 1 : ~~m[2]) * (m[3] ? -1 : 1);
				if (mod(k, 6)) {
					ret.push([m[1], norm(k)]);
				}
			} else if (/^[ABC]'?$/.exec(toks[i])) {
				ret.push([toks[i].charAt(0), toks[i].length > 1 ? -1 : 1]);
			} else if (/^[xz]2'?$/.exec(toks[i])) {
				ret.push([toks[i].charAt(0), 1]);
			}
		}
		return ret;
	}

	// sixths as -2 .. 3
	function norm(k) {
		k = mod(k, 6);
		return k > 3 ? k - 6 : k;
	}

	/**
	 * a move in notation (csTimer's: U U' U2 U2' U3, A B C, y..., x2 z2)
	 * @param {any[]} mv
	 * @returns {string}
	 */
	function toStr(mv) {
		var t = mv[0];
		if (t == 'U' || t == 'D' || t == 'y') {
			var k = norm(mv[1]);
			return t + (Math.abs(k) > 1 ? Math.abs(k) : '') + (k < 0 ? "'" : '');
		}
		if (t == 'x' || t == 'z') {
			return t + '2';
		}
		return t;
	}

	/**
	 * the state after a sequence from solved
	 * @param {string} str
	 */
	function run(str) {
		var st = solved();
		var mv = parse(str);
		for (var i = 0; i < mv.length; i++) {
			apply(st, mv[i]);
		}
		return st;
	}

	return {
		TWIST: TWIST,
		angleOf: angleOf,
		posAt: posAt,
		mapPos: mapPos,
		solved: solved,
		apply: apply,
		moving: moving,
		isRotation: isRotation,
		isSolved: isSolved,
		sideColours: sideColours,
		parse: parse,
		toStr: toStr,
		norm: norm,
		run: run
	};
})();
