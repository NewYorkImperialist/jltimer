// @ts-check
"use strict";

// jlTimer sliding puzzles (15 puzzle "15p" / "15b", 8 puzzle "8p" / "8b"): the puzzle model used by the virtual puzzle
// (twisty/twistyslide.js) and its settings. The scramble image (tools/image.js sldImage) and the scramblers
// (scramble/slide.js random state, scramble/utilscramble.js random move) are csTimer's and use the same notation.
//
// The grid is size x size; cell index = row * size + col, row 0 at the top. tiles[i] is the number on cell i
// (1 .. size*size-1), 0 for the blank. Solved: 1 .. N-1 in reading order, the blank bottom-right.
//
// A move is {d, n}: n tiles slide one cell in direction d (0 U, 1 L, 2 R, 3 D), i.e. the n tiles next to the blank
// on the side opposite to d. The blank travels n cells the other way (U moves the blank down).
//
// Notation (csTimer, see image.js sldImage): a letter U L R D or an arrow (U+FFEA up, U+FFE9 left, U+FFEB right,
// U+FFEC down), optionally followed by a count ("R3" = R R R).
//   - "URLD" and arrow scrambles (puzzle types 15p, 8p) name the direction the tiles move: R = a tile slides right.
//   - "Blank" scrambles (15b, 8b) name the direction the blank moves: R = the blank moves right (a tile slides left).
// So in blank notation a letter is the opposite tile direction (U <-> D, L <-> R: index 3 - d).
var puzzleSlide = (function() {
	var LETTERS = 'ULRD';
	var ARROWS = '￪￩￫￬';
	/** @type {number[][]} [drow, dcol] of the blank for tile direction d */
	var BLANK_STEP = [[1, 0], [0, 1], [0, -1], [-1, 0]];

	/**
	 * @typedef {{size: number, tiles: number[], blank: number}} SlideState
	 * @typedef {{d: number, n: number}} SlideMove
	 */

	/**
	 * @param {number} size
	 * @returns {SlideState}
	 */
	function solved(size) {
		var tiles = [];
		for (var i = 0; i < size * size - 1; i++) {
			tiles.push(i + 1);
		}
		tiles.push(0);
		return { size: size, tiles: tiles, blank: size * size - 1 };
	}

	/** @param {SlideState} st */
	function clone(st) {
		return { size: st.size, tiles: st.tiles.slice(), blank: st.blank };
	}

	/**
	 * how many tiles can slide in direction d (the cells between the blank and the edge on the far side)
	 * @param {SlideState} st
	 * @param {number} d
	 */
	function room(st, d) {
		var r = Math.floor(st.blank / st.size), c = st.blank % st.size, s = st.size - 1;
		return [s - r, s - c, c, r][d];
	}

	/**
	 * slide n tiles in direction d; all or nothing. Returns the cells whose tile moved as [from, to] pairs, or null if
	 * the move does not fit.
	 * @param {SlideState} st
	 * @param {SlideMove} mv
	 * @returns {number[][] | null}
	 */
	function apply(st, mv) {
		if (!(mv.n >= 1) || mv.n > room(st, mv.d)) {
			return null;
		}
		var step = BLANK_STEP[mv.d];
		var moved = [];
		for (var k = 0; k < mv.n; k++) {
			var r = Math.floor(st.blank / st.size), c = st.blank % st.size;
			var from = (r + step[0]) * st.size + c + step[1];
			st.tiles[st.blank] = st.tiles[from];
			st.tiles[from] = 0;
			moved.push([from, st.blank]);
			st.blank = from;
		}
		return moved;
	}

	/**
	 * the move that slides the tile on cell idx (and every tile between it and the blank) into the blank's line, or
	 * null if the cell is not in the blank's row or column
	 * @param {SlideState} st
	 * @param {number} idx
	 * @returns {SlideMove | null}
	 */
	function moveTo(st, idx) {
		var s = st.size;
		var r = Math.floor(idx / s), c = idx % s, br = Math.floor(st.blank / s), bc = st.blank % s;
		if (idx == st.blank) {
			return null;
		}
		if (r == br) {
			return c > bc ? { d: 1, n: c - bc } : { d: 2, n: bc - c };
		}
		if (c == bc) {
			return r > br ? { d: 0, n: r - br } : { d: 3, n: br - r };
		}
		return null;
	}

	/** @param {SlideState} st */
	function isSolved(st) {
		for (var i = 0; i < st.tiles.length - 1; i++) {
			if (st.tiles[i] != i + 1) {
				return false;
			}
		}
		return true;
	}

	/**
	 * @param {string} str
	 * @param {boolean} blankNotation letters name the blank's direction (15b / 8b)
	 * @returns {SlideMove[]}
	 */
	function parse(str, blankNotation) {
		var ret = [];
		var re = /([ULRD￪￩￫￬])(\d*)/g;
		var m;
		while ((m = re.exec(str || ''))) {
			var d = (LETTERS + ARROWS).indexOf(m[1]) % 4;
			ret.push({ d: blankNotation ? 3 - d : d, n: ~~m[2] || 1 });
		}
		return ret;
	}

	/** @param {string} str */
	function usesArrows(str) {
		return /[￩-￬]/.test(str || '');
	}

	/**
	 * @param {SlideMove} mv
	 * @param {boolean} blankNotation
	 * @param {boolean} [arrows]
	 */
	function toStr(mv, blankNotation, arrows) {
		var d = blankNotation ? 3 - mv.d : mv.d;
		return (arrows ? ARROWS : LETTERS).charAt(d) + (mv.n > 1 ? mv.n : '');
	}

	/**
	 * the state after a sequence from solved, or null if a move does not fit
	 * @param {string} str
	 * @param {number} size
	 * @param {boolean} blankNotation
	 */
	function run(str, size, blankNotation) {
		var st = solved(size);
		var mv = parse(str, blankNotation);
		for (var i = 0; i < mv.length; i++) {
			if (!apply(st, mv[i])) {
				return null;
			}
		}
		return st;
	}

	/**
	 * move counts of a sequence: [single-tile moves (STM), multi-tile moves (MTM)]. In MTM a run of slides in the same
	 * direction is one move, however many tiles it pushes (R R R = R3 = 1 move).
	 * @param {SlideMove[]} moves
	 */
	function counts(moves) {
		var stm = 0, mtm = 0, last = -1;
		for (var i = 0; i < moves.length; i++) {
			stm += moves[i].n;
			if (moves[i].d != last) {
				mtm++;
			}
			last = moves[i].d;
		}
		return [stm, mtm];
	}

	/**
	 * puzzle id (tools.puzzleType) -> [size, blankNotation], or null if it is not a sliding puzzle
	 * @param {string} puzzle
	 * @returns {[number, boolean] | null}
	 */
	function info(puzzle) {
		var m = /^(15|8)([pb])$/.exec(puzzle || '');
		return m ? [m[1] == '15' ? 4 : 3, m[2] == 'b'] : null;
	}

	return {
		LETTERS: LETTERS,
		ARROWS: ARROWS,
		solved: solved,
		clone: clone,
		room: room,
		apply: apply,
		moveTo: moveTo,
		isSolved: isSolved,
		parse: parse,
		usesArrows: usesArrows,
		toStr: toStr,
		run: run,
		counts: counts,
		info: info
	};
})();
