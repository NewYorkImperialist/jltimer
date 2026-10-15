// @ts-check
/*
 * jlTimer: the Gear Cube model (Oskar van Deventer's / Meffert's), for the virtual puzzle (twisty/twistygear.js).
 *
 * Mechanics (jaapsch.net/puzzles/gearcube.htm, Jim Storer's notes): the faces only make half turns. A half turn of a
 * face (the opposite face held) turns the middle layer between them a quarter turn the same way, and the four gear
 * edges in that middle layer each spin 60 degrees on their own axis; the edges of the turning face ride along. 12
 * half turns of one face bring everything back. 41,472 positions.
 *
 * State: the 102 stickers of csTimer's Gear Cube scramble image (tools/image.js gearImage), in its order: 17 per face
 * (U R F D L B): 4 corners, the centre, then 3 slots per edge. A gear edge's cog is a disk split into two colours by a
 * diameter; seen on one face it is a half disk, cut into 3 sectors of 60 degrees (the slots). The moves are made from
 * the geometry below (sticker positions, sector directions, rotations) and give exactly csTimer's image permutations
 * for U R F (checked by the tests), so scrambles, the image and the virtual puzzle agree.
 *
 * Moves use the NxN move format [1, layerEnd, face, pow]: layerEnd 1 = a face turn, pow in half turns ("R" = one half
 * turn clockwise, "R3" three, "R'" one anticlockwise, as csTimer's scrambler writes them); layerEnd 99 = a whole-cube
 * rotation (x y z), pow in quarter turns.
 */
