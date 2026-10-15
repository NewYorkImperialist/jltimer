// @ts-check
"use strict";

// jlTimer Siamese Cubes (Special > Siamese Cube): two 3x3x3 cubes fused so that they share a block of cubies.
// The model shared by the scramble image (tools/image.js) and the virtual puzzle (twisty/twistysiamese.js).
//
//   sia113  1x1x3 block: Tony Fischer's Siamese Cubes / Rubik's Mate (jaapsch.net/puzzles/siamese.htm). Each cube is
//           a 3x3x3 with one 1x1x3 edge column glued; it turns U, u (= U + E), R and r (= R + M) relative to the
//           glued column.
//   sia123  1x2x3 block: the "new Siamese Cube" (qqTimer's notes): each cube turns U, R and r.
//   sia222  2x2x2 block: the "Fused Cube": each cube turns U, R and F.
//
// csTimer's scrambles (scramble/megascramble.js, kept unchanged) give the moves of the first cube, then a regrip
// ("z2", or "z2 y" for the 2x2x2 block) that brings the second cube to where the first one was, then the moves of the
// second cube. Lowercase letters are double-layer turns (qqTimer's notes: "A lowercase letter means a double layer
// turn").
//
// Geometry, in the frame of those scrambles: cube A has its glued block at its D-L(-B) side, cube B is displaced
// down-left(-back) so that its U-R(-F) side is the same block. Coordinates: cubie = 2 units, the whole puzzle centred
// on the origin, cube A's centre at +OFF, cube B's at -OFF:
//   sia113 OFF (2, 2, 0): shared cubies x = 0, y = 0, every z (the block runs front to back)
//   sia123 OFF (2, 1, 0): shared x = 0, y = -1 and 1, every z
//   sia222 OFF (1, 1, 1): shared x, y, z in {-1, 1}
// A sticker exists on a cubie face that is on its cube's surface and not covered by the other cube; so the shared
// block of sia113 shows only its front and back stickers (which belong to both cubes' F / B faces), the 2x2x2 block
// none at all.
//
// Moves are written in the frame of the whole puzzle, as on a 3x3: a face turn turns that face of the cube whose face
// it is ("U" = the top layer of the upper cube, "D" = the bottom layer of the lower cube); of the two cubes the one
// whose face lies further out in that direction is used, among those for which the turn is possible (it may not
// contain a shared cubie). So with the scramble's frame, U R u r turn cube A and D L d l cube B; after the scramble's
// regrip z2 the cubes have swapped places and U R u r turn cube B, exactly as the scramble reads. Moves are
// [layerStart, layerEnd, face, quarterTurns, cube] with layers counted from that face of that cube (1 = the face, 2 = u
// / r, [2, -2] the middle slice M / E / S) and layerEnd 99 = the whole puzzle (x / y / z; cube ignored).
var puzzleSiamese = (function() {
	var FACES = 'URFDLB';
	/** @type {number[][]} outward normals in URFDLB order */
	var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
	var AXIS = [1, 0, 2, 1, 0, 2];
	var SIGN = [1, 1, 1, -1, -1, -1];
	/** @type {Object<string, number[]>} cube A's centre (cube B's is the negative) */
	var OFF = {
		'sia113': [2, 2, 0],
		'sia123': [2, 1, 0],
		'sia222': [1, 1, 1]
	};
	var WHOLE = 99;
	var INNER = -2;
	var SHARED = 2; // sticker.cube of the shared block

	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	// a quarter turn of v about the origin, clockwise looking at the face whose outward normal is n
	function quarter(v, n) {
		var d = dot(n, v);
		return [
			d * n[0] + v[1] * n[2] - v[2] * n[1],
			d * n[1] + v[2] * n[0] - v[0] * n[2],
			d * n[2] + v[0] * n[1] - v[1] * n[0]
		];
	}

	function add(a, b) {
		return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
	}

	function sub(a, b) {
		return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
	}

	function inCube(p, centre) {
		return Math.abs(p[0] - centre[0]) <= 2 && Math.abs(p[1] - centre[1]) <= 2 && Math.abs(p[2] - centre[2]) <= 2;
	}

	/**
	 * the solved puzzle in the scramble's frame
	 * @param {string} type sia113 / sia123 / sia222
	 * @returns {any}
	 */
	function solved(type) {
		var off = OFF[type];
		var cubes = [off.slice(), [-off[0], -off[1], -off[2]]];
		var stickers = [];
		var shared = [];
		var seen = {};
		for (var k = 0; k < 2; k++) {
			var other = cubes[1 - k];
			for (var i = -2; i <= 2; i += 2) {
				for (var j = -2; j <= 2; j += 2) {
					for (var l = -2; l <= 2; l += 2) {
						var p = add(cubes[k], [i, j, l]);
						var isShared = inCube(p, other);
						if (isShared && k == 1) {
							continue; // added with cube A
						}
						if (isShared) {
							shared.push(p);
						}
						for (var f = 0; f < 6; f++) {
							var n = NORMALS[f];
							if (dot(sub(p, cubes[k]), n) != 2 || inCube(add(p, add(n, n)), other)) {
								continue; // inside its cube, or covered by the other cube
							}
							var key = add(p, n).join();
							if (!seen[key]) {
								seen[key] = 1;
								stickers.push({ col: f, c: p, n: n.slice(), cube: isShared ? SHARED : k });
							}
						}
					}
				}
			}
		}
		return { type: type, cubes: cubes, shared: shared, stickers: stickers, frame: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
	}

	/** @param {any} st */
	function clone(st) {
		return {
			type: st.type,
			cubes: st.cubes.map(function(c) {
				return c.slice();
			}),
			shared: st.shared.map(function(c) {
				return c.slice();
			}),
			stickers: st.stickers.map(function(s) {
				return { col: s.col, c: s.c.slice(), n: s.n.slice(), cube: s.cube };
			}),
			frame: st.frame.map(function(c) {
				return c.slice();
			})
		};
	}

	/**
	 * the layer of cube k (counted from face f, 1-based) that point p is in
	 * @param {any} st
	 * @param {number} k
	 * @param {number[]} p
	 * @param {number} f
	 */
	function layerOf(st, k, p, f) {
		var a = AXIS[f];
		return (2 - SIGN[f] * (p[a] - st.cubes[k][a])) / 2 + 1;
	}

	function range(mv) {
		var lo = mv[0], hi = mv[1];
		if (hi == INNER) {
			hi = 2;
		}
		return [Math.max(lo, 1), Math.min(hi, 3)];
	}

	/** @param {any[]} mv */
	function isRotation(mv) {
		return mv[1] >= WHOLE;
	}

	/**
	 * can cube k turn these layers? (not the whole cube, and no shared cubie in them)
	 * @param {any} st
	 * @param {number} k
	 * @param {any[]} mv
	 */
	function canTurn(st, k, mv) {
		var f = FACES.indexOf(mv[2]);
		var r = range(mv);
		if (f < 0 || r[0] > r[1] || r[0] == 1 && r[1] == 3) {
			return false;
		}
		for (var i = 0; i < st.shared.length; i++) {
			var l = layerOf(st, k, st.shared[i], f);
			if (l >= r[0] && l <= r[1]) {
				return false;
			}
		}
		return true;
	}

	/**
	 * the move with its cube, or null if no cube can make it (a turn through the shared block)
	 * @param {any} st
	 * @param {any[]} mv [layerStart, layerEnd, face, quarterTurns]
	 * @returns {any[]|null}
	 */
	function resolve(st, mv) {
		var f = FACES.indexOf(mv[2]);
		if (f < 0 || !(mv[3] % 4)) {
			return null;
		}
		if (mv[1] >= WHOLE) {
			return [1, WHOLE, mv[2], mv[3], 0];
		}
		var best = -1, bestOut = -1e9, tie = false;
		for (var k = 0; k < 2; k++) {
			if (!canTurn(st, k, mv)) {
				continue;
			}
			var out = SIGN[f] * st.cubes[k][AXIS[f]];
			if (out > bestOut) {
				best = k;
				bestOut = out;
				tie = false;
			} else if (out == bestOut) {
				tie = true;
			}
		}
		if (best < 0 || tie) {
			return null;
		}
		return [mv[0], mv[1], mv[2], mv[3], best];
	}

	/**
	 * indices of the stickers a resolved move turns
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function turning(st, mv) {
		var ret = [];
		var f = FACES.indexOf(mv[2]);
		if (mv[1] >= WHOLE) {
			for (var i = 0; i < st.stickers.length; i++) {
				ret.push(i);
			}
			return ret;
		}
		var r = range(mv);
		for (var i = 0; i < st.stickers.length; i++) {
			var s = st.stickers[i];
			if (s.cube != mv[4]) {
				continue;
			}
			var l = layerOf(st, mv[4], s.c, f);
			if (l >= r[0] && l <= r[1]) {
				ret.push(i);
			}
		}
		return ret;
	}

	/**
	 * the point the move turns about (the centre of its cube, or the origin for a rotation)
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function pivot(st, mv) {
		return mv[1] >= WHOLE ? [0, 0, 0] : st.cubes[mv[4]].slice();
	}

	/**
	 * apply a resolved move in place
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function apply(st, mv) {
		var f = FACES.indexOf(mv[2]);
		var q = ((mv[3] % 4) + 4) % 4;
		var n = NORMALS[f];
		var idx = turning(st, mv);
		var o = pivot(st, mv);
		for (var t = 0; t < q; t++) {
			for (var i = 0; i < idx.length; i++) {
				var s = st.stickers[idx[i]];
				s.c = add(quarter(sub(s.c, o), n), o);
				s.n = quarter(s.n, n);
			}
			if (mv[1] >= WHOLE) {
				st.cubes = st.cubes.map(function(c) {
					return quarter(c, n);
				});
				st.shared = st.shared.map(function(c) {
					return quarter(c, n);
				});
				st.frame = st.frame.map(function(c) {
					return quarter(c, n);
				});
			}
		}
		return st;
	}

	/**
	 * solved = every face of each cube one colour (the shared block's stickers count for both cubes), in any
	 * whole-puzzle orientation
	 * @param {any} st
	 */
	function isSolved(st) {
		var col = {};
		for (var i = 0; i < st.stickers.length; i++) {
			var s = st.stickers[i];
			for (var k = 0; k < 2; k++) {
				if (s.cube != k && s.cube != SHARED) {
					continue;
				}
				var key = k + ':' + s.n.join();
				if (key in col && col[key] != s.col) {
					return false;
				}
				col[key] = s.col;
			}
		}
		return true;
	}

	var POW = { '': 1, "'": -1, '2': 2, "2'": -2 };
	var ROT = { 'x': 'R', 'y': 'U', 'z': 'F' };
	var SLICE = { 'M': 'L', 'E': 'D', 'S': 'F' };

	/**
	 * parse a move sequence: U R F D L B, u r f d l b / Uw (double layer), M E S (middle slices, turning like L D F),
	 * x y z. Unknown tokens are skipped. Returns unresolved moves [layerStart, layerEnd, face, quarterTurns].
	 * @param {string} str
	 * @returns {any[][]}
	 */
	function parse(str) {
		var ret = [];
		var toks = String(str || '').split(/\s+/);
		for (var i = 0; i < toks.length; i++) {
			var m = /^([URFDLBurfdlbxyzMES])(w?)(2'|2|'|)$/.exec(toks[i]);
			if (!m) {
				continue;
			}
			var ch = m[1], p = POW[m[3]];
			if (ROT[ch]) {
				ret.push([1, WHOLE, ROT[ch], p]);
			} else if (SLICE[ch]) {
				ret.push([2, INNER, SLICE[ch], p]);
			} else {
				ret.push([1, m[2] || ch != ch.toUpperCase() ? 2 : 1, ch.toUpperCase(), p]);
			}
		}
		return ret;
	}

	/**
	 * a resolved move in notation: U, u (double layer), M E S, x y z
	 * @param {any[]} mv
	 * @returns {string}
	 */
	function toStr(mv) {
		var f = FACES.indexOf(mv[2]);
		var p = ((mv[3] % 4) + 4) % 4;
		var suf = ['', '', '2', "'"];
		if (mv[1] >= WHOLE || mv[1] == INNER) {
			var opp = mv[1] >= WHOLE ? f >= 3 : f == 0 || f == 1 || f == 5;
			if (opp) {
				p = (4 - p) % 4;
			}
			return (mv[1] >= WHOLE ? 'yxz' : 'EMS').charAt(f % 3) + suf[p];
		}
		return (mv[1] >= 2 ? mv[2].toLowerCase() : mv[2]) + suf[p];
	}

	// whole-puzzle rotation sequences (every orientation, shortest first), for turning the puzzle back upright
	var ORIENTS = (function() {
		var one = ['x', 'x2', "x'", 'y', 'y2', "y'", 'z', 'z2', "z'"];
		var ret = [''].concat(one);
		for (var i = 0; i < one.length; i++) {
			for (var j = 0; j < one.length; j++) {
				ret.push(one[i] + ' ' + one[j]);
			}
		}
		return ret;
	})();

	/**
	 * the rotations that bring the puzzle back to the scramble's starting orientation (csTimer's scrambles end held
	 * upside down after their regrip), as resolved moves
	 * @param {any} st
	 * @returns {any[][]}
	 */
	function uprightMoves(st) {
		for (var i = 0; i < ORIENTS.length; i++) {
			var mv = parse(ORIENTS[i]);
			var fr = st.frame.map(function(c) {
				return c.slice();
			});
			for (var j = 0; j < mv.length; j++) {
				for (var t = 0; t < ((mv[j][3] % 4) + 4) % 4; t++) {
					fr = fr.map(function(c) {
						return quarter(c, NORMALS[FACES.indexOf(mv[j][2])]);
					});
				}
			}
			if (fr[0][0] == 1 && fr[1][1] == 1 && fr[2][2] == 1) {
				return mv.map(function(m) {
					return [1, WHOLE, m[2], m[3], 0];
				});
			}
		}
		return [];
	}

	/**
	 * resolve a parsed sequence on st (in place), dropping moves no cube can make
	 * @param {any} st
	 * @param {any[][]} moves
	 * @returns {any[][]}
	 */
	function resolveAll(st, moves) {
		var ret = [];
		for (var i = 0; i < moves.length; i++) {
			var mv = resolve(st, moves[i]);
			if (mv) {
				apply(st, mv);
				ret.push(mv);
			}
		}
		return ret;
	}

	/**
	 * the moves of a scramble from solved, resolved, followed by the rotations that turn the puzzle back upright
	 * @param {string} type
	 * @param {string} str
	 * @returns {any[][]}
	 */
	function scrambleMoves(type, str) {
		var st = solved(type);
		var ret = resolveAll(st, parse(str));
		return ret.concat(uprightMoves(st));
	}

	/**
	 * the state after a sequence from solved
	 * @param {string} type
	 * @param {string} str
	 */
	function run(type, str) {
		var st = solved(type);
		resolveAll(st, parse(str));
		return st;
	}

	return {
		FACES: FACES,
		NORMALS: NORMALS,
		OFF: OFF,
		WHOLE: WHOLE,
		INNER: INNER,
		SHARED: SHARED,
		solved: solved,
		clone: clone,
		resolve: resolve,
		turning: turning,
		pivot: pivot,
		apply: apply,
		isSolved: isSolved,
		isRotation: isRotation,
		canTurn: canTurn,
		parse: parse,
		toStr: toStr,
		resolveAll: resolveAll,
		uprightMoves: uprightMoves,
		scrambleMoves: scrambleMoves,
		run: run
	};
})();
