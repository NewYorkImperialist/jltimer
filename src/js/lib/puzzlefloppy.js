// @ts-check
"use strict";

// jlTimer Floppy Cube (3x3x1, event "133") and Super Floppy (event "sfl"): the puzzle model shared by the
// scramblers (scramble/1x3x3.js, scramble/superfloppy.js), the scramble image (tools/image.js) and the virtual puzzle
// (twisty/twistyfloppy.js).
//
// GEOMETRY. The puzzle lies flat: big faces U and D, turnable sides R F L B. Every piece is one cubie sitting at an
// integer position in {-1, 0, 1}^3: the centre at the origin, the 4 edges at the side centres (+-1, 0, 0),
// (0, 0, +-1), the 4 corners at (+-1, 0, +-1). A side turn turns every piece whose position is on that side
// (pos . n == 1). On the Super Floppy a quarter turn swings the side's two corners out of the plane, to the 8 extra
// locations above and below the side edges, (+-1, +-1, 0) and (0, +-1, +-1): 12 corner locations in all, 4 per side
// (2 flat ones shared with the neighbouring sides, one above and one below the edge), and a quarter turn cycles them.
// Edges never move, they only rotate (4 orientations; 2 on the Floppy, which only turns half turns).
// A piece is stored as its position and the images ax, ay of its x and y axes (az = ax x ay); its stickers are the
// faces that point outwards when solved. All whole-puzzle orientations are allowed: a face turn whose face is one
// of the big faces (U while flat, F after an x) is the whole puzzle turning and is treated as that rotation.
//
// SUPER FLOPPY RULES. The official puzzle (Katsuhiko Okamoto's) blocks turning a side whose 4 locations hold no
// corner, i.e. a bare edge; imitations allow it. 12*11*10*9*4^4 = 3,041,280 states, all reachable either way.
// God's number (Jaap Scherphuis, jaapsch.net/puzzles/floppy2.htm): official 15, imitation 13 moves, a quarter or
// half turn counting as one move.
var puzzleFloppy = (function() {
	var FACES = 'URFDLB';
	/** @type {number[][]} outward normals in URFDLB order */
	var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
	/** @type {number[][]} the turnable sides of the flat puzzle: R F L B (edge pieces 1..4) */
	var SIDES = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
	/** @type {number[][]} the corner homes FR FL BL BR (corner pieces 5..8) */
	var FLAT = [[1, 0, 1], [-1, 0, 1], [-1, 0, -1], [1, 0, -1]];
	/** @type {number[][]} the 12 corner locations: 0..3 flat (FLAT), then above / below the R, F, L, B edges */
	var LOCS = FLAT.concat([[1, 1, 0], [1, -1, 0], [0, 1, 1], [0, -1, 1], [-1, 1, 0], [-1, -1, 0], [0, 1, -1], [0, -1, -1]]);
	/** @type {number[][]} piece homes: 0 centre, 1..4 edges, 5..8 corners */
	var HOMES = [[0, 0, 0]].concat(SIDES, FLAT);

	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	function cross(a, b) {
		return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	}

	function same(a, b) {
		return a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
	}

	// a quarter turn of v, clockwise when looking at the face whose outward normal is n (as in lib/puzzle112.js)
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

	/**
	 * the outward faces of piece i when solved (URFDLB indices): its sticker faces
	 * @param {number} i
	 */
	function stickerFaces(i) {
		var ret = [0, 3];
		var h = HOMES[i];
		for (var f = 0; f < 6; f++) {
			if (f % 3 != 0 && dot(h, NORMALS[f]) == 1) {
				ret.push(f);
			}
		}
		return ret;
	}

	/** @returns {any} */
	function solved() {
		var p = [];
		for (var i = 0; i < HOMES.length; i++) {
			p.push({ pos: HOMES[i].slice(), ax: [1, 0, 0], ay: [0, 1, 0] });
		}
		return { p: p };
	}

	/** @param {any} st */
	function clone(st) {
		return {
			p: st.p.map(function(pc) {
				return { pos: pc.pos.slice(), ax: pc.ax.slice(), ay: pc.ay.slice() };
			})
		};
	}

	/**
	 * where the home direction d of a piece points now
	 * @param {any} pc
	 * @param {number[]} d
	 */
	function dirOf(pc, d) {
		var az = cross(pc.ax, pc.ay);
		return [
			d[0] * pc.ax[0] + d[1] * pc.ay[0] + d[2] * az[0],
			d[0] * pc.ax[1] + d[1] * pc.ay[1] + d[2] * az[1],
			d[0] * pc.ax[2] + d[1] * pc.ay[2] + d[2] * az[2]
		];
	}

	/**
	 * the big faces' axis: where the centre's U sticker points
	 * @param {any} st
	 */
	function flatAxis(st) {
		return st.p[0].ay.slice();
	}

	/**
	 * the move as it is on the puzzle in this orientation: a turn of one of the big faces (or of a wide layer) is the
	 * whole puzzle turning; with half, a side turn is always a half turn (the Floppy turns only 180 degrees)
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 * @param {boolean=} half
	 * @returns {{face: string, pow: number, whole: boolean}}
	 */
	function resolve(st, mv, half) {
		var n = NORMALS[FACES.indexOf(mv.face)];
		if (mv.whole || Math.abs(dot(n, flatAxis(st))) == 1) {
			return { face: mv.face, pow: mv.pow, whole: true };
		}
		var pow = mv.pow;
		if (half && pow % 2 != 0) {
			pow = 2;
		}
		return { face: mv.face, pow: pow, whole: false };
	}

	/**
	 * the pieces a move turns (indices into st.p)
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 */
	function layerOf(st, mv) {
		var whole = resolve(st, mv).whole;
		var n = NORMALS[FACES.indexOf(mv.face)];
		var ret = [];
		for (var i = 0; i < st.p.length; i++) {
			if (whole || dot(st.p[i].pos, n) == 1) {
				ret.push(i);
			}
		}
		return ret;
	}

	/**
	 * true if the move turns a side against the rest (not the whole puzzle, not a null move)
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 */
	function isTurn(st, mv) {
		return !resolve(st, mv).whole && ((mv.pow % 4) + 4) % 4 != 0;
	}

	/**
	 * can the move be made? Whole-puzzle turns always; on the official Super Floppy a side with no corner (only its
	 * edge) is locked
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 * @param {boolean=} official
	 */
	function isLegal(st, mv, official) {
		if (!official || !isTurn(st, mv)) {
			return true;
		}
		var layer = layerOf(st, mv);
		for (var i = 0; i < layer.length; i++) {
			if (layer[i] >= 5) {
				return true;
			}
		}
		return false;
	}

	/**
	 * apply a move in place (resolved first, so a quarter-turn key on the Floppy is its half turn)
	 * @param {any} st
	 * @param {{face: string, pow: number, whole: boolean}} mv
	 * @param {boolean=} half
	 */
	function apply(st, mv, half) {
		var f = FACES.indexOf(mv.face);
		if (f < 0) {
			return st;
		}
		mv = resolve(st, mv, half);
		var n = NORMALS[f];
		var layer = layerOf(st, mv);
		var q = ((mv.pow % 4) + 4) % 4;
		for (var k = 0; k < q; k++) {
			for (var i = 0; i < layer.length; i++) {
				var pc = st.p[layer[i]];
				pc.pos = quarter(pc.pos, n);
				pc.ax = quarter(pc.ax, n);
				pc.ay = quarter(pc.ay, n);
			}
		}
		return st;
	}

	/**
	 * solved in any whole-puzzle orientation: every piece turned like the centre and at its home turned like it
	 * @param {any} st
	 */
	function isSolved(st) {
		var c = st.p[0];
		for (var i = 1; i < st.p.length; i++) {
			var pc = st.p[i];
			if (!same(pc.ax, c.ax) || !same(pc.ay, c.ay) || !same(pc.pos, dirOf(c, HOMES[i]))) {
				return false;
			}
		}
		return true;
	}

	/**
	 * is the puzzle flat (every corner in one of the 4 flat locations, seen from the centre)?
	 * @param {any} st
	 */
	function isFlat(st) {
		var c = st.p[0];
		for (var i = 5; i < 9; i++) {
			if (dot(st.p[i].pos, c.ay) != 0) {
				return false;
			}
		}
		return true;
	}

	var POW = { '': 1, "'": -1, '2': 2, "2'": -2 };
	var WIDE = { 'x': 'R', 'y': 'U', 'z': 'F' };

	/**
	 * parse a move sequence; tokens that are not moves are skipped. Lowercase, wide (Rw) and multi-layer (2R) turns
	 * hold 2 of the 3 layers, which a 3x3x1 can't turn: they are read as the whole puzzle turning (r = x).
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
	 * the state after a sequence, from solved. half: the Floppy (every side turn is a half turn)
	 * @param {string} str
	 * @param {boolean=} half
	 */
	function run(str, half) {
		var st = solved();
		var mv = parse(str);
		for (var i = 0; i < mv.length; i++) {
			apply(st, mv[i], half);
		}
		return st;
	}

	// the virtual puzzle is a twisty type (twisty/twistyfloppy.js): register it next to $.TWISTY_RE (lib/utillib.js)
	var jq = /** @type {any} */ (typeof $ != 'undefined' ? $ : null);
	if (jq && jq.TWISTY_RE) {
		jq.TWISTY_RE += '|133';
	}

	return {
		FACES: FACES,
		NORMALS: NORMALS,
		SIDES: SIDES,
		LOCS: LOCS,
		HOMES: HOMES,
		stickerFaces: stickerFaces,
		solved: solved,
		clone: clone,
		dirOf: dirOf,
		flatAxis: flatAxis,
		resolve: resolve,
		layerOf: layerOf,
		isTurn: isTurn,
		isLegal: isLegal,
		apply: apply,
		isSolved: isSolved,
		isFlat: isFlat,
		parse: parse,
		toStr: toStr,
		run: run
	};
})();
