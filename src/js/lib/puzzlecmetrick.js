// @ts-check
"use strict";

// jlTimer Cmetrick (cm3) and Cmetrick Mini (cm2), Special > Cmetrick. The model shared by the scrambler
// (scramble/utilscramble.js: Cmetrick Mini random state), the scramble image (tools/image.js) and the virtual puzzle
// (twisty/twistycmetrick.js).
//
// The puzzle (Dror Rom; jaapsch.net/puzzles/cmetrick.htm and Jaap's JavaScript version): a frame holding a 3x3 (Mini:
// 2x2) array of identical balls coloured like the six faces of a cube. Rolling a ball left or right rolls every ball
// of its row the same way (about the vertical axis), rolling it up or down rolls every ball of its column the same
// way (about the left-right axis); internal cogs keep them together. Solved = every ball in the same orientation (any
// of the 24). 24^9 / 2^4 = 165,112,971,264 positions (Mini: 24^4 / 2 = 165,888), the 2^4 from the orientation
// parities: any move changes the parity of a whole row or column.
//
// Notation (csTimer / qqTimer): rows U, E, D (Mini: U, D) and columns L, M, R (Mini: L, R); an arrow turns the layer
// a quarter in that direction (U< rolls the top row to the left, R^ the right column up), 2 a half turn. Moves are
// [line, quarterTurns]: line 0..n-1 the rows from the top, n..2n-1 the columns from the left; quarterTurns > 0 rolls
// a row left / a column up. Whole-puzzle turns of the frame in its own plane are ['z', k] (k quarter turns clockwise
// as seen from the front).
//
// A ball's orientation is a rotation matrix (9 integers, row-major) taking the ball's own axes to the puzzle's: its
// face with outward normal n (URFDLB order, as the cube colours) points along R n. Puzzle axes: x right, y up, z out
// of the front.
var puzzleCmetrick = (function() {
	/** @type {Object<string, number>} event -> balls per side */
	var SIZE = { 'cm3': 3, 'cm2': 2 };
	var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
	var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
	var ROW_LEFT = [0, 0, -1, 0, 1, 0, 1, 0, 0]; // about y: front -> left, right -> front
	var COL_UP = [1, 0, 0, 0, 0, 1, 0, -1, 0]; // about x: front -> up, up -> back
	var Z_CW = [0, 1, 0, -1, 0, 0, 0, 0, 1]; // the frame a quarter clockwise seen from the front: up -> right

	function mul(a, b) {
		var r = [];
		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 3; j++) {
				r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
			}
		}
		return r;
	}

	function transpose(a) {
		return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
	}

	function pow(m, k) {
		k = ((k % 4) + 4) % 4;
		var r = I3;
		for (var i = 0; i < k; i++) {
			r = mul(m, r);
		}
		return r;
	}

	/** @param {number[]} m @param {number[]} v */
	function apply3(m, v) {
		return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
	}

	/**
	 * the solved puzzle: n x n balls (row-major from the top left), all unturned
	 * @param {string} type cm3 / cm2
	 * @returns {any}
	 */
	function solved(type) {
		var n = SIZE[type];
		var balls = [];
		for (var i = 0; i < n * n; i++) {
			balls.push(I3.slice());
		}
		return { n: n, balls: balls };
	}

	/** @param {any} st */
	function clone(st) {
		return { n: st.n, balls: st.balls.map(function(b) { return b.slice(); }) };
	}

	/**
	 * the balls (indices) a move rolls
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function lineBalls(st, mv) {
		var n = st.n, ret = [];
		for (var k = 0; k < n; k++) {
			ret.push(mv[0] < n ? mv[0] * n + k : k * n + mv[0] - n);
		}
		return ret;
	}

	/**
	 * the rotation a move gives each ball it turns
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function rotation(st, mv) {
		if (mv[0] == 'z') {
			return pow(Z_CW, mv[1]);
		}
		return pow(mv[0] < st.n ? ROW_LEFT : COL_UP, mv[1]);
	}

	/**
	 * apply a move in place
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function apply(st, mv) {
		var r = rotation(st, mv);
		if (mv[0] == 'z') { // the frame turns: balls move to new places and turn with it
			var n = st.n, old = st.balls, nb = [];
			var q = ((mv[1] % 4) + 4) % 4;
			for (var i = 0; i < n * n; i++) {
				var row = Math.floor(i / n), col = i % n;
				for (var t = 0; t < q; t++) { // clockwise: (row, col) -> (col, n - 1 - row)
					var c2 = n - 1 - row;
					row = col;
					col = c2;
				}
				nb[row * n + col] = mul(r, old[i]);
			}
			st.balls = nb;
			return st;
		}
		var idx = lineBalls(st, mv);
		for (var i = 0; i < idx.length; i++) {
			st.balls[idx[i]] = mul(r, st.balls[idx[i]]);
		}
		return st;
	}

	/** @param {any} st */
	function isSolved(st) {
		var a = st.balls[0].join();
		for (var i = 1; i < st.balls.length; i++) {
			if (st.balls[i].join() != a) {
				return false;
			}
		}
		return true;
	}

	/**
	 * the colour (URFDLB index) of ball b's face that points along the puzzle direction d
	 * @param {number[]} b
	 * @param {number[]} d
	 */
	function colourAt(b, d) {
		var local = apply3(transpose(b), d);
		for (var f = 0; f < 6; f++) {
			if (NORMALS[f][0] == local[0] && NORMALS[f][1] == local[1] && NORMALS[f][2] == local[2]) {
				return f;
			}
		}
		return -1;
	}

	/** @param {any[]} mv */
	function isRotation(mv) {
		return mv[0] == 'z';
	}

	/** @param {number} n */
	function lineNames(n) {
		return n == 3 ? ['U', 'E', 'D', 'L', 'M', 'R'] : ['U', 'D', 'L', 'R'];
	}

	/**
	 * parse a sequence: U< U> U2 (rows U E D), R^ Rv R2 (columns L M R), also the arrows csTimer may show as
	 * characters; z z' z2 for the frame. Unknown tokens are skipped.
	 * @param {number} n
	 * @param {string} str
	 * @returns {any[][]}
	 */
	function parse(n, str) {
		var names = lineNames(n);
		var ret = [];
		var toks = String(str || '').replace(/←/g, '<').replace(/→/g, '>').replace(/↑/g, '^').replace(/↓/g, 'v').split(/\s+/);
		for (var i = 0; i < toks.length; i++) {
			var m = /^([UEDLMR])([<>^v2])$/.exec(toks[i]);
			if (m) {
				var line = names.indexOf(m[1]);
				if (line < 0) {
					continue;
				}
				var isRow = line < n;
				var q = m[2] == '2' ? 2 : m[2] == (isRow ? '<' : '^') ? 1 : m[2] == (isRow ? '>' : 'v') ? -1 : 0;
				if (q) {
					ret.push([line, q]);
				}
				continue;
			}
			m = /^z(2|'|)$/.exec(toks[i]);
			if (m) {
				ret.push(['z', m[1] == '2' ? 2 : m[1] ? -1 : 1]);
			}
		}
		return ret;
	}

	/**
	 * a move in notation
	 * @param {number} n
	 * @param {any[]} mv
	 * @returns {string}
	 */
	function toStr(n, mv) {
		var q = ((mv[1] % 4) + 4) % 4;
		if (mv[0] == 'z') {
			return 'z' + ['', '', '2', "'"][q];
		}
		var isRow = mv[0] < n;
		return lineNames(n)[mv[0]] + (q == 2 ? '2' : q == 1 ? (isRow ? '<' : '^') : (isRow ? '>' : 'v'));
	}

	/**
	 * the state after a sequence from solved
	 * @param {string} type
	 * @param {string} str
	 */
	function run(type, str) {
		var st = solved(type);
		var mv = parse(SIZE[type], str);
		for (var i = 0; i < mv.length; i++) {
			apply(st, mv[i]);
		}
		return st;
	}

	// ---------- Cmetrick Mini: random state ----------

	// the 24 orientations, numbered, with a multiplication table
	var ORI = null;

	function initOri() {
		if (ORI) {
			return ORI;
		}
		var mats = [I3], keys = [I3.join()];
		for (var i = 0; i < mats.length; i++) {
			var gens = [ROW_LEFT, COL_UP];
			for (var g = 0; g < 2; g++) {
				var m = mul(gens[g], mats[i]);
				if (keys.indexOf(m.join()) < 0) {
					mats.push(m);
					keys.push(m.join());
				}
			}
		}
		var mult = [], inv = [];
		for (var a = 0; a < 24; a++) {
			mult.push([]);
			for (var b = 0; b < 24; b++) {
				mult[a].push(keys.indexOf(mul(mats[a], mats[b]).join()));
				if (mult[a][b] == 0) {
					inv[a] = b;
				}
			}
		}
		ORI = { mats: mats, keys: keys, mult: mult, inv: inv };
		return ORI;
	}

	var MINI = null; // breadth-first search of the Mini up to recolouring: dist / parent move per class

	// a Mini position up to recolouring (relabelling the balls' faces, R -> R h for every ball, which commutes with the
	// moves): the orientations of balls 1..3 times the inverse of ball 0's
	function miniKey(o) {
		var inv0 = ORI.inv[o[0]];
		return (ORI.mult[o[1]][inv0] * 24 + ORI.mult[o[2]][inv0]) * 24 + ORI.mult[o[3]][inv0];
	}

	// the 12 face-turn moves of the Mini as [line, quarterTurns]
	var MINI_MOVES = [];
	for (var l = 0; l < 4; l++) {
		MINI_MOVES.push([l, 1], [l, -1], [l, 2]);
	}

	function initMini() {
		if (MINI) {
			return MINI;
		}
		initOri();
		var rot = MINI_MOVES.map(function(mv) {
			return ORI.keys.indexOf(pow(mv[0] < 2 ? ROW_LEFT : COL_UP, mv[1]).join());
		});
		var lines = [[0, 1], [2, 3], [0, 2], [1, 3]];
		var dist = new Int8Array(13824).fill(-1);
		var from = new Int32Array(13824).fill(-1);
		var how = new Int8Array(13824).fill(-1);
		var queue = [[0, 0, 0, 0]];
		dist[0] = 0;
		var count = [1];
		for (var h = 0; h < queue.length; h++) {
			var o = queue[h], k0 = miniKey(o);
			for (var m = 0; m < MINI_MOVES.length; m++) {
				var t = o.slice(), ln = lines[MINI_MOVES[m][0]];
				t[ln[0]] = ORI.mult[rot[m]][t[ln[0]]];
				t[ln[1]] = ORI.mult[rot[m]][t[ln[1]]];
				var k = miniKey(t);
				if (dist[k] < 0) {
					dist[k] = dist[k0] + 1;
					from[k] = k0;
					how[k] = m;
					count[dist[k]] = (count[dist[k]] || 0) + 1;
					queue.push(t);
				}
			}
		}
		MINI = { dist: dist, from: from, how: how, count: count, reachable: queue.length };
		return MINI;
	}

	/**
	 * a random-state Cmetrick Mini scramble: a position chosen uniformly among the 6,912 (up to recolouring) other than
	 * solved, written as an optimal sequence of face turns from solved (at most 8)
	 * @param {(n: number) => number} rn uniform integer in [0, n)
	 * @returns {string}
	 */
	function scrambleMini(rn) {
		var mini = initMini();
		var pick = 1 + rn(mini.reachable - 1);
		var k = -1;
		for (var i = 0; i < 13824; i++) {
			if (mini.dist[i] > 0 && --pick == 0) {
				k = i;
				break;
			}
		}
		var moves = [];
		while (mini.dist[k] > 0) {
			moves.unshift(toStr(2, MINI_MOVES[mini.how[k]]));
			k = mini.from[k];
		}
		return moves.join(' ');
	}

	return {
		SIZE: SIZE,
		NORMALS: NORMALS,
		solved: solved,
		clone: clone,
		lineBalls: lineBalls,
		rotation: rotation,
		apply: apply,
		isSolved: isSolved,
		isRotation: isRotation,
		colourAt: colourAt,
		parse: parse,
		toStr: toStr,
		run: run,
		initMini: initMini,
		scrambleMini: scrambleMini
	};
})();
