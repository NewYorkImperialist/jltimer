// @ts-check
"use strict";

// jlTimer LxMxN cuboids (Other > LxMxN): 2x2x3 Tower Cube (223), 2x3x3 Domino (233), 3x3x4 .. 3x3x7 (334 .. 337).
// The puzzle model shared by the scramblers (scramble/utilscramble.js), the scramble image (tools/image.js) and the
// virtual puzzle (twisty/twistycuboid.js). The 3x3x5 and 3x3x7 change shape: their model is lib/puzzleshift.js (which
// reuses the notation here), their renderer twisty/twistyshift.js.
//
// Coordinates: the cuboid is centred on the origin, a cubie is 2 units wide, dims = [X, Y, Z] cubies along x (L->R),
// y (D->U) and z (B->F) in the current orientation (whole-puzzle rotations swap them). Every sticker is stored as
// its colour (0..5 in URFDLB order), the centre of its cubie and its outward normal, all integer vectors.
//
// Moves use the NxN move format [layerStart, layerEnd, face, quarterTurns]: layers are counted from that face (1 =
// the face itself), so [1, 1, "U", 1] is U, [1, 2, "U", 1] is Uw (= u), [2, 3, "R", 1] the 2nd and 3rd layers from R.
// Two special layerEnd values keep a move's meaning independent of the orientation:
//   99  the whole puzzle (x / y / z)
//   -2  all inner layers between that face and the opposite one (M / E / S: on a 3-wide axis the middle layer,
//       on the 3x3x4's vertical axis both inner layers)
// Mechanics (jaapsch.net cube223.htm, domino.htm, cube334.htm): a layer may make quarter turns only if its cross
// section is square; the rectangular faces (and slices) only make half turns. A quarter turn asked of a layer that
// can only make half turns is a half turn (resolve()). Whole-puzzle rotations are always quarter turns.
var puzzleCuboid = (function() {
	var FACES = 'URFDLB';
	/** @type {number[][]} outward normals in URFDLB order */
	var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
	var AXIS = [1, 0, 2, 1, 0, 2]; // the coordinate each face's normal lies along
	var SIGN = [1, 1, 1, -1, -1, -1];
	/** @type {Object<string, number[]>} event id -> [X, Y, Z] when upright */
	var DIMS = {
		'223': [2, 3, 2],
		'233': [3, 2, 3],
		'334': [3, 4, 3],
		'335': [3, 5, 3],
		'336': [3, 6, 3],
		'337': [3, 7, 3]
	};
	var WHOLE = 99;
	var INNER = -2;

	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	// a quarter turn of v, clockwise when looking at the face whose outward normal is n (as in lib/puzzle112.js and
	// twisty/twistynnn.js sidesRot): v' = (n . v) n + v x n
	function quarter(v, n) {
		var d = dot(n, v);
		return [
			d * n[0] + v[1] * n[2] - v[2] * n[1],
			d * n[1] + v[2] * n[0] - v[0] * n[2],
			d * n[2] + v[0] * n[1] - v[1] * n[0]
		];
	}

	/**
	 * the solved puzzle, upright
	 * @param {number[]} dims
	 * @returns {any}
	 */
	function solved(dims) {
		var stickers = [];
		for (var f = 0; f < 6; f++) {
			var a = AXIS[f], u = (a + 1) % 3, v = (a + 2) % 3;
			for (var i = 0; i < dims[u]; i++) {
				for (var j = 0; j < dims[v]; j++) {
					var c = [0, 0, 0];
					c[a] = SIGN[f] * (dims[a] - 1);
					c[u] = 2 * i - dims[u] + 1;
					c[v] = 2 * j - dims[v] + 1;
					stickers.push({ col: f, c: c, n: NORMALS[f].slice() });
				}
			}
		}
		return { dims: dims.slice(), stickers: stickers };
	}

	/** @param {any} st */
	function clone(st) {
		return {
			dims: st.dims.slice(),
			stickers: st.stickers.map(function(s) {
				return { col: s.col, c: s.c.slice(), n: s.n.slice() };
			})
		};
	}

	/**
	 * the layers a move turns in the current orientation, as [from, to] counted from its face (1-based), or null if
	 * it turns nothing (a slice of a 2-wide axis); the whole puzzle is [1, dim]
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function layerRange(st, mv) {
		var f = FACES.indexOf(mv[2]);
		if (f < 0) {
			return null;
		}
		var dim = st.dims[AXIS[f]];
		var lo = mv[0], hi = mv[1];
		if (hi >= WHOLE) {
			return [1, dim];
		}
		if (hi < 0) {
			hi = dim + 1 + hi;
		}
		lo = Math.max(lo, 1);
		hi = Math.min(hi, dim);
		return lo <= hi ? [lo, hi] : null;
	}

	/**
	 * the layer (counted from face f) the sticker's cubie is in
	 * @param {any} st
	 * @param {any} s
	 * @param {number} f
	 */
	function layerOf(st, s, f) {
		var a = AXIS[f];
		return (st.dims[a] - 1 - SIGN[f] * s.c[a]) / 2 + 1;
	}

	/**
	 * true if the layers of this face can make quarter turns (their cross section is square)
	 * @param {any} st
	 * @param {string} face
	 */
	function isSquare(st, face) {
		var a = AXIS[FACES.indexOf(face)];
		return st.dims[(a + 1) % 3] == st.dims[(a + 2) % 3];
	}

	/** @param {any[]} mv */
	function isRotation(mv) {
		return mv[1] >= WHOLE;
	}

	/**
	 * the move as the puzzle in state st really does it, or null if it does nothing:
	 *   - layers covering the whole puzzle are the rotation (x / y / z), layers reaching the far face are counted from
	 *     that face (so the move log reads naturally)
	 *   - a quarter turn of a layer that can only make half turns is a half turn
	 * @param {any} st
	 * @param {any[]} mv
	 * @returns {any[]|null}
	 */
	function resolve(st, mv) {
		var f = FACES.indexOf(mv[2]);
		var r = layerRange(st, mv);
		if (!r || !mv[3]) {
			return null;
		}
		var dim = st.dims[AXIS[f]];
		var ret = mv.slice(0, 4);
		if (r[0] == 1 && r[1] == dim) {
			return [1, WHOLE, mv[2], mv[3]];
		}
		if (mv[1] == INNER && r[0] == 2 && r[1] == dim - 1) {
			ret = [2, INNER, mv[2], mv[3]];
		} else if (r[1] == dim && r[0] > 1) {
			ret = [1, dim - r[0] + 1, FACES.charAt((f + 3) % 6), -mv[3]];
		} else {
			ret = [r[0], r[1], mv[2], mv[3]];
		}
		if (!isSquare(st, mv[2]) && Math.abs(ret[3]) % 2 == 1) {
			ret[3] = ret[3] > 0 ? 2 : -2;
		}
		return ret;
	}

	/**
	 * apply a move in place (an illegal quarter turn is applied as a half turn)
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function apply(st, mv) {
		var f = FACES.indexOf(mv[2]);
		var r = layerRange(st, mv);
		if (!r) {
			return st;
		}
		var whole = r[0] == 1 && r[1] == st.dims[AXIS[f]];
		var q = ((mv[3] % 4) + 4) % 4;
		if (q % 2 == 1 && !whole && !isSquare(st, mv[2])) {
			q = 2;
		}
		var n = NORMALS[f];
		var turning = [];
		for (var i = 0; i < st.stickers.length; i++) {
			var l = layerOf(st, st.stickers[i], f);
			if (l >= r[0] && l <= r[1]) {
				turning.push(st.stickers[i]);
			}
		}
		for (var k = 0; k < q; k++) {
			for (var i = 0; i < turning.length; i++) {
				turning[i].c = quarter(turning[i].c, n);
				turning[i].n = quarter(turning[i].n, n);
			}
		}
		if (whole && q % 2 == 1) {
			var a = AXIS[f], u = (a + 1) % 3, v = (a + 2) % 3;
			var t = st.dims[u];
			st.dims[u] = st.dims[v];
			st.dims[v] = t;
		}
		return st;
	}

	/**
	 * solved = every face one colour, in any whole-puzzle orientation
	 * @param {any} st
	 */
	function isSolved(st) {
		var nrm = [];
		for (var i = 0; i < st.stickers.length; i++) {
			var s = st.stickers[i];
			var m = nrm[s.col];
			if (!m) {
				nrm[s.col] = s.n;
			} else if (m[0] != s.n[0] || m[1] != s.n[1] || m[2] != s.n[2]) {
				return false;
			}
		}
		return true;
	}

	var POW = { '': 1, "'": -1, '2': 2, "2'": -2 };
	var ROT = { 'x': 'R', 'y': 'U', 'z': 'F' };
	var SLICE = { 'M': 'L', 'E': 'D', 'S': 'F' };

	/**
	 * parse a move sequence (as in the NxN parser lib/cubeutil.js): U, Uw / u (2 layers), 3Uw / 3u (3 layers),
	 * 2-3Uw (layers 2 to 3), M / E / S (all inner layers, turning like L / D / F), x / y / z. Other tokens (such as
	 * the "/" of csTimer's old 3x3x5 / 3x3x7 scrambles) are skipped.
	 * @param {string} str
	 * @returns {any[][]}
	 */
	function parse(str) {
		var ret = [];
		var toks = String(str || '').split(/\s+/);
		for (var i = 0; i < toks.length; i++) {
			var m = /^(?:(\d+)-(\d+)|(\d+))?([URFDLBurfdlbxyzMES])(w?)(2'|2|'|)$/.exec(toks[i]);
			if (!m) {
				continue;
			}
			var ch = m[4], p = POW[m[6]];
			if (ROT[ch]) {
				ret.push([1, WHOLE, ROT[ch], p]);
			} else if (SLICE[ch]) {
				ret.push([2, INNER, SLICE[ch], p]);
			} else if (m[1]) {
				ret.push([~~m[1], ~~m[2], ch.toUpperCase(), p]);
			} else {
				var lower = ch != ch.toUpperCase();
				var w = ~~m[3] || (m[5] || lower ? 2 : 1);
				ret.push([1, w, ch.toUpperCase(), p]);
			}
		}
		return ret;
	}

	/**
	 * a resolved move in notation (NxN style: U, Uw, 3Uw, 2-3Uw; M / E / S; x / y / z)
	 * @param {any[]} mv
	 * @returns {string}
	 */
	function toStr(mv) {
		var f = FACES.indexOf(mv[2]);
		var p = ((mv[3] % 4) + 4) % 4;
		if (mv[1] >= WHOLE || mv[1] == INNER) {
			var opp = mv[1] >= WHOLE ? f >= 3 : f == 0 || f == 1 || f == 5; // x y z follow R U F, M E S follow L D F
			if (opp) {
				p = (4 - p) % 4;
			}
			return (mv[1] >= WHOLE ? 'yxz' : 'EMS').charAt(f % 3) + ['', '', '2', "'"][p];
		}
		var suf = ['', '', '2', "'"][p];
		if (mv[0] == 1) {
			return (mv[1] > 2 ? mv[1] : '') + mv[2] + (mv[1] >= 2 ? 'w' : '') + suf;
		}
		return mv[0] + '-' + mv[1] + mv[2] + 'w' + suf;
	}

	/**
	 * the state after a sequence, from solved (illegal quarter turns become half turns)
	 * @param {number[]} dims
	 * @param {string} str
	 */
	function run(dims, str) {
		var st = solved(dims);
		var mv = parse(str);
		for (var i = 0; i < mv.length; i++) {
			apply(st, mv[i]);
		}
		return st;
	}

	// ---------- scramblers ----------

	/**
	 * 3x3xN (334 .. 337): random moves in the style of csTimer's megascramble (the same axis is never turned twice in
	 * a row with the same layer). Every cut between two horizontal layers can turn on its own: the moves are U, D
	 * and the wide moves u (top two layers), d, 3u, 3d... up to the middle, so no layer stays fixed to its neighbour.
	 * Side faces make half turns only: R2 L2 F2 B2.
	 * @param {number} n the number of horizontal layers
	 * @param {number} len
	 * @param {(n: number) => number} rn uniform integer in [0, n)
	 */
	function scrambleTall(n, len, rn) {
		var vert = [];
		for (var k = 1; k < n; k++) { // turn the top k layers, written from the nearer end
			var top = k <= n / 2;
			var w = top ? k : n - k;
			vert.push((w > 2 ? w : '') + (w == 1 ? (top ? 'U' : 'D') : (top ? 'u' : 'd')));
		}
		var axes = [vert, ['R', 'L'], ['F', 'B']];
		var out = [];
		var last = -1, done = 0;
		for (var i = 0; i < len; i++) {
			var a, s;
			do {
				a = rn(3);
				s = rn(axes[a].length);
				if (a != last) {
					done = 0;
					last = a;
				}
			} while ((done >> s) & 1);
			done |= 1 << s;
			out.push(axes[a][s] + (a == 0 ? ['', '2', "'"][rn(3)] : '2'));
		}
		return out.join(' ');
	}

	// 2x3x3 Domino: random state. 8 corners and 8 edges in the frame of the U / D centres (U, D quarter turns, the
	// 2x3 sides half turns); every permutation pair is reachable (jaapsch.net domino.htm: 8!*8!/4 positions up to the
	// 4 equivalent orientations). Solved optimally (half-turn metric) by IDA* with two pruning tables: the edge
	// permutation (40320) and the corner permutation together with the places of the 4 U-layer edges (40320 x 70).
	// About 1 s to build the tables once (in the scramble worker), then typically a few ms per scramble.
	var domino = (function() {
		var MOVES = ['U', 'U2', "U'", 'D', 'D2', "D'", 'R2', 'L2', 'F2', 'B2'];
		var MFACE = [0, 0, 0, 1, 1, 1, 2, 3, 4, 5]; // U D R L F B
		var cpos = [], epos = [];
		var cmv = [], emv = [], eprun = [];
		var NSEP = 70;
		var esep = [], sepMv = [], cseprun = null; // esep: edge perm -> which places hold the U-layer edges (70 sets)
		var ready = false;

		var FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

		function getPerm(p) {
			var idx = 0;
			for (var i = 0; i < 8; i++) {
				var c = 0;
				for (var j = i + 1; j < 8; j++) {
					if (p[j] < p[i]) {
						c++;
					}
				}
				idx += c * FACT[7 - i];
			}
			return idx;
		}

		function setPerm(idx) {
			var p = [], left = [0, 1, 2, 3, 4, 5, 6, 7];
			for (var i = 0; i < 8; i++) {
				var f = FACT[7 - i];
				var c = Math.floor(idx / f);
				idx %= f;
				p.push(left.splice(c, 1)[0]);
			}
			return p;
		}

		function key(c) {
			return c.join(',');
		}

		function init() {
			if (ready) {
				return;
			}
			ready = true;
			for (var x = -2; x <= 2; x += 2) {
				for (var y = -1; y <= 1; y += 2) {
					for (var z = -2; z <= 2; z += 2) {
						if (x == 0 && z == 0) {
							continue;
						}
						(x != 0 && z != 0 ? cpos : epos).push([x, y, z]);
					}
				}
			}
			var cidx = {}, eidx = {};
			cpos.forEach(function(c, i) {
				cidx[key(c)] = i;
			});
			epos.forEach(function(c, i) {
				eidx[key(c)] = i;
			});
			// where each move sends each position (from the cuboid model itself)
			var cmap = [], emap = [];
			for (var m = 0; m < MOVES.length; m++) {
				var mv = parse(MOVES[m])[0];
				var st = { dims: [3, 2, 3], stickers: [] };
				var all = cpos.concat(epos);
				for (var i = 0; i < all.length; i++) {
					st.stickers.push({ col: 0, c: all[i].slice(), n: [0, 1, 0] });
				}
				apply(st, mv);
				cmap[m] = [];
				emap[m] = [];
				for (var i = 0; i < all.length; i++) {
					var to = key(st.stickers[i].c);
					if (i < 8) {
						cmap[m][i] = cidx[to];
					} else {
						emap[m][i - 8] = eidx[to];
					}
				}
			}
			// a state is p[position] = piece; moving sends the piece at position i to map[i]
			function table(map, out) {
				for (var s = 0; s < 40320; s++) {
					var p = setPerm(s);
					out[s] = [];
					for (var m = 0; m < MOVES.length; m++) {
						var q = [];
						for (var i = 0; i < 8; i++) {
							q[map[m][i]] = p[i];
						}
						out[s][m] = getPerm(q);
					}
				}
			}
			table(cmap, cmv);
			table(emap, emv);
			prun(emv, eprun);
			// a stronger table: the corner permutation together with where the 4 U-layer edges are
			var uPiece = epos.map(function(c) {
				return c[1] > 0;
			});
			var maskIdx = {}, masks = [];
			for (var e = 0; e < 40320; e++) {
				var p = setPerm(e), mask = 0;
				for (var i = 0; i < 8; i++) {
					if (uPiece[p[i]]) {
						mask |= 1 << i;
					}
				}
				if (!(mask in maskIdx)) {
					maskIdx[mask] = masks.length;
					masks.push(e);
				}
				esep[e] = maskIdx[mask];
			}
			for (var s = 0; s < masks.length; s++) {
				sepMv[s] = [];
				for (var m = 0; m < MOVES.length; m++) {
					sepMv[s][m] = esep[emv[masks[s]][m]];
				}
			}
			var ns = masks.length; // 70 = C(8, 4)
			cseprun = new Int8Array(40320 * ns).fill(-1);
			var start = esep[0];
			cseprun[start] = 0;
			var frontier = [start], d = 0;
			while (frontier.length) {
				var next = [];
				for (var i = 0; i < frontier.length; i++) {
					var c = Math.floor(frontier[i] / ns), sp = frontier[i] % ns;
					for (var m = 0; m < MOVES.length; m++) {
						var t = cmv[c][m] * ns + sepMv[sp][m];
						if (cseprun[t] == -1) {
							cseprun[t] = d + 1;
							next.push(t);
						}
					}
				}
				frontier = next;
				d++;
			}
		}

		function prun(mv, out) {
			for (var i = 0; i < 40320; i++) {
				out[i] = -1;
			}
			out[0] = 0;
			var frontier = [0], d = 0;
			while (frontier.length) {
				var next = [];
				for (var i = 0; i < frontier.length; i++) {
					for (var m = 0; m < MOVES.length; m++) {
						var t = mv[frontier[i]][m];
						if (out[t] == -1) {
							out[t] = d + 1;
							next.push(t);
						}
					}
				}
				frontier = next;
				d++;
			}
		}

		function search(c, e, depth, lastFace, sol) {
			if (depth == 0) {
				return c == 0 && e == 0;
			}
			if (eprun[e] > depth || cseprun[c * NSEP + esep[e]] > depth) {
				return false;
			}
			for (var m = 0; m < MOVES.length; m++) {
				var f = MFACE[m];
				// no face twice in a row; U and D (R L, F B) commute, so only one order
				if (f == lastFace || (f >> 1) == (lastFace >> 1) && f < lastFace) {
					continue;
				}
				if (search(cmv[c][m], emv[e][m], depth - 1, f, sol)) {
					sol.push(MOVES[m]);
					return true;
				}
			}
			return false;
		}

		/**
		 * a solution of the state (corner permutation index, edge permutation index), shortest in the half-turn metric
		 * @param {number} c
		 * @param {number} e
		 */
		function solve(c, e) {
			init();
			var sol = [];
			for (var d = 0; d < 30; d++) {
				if (search(c, e, d, -1, sol)) {
					break;
				}
			}
			return sol.reverse();
		}

		/** @param {(n: number) => number} rn */
		function scramble(rn) {
			init();
			// the 4 solved positions in this frame: U^k D^-k (the whole puzzle turned about the vertical axis)
			var solvedSt = [];
			var c = 0, e = 0;
			for (var k = 0; k < 4; k++) {
				solvedSt.push(c + ',' + e);
				c = cmv[cmv[c][0]][5]; // U D'
				e = emv[emv[e][0]][5];
			}
			do {
				c = rn(40320);
				e = rn(40320);
			} while (solvedSt.indexOf(c + ',' + e) != -1);
			// the solution of a uniformly random state, read as a scramble, makes the inverse state: also uniform
			return solve(c, e).join(' ');
		}

		return { scramble: scramble, solve: solve, init: init };
	})();

	/**
	 * a scramble for the event; len = the scramble length from the menu (random-move ones)
	 * @param {string} type
	 * @param {number} len
	 * @param {(n: number) => number} rn
	 */
	function scramble(type, len, rn) {
		if (type == '233') {
			return domino.scramble(rn);
		}
		return scrambleTall(DIMS[type][1], len, rn);
	}

	return {
		FACES: FACES,
		NORMALS: NORMALS,
		AXIS: AXIS,
		DIMS: DIMS,
		WHOLE: WHOLE,
		INNER: INNER,
		solved: solved,
		clone: clone,
		layerRange: layerRange,
		layerOf: layerOf,
		isSquare: isSquare,
		isRotation: isRotation,
		resolve: resolve,
		apply: apply,
		isSolved: isSolved,
		parse: parse,
		toStr: toStr,
		run: run,
		scramble: scramble,
		scrambleTall: scrambleTall,
		domino: domino
	};
})();