var puzzleGear = (function() {
	var FACES = 'URFDLB';
	var NORM = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
	var W = 99;

	/** @param {number[]} a @param {number[]} b */
	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	/** @param {number[]} a @param {number[]} b @param {number} [k] */
	function add(a, b, k) {
		k = k == null ? 1 : k;
		return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
	}

	/** @param {number[]} a @param {number[]} b */
	function cross(a, b) {
		return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	}

	/** @param {number[]} v */
	function normed(v) {
		var l = Math.sqrt(dot(v, v));
		return [v[0] / l, v[1] / l, v[2] / l];
	}

	// rotation matrix about the unit axis a by angle t (anticlockwise looking from the tip of a)
	/** @param {number[]} a @param {number} t */
	function rot(a, t) {
		var c = Math.cos(t), s = Math.sin(t), C = 1 - c, x = a[0], y = a[1], z = a[2];
		return [
			[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
			[y * x * C + z * s, c + y * y * C, y * z * C - x * s],
			[z * x * C - y * s, z * y * C + x * s, c + z * z * C]
		];
	}

	/** @param {number[][]} R @param {number[]} v */
	function mul(R, v) {
		return [dot(R[0], v), dot(R[1], v), dot(R[2], v)];
	}

	/** @param {number[]} a @param {number[]} b */
	function near(a, b) {
		return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6;
	}

	// a point of face f's square in the image's net (x right, y down, 0..3) -> the cube [-1.5, 1.5]^3
	// (x = R, y = U, z = F; the net is U above F, L F R B in a row, D below F)
	/** @param {number} f @param {number} x @param {number} y @return {number[]} */
	function net3(f, x, y) {
		switch (f) {
			case 0: return [x - 1.5, 1.5, y - 1.5];
			case 1: return [1.5, 1.5 - y, 1.5 - x];
			case 2: return [x - 1.5, 1.5 - y, 1.5];
			case 3: return [x - 1.5, -1.5, 1.5 - y];
			case 4: return [-1.5, 1.5 - y, x - 1.5];
			default: return [1.5 - x, 1.5 - y, -1.5];
		}
	}

	// the image's placement of edge s (top, right, bottom, left) of a face: [a, b, c, d, e, f], (x, y) -> (ax+by+c, dx+ey+f)
	var EROT = [[1, 0, 0, 0, 1, 0], [0, -1, 3, 1, 0, 0], [-1, 0, 3, 0, -1, 3], [0, 1, 0, -1, 0, 3]];

	/**
	 * STK[i]: sticker i. p: centre (corners, centres) or the edge's midpoint on the cube edge (edge slots); n: the face's
	 * normal; d (edge slots): the direction of the slot's sector on the cog's disk; f: face; s: place on the face
	 * (0-3 corners, 4 centre, 5.. edge slots); edge: the edge's index in EDGES.
	 * @type {{p: number[], n: number[], d?: number[], f: number, s: number, edge?: number}[]}
	 */
	var STK = [];
	/**
	 * EDGES[e]: m midpoint, r outward axis, e along the edge, w towards face A on the disk (A = faces[0]); slots[k]:
	 * the sticker whose sector is centred at theta = 30 + 60k (theta from e towards w: 0..180 is face A's half)
	 * @type {{m: number[], r: number[], e: number[], w: number[], faces: number[], slots: number[]}[]}
	 */
	var EDGES = [];

	(function() {
		for (var f = 0; f < 6; f++) {
			for (var s = 0; s < 4; s++) {
				STK[f * 17 + s] = { p: net3(f, [0, 2, 0, 2][s] + 0.5, [0, 0, 2, 2][s] + 0.5), n: NORM[f], f: f, s: s };
			}
			STK[f * 17 + 4] = { p: net3(f, 1.5, 1.5), n: NORM[f], f: f, s: 4 };
			for (var s = 0; s < 4; s++) {
				var R = EROT[s];
				var o = net3(f, 0, 0);
				var X = add(net3(f, R[0], R[3]), o, -1); // the edge's own x (along it) and y (into the face)
				var Y = add(net3(f, R[1], R[4]), o, -1);
				var m = net3(f, R[0] * 1.5 + R[2], R[3] * 1.5 + R[5]);
				var r = normed(m);
				var w = normed(add(Y, r, -dot(Y, r))); // into this face, on the disk
				for (var j = 0; j < 3; j++) { // the image's c1 c2 c3: left, middle, right part of the edge
					var a = [150, 90, 30][j] * Math.PI / 180;
					var idx = f * 17 + s * 3 + 5 + j;
					STK[idx] = { p: m, n: NORM[f], d: add(X.map(function(v) { return v * Math.cos(a); }), w, Math.sin(a)), f: f, s: 5 + s * 3 + j };
				}
			}
		}
		// the 12 edges, each with its 6 slots in disk order
		for (var i = 0; i < STK.length; i++) {
			var st = STK[i];
			if (!st.d) {
				continue;
			}
			var ei = -1;
			for (var k = 0; k < EDGES.length; k++) {
				if (near(EDGES[k].m, st.p)) {
					ei = k;
				}
			}
			if (ei < 0) {
				ei = EDGES.length;
				var nA = st.n;
				var nB = add(normed(st.p).map(function(v) { return v * Math.sqrt(2); }), nA, -1);
				var e = cross(nA, nB);
				EDGES.push({ m: st.p, r: normed(st.p), e: e, w: normed(add(nA, nB, -1)), faces: [st.f, NORM.findIndex(function(n) { return near(n, nB); })], slots: [] });
			}
			st.edge = ei;
			var E = EDGES[ei];
			var th = Math.atan2(dot(st.d, E.w), dot(st.d, E.e)) * 180 / Math.PI;
			E.slots[Math.round(((th + 360) % 360 - 30) / 60)] = i;
		}
	})();

	var N = STK.length;

	// the sticker permutation of one move unit: perm[to] = from (as csTimer's image tables). Face turn of face f:
	// its layer half a turn, the middle layer a quarter turn the same way, the middle layer's gears 60 degrees about
	// their outward axes (the sense that matches csTimer's U R F); rotation: the whole cube a quarter turn
	/** @param {number} f @param {boolean} whole @return {number[]} */
	function genPerm(f, whole) {
		var ax = NORM[f];
		var Rf = rot(ax, -Math.PI), Rm = rot(ax, -Math.PI / 2);
		var perm = [];
		for (var i = 0; i < N; i++) {
			var st = STK[i];
			var l = dot(st.p, ax);
			var R = null, spin = false;
			if (whole) {
				R = Rm;
			} else if (l > 0.75) {
				R = Rf;
			} else if (Math.abs(l) < 0.5) {
				R = Rm;
				spin = !!st.d;
			}
			var p = st.p, n = st.n, d = st.d;
			if (R) {
				if (d && spin) {
					d = mul(rot(normed(p), -Math.PI / 3), d);
				}
				p = mul(R, p);
				n = mul(R, n);
				d = d && mul(R, d);
			}
			var j = -1;
			for (var k = 0; k < N && j < 0; k++) {
				var t = STK[k];
				if (near(t.p, p) && (d ? !!t.d && near(/** @type {number[]} */ (t.d), d) : !t.d && near(t.n, n))) {
					j = k;
				}
			}
			perm[j] = i;
		}
		return perm;
	}

	/** @type {Object<string, number[]>} */
	var permCache = {};

	/** @param {number} f @param {boolean} whole */
	function unitPerm(f, whole) {
		var key = f + (whole ? 'w' : 'f');
		if (!permCache[key]) {
			permCache[key] = genPerm(f, whole);
		}
		return permCache[key];
	}

	function solved() {
		var st = [];
		for (var i = 0; i < N; i++) {
			st[i] = ~~(i / 17);
		}
		return st;
	}

	/** @param {number[]} state @param {any[]} move */
	function apply(state, move) {
		var whole = move[1] >= W;
		var f = FACES.indexOf(move[2]);
		var period = whole ? 4 : 12;
		var pow = ((move[3] % period) + period) % period;
		var perm = unitPerm(f, whole);
		for (var p = 0; p < pow; p++) {
			var tmp = state.slice();
			for (var i = 0; i < N; i++) {
				state[i] = tmp[perm[i]];
			}
		}
		return state;
	}

	/** @param {number[]} state */
	function isSolved(state) {
		for (var f = 0; f < 6; f++) {
			for (var i = 1; i < 17; i++) {
				if (state[f * 17 + i] != state[f * 17]) {
					return false;
				}
			}
		}
		return true;
	}

	// a cog as drawn: colour P on the disk from theta = gamma to gamma + 180, colour Q on the rest
	/** @param {number[]} state @param {number} e @return {{gamma: number, P: number, Q: number}} */
	function cog(state, e) {
		var c = EDGES[e].slots.map(function(i) { return state[i]; });
		for (var k = 0; k < 6; k++) {
			if (c[k] != c[(k + 5) % 6] && c[k] == c[(k + 1) % 6] && c[k] == c[(k + 2) % 6] &&
				c[(k + 3) % 6] == c[(k + 4) % 6] && c[(k + 3) % 6] == c[(k + 5) % 6]) {
				return { gamma: 60 * k, P: c[k], Q: c[(k + 3) % 6] };
			}
		}
		return { gamma: 0, P: c[0], Q: c[3] }; // not a legal cog (cannot happen)
	}

	// which stickers a move turns: 1 = with the face (half turns), 2 = middle layer (quarter turns, gears spin)
	/** @param {any[]} move @return {number[]} */
	function groups(move) {
		var ax = NORM[FACES.indexOf(move[2])];
		var ret = [];
		for (var i = 0; i < N; i++) {
			var l = dot(STK[i].p, ax);
			ret[i] = move[1] >= W ? 3 : l > 0.75 ? 1 : Math.abs(l) < 0.5 ? 2 : 0;
		}
		return ret;
	}

	var MOVE_RE = /([URFDLBxyz])(\d*)(')?/g;

	/** @param {string} s */
	function parse(s) {
		var ret = [];
		(s || '').replace(MOVE_RE, function(m, f, n, p) {
			var pow = (n === '' ? 1 : ~~n) * (p ? -1 : 1);
			var r = 'xyz'.indexOf(f);
			if (pow != 0) {
				ret.push(r >= 0 ? [1, W, 'RUF'.charAt(r), pow] : [1, 1, f, pow]);
			}
			return '';
		});
		return ret;
	}

	/** @param {any[]} move */
	function toStr(move) {
		var whole = move[1] >= W;
		var period = whole ? 4 : 12;
		var pow = ((move[3] % period) + period) % period;
		if (pow > period / 2) {
			pow -= period;
		}
		var f = whole ? 'xyz'.charAt('RUF'.indexOf(move[2])) : move[2];
		return f + (Math.abs(pow) == 1 ? '' : Math.abs(pow)) + (pow < 0 ? "'" : '');
	}

	return {
		FACES: FACES,
		NORM: NORM,
		STK: STK,
		EDGES: EDGES,
		solved: solved,
		apply: apply,
		isSolved: isSolved,
		cog: cog,
		groups: groups,
		parse: parse,
		toStr: toStr,
		/** @param {string} s */
		run: function(s) {
			var st = solved();
			parse(s).forEach(function(m) { apply(st, m); });
			return st;
		},
		perm: unitPerm
	};
})();
