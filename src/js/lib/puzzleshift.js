// @ts-check
"use strict";

// jlTimer: the shape-shifting cuboids 3x3x5 (335) and 3x3x7 (337), shared by the scrambler (scramble/utilscramble.js),
// the scramble image (tools/image.js) and the virtual puzzle (twisty/twistyshift.js). The other cuboids (2x2x3,
// Domino, 3x3x4, 3x3x6) never change shape and stay in lib/puzzlecuboid.js, whose notation (parse / toStr / layer
// ranges) this model reuses.
//
// Mechanics (Jaap Scherphuis's analysis of the shape-shifting cuboids, jaapsch.net cube345.htm / cube234.htm, applied
// to the 3x3xN; Ruwix "3x3x5 and 3x3x7 cuboids"; csTimer's old 335 / 337 scramblers): the puzzle is a 3x3x3 core onto
// which the pieces of the outer layers are attached (1 extra layer at each end on the 3x3x5, 2 on the 3x3x7). The core
// always keeps its shape and any of its 9 layers can make quarter turns, carrying the outer pieces attached to its
// pieces, so a quarter turn of a long side (R L F B, and the slices M S) swings the outer pieces of that side out to
// the front / back: the puzzle changes shape. The outer pieces can only be separated from the core piece they sit on
// (a turn of an outer layer on its own: U, D, or an inner layer between the core and the ends) when they form a
// complete 3x3 outer layer; otherwise that turn is blocked. A turn of the core's own end layer (on the 3x3x5 2-2Uw,
// the 3x3x7 3-3Uw) while its end layer is incomplete carries the end pieces stacked on it (the plane between them
// cuts nothing), so it turns as Uw / 3Uw. The rule in general: a layer turn is possible iff no stack of attached
// pieces crosses its boundary planes, the stacks whose core end it turns riding along (span). Solved = cuboid shape
// and every face one colour, in any orientation.
//
// The flexible entries 335f / 337f (3x3x5 / 3x3x7 "flexible", their own scramble and twisty types) drop the mechanism
// and keep only the geometry: a turn is possible whenever its cut planes pass through no piece and its pieces can turn
// without hitting the others. Every piece is a unit cubie on the grid and every turn is a quarter turn of whole grid
// layers about an axis through the centre, so a cut plane (between grid layers) never passes through a piece and the
// turning pieces stay within their layers along the axis, where no other piece is: every layer turn is possible that
// holds at least one piece and not all of them (that would be a rotation). After R on the 3x3x5 its U turns the six
// end pieces left on top, 2-2Uw the core's top layer on its own. The reachable shapes stay on the grid (rotations
// keep every coordinate within +-(k + 1)), so the same state holds them; solved additionally needs every sticker on
// the outside, since a core piece could now sit in an end layer with its sticker turned inwards.
//
// Coordinates: one unit per cubie, the core occupies -1..1 on every axis, an outer piece has one coordinate beyond
// +-1 (up to +-2 / +-3). Every cubie (also the hidden core centre) is stored with its position and the current
// directions of its six faces (in URFDLB home order); a face that is outside on the solved cuboid carries a sticker of
// that face's colour. dims = [X, Y, Z] is the frame the notation counts layers in: the cuboid's long axis is the one
// its outer layers sit on. Whole-puzzle rotations turn the frame with the puzzle, and whenever the puzzle is back in
// cuboid shape the frame follows its long axis (e.g. after R L' M', a core x, the puzzle lies on its side: the keys
// then turn it as a lying cuboid, as after a rotation). In other shapes the frame stays as it was (Jaap: keep in mind
// you have a core and that the outer pieces will eventually form the end layers).
//
// Moves use the NxN move format of lib/puzzlecuboid.js, [layerStart, layerEnd, face, quarterTurns], layers counted
// from that face in the frame (layer 1 includes everything sticking out beyond it), with layerEnd 99 = the whole
// puzzle and -2 = all inner layers; and -3 (CORE) = the core's outer layer on that side with everything attached to
// it (csTimer's old "... / 3x3x3" scrambles: their 3x3x3 part turns the core).
var puzzleShift = (function() {
	var FACES = 'URFDLB';
	/** @type {number[][]} */
	var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
	var AXIS = [1, 0, 2, 1, 0, 2];
	var SIGN = [1, 1, 1, -1, -1, -1];
	/** @type {Object<string, number[]>} */
	var DIMS = {
		'335': [3, 5, 3],
		'337': [3, 7, 3],
		'335f': [3, 5, 3],
		'337f': [3, 7, 3]
	};
	/** @type {Object<string, boolean>} */
	var FLEX = { '335f': true, '337f': true };
	var WHOLE = 99;
	var INNER = -2;
	var CORE = -3;

	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	// a quarter turn of v, clockwise looking at the face with outward normal n (as lib/puzzlecuboid.js)
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
	 * @param {boolean=} flex the flexible rules (335f / 337f)
	 * @returns {any}
	 */
	function solved(dims, flex) {
		var h = (dims[1] - 1) / 2;
		var cubies = [];
		for (var x = -1; x <= 1; x++) {
			for (var y = -h; y <= h; y++) {
				for (var z = -1; z <= 1; z++) {
					var p = [x, y, z];
					var st = [];
					for (var f = 0; f < 6; f++) {
						var a = AXIS[f];
						st.push(p[a] * SIGN[f] == (a == 1 ? h : 1));
					}
					cubies.push({ p: p, n: NORMALS.map(function(v) { return v.slice(); }), st: st });
				}
			}
		}
		return { dims: dims.slice(), k: h - 1, flex: !!flex, cubies: cubies };
	}

	/** @param {any} st */
	function clone(st) {
		return {
			dims: st.dims.slice(),
			k: st.k,
			flex: st.flex,
			cubies: st.cubies.map(function(c) {
				return { p: c.p.slice(), n: c.n.map(function(v) { return v.slice(); }), st: c.st };
			})
		};
	}

	/**
	 * the slab a move turns: [axis, lo, hi] in coordinates (+-Infinity: everything beyond), 'whole' for the whole
	 * puzzle, or null for no layers
	 * @param {any} st
	 * @param {any[]} mv
	 * @returns {any}
	 */
	function slab(st, mv) {
		var f = FACES.indexOf(mv[2]);
		if (f < 0) {
			return null;
		}
		var a = AXIS[f], s = SIGN[f];
		var dim = st.dims[a], h = (dim - 1) / 2;
		var lo, hi; // in s * coordinate
		if (mv[1] == CORE) {
			lo = 1;
			hi = Infinity;
		} else {
			var r = puzzleCuboid.layerRange(st, mv);
			if (!r) {
				return null;
			}
			if (r[0] == 1 && r[1] == dim) {
				return 'whole';
			}
			hi = r[0] == 1 ? Infinity : h - r[0] + 1;
			lo = r[1] == dim ? -Infinity : h - r[1] + 1;
		}
		return s > 0 ? [a, lo, hi] : [a, -hi, -lo];
	}

	/**
	 * true if the outer layer at coordinate v of axis a can separate from the stacks it sits on: it is a complete 3x3
	 * layer (or empty: no stack reaches it)
	 * @param {any} st
	 * @param {number} a
	 * @param {number} v
	 */
	function layerComplete(st, a, v) {
		var n = 0;
		for (var i = 0; i < st.cubies.length; i++) {
			if (st.cubies[i].p[a] == v) {
				n++;
			}
		}
		return n == 9 || n == 0;
	}

	/**
	 * the layers a move really turns, by the geometry: [axis, lo, hi] as slab(), 'whole', or null if the move can't be
	 * made now. Every end piece sits on a stack: it is attached to the piece next to it towards the core along the
	 * axis it sticks out on (the core is always complete, so every stack reaches it). A boundary plane of the slab
	 * inside the core cuts no piece. A plane beyond the core (between u and u + 1, |u| >= 1) cuts the stacks crossing
	 * it unless the layer beyond it is a complete 3x3 (the end layer then separates from the core, Jaap's rule). If
	 * it would cut them, the turn is still possible when the slab holds the inner end of every stack crossing it
	 * (the plane is its outer boundary): the pieces beyond ride along on their stacks, so the slab extends to the end
	 * of the puzzle. If the slab holds the outer end (its inner boundary), it would tear the stacks: blocked. A slab
	 * extended to the whole puzzle is no layer turn (nothing is held): blocked. Turning whole layers of the grid
	 * can't collide with anything.
	 * @param {any} st
	 * @param {any[]} mv
	 * @returns {any}
	 */
	function span(st, mv) {
		var sl = slab(st, mv);
		if (!sl || !mv[3] || sl == 'whole') {
			return mv[3] ? sl : null;
		}
		var a = sl[0], lo = sl[1], hi = sl[2];
		if (st.flex) { // no mechanism: any layers that hold some of the pieces but not all (see the top)
			var n = 0;
			for (var i = 0; i < st.cubies.length; i++) {
				var u = st.cubies[i].p[a];
				if (u >= lo && u <= hi) {
					n++;
				}
			}
			return n > 0 && n < st.cubies.length ? sl : null;
		}
		// the upper boundary (between hi and hi + 1) beyond the core: hi >= 1 (the slab holds the inner ends) or
		// hi <= -2 (the outer ends, below the core)
		if (hi != Infinity && (hi >= 1 || hi <= -2) && !layerComplete(st, a, hi >= 1 ? hi + 1 : hi)) {
			if (hi <= -2) {
				return null;
			}
			hi = Infinity;
		}
		// the lower boundary (between lo - 1 and lo): lo <= -1 (inner ends) or lo >= 2 (outer ends)
		if (lo != -Infinity && (lo <= -1 || lo >= 2) && !layerComplete(st, a, lo <= -1 ? lo - 1 : lo)) {
			if (lo >= 2) {
				return null;
			}
			lo = -Infinity;
		}
		if (lo == -Infinity && hi == Infinity) {
			return null;
		}
		return [a, lo, hi];
	}

	/**
	 * can the puzzle make this move now? (rotations always; a move of no layers never)
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function isLegal(st, mv) {
		return !!span(st, mv);
	}

	/**
	 * indices of the cubies a move turns (all of them for a rotation; none if it is not legal); in a shifted shape
	 * this may include the pieces riding along on the stacks of the turning layers (see span)
	 * @param {any} st
	 * @param {any[]} mv
	 * @returns {number[]}
	 */
	function turning(st, mv) {
		var ret = [];
		var sl = span(st, mv);
		if (!sl) {
			return ret;
		}
		for (var i = 0; i < st.cubies.length; i++) {
			var p = st.cubies[i].p;
			if (sl == 'whole' || p[sl[0]] >= sl[1] && p[sl[0]] <= sl[2]) {
				ret.push(i);
			}
		}
		return ret;
	}

	/**
	 * the axis the outer pieces sit on if the puzzle is a cuboid (every outer piece in the end layers of one axis),
	 * else -1
	 * @param {any} st
	 */
	function cuboidAxis(st) {
		var axis = -1;
		for (var i = 0; i < st.cubies.length; i++) {
			var p = st.cubies[i].p;
			for (var a = 0; a < 3; a++) {
				if (Math.abs(p[a]) > 1) {
					if (axis != -1 && axis != a) {
						return -1;
					}
					axis = a;
				}
			}
		}
		return axis;
	}

	/**
	 * apply a move in place; a move the puzzle can't make does nothing
	 * @param {any} st
	 * @param {any[]} mv
	 */
	function apply(st, mv) {
		var idx = turning(st, mv);
		if (!idx.length) {
			return st;
		}
		var f = FACES.indexOf(mv[2]);
		var n = NORMALS[f];
		var q = ((mv[3] % 4) + 4) % 4;
		for (var k = 0; k < q; k++) {
			for (var i = 0; i < idx.length; i++) {
				var c = st.cubies[idx[i]];
				c.p = quarter(c.p, n);
				for (var j = 0; j < 6; j++) {
					c.n[j] = quarter(c.n[j], n);
				}
			}
		}
		if (slab(st, mv) == 'whole') {
			if (q % 2 == 1) {
				var a = AXIS[f], u = (a + 1) % 3, v = (a + 2) % 3;
				var t = st.dims[u];
				st.dims[u] = st.dims[v];
				st.dims[v] = t;
			}
		} else {
			var ca = cuboidAxis(st);
			if (ca != -1 && st.dims[ca] == 3) { // back in cuboid shape, lying another way: the frame follows it
				var len = 2 * st.k + 3;
				st.dims = [3, 3, 3];
				st.dims[ca] = len;
			}
		}
		return st;
	}

	/**
	 * the move in the notation of the frame (as lib/puzzlecuboid.js resolve, but quarter turns stay quarter turns:
	 * every layer can make them, they may change the shape), or null if it turns no layers. Legality is separate.
	 * @param {any} st
	 * @param {any[]} mv
	 * @returns {any[]|null}
	 */
	function resolve(st, mv) {
		var f = FACES.indexOf(mv[2]);
		if (f < 0 || !mv[3]) {
			return null;
		}
		var dim = st.dims[AXIS[f]];
		if (mv[1] == CORE) {
			return [1, (dim - 1) / 2, mv[2], mv[3]]; // the core's layer: U on a short axis, Uw / 3Uw on the long one
		}
		var r = puzzleCuboid.layerRange(st, mv);
		if (!r) {
			return null;
		}
		if (r[0] == 1 && r[1] == dim) {
			return [1, WHOLE, mv[2], mv[3]];
		}
		if (mv[1] == INNER && r[0] == 2 && r[1] == dim - 1) {
			return [2, INNER, mv[2], mv[3]];
		}
		if (r[1] == dim && r[0] > 1) {
			return [1, dim - r[0] + 1, FACES.charAt((f + 3) % 6), -mv[3]];
		}
		return [r[0], r[1], mv[2], mv[3]];
	}

	/**
	 * solved = cuboid shape and every face one colour, in any orientation
	 * @param {any} st
	 */
	function isSolved(st) {
		var ca = cuboidAxis(st);
		if (ca == -1) {
			return false;
		}
		var nrm = [];
		for (var i = 0; i < st.cubies.length; i++) {
			var c = st.cubies[i];
			for (var f = 0; f < 6; f++) {
				if (!c.st[f]) {
					continue;
				}
				var m = nrm[f], v = c.n[f];
				if (st.flex) { // every sticker on the outside (strict shapes can't hide one)
					var b = v[0] ? 0 : v[1] ? 1 : 2;
					if (c.p[b] * v[b] != (b == ca ? st.k + 1 : 1)) {
						return false;
					}
				}
				if (!m) {
					nrm[f] = v;
				} else if (m[0] != v[0] || m[1] != v[1] || m[2] != v[2]) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * parse a move sequence (lib/puzzlecuboid.js notation). csTimer's old scrambles "<cuboid moves> / <3x3x3
	 * scramble>": after the "/" the face turns are turns of the 3x3x3 core (U = the core's top layer, Uw on the
	 * 3x3x5, 3Uw on the 3x3x7; R = the whole right side).
	 * @param {string} str
	 * @returns {any[][]}
	 */
	function parse(str) {
		var parts = String(str || '').split('/');
		var ret = puzzleCuboid.parse(parts[0]);
		for (var i = 1; i < parts.length; i++) {
			var mv = puzzleCuboid.parse(parts[i]);
			for (var j = 0; j < mv.length; j++) {
				var m = mv[j];
				ret.push(m[0] == 1 && m[1] == 1 ? [1, CORE, m[2], m[3]] : m);
			}
		}
		return ret;
	}

	/**
	 * the state after a sequence, from solved (moves the puzzle can't make are skipped)
	 * @param {number[]} dims
	 * @param {string} str
	 * @param {boolean=} flex the flexible rules
	 */
	function run(dims, str, flex) {
		var st = solved(dims, flex);
		var mv = parse(str);
		for (var i = 0; i < mv.length; i++) {
			apply(st, mv[i]);
		}
		return st;
	}

	/**
	 * a scramble (random moves, as csTimer's: the random-move cuboid scramble of lib/puzzlecuboid.js, which mixes the
	 * outer layers and keeps the shape, then a random-state 3x3x3 scramble of the core, written as the moves it is:
	 * U / D as the core's layers (Uw / 3Uw), R L F B quarter turns that change the shape). The 3x3x3 part is drawn
	 * again if the shape is a cuboid at its end or turns into a lying cuboid on the way (the frame would change).
	 * The flexible types get the same scrambles: none of these moves is ever extended by the mechanism (span), so
	 * they turn the same pieces under both rules.
	 * @param {string} type
	 * @param {number} len length of the first part (scramble length setting)
	 * @param {(n: number) => number} rn
	 * @param {() => string} get333 a random-state 3x3x3 scramble
	 */
	function scramble(type, len, rn, get333) {
		var dims = DIMS[type];
		var first = puzzleCuboid.scrambleTall(dims[1], len, rn);
		var base = run(dims, first);
		for (var tries = 0; tries < 20; tries++) {
			var st = clone(base);
			var mv = puzzleCuboid.parse(get333());
			var out = [];
			var ok = true;
			for (var i = 0; i < mv.length && ok; i++) {
				var r = resolve(st, [1, CORE, mv[i][2], mv[i][3]]);
				out.push(puzzleCuboid.toStr(r));
				apply(st, r);
				ok = st.dims[1] == dims[1];
			}
			if (ok && cuboidAxis(st) == -1) {
				return (first + ' ' + out.join(' ')).trim();
			}
		}
		return (first + ' ' + puzzleCuboid.toStr([1, (dims[1] - 1) / 2, 'U', 1]) + " R").trim();
	}

	/**
	 * the six views of the scramble image as a cross net (U above F, L F R B in a row, D below F), each view as
	 * large as the puzzle reaches that way: cells [x, y, colour (URFDLB, -1 = a face without a sticker), depth]
	 * in net cell units; depth > 0 sticks out towards the viewer beyond the frame's surface, < 0 lies below it.
	 * Without shape changes the cells are those of lib/puzzlecuboid.js's net.
	 * @param {any} st
	 * @returns {{w: number, h: number, cells: number[][]}}
	 */
	function net(st) {
		var lo = [-1, -1, -1], hi = [1, 1, 1];
		var at = {};
		for (var a = 0; a < 3; a++) {
			lo[a] = -(st.dims[a] - 1) / 2;
			hi[a] = -lo[a];
		}
		for (var i = 0; i < st.cubies.length; i++) {
			var p = st.cubies[i].p;
			at[p.join()] = i;
			for (var a = 0; a < 3; a++) {
				lo[a] = Math.min(lo[a], p[a]);
				hi[a] = Math.max(hi[a], p[a]);
			}
		}
		var X = hi[0] - lo[0] + 1, Y = hi[1] - lo[1] + 1, Z = hi[2] - lo[2] + 1;
		var GAP = 1 / 3;
		// face, net position, size, cell (i, j) -> [x, y, z] of the column (the view's axis left free)
		/** @type {any[][]} */
		var SPEC = [
			[0, Z + GAP, 0, X, Z, function(i, j) { return [lo[0] + i, 0, lo[2] + j]; }],
			[1, Z + X + 2 * GAP, Z + GAP, Z, Y, function(i, j) { return [0, hi[1] - j, hi[2] - i]; }],
			[2, Z + GAP, Z + GAP, X, Y, function(i, j) { return [lo[0] + i, hi[1] - j, 0]; }],
			[3, Z + GAP, Z + Y + 2 * GAP, X, Z, function(i, j) { return [lo[0] + i, 0, hi[2] - j]; }],
			[4, 0, Z + GAP, Z, Y, function(i, j) { return [0, hi[1] - j, lo[2] + i]; }],
			[5, 2 * Z + X + 3 * GAP, Z + GAP, X, Y, function(i, j) { return [hi[0] - i, hi[1] - j, 0]; }]
		];
		var cells = [];
		for (var f = 0; f < 6; f++) {
			var sp = SPEC[f], a = AXIS[f], s = SIGN[f], nv = NORMALS[f];
			var surf = (st.dims[a] - 1) / 2;
			for (var i = 0; i < sp[3]; i++) {
				for (var j = 0; j < sp[4]; j++) {
					var q = sp[5](i, j);
					for (var d = s > 0 ? hi[a] : -lo[a]; d >= -surf; d--) { // from the viewer inwards
						q[a] = s * d;
						var ci = at[q.join()];
						if (ci === undefined) {
							continue;
						}
						var c = st.cubies[ci], col = -1;
						for (var g = 0; g < 6; g++) {
							if (c.st[g] && dot(c.n[g], nv) == 1) {
								col = g;
							}
						}
						cells.push([sp[1] + i, sp[2] + j, col, d - surf]);
						break;
					}
				}
			}
		}
		return { w: 2 * Z + 2 * X + 3 * GAP, h: 2 * Z + Y + 2 * GAP, cells: cells };
	}

	return {
		FACES: FACES,
		NORMALS: NORMALS,
		AXIS: AXIS,
		DIMS: DIMS,
		FLEX: FLEX,
		WHOLE: WHOLE,
		INNER: INNER,
		CORE: CORE,
		solved: solved,
		clone: clone,
		slab: slab,
		isLegal: isLegal,
		turning: turning,
		cuboidAxis: cuboidAxis,
		apply: apply,
		resolve: resolve,
		isSolved: isSolved,
		parse: parse,
		toStr: function(mv) {
			return puzzleCuboid.toStr(mv);
		},
		run: run,
		scramble: scramble,
		net: net
	};
})();
