"use strict";

var image = (function() {

	var img;
	var hsq3 = Math.sqrt(3) / 2;
	var PI = Math.PI;

	var Rotate = $.ctxRotate;
	var Transform = $.ctxTransform;
	var drawPolygon = $.ctxDrawPolygon;

	var clkImage = (function() {
		function drawClock(svg, color, trans, time) {
			var points = Transform(Rotate([
				[1, 1, 0, -1, -1, -1, 1, 0],
				[0, -1, -8, -1, 0, 1, 1, 0]
			], time / 6 * PI), trans);
			var x = points[0];
			var y = points[1];
			svg.addElem('<circle cx="' + x[7] + '" cy="' + y[7] + '" r="' + trans[0] * 9 + '" style="fill:' + color + '" />');
			var path = [];
			path.push('M' + x[0] + ' ' + y[0]);
			path.push('Q' + x[1] + ' ' + y[1] + ',' + x[2] + ' ' + y[2]);
			path.push('Q' + x[3] + ' ' + y[3] + ',' + x[4] + ' ' + y[4]);
			path.push('C' + x[5] + ' ' + y[5] + ',' + x[6] + ' ' + y[6] + ',' + x[0] + ' ' + y[0]);
			svg.addElem('<path d="' + path.join(' ') + '" style="fill:' + colors[3] + ';stroke:' + colors[0] + '" />');
		}

		function drawButton(svg, color, trans) {
			var points = Transform([[0],[0]], trans);
			svg.addElem('<circle cx="' + points[0][0] + '" cy="' + points[1][0] +
				'" r="' + trans[0] * 3 + '" style="fill:' + color + ';stroke:#000;" />');
		}

		var width = 3;
		var movere = /([UD][RL]|ALL|[UDRLy]|all)(?:(\d[+-]?)|\((\d[+-]?),(\d[+-]?)\))?/
		var movestr = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL']
		var colors = ['#f00', '#37b', '#5cf', '#ff0', '#850'];

		return function(svg, moveseq) {
			colors = kernel.getProp('colclk').match(colre);
			var moves = moveseq.split(/\s+/);
			var moveArr = clock.moveArr;
			var flip = 9;
			var buttons = [0, 0, 0, 0];
			var clks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
			for (var i = 0; i < moves.length; i++) {
				var m = movere.exec(moves[i]);
				if (!m) {
					continue;
				}
				if (m[0] == 'y2') {
					flip = 9 - flip;
					continue;
				}
				var axis = movestr.indexOf(m[1]) + flip;
				if (m[2] == undefined && m[3] == undefined) {
					buttons[axis % 9] = 1;
					continue;
				}
				var power;
				var actions = [];
				if (m[1] == 'all') {
					power = ~~m[2][0] * (m[2][1] == '+' ? -1 : 1) + 12;
					actions.push(8 + 9 - flip, power);
				} else if (m[2]) {
					power = ~~m[2][0] * (m[2][1] == '+' ? 1 : -1) + 12;
					actions.push(axis, power);
				} else {
					power = ~~m[3][0] * (m[3][1] == '+' ? 1 : -1) + 12;
					actions.push(axis, power);
					power = ~~m[4][0] * (m[4][1] == '+' ? -1 : 1) + 12;
					axis = (10 - axis % 9) % 4 + 4 + 9 - flip;
					actions.push(axis, power);
				}
				for (var k = 0; k < actions.length; k += 2) {
					for (var j = 0; j < 14; j++) {
						clks[j] = (clks[j] + moveArr[actions[k]][j] * actions[k + 1]) % 12;
					}
				}
			}
			clks = [clks[0], clks[3], clks[6], clks[1], clks[4], clks[7], clks[2], clks[5], clks[8],
				12 - clks[2], clks[10], 12 - clks[8], clks[9], clks[11], clks[13], 12 - clks[0], clks[12], 12 - clks[6]
			];
			buttons = [buttons[3], buttons[2], buttons[0], buttons[1], 1 - buttons[0], 1 - buttons[1], 1 - buttons[3], 1 - buttons[2]];

			svg.width = 6.25 * 20 * width;
			svg.height = 3 * 20 * width;

			var y = [10, 30, 50];
			var x = [10, 30, 50, 75, 95, 115];
			for (var ii = 0; ii < 18; ii++) {
				var i = (ii + flip) % 18;
				drawClock(svg, [colors[1], colors[2]][~~(ii / 9)], [width, x[~~(i / 3)], y[i % 3]], clks[ii]);
			}

			y = [20, 40];
			x = [20, 40, 85, 105];
			for (var i = 0; i < 8; i++) {
				drawButton(svg, [colors[4], colors[3]][buttons[i]], [width, x[~~(i / 2)], y[i % 2]]);
			}
		};
	})();

	var sq1Image = (function() {

		var sqa = hsq3 + 1;
		var sqb = sqa * Math.sqrt(2);
		var ep = [
			[0, -0.5, 0.5],
			[0, -sqa, -sqa]
		];
		var cp = [
			[0, -0.5, -sqa, -sqa],
			[0, -sqa, -sqa, -0.5]
		];
		var cpr = [
			[0, -0.5, -sqa],
			[0, -sqa, -sqa]
		];
		var cpl = [
			[0, -sqa, -sqa],
			[0, -sqa, -0.5]
		];

		var eps = Transform(ep, [0.66, 0, 0]);
		var cps = Transform(cp, [0.66, 0, 0]);
		var cprs = Transform(cpr, [0.66, 0, 0]);
		var cpls = Transform(cpl, [0.66, 0, 0]);

		var udcol = 'UD';
		var ecol = 'R-B-L-F-F-L-B-R-';
		var ccol = 'RBBLLFFRRFFLLBBR';
		var colors = {
			'U': '#ff0',
			'R': '#f80',
			'F': '#0f0',
			'D': '#fff',
			'L': '#f00',
			'B': '#00f'
		};

		var width = 45;

		var movere = /^\s*\(\s*(-?\d+),\s*(-?\d+)\s*\)\s*$/;

		function doMove(move, sc) {
			if (move[0] != 0) {
				sc.doMove(move[0]);
			}
			if (move[1] != 0) {
				sc.doMove(-move[1]);
			}
			if (move[2] != 0) {
				sc.doMove(0);
			}
		}

		// dy: vertical offset (in pieces' units); innerCol: Super Square-1 inner layers (no top / bottom sticker)
		function drawPosit(svg, sc, colors, sq2sc, half, dy, innerCol) {
			dy = dy || 0;
			for (var i = 0; i < (half ? 12 : 24); i++) {
				var trans = i < 12 ? [width, sqb, sqb + dy] : [width, sqb * 3, sqb + dy];
				var val = sc.pieceAt(i);
				var colorUD = innerCol || colors[udcol[val >= 8 ? 1 : 0]];
				var cRot = -(i < 12 ? (i - 1) : (i - 6)) * PI / 6;
				var eRot = -(i < 12 ? (i) : (i - 5)) * PI / 6;
				if (val % 2 == 1) { // corner
					if (sq2sc) {
						var cLR = sq2sc.pieceAt(i) & 1;
						cRot += cLR ? 0 : PI / 6;
						drawPolygon(svg, colors[ccol[val - cLR]],
							Rotate(cLR ? cpr : cpl, cRot), trans);
						drawPolygon(svg, colorUD,
							Rotate(cLR ? cprs : cpls, cRot), trans);
					} else {
						drawPolygon(svg, colors[ccol[val - 1]],
							Rotate(cpr, cRot), trans);
						drawPolygon(svg, colors[ccol[val]],
							Rotate(cpl, cRot), trans);
						drawPolygon(svg, colorUD,
							Rotate(cps, cRot), trans);
						i++;
					}
				} else { // edge
					drawPolygon(svg, colors[ecol[val]],
						Rotate(ep, eRot), trans);
					drawPolygon(svg, colorUD,
						Rotate(eps, eRot), trans);
				}
			}
		}

		function llImage(sc, sq2sc, img) {
			var svg = new $.svg();
			var cols = kernel.getProp('colsq1').match(colre);
			colors = {
				'U': cols[0],
				'R': cols[1],
				'F': cols[2],
				'D': cols[3],
				'L': cols[4],
				'B': cols[5]
			};
			svg.width = 2 * sqb * width;
			svg.height = 2 * sqb * width;
			drawPosit(svg, sc, colors, sq2sc, true);
			if (img) {
				img.attr('src', 'data:image/svg+xml;base64,' + btoa(svg.render()));
			}
			return svg;
		}

		// a small diamond: the glued piece of the bandaged Square-1 (event bsq, lib/puzzlebandaged.js)
		function glueMark(svg, cx, cy, trans) {
			var r = 0.22;
			drawPolygon(svg, '#000', [
				[cx, cx + r, cx, cx - r],
				[cy - r, cy, cy + r, cy]
			], trans);
		}

		// isBandaged: the bandaged Square-1 </,(1,0)>: its DBL corner is glued to the left half of the middle layer
		function scrImage(svg, moveseq, isSQ2, isBandaged) {
			var cols = kernel.getProp('colsq1').match(colre);
			colors = {
				'U': cols[0],
				'R': cols[1],
				'F': cols[2],
				'D': cols[3],
				'L': cols[4],
				'B': cols[5]
			};
			var sc = new sq1.SqCubie();
			var sq2sc = null;
			if (isSQ2) {
				sq2sc = new sq1.SqCubie();
				sq2sc.ul = sq2sc.ur = 0x010010;
				sq2sc.dl = sq2sc.dr = 0x100100;
			}
			var moves = moveseq.split('/');
			var tomove = [];
			for (var i = 0; i < moves.length; i++) {
				if (/^\s*$/.exec(moves[i])) {
					tomove.push([0, 0, 1]);
					continue;
				}
				var m = movere.exec(moves[i]);
				tomove.push([(~~m[1] + 12) % 12, (~~m[2] + 12) % 12, 1]);
			}
			tomove.push([0, 0, 1]);
			for (var i = 0; i < tomove.length; i++) {
				doMove(tomove[i], sc);
				sq2sc && doMove(tomove[i], sq2sc);
			}

			svg.width = 4 * sqb * width;
			svg.height = 2 * sqb * width;

			//draw middle
			for (var i = 0; i < 2; i++) {
				var trans = i == 0 ? [width, sqb, sqb + sqa] : [width, sqb * 3, sqb - sqa - 0.7];
				drawPolygon(svg, colors['L'], [[-sqa, -sqa, -0.5, -0.5], [0, 0.7, 0.7, 0]], trans);
				if (sc.ml == 0) {
					drawPolygon(svg, colors['L'], [[sqa, sqa, -0.5, -0.5], [0, 0.7, 0.7, 0]], trans);
				} else {
					drawPolygon(svg, colors['R'], [[hsq3, hsq3, -0.5, -0.5], [0, 0.7, 0.7, 0]], trans);
				}
			}
			//draw top and bottom
			drawPosit(svg, sc, colors, sq2sc);
			if (isBandaged) {
				glueMark(svg, (-sqa - 0.5) / 2, 0.35, [width, sqb * 3, sqb - sqa - 0.7]);
				for (var i = 12; i < 24; i++) {
					if (sc.pieceAt(i) == 13 && sc.pieceAt((i - 11) % 12 + 12) == 13) { // the DBL corner, first half
						var c = Rotate([[(cps[0][0] + cps[0][1] + cps[0][2] + cps[0][3]) / 4], [(cps[1][0] + cps[1][1] + cps[1][2] + cps[1][3]) / 4]], -(i - 6) * PI / 6);
						glueMark(svg, c[0][0], c[1][0], [width, sqb * 3, sqb]);
					}
				}
			}

			var recons = [];
			for (var i = 0; i < moves.length; i++) {
				if (/^\s*$/.exec(moves[i])) {
					recons.push('/');
					continue;
				}
				var m = movere.exec(moves[i]);
				if (~~m[1]) {
					recons.push('(' + m[1] + ',0)');
				}
				if (~~m[2]) {
					recons.push('(0,' + m[2] + ')');
				}
				recons.push('/');
			}
			if (recons.at(-1) == '/') {
				recons.pop();
			} else {
				recons.push('/');
			}
			return ["~", recons, isBandaged ? 'bsq' : 'sq1'];
		}

		// Super Square-1 (jlTimer): (top, second, third, bottom)/ ...; two Square-1s sharing the slice, layers 1 and 4
		// (top row: top seen from above, bottom from below) and the inner layers 2 and 3 (second row, grey tops)
		var move4re = /^\s*\(\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\)\s*$/;

		function scrImage4(svg, moveseq) {
			var cols = kernel.getProp('colsq1').match(colre);
			colors = { 'U': cols[0], 'R': cols[1], 'F': cols[2], 'D': cols[3], 'L': cols[4], 'B': cols[5] };
			var outer = new sq1.SqCubie();
			var inner = new sq1.SqCubie();
			var moves = moveseq.split('/');
			var recons = [];
			for (var i = 0; i < moves.length; i++) {
				var m = move4re.exec(moves[i]);
				if (m) {
					doMove([(~~m[1] + 12) % 12, (~~m[4] + 12) % 12, 0], outer);
					doMove([(~~m[2] + 12) % 12, (~~m[3] + 12) % 12, 0], inner);
					recons.push('(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + m[4] + ')');
				} else if (!/^\s*$/.exec(moves[i])) {
					continue;
				}
				if (i < moves.length - 1) {
					doMove([0, 0, 1], outer);
					doMove([0, 0, 1], inner);
					recons.push('/');
				}
			}
			svg.width = 4 * sqb * width;
			svg.height = (4 * sqb + 1) * width;
			drawPosit(svg, outer, colors);
			drawPosit(svg, inner, colors, null, false, 2 * sqb, '#999');
			// middle layer, under the second row
			for (var i = 0; i < 2; i++) {
				var trans = [width, sqb * (i * 2 + 1), 4 * sqb + 0.15];
				drawPolygon(svg, colors['L'], [[-sqa, -sqa, -0.5, -0.5], [0, 0.7, 0.7, 0]], trans);
				if (outer.ml == 0) {
					drawPolygon(svg, colors['L'], [[sqa, sqa, -0.5, -0.5], [0, 0.7, 0.7, 0]], trans);
				} else {
					drawPolygon(svg, colors['R'], [[hsq3, hsq3, -0.5, -0.5], [0, 0.7, 0.7, 0]], trans);
				}
			}
			return ["~", recons, 'ssq1'];
		}

		return {
			scrImage: scrImage,
			scrImage4: scrImage4,
			llImage: llImage
		}
	})();

	var nnnImage = (function() {
		var width = 30;

		var posit = [];
		var colors = ['#ff0', '#fa0', '#00f', '#fff', '#f00', '#0d0'];

		function face(svg, f, size) {
			var offx = 10 / 9,
				offy = 10 / 9;
			if (f == 0) { //D
				offx *= size;
				offy *= size * 2;
			} else if (f == 1) { //L
				offx *= 0;
				offy *= size;
			} else if (f == 2) { //B
				offx *= size * 3;
				offy *= size;
			} else if (f == 3) { //U
				offx *= size;
				offy *= 0;
			} else if (f == 4) { //R
				offx *= size * 2;
				offy *= size;
			} else if (f == 5) { //F
				offx *= size;
				offy *= size;
			}

			for (var i = 0; i < size; i++) {
				var x = (f == 1 || f == 2) ? size - 1 - i : i;
				for (var j = 0; j < size; j++) {
					var y = (f == 0) ? size - 1 - j : j;
					drawPolygon(svg, colors[posit[(f * size + y) * size + x]], [
						[i, i, i + 1, i + 1],
						[j, j + 1, j + 1, j]
					], [width, offx + 0.1, offy + 0.1]);
				}
			}
		}

		/**
		 *  f: face, [ D L B U R F ]
		 *  d: which slice, in [0, size-1)
		 *  q: [  2 ']
		 */
		function doslice(f, d, q, size) {
			var f1, f2, f3, f4;
			var s2 = size * size;
			var c, i, j, k;
			if (f > 5) f -= 6;
			for (k = 0; k < q; k++) {
				for (i = 0; i < size; i++) {
					if (f == 0) {
						f1 = 6 * s2 - size * d - size + i;
						f2 = 2 * s2 - size * d - 1 - i;
						f3 = 3 * s2 - size * d - 1 - i;
						f4 = 5 * s2 - size * d - size + i;
					} else if (f == 1) {
						f1 = 3 * s2 + d + size * i;
						f2 = 3 * s2 + d - size * (i + 1);
						f3 = s2 + d - size * (i + 1);
						f4 = 5 * s2 + d + size * i;
					} else if (f == 2) {
						f1 = 3 * s2 + d * size + i;
						f2 = 4 * s2 + size - 1 - d + size * i;
						f3 = d * size + size - 1 - i;
						f4 = 2 * s2 - 1 - d - size * i;
					} else if (f == 3) {
						f1 = 4 * s2 + d * size + size - 1 - i;
						f2 = 2 * s2 + d * size + i;
						f3 = s2 + d * size + i;
						f4 = 5 * s2 + d * size + size - 1 - i;
					} else if (f == 4) {
						f1 = 6 * s2 - 1 - d - size * i;
						f2 = size - 1 - d + size * i;
						f3 = 2 * s2 + size - 1 - d + size * i;
						f4 = 4 * s2 - 1 - d - size * i;
					} else if (f == 5) {
						f1 = 4 * s2 - size - d * size + i;
						f2 = 2 * s2 - size + d - size * i;
						f3 = s2 - 1 - d * size - i;
						f4 = 4 * s2 + d + size * i;
					}
					c = posit[f1];
					posit[f1] = posit[f2];
					posit[f2] = posit[f3];
					posit[f3] = posit[f4];
					posit[f4] = c;
				}
				if (d == 0) {
					for (i = 0; i + i < size; i++) {
						for (j = 0; j + j < size - 1; j++) {
							f1 = f * s2 + i + j * size;
							f3 = f * s2 + (size - 1 - i) + (size - 1 - j) * size;
							if (f < 3) {
								f2 = f * s2 + (size - 1 - j) + i * size;
								f4 = f * s2 + j + (size - 1 - i) * size;
							} else {
								f4 = f * s2 + (size - 1 - j) + i * size;
								f2 = f * s2 + j + (size - 1 - i) * size;
							}
							c = posit[f1];
							posit[f1] = posit[f2];
							posit[f2] = posit[f3];
							posit[f3] = posit[f4];
							posit[f4] = c;
						}
					}
				}
			}
		}

		function genPosit(size, moveseq) {
			var cnt = 0;
			posit = [];
			for (var i = 0; i < 6; i++) {
				for (var f = 0; f < size * size; f++) {
					posit[cnt++] = i;
				}
			}
			var moves = cubeutil.parseScramble(moveseq, "DLBURF", true);
			for (var s = 0; s < moves.length; s++) {
				for (var d = 0; d < moves[s][1]; d++) {
					doslice(moves[s][0], d, moves[s][2], size)
				}
				if (moves[s][1] == -1) {
					for (var d = 0; d < size - 1; d++) {
						doslice(moves[s][0], d, -moves[s][2], size);
					}
					doslice((moves[s][0] + 3) % 6, 0, moves[s][2] + 4, size);
				}
			}
			return posit;
		}

		function draw(svg, size, moveseq) {
			genPosit(size, moveseq);

			svg.width = (39 * size / 9 + 0.2) * width;
			svg.height = (29 * size / 9 + 0.2) * width;

			colors = kernel.getProp('colcube').match(colre);
			for (var i = 0; i < 6; i++) {
				face(svg, i, size);
			}

			var moves = moveseq.split(/\s+/);
			var recons = [];
			for (var i = 0; i < moves.length; i++) {
				if (moves[i]) {
					recons.push(moves[i]);
				}
			}
			return ["~", recons, [size, size, size].join('')];
		}

		return {
			draw: draw,
			genPosit: genPosit
		}
	})();

	// 1x1x2 / 1x1x1 (jlTimer, lib/puzzle112.js): a cross net, U on top, L F R B as 1x2 strips (top cubie above the
	// bottom one; single cells on the 1x1x1), D below F; colours from colcube like the NxN net
	var img112 = (function() {
		var width = 30;
		var CELLS = [ // face (URFDLB), column, row (in cells; the side strips are two cells tall)
			[0, 1, 0], [4, 0, 1], [2, 1, 1], [1, 2, 1], [5, 3, 1], [3, 1, 3]
		];

		function stickerAt(st, pos, n) {
			for (var i = 0; i < st.stickers.length; i++) {
				var s = st.stickers[i];
				if (s.pos[0] == pos[0] && s.pos[1] == pos[1] && s.pos[2] == pos[2] && s.n[0] == n[0] && s.n[1] == n[1] && s.n[2] == n[2]) {
					return s;
				}
			}
			return null;
		}

		// h: height, 2 (1x1x2) or 1 (1x1x1)
		return function(svg, moveseq, h) {
			var st = puzzle112.solved(h);
			if (h != 1) { // the 1x1x1 ignores pre-scramble rotations (as in the virtual puzzle)
				var pre = puzzle112.parse(kernel.getProp(tools.isCurTrainScramble() ? 'preScrT' : 'preScr'));
				for (var i = 0; i < pre.length; i++) {
					puzzle112.apply(st, pre[i]);
				}
				if (Math.abs(puzzle112.longAxis(st)[1]) != 1) { // a pre-scramble that tips it over is ignored (as in the virtual puzzle)
					st = puzzle112.solved();
				}
			}
			var moves = puzzle112.parse(moveseq);
			for (var i = 0; i < moves.length; i++) {
				puzzle112.apply(st, moves[i]);
			}
			var colors = kernel.getProp('colcube').match(colre); // D L B U R F
			var dy = h == 1 ? 20 / 9 : 29 / 9; // where D sits: below the two-cell strips (one cell on a 1x1x1)
			svg.width = (3 * 10 / 9 + 1 + 0.2) * width;
			svg.height = (dy + 1 + 0.2) * width;
			for (var c = 0; c < CELLS.length; c++) {
				var f = CELLS[c][0];
				var n = puzzle112.NORMALS[f];
				var offx = CELLS[c][1] * 10 / 9;
				var offy = CELLS[c][2] == 3 ? dy : CELLS[c][2] * 10 / 9;
				// the cubie each cell belongs to: +1 top, -1 bottom (0: the 1x1x1's only cubie)
				var rows = h == 1 ? [0] : f == 0 || f == 3 ? [n[1]] : [1, -1];
				for (var j = 0; j < rows.length; j++) {
					var pos = [n[0], n[1] + rows[j], n[2]];
					var s = stickerAt(st, pos, n);
					var col = s ? colors["DLBURF".indexOf("URFDLB".charAt(s.col))] : '#777';
					drawPolygon(svg, col, [
						[0, 0, 1, 1],
						[j, j + 1, j + 1, j]
					], [width, offx + 0.1, offy + 0.1]);
				}
			}
			var recons = [];
			for (var i = 0; i < moves.length; i++) {
				recons.push(puzzle112.toStr(moves[i]));
			}
			return ["~", recons, h == 1 ? "111" : "112"];
		};
	})();

	// Floppy (lib/puzzlefloppy.js): a cube net of the flat puzzle, U on top, the L F R B sides below it, D under F;
	// colours from colcube like the NxN net. Each side view shows that side's layer (on the Super Floppy a plus: the
	// edge, the two flat corner locations and the locations above and below the edge; empty ones are left out), a
	// face without a sticker is grey. The U / D views show what is seen from above / below; a corner standing out of
	// the plane towards the viewer carries a small diamond.
	var imgFloppy = (function() {
		var width = 30;
		var GAP = 0.3;
		// per view: face, net position (in faces), and cell (col, row) -> [ray start, ray step]; rows count from the top
		var VIEWS = [
			[0, 1, 0, function(c, r, h) { return [[c - 1, 1, r - 1], [0, -1, 0]]; }],
			[4, 0, 1, function(c, r, h) { return [[-1, h, c - 1], [1, 0, 0]]; }],
			[2, 1, 1, function(c, r, h) { return [[c - 1, h, 1], [0, 0, -1]]; }],
			[1, 2, 1, function(c, r, h) { return [[1, h, 1 - c], [-1, 0, 0]]; }],
			[5, 3, 1, function(c, r, h) { return [[1 - c, h, -1], [0, 0, 1]]; }],
			[3, 1, 2, function(c, r, h) { return [[c - 1, -1, 1 - r], [0, 1, 0]]; }]
		];

		return function(svg, moveseq, kind) {
			var half = kind == '133';
			var rows = half ? 1 : 3;
			if (kind == 'sfl') {
				moveseq = puzzleFloppy.legacySfl(moveseq); // old csTimer scrambles: R L U D, held upright
			}
			var st = puzzleFloppy.run(moveseq, half);
			var colors = kernel.getProp('colcube').match(colre); // D L B U R F
			var at = {};
			for (var i = 0; i < st.p.length; i++) {
				at[st.p[i].pos.join(',')] = i;
			}
			svg.width = (12 + 3 * GAP + 0.2) * width;
			svg.height = (6 + rows + 2 * GAP + 0.2) * width;
			for (var v = 0; v < VIEWS.length; v++) {
				var view = VIEWS[v];
				var n = puzzleFloppy.NORMALS[view[0]];
				var big = view[0] % 3 == 0; // U or D: a 3x3 view
				var offx = view[1] * (3 + GAP) + 0.1;
				var offy = (view[2] == 0 ? 0 : view[2] == 1 ? 3 + GAP : 3 + 2 * GAP + rows) + 0.1;
				for (var r = 0; r < (big ? 3 : rows); r++) {
					for (var c = 0; c < 3; c++) {
						var ray = view[3](c, r, half ? 0 : 1 - r);
						var p = ray[0], depth = 0, hit = -1;
						for (; depth < (big ? 3 : 1); depth++) { // a side view: its outer layer only
							hit = at[p.join(',')];
							if (hit !== undefined) {
								break;
							}
							p = [p[0] + ray[1][0], p[1] + ray[1][1], p[2] + ray[1][2]];
						}
						if (hit === undefined) {
							continue; // nothing there
						}
						var pc = st.p[hit];
						var col = '#555'; // a face without a sticker (the body)
						var sf = puzzleFloppy.stickerFaces(hit);
						for (var f = 0; f < 6; f++) {
							var d = puzzleFloppy.dirOf(pc, puzzleFloppy.NORMALS[f]);
							if (d[0] == n[0] && d[1] == n[1] && d[2] == n[2]) {
								col = sf.indexOf(f) != -1 ? colors["DLBURF".indexOf("URFDLB".charAt(f))] : col;
							}
						}
						drawPolygon(svg, col, [
							[c, c + 1, c + 1, c],
							[r, r, r + 1, r + 1]
						], [width, offx, offy]);
						if (big && depth == 0) { // standing out of the plane towards the viewer
							drawPolygon(svg, '#000', [
								[c + 0.5, c + 0.7, c + 0.5, c + 0.3],
								[r + 0.3, r + 0.5, r + 0.7, r + 0.5]
							], [width, offx, offy]);
						}
					}
				}
			}
			var recons = [];
			var moves = puzzleFloppy.parse(moveseq);
			var rs = puzzleFloppy.solved();
			for (var i = 0; i < moves.length; i++) {
				var mv = puzzleFloppy.resolve(rs, moves[i], half);
				puzzleFloppy.apply(rs, mv, half);
				recons.push(puzzleFloppy.toStr(mv));
			}
			return ["~", recons, kind];
		};
	})();

	// LxMxN cuboids (jlTimer, lib/puzzlecuboid.js): a cross net like the NxN's, U above F, L F R B in a row, D below
	// F, each face as many cells as the cuboid has layers that way; colours from colcube like the NxN net
	var imgCuboid = (function() {
		var width = 30;
		var GAP = 1 / 3;

		return function(svg, type, moveseq) {
			var dims = puzzleCuboid.DIMS[type];
			var X = dims[0], Y = dims[1], Z = dims[2];
			var pre = puzzleCuboid.parse(kernel.getProp(tools.isCurTrainScramble() ? 'preScrT' : 'preScr'));
			var st = puzzleCuboid.solved(dims);
			for (var i = 0; i < pre.length; i++) {
				puzzleCuboid.apply(st, pre[i]);
			}
			if (st.dims.join() != dims.join()) { // a pre-scramble that tips it over is ignored (as in the virtual puzzle)
				st = puzzleCuboid.solved(dims);
			}
			var moves = puzzleCuboid.parse(moveseq);
			var recons = [];
			for (var i = 0; i < moves.length; i++) {
				var mv = puzzleCuboid.resolve(st, moves[i]);
				if (mv) {
					puzzleCuboid.apply(st, mv);
					recons.push(puzzleCuboid.toStr(mv));
				}
			}
			var at = {};
			for (var i = 0; i < st.stickers.length; i++) {
				var s = st.stickers[i];
				at[[s.c[0] + s.n[0], s.c[1] + s.n[1], s.c[2] + s.n[2]].join()] = s.col;
			}
			var colors = kernel.getProp('colcube').match(colre); // D L B U R F
			// face (URFDLB), net position (cells), size in cells, and the sticker (cubie centre + normal) of cell (i, j)
			var FACESPEC = [
				[0, Z + GAP, 0, X, Z, function(i, j) { return [2 * i - X + 1, Y, 2 * j - Z + 1]; }],
				[1, Z + X + 2 * GAP, Z + GAP, Z, Y, function(i, j) { return [X, Y - 1 - 2 * j, Z - 1 - 2 * i]; }],
				[2, Z + GAP, Z + GAP, X, Y, function(i, j) { return [2 * i - X + 1, Y - 1 - 2 * j, Z]; }],
				[3, Z + GAP, Z + Y + 2 * GAP, X, Z, function(i, j) { return [2 * i - X + 1, -Y, Z - 1 - 2 * j]; }],
				[4, 0, Z + GAP, Z, Y, function(i, j) { return [-X, Y - 1 - 2 * j, 2 * i - Z + 1]; }],
				[5, 2 * Z + X + 3 * GAP, Z + GAP, X, Y, function(i, j) { return [X - 1 - 2 * i, Y - 1 - 2 * j, -Z]; }]
			];
			svg.width = (2 * Z + 2 * X + 3 * GAP + 0.2) * width;
			svg.height = (2 * Z + Y + 2 * GAP + 0.2) * width;
			for (var f = 0; f < 6; f++) {
				var spec = FACESPEC[f];
				for (var i = 0; i < spec[3]; i++) {
					for (var j = 0; j < spec[4]; j++) {
						var col = at[spec[5](i, j).join()];
						drawPolygon(svg, col == null ? '#777' : colors["DLBURF".indexOf("URFDLB".charAt(col))], [
							[i, i, i + 1, i + 1],
							[j, j + 1, j + 1, j]
						], [width, spec[1] + 0.1, spec[2] + 0.1]);
					}
				}
			}
			return ["~", recons, type];
		};
	})();

	var mrblImage = (function() {
		// image for mirror block
		var width = 30;
		var posit = [];
		var colors = [];

		function getBoundOffset(f, size, i, j) {
			if (i != 0 && i != size - 1 && j != 0 && j != size - 1) {
				return [-1, -1, -1, -1];
			}
			//   0
			// 2   3
			//   1
			var D = 0, L = 4, B = 8, U = 12, R = 16, F = 20;
			var neighbor = [
				[F + 1, B + 1, L + 1, R + 1],
				[U + 2, D + 2, B + 3, F + 2],
				[U + 0, D + 1, R + 3, L + 2],
				[B + 0, F + 0, L + 0, R + 0],
				[U + 3, D + 3, F + 3, B + 2],
				[U + 1, D + 0, L + 3, R + 2]
			][f];
			var isBound = [i == 0, i == size - 1, j == 0, j == size - 1];
			var ret = [-1, -1, -1, -1];
			for (var i1 = 0; i1 < 4; i1++) {
				if (!isBound[i1]) {
					continue;
				}
				var idx = [size - 1 - j, j, i, size - 1 - i][i1];
				var rij = [[0, idx], [size - 1, size - 1 - idx], [size - 1 - idx, 0], [idx, size - 1]][neighbor[i1] & 0x3];
				var fidx = neighbor[i1] >> 2;
				if (fidx == 1 || fidx == 2) {
					rij[1] = size - 1 - rij[1];
				}
				if (fidx == 0) {
					rij[0] = size - 1 - rij[0];
				}
				ret[i1] = posit[fidx * size * size + rij[0] * size + rij[1]];
			}
			return ret;
		}

		function face(svg, f, size) {
			var offx = (size + 1) / size,
				offy = (size + 1) / size;
			if (f == 0) { //D
				offx *= size;
				offy *= size * 2;
			} else if (f == 1) { //L
				offx *= 0;
				offy *= size;
			} else if (f == 2) { //B
				offx *= size * 3;
				offy *= size;
			} else if (f == 3) { //U
				offx *= size;
				offy *= 0;
			} else if (f == 4) { //R
				offx *= size * 2;
				offy *= size;
			} else if (f == 5) { //F
				offx *= size;
				offy *= size;
			}
			var heights = [0.45, 0.15, 0.3, -0.45, -0.15, -0.3];
			for (var i = 0; i < size; i++) {
				var x = (f == 1 || f == 2) ? size - 1 - i : i;
				for (var j = 0; j < size; j++) {
					var y = (f == 0) ? size - 1 - j : j;
					var off = getBoundOffset(f, size, j, i);
					for (var i1 = 0; i1 < 4; i1++) {
						off[i1] = off[i1] == -1 ? 0 : heights[off[i1]];
					}
					drawPolygon(svg, colors[posit[(f * size + y) * size + x]], [
						[i - off[2], i - off[2], i + 1 + off[3], i + 1 + off[3]],
						[j - off[0], j + 1 + off[1], j + 1 + off[1], j - off[0]]
					], [width, offx + 0.6, offy + 0.6]);
				}
			}
		}

		return function(svg, size, moveseq) {
			posit = nnnImage.genPosit(size, moveseq);
			svg.width = (4 * size + 4 + 0.2) * width;
			svg.height = (3 * size + 3 + 0.2) * width;
			colors = kernel.getProp('colcube').match(colre);
			for (var i = 0; i < 6; i++) {
				face(svg, i, size);
			}
		}
	})();

	var gearImage = (function() {

		var moveMaps = [
			[3, 2, 1, 0, 4, 11, 12, 13, 14, 15, 16, 5, 6, 7, 8, 9, 10, 68, 69, 19, 20, 89, 73, 74, 75, 94, 95, 82, 28, 29, 30, 100, 101, 25, 85, 86, 36, 37, 21, 90, 91, 92, 26, 27, 99, 45, 46, 47, 32, 33, 42, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 17, 18, 70, 71, 38, 22, 23, 24, 43, 44, 31, 79, 80, 81, 49, 50, 76, 34, 35, 87, 88, 72, 39, 40, 41, 77, 78, 48, 96, 97, 98, 83, 84, 93],
			[0, 52, 2, 54, 38, 40, 41, 11, 59, 60, 61, 46, 47, 56, 14, 15, 16, 20, 19, 18, 17, 21, 28, 29, 30, 31, 32, 33, 22, 23, 24, 25, 26, 27, 34, 87, 36, 85, 55, 57, 58, 45, 99, 100, 101, 63, 64, 96, 48, 49, 50, 51, 1, 53, 3, 89, 97, 98, 62, 8, 9, 10, 91, 92, 5, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 37, 86, 35, 88, 4, 12, 13, 39, 93, 94, 95, 6, 7, 90, 42, 43, 44],
			[0, 1, 52, 51, 72, 5, 6, 7, 74, 75, 14, 56, 57, 58, 80, 81, 65, 71, 18, 69, 20, 4, 15, 16, 73, 25, 26, 27, 9, 10, 22, 76, 77, 78, 37, 36, 35, 34, 38, 45, 46, 47, 48, 49, 50, 39, 40, 41, 42, 43, 44, 3, 2, 53, 54, 21, 11, 12, 13, 23, 24, 8, 62, 63, 64, 29, 30, 59, 68, 19, 70, 17, 55, 66, 67, 79, 31, 32, 33, 60, 61, 28, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101]
		];

		return function(svg, moveseq) {
			var width = 30;
			svg.width = (39 * 3 / 9 + 0.2) * width;
			svg.height = (29 * 3 / 9 + 0.2) * width;
			var state = [];
			for (var i = 0; i < 17 * 6; i++) {
				state[i] = ~~(i / 17);
			}
			moveseq.replace(/([URF])([23456]?)('?)/g, function(m, g1, g2, g3) {
				var move = moveMaps["URF".indexOf(g1)];
				var pow = ~~g2 || 1;
				pow = g3 ? (12 - pow) : pow;
				for (var p = 0; p < pow; p++) {
					var tmp = [];
					for (var i = 0; i < 17 * 6; i++) {
						tmp[i] = state[move[i]];
					}
					state = tmp;
				}
			});
			var colors = kernel.getProp('colcube').match(colre);
			for (var f = 0; f < 6; f++) {
				var offx = 10 / 3 * [1, 2, 1, 1, 0, 3][f],
					offy = 10 / 3 * [0, 1, 1, 2, 1, 1][f];
				for (var s = 0; s < 5; s++) {
					var x = [0, 2, 0, 2, 1][s],
						y = [0, 0, 2, 2, 1][s];
					drawPolygon(svg, colors[(state[f * 17 + s] + 3) % 6], [
						[x, x, x + 1, x + 1],
						[y, y + 1, y + 1, y]
					], [width, offx + 0.1, offy + 0.1]);
				}
				for (var s = 0; s < 4; s++) {
					var c1 = state[f * 17 + s * 3 + 5];
					var c2 = state[f * 17 + s * 3 + 6];
					var c3 = state[f * 17 + s * 3 + 7];
					var rot = [
						[1, 0, 0, 0, 1, 0],
						[0, -1, 3, 1, 0, 0],
						[-1, 0, 3, 0, -1, 3],
						[0, 1, 0, -1, 0, 3]
					][s];
					if (c1 == c2 && c2 == c3) {
						drawPolygon(svg, colors[(c1 + 3) % 6], Transform([
							[1, 1, 2, 2],
							[0, 1, 1, 0]
						], rot), [width, offx + 0.1, offy + 0.1]);
					} else if (c1 == c2) {
						drawPolygon(svg, colors[(c1 + 3) % 6], Transform([
							[1, 1, 2, 1.5],
							[0, 1, 1, 0]
						], rot), [width, offx + 0.1, offy + 0.1]);
						drawPolygon(svg, colors[(c3 + 3) % 6], Transform([
							[1.5, 2, 2],
							[0, 1, 0]
						], rot), [width, offx + 0.1, offy + 0.1]);
					} else {
						drawPolygon(svg, colors[(c1 + 3) % 6], Transform([
							[1, 1, 1.5],
							[0, 1, 0]
						], rot), [width, offx + 0.1, offy + 0.1]);
						drawPolygon(svg, colors[(c3 + 3) % 6], Transform([
							[1.5, 1, 2, 2],
							[0, 1, 1, 0]
						], rot), [width, offx + 0.1, offy + 0.1]);
					}
				}
			}
			return svg;
		}
	})();

	/**
	 *	last layer image
	 *	pieces = U1U2...U9F1..F3R1..L3
	 *	   B3 B2 B1
	 *	L1 U1 U2 U3 R3
	 *	L2 U4 U5 U6 R2
	 *	L3 U7 U8 U9 R1
	 *	   F1 F2 F3
	 */
	var llImage = (function() {
		function drawImage(pieces, arrows, img) {
			var svg = new $.svg();
			var colors = kernel.getProp('colcube').match(colre);
			var dim = 3;
			if (pieces.length == 12) {
				dim = 2;
			} else if (pieces.length == 32) {
				dim = 4;
			}
			var width = 50;
			svg.width = (dim + 1.2) * width;
			svg.height = (dim + 1.2) * width;
			for (var i = 0; i < dim * dim; i++) {
				var x = i % dim + 0.5;
				var y = ~~(i / dim) + 0.5;
				drawPolygon(svg, colors["DLBURF".indexOf(pieces[i])] || '#888', [
					[x, x + 1, x + 1, x],
					[y, y, y + 1, y + 1]
				], [width, 0.1, 0.1]);
			}
			for (var i = 0; i < dim * 4; i++) {
				var x = i % dim;
				var rot = ~~(i / dim);
				drawPolygon(svg, colors["DLBURF".indexOf(pieces[i + dim * dim])] || '#888', Rotate([
					[x - dim / 2, x - dim / 2 + 1, (x - dim / 2 + 1) * 0.9, (x - dim / 2) * 0.9],
					[dim / 2 + 0.05, dim / 2 + 0.05, dim / 2 + 0.5, dim / 2 + 0.5]
				], -rot * PI / 2), [width, 0.6 + dim / 2, 0.6 + dim / 2]);
			}
			arrows = arrows || [];
			for (var i = 0; i < arrows.length; i++) {
				var arrow = arrows[i];
				var x1, y1, x2, y2;
				if (typeof arrow[0] === 'number') {
					x1 = arrow[0] % dim + 1.1;
					y1 = ~~(arrow[0] / dim) + 1.1;
				} else {
					x1 = arrow[0][0] + 1.1;
					y1 = arrow[0][1] + 1.1;
				}
				if (typeof arrow[1] === 'number') {
					x2 = arrow[1] % dim + 1.1;
					y2 = ~~(arrow[1] / dim) + 1.1;
				} else {
					x2 = arrow[1][0] + 1.1;
					y2 = arrow[1][1] + 1.1;
				}
				var length = Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
				drawPolygon(svg, '#000', Rotate([
					[0.2, length - 0.4, length - 0.4, length - 0.1, length - 0.4, length - 0.4, 0.2],
					[0.05, 0.05, 0.15, 0, -0.15, -0.05, -0.05]
				], Math.atan2(y2 - y1, x2 - x1)), [width, x1, y1]);
			}
			if (img) {
				img.attr('src', 'data:image/svg+xml;base64,' + btoa(svg.render()));
			}
			return svg;
		}

		function draw(size, moveseq, img) {
			var state = nnnImage.genPosit(size, moveseq);
			var pieces = [];
			for (var i = 0; i < size * size; i++) {
				pieces.push("DLBURF"[state[3 * size * size + i]]);
			}
			for (var j = 0; j < 4; j++) {
				var offset = [5, 4, 2, 1][j] * size * size;
				for (var i = 0; i < size; i++) {
					var ii = [i, i, size - 1 - i, size - 1 - i][j];
					pieces.push("DLBURF"[state[offset + ii]]);
				}
			}
			return drawImage(pieces.join(''), [], img);
		}

		return {
			drawImage: drawImage,
			draw: draw
		}
	})();

	/**
	 *	cube image of URF faces
	 *	pieces = U1U2...U9R1..R9F1..F9
	 *	U1 U3 R3 R9
	 *	U7 U9 R1 R7
	 *	F1 F3
	 * 	F7 F9
	 */
	var face3Image = (function() {
		var width = 20;
		var gap = 1;
		var ftrans = [
			[width * hsq3, -width * hsq3, (width * 3 + gap) * hsq3, width / 2, width / 2, 0],
			[width * hsq3, 0, (width * 3 + gap * 2) * hsq3, -width / 2, width, width * 3 + gap * 1.5],
			[width * hsq3, 0, 0, width / 2, width, width * 1.5 + gap * 1.5],
		]
		function drawImage(pieces, img) {
			var svg = new $.svg();
			var colors = kernel.getProp('colcube').match(colre);
			svg.width = (6 * width + gap * 2) * hsq3;
			svg.height = (6 * width + gap * 1.5);
			for (var i = 0; i < 27; i++) {
				var x = i % 3;
				var y = ~~(i / 3) % 3;
				drawPolygon(svg, colors["DLBURF".indexOf(pieces[i])] || '#888', [
					[x, x + 1, x + 1, x],
					[y, y, y + 1, y + 1]
				], ftrans[~~(i / 9)]);
			}
			if (img) {
				img.attr('src', 'data:image/svg+xml;base64,' + btoa(svg.render()));
			}
			return svg;
		}
		return drawImage;
	})();

	/**
	 *  F1 R1 L1 F2 F3 F4 R L F5..
	 */
	var pyrllImage = (function() {
		var width = 20;

		function drawImage(pieces, img) {
			var svg = new $.svg();
			svg.width = 6 * hsq3 * width;
			svg.height = 6 * hsq3 * width;
			var colors = kernel.getProp('colpyr').match(colre);
			var idx = 0;
			for (var i = 0; i < 3; i++) {
				for (var f = 0; f < 3; f++) {
					for (var j = 0; j < (i * 2 + 1); j++) {
						var piece;
						var x = -hsq3 * i + hsq3 * j;
						var y = i / 2;
						if (j % 2 == 0) {
							piece = [[x, x - hsq3, x + hsq3], [y, y + 0.5, y + 0.5]];
						} else {
							piece = [[x - hsq3, x, x + hsq3], [y, y + 0.5, y]];
						}
						drawPolygon(svg, colors["FLRD".indexOf(pieces[idx])] || '#888', Rotate(piece, PI / 3 * 4 * f), [width, 3 * hsq3, 3 + (6 * hsq3 - 4.5) / 2]);
						idx++;
					}
				}
			}
			if (img) {
				img.attr('src', 'data:image/svg+xml;base64,' + btoa(svg.render()));
			}
			return svg;
		}
		return drawImage;
	})();

	var polyhedronImage = (function() {
		var puzzleCache = {};

		return function(svg, type, moveseq, faceNameMask, minArea) {
			var colors = [];
			var moves = [];
			minArea = minArea || 0;
			var gap = 0.05;
			var puzzle = puzzleCache[type];

			var params = poly3d.getFamousPuzzle(type);
			if (params != null) {
				puzzle = puzzle || poly3d.makePuzzle.apply(poly3d, params.polyParam);
				params.parser = params.parser || poly3d.makePuzzleParser(puzzle);
				moves = params.parser.parseScramble(moveseq);
				gap = params.pieceGap;
				colors = params.colors;
			} else {
				debugger; // unknown puzzle
			}

			DEBUG && console.log('[polyhedron image] puzzle=', puzzle, 'moves=', moves);
			puzzleCache[type] = puzzle;
			var poly2d = poly3d.renderNet(puzzle, gap, minArea);
			var sizes = poly2d[0];
			var polys = poly2d[1];
			var faces = poly2d[2];
			var posit = [];
			for (var i = 0; i < polys.length; i++) {
				posit[i] = polys[i] && polys[i][2];
			}
			for (var midx = 0; midx < moves.length; midx++) {
				var move = moves[midx];
				var moveIdx = puzzle.getTwistyIdx(move[0]);
				if (moveIdx == -1) {
					debugger; // error, cannot find move permutations
				}
				var perm = puzzle.moveTable[moveIdx];
				var maxPow = puzzle.twistyDetails[moveIdx][1];
				var pow = (move[1] % maxPow + maxPow) % maxPow;
				var posit2 = [];
				for (var i = 0; i < posit.length; i++) {
					var val = i;
					for (var j = 0; j < pow; j++) {
						val = perm[val] < 0 ? val : perm[val];
					}
					posit2[i] = posit[val];
				}
				posit = posit2;
			}
			if (type == 'skb') {
				colors = $.col2std(kernel.getProp("colskb"), [0, 2, 4, 3, 5, 1])
				var trans = [
					[hsq3, -hsq3, hsq3 * 2, 0.5, 0.5, -1],
					[hsq3, 0, 0, -0.5, 1, 2],
					[hsq3, 0, 0, 0.5, 1, -2],
					[hsq3, 0, 0, 0.5, 1, -2],
					[hsq3, 0, 0, 0.5, 1, -2],
					[hsq3, 0, 0, -0.5, 1, 2]
				];
				for (var i = 0; i < 6; i++) {
					for (var j = 0; j < 6; j++) {
						if (j % 3 != 2) {
							trans[i][j] *= 8 / sizes[0];
						}
					}
				}
				for (var i = 0; i < polys.length; i++) {
					if (!polys[i]) {
						continue;
					}
					var poly = Transform(polys[i], trans[polys[i][2]]);
					polys[i][0] = poly[0];
					polys[i][1] = poly[1];
				}
				sizes = [8 * hsq3, 6];
			}
			var scale = Math.min(1.6 / sizes[0], 1.0 / sizes[1]) * 300;
			svg.width = sizes[0] * scale;
			svg.height = sizes[1] * scale;
			for (var i = 0; i < colors.length; i++) {
				colors[i] = '#' + colors[i].toString(16).padStart(6, '0');
			}
			for (var i = 0; i < posit.length; i++) {
				polys[i] && drawPolygon(svg, colors[posit[i]], polys[i], [scale, 0, 0, 0, scale, 0]);
			}
			for (var i = 0; i < faces.length; i++) {
				if ((faceNameMask >> i & 1) == 0) {
					continue;
				}
				var face = faces[i];
				svg.addText(face[2].toUpperCase(), [face[0] * scale, face[1] * scale], {
					'font': '20px Arial',
					'fill': kernel.getProp('col-font'),
					'stroke': kernel.getProp('col-board'),
					'stroke-width': '3px'
				});
			}
			var recons = [];
			for (var midx = 0; midx < moves.length; midx++) {
				recons.push(params.parser.move2str(moves[midx]));
			}
			return ["~", recons, type];
		}
	})();


	var sldImage = (function() {

		return function(svg, type, size, moveseq) {
			var width = 50;
			var gap = 0.05;

			var state = [];
			var effect = [
				[1, 0],
				[0, 1],
				[0, -1],
				[-1, 0]
			];
			for (var i = 0; i < size * size; i++) {
				state[i] = i;
			}
			var x = size - 1;
			var y = size - 1;

			var movere = /([ULRD\uFFEA\uFFE9\uFFEB\uFFEC])([\d]?)/;
			moveseq = moveseq.split(' ');
			for (var s = 0; s < moveseq.length; s++) {
				var m = movere.exec(moveseq[s]);
				if (!m) {
					continue;
				}
				var turn = 'ULRD\uFFEA\uFFE9\uFFEB\uFFEC'.indexOf(m[1]) % 4;
				var pow = ~~m[2] || 1;
				var eff = effect[type == 'b' ? 3 - turn : turn];
				for (var p = 0; p < pow; p++) {
					mathlib.circle(state, x * size + y, (x + eff[0]) * size + y + eff[1]);
					x += eff[0];
					y += eff[1];
				}
			}

			svg.width = (size + gap * 4) * width;
			svg.height = (size + gap * 4) * width;

			var cols = kernel.getProp('col15p').match(colre);
			cols[size - 1] = cols.at(-1);
			for (var i = 0; i < size; i++) {
				for (var j = 0; j < size; j++) {
					var val = state[j * size + i];
					var colorIdx = Math.min(~~(val / size), val % size);
					val++;
					drawPolygon(svg, cols[colorIdx], [
						[i + gap, i + gap, i + 1 - gap, i + 1 - gap],
						[j + gap, j + 1 - gap, j + 1 - gap, j + gap]
					], [width, gap * 2, gap * 2]);
					if (val == size * size) {
						continue;
					}
					svg.addText(val, [width * (i + 0.5 + gap * 2), width * (j + 0.5 + gap * 2)], {
						'font': width * 0.6 + 'px Arial',
						'fill': '#000'
					});
				}
			}
		}
	})();

	// Bicube (lib/puzzlebandaged.js): a cube net like the NxN's (U on top, L F R B, D under F), colours from colcube;
	// the stickers of a glued block on one face are drawn as one tile
	var imgBicube = (function() {
		var width = 30;
		var GAP = 1 / 3;
		// per face (URFDLB): net position (in faces) and cell (col, row) -> cubie
		var VIEWS = [
			[1, 0, function(c, r) { return [c - 1, 1, r - 1]; }],
			[2, 1, function(c, r) { return [1, 1 - r, 1 - c]; }],
			[1, 1, function(c, r) { return [c - 1, 1 - r, 1]; }],
			[1, 2, function(c, r) { return [c - 1, -1, 1 - r]; }],
			[0, 1, function(c, r) { return [-1, 1 - r, c - 1]; }],
			[3, 1, function(c, r) { return [1 - c, 1 - r, -1]; }]
		];

		return function(svg, moveseq) {
			var st = puzzleBandaged.run(moveseq);
			var colors = kernel.getProp('colcube').match(colre); // D L B U R F
			svg.width = (12 + 3 * GAP + 0.2) * width;
			svg.height = (9 + 2 * GAP + 0.2) * width;
			for (var f = 0; f < 6; f++) {
				var offx = VIEWS[f][0] * (3 + GAP) + 0.1;
				var offy = VIEWS[f][1] * (3 + GAP) + 0.1;
				var tiles = {}; // block -> [col, minC, minR, maxC, maxR]
				for (var r = 0; r < 3; r++) {
					for (var c = 0; c < 3; c++) {
						var s = puzzleBandaged.stickerAt(st, VIEWS[f][2](c, r), f);
						var key = s.block == 12 ? 'free' : s.block; // the free corner is never joined
						var t = tiles[key];
						tiles[key] = t ? [t[0], Math.min(t[1], c), Math.min(t[2], r), Math.max(t[3], c), Math.max(t[4], r)] : [s.col, c, r, c, r];
					}
				}
				for (var key in tiles) {
					var t = tiles[key];
					drawPolygon(svg, colors["DLBURF".indexOf("URFDLB".charAt(t[0]))], [
						[t[1], t[3] + 1, t[3] + 1, t[1]],
						[t[2], t[2], t[4] + 1, t[4] + 1]
					], [width, offx, offy]);
				}
			}
			return ["~", moveseq.split(/\s+/).filter(function(m) {
				return m;
			}), "bic"];
		};
	})();

	var types_nnn = ['222', '333', '444', '555', '666', '777', '888', '999', '101010', '111111'];

	function renderSVG(svg, scramble) {
		var type = scramble[0];
		if (type == 'input') {
			type = tools.scrambleType(scramble[1]);
		}
		type = tools.puzzleType(type);
		var size = types_nnn.indexOf(type);
		var recons = 0;
		if (size >= 0) {
			recons = nnnImage.draw(svg, size + 2, scramble[1]);
		} else if (type == "cubennn") {
			nnnImage.draw(svg, scramble[2], scramble[1]);
		} else if (poly3d.udpolyre.exec(type)) {
			var faceNameMask = 0;
			if (/^prc|giga|mgm|klm$/.exec(type)) {
				faceNameMask = 0x3;
			} else if (type == 'fto') {
				faceNameMask = 0xff;
			} else if (type == 'ctico') {
				faceNameMask = 0xfffff;
			}
			recons = polyhedronImage(svg, type, scramble[1], faceNameMask, type == 'klm' ? 0.1 : 0);
		} else if (type == "sq1" || type == "sq2" || type == "bsq") {
			recons = sq1Image.scrImage(svg, scramble[1], type == "sq2", type == "bsq");
		} else if (type == "bic") {
			recons = imgBicube(svg, scramble[1]);
		} else if (type == "ssq1") {
			recons = sq1Image.scrImage4(svg, scramble[1]);
		} else if (type == "clk") {
			clkImage(svg, scramble[1]);
		} else if (type == "gear") {
			gearImage(svg, scramble[1]);
		} else if (type == "112") {
			recons = img112(svg, scramble[1], 2);
		} else if (type == "111") {
			recons = img112(svg, scramble[1], 1);
		} else if (type == "133" || type == "sfl") {
			recons = imgFloppy(svg, scramble[1], type);
		} else if (/^(223|233|33[4-7])$/.exec(type)) {
			recons = imgCuboid(svg, type, scramble[1]);
		} else if (type == "mrbl") {
			mrblImage(svg, 3, scramble[1]);
		} else if (type == "15b" || type == "15p") {
			sldImage(svg, type[2], 4, scramble[1]);
		} else if (type == "8b" || type == "8p") {
			sldImage(svg, type[1], 3, scramble[1]);
		} else if (/^r(3(ni)?|23\d+w?|mngf)$/.exec(type)) {
			var subScrs = [];
			scramble[1].replaceAll(/(?:^|\n)\s*(\d+|3oh|pyr|skb|sq1|clk|mgm)\)\s*([^\0]*?)\s*(?=\n.*\)|$)/g, function(m, p1, p2) {
				var subType = type.startsWith('r3') ? '333' :
					type == 'rmngf' ? p1.replace('3oh', '333').padEnd(3, p1):
					types_nnn[subScrs.length];
				subScrs.push([subType, p2, 0]);
			});
			var n_height = Math.ceil(Math.sqrt(subScrs.length));
			var n_width = Math.ceil(subScrs.length / n_height);
			var GRID_WIDTH = 240;
			var GRID_HEIGHT = 150;
			svg.width = n_width * GRID_WIDTH;
			svg.height = n_height * GRID_HEIGHT;
			for (var i = 0; i < subScrs.length; i++) {
				var x = i % n_width * GRID_WIDTH;
				var y = ~~(i / n_width) * GRID_HEIGHT;
				var subSvg = new $.svg();
				renderSVG(subSvg, subScrs[i]);
				svg.addElem(subSvg.renderGroup(x, y, GRID_WIDTH, GRID_HEIGHT));
				svg.addText((i + 1).toString(), [x, y], {
					'font': '40px Arial',
					'fill': kernel.getProp('col-font')
				}, 1);
			}
		} else {
			return -1;
		}
		return recons;
	}

	function genImage(scramble, renderTool) {
		var svg = new $.svg();
		var recons = renderSVG(svg, scramble);
		if (recons == -1) { // not available
			return false;
		}
		if (!renderTool) {
			return svg;
		}
		var scale = Math.min(1.6 / svg.width, 1.0 / svg.height) * kernel.getProp('imgSize') * 0.6;
		img.attr('src', 'data:image/svg+xml;base64,' + btoa(svg.render()));
		img.width(svg.width * scale + 'em');
		img.height(svg.height * scale + 'em');

		if (recons && kernel.getProp('imgRep')) {
			for (var i = 0; i < recons[1].length; i++) {
				recons[1][i] = recons[1][i] + '@' + (i + 1) * 1000;
			}
			recons[1] = recons[1].join(' ');
			img.click(function(recons) {
				replay.popupReplay(recons[0], recons[1], recons[2], {'plain': true});
			}.bind(null, recons));
		} else {
			img.click(function(svg, scale) {
				var popImg = $('<img style="display:block;">');
				popImg.attr('src', 'data:image/svg+xml;base64,' + btoa(svg.render()));
				popImg.css('object-fit', 'contain');
				kernel.showDialog([popImg, $.noop, undefined, $.noop], 'share', TOOLS_IMAGE);
			}.bind(null, svg, scale));
		}
		return true;
	}

	ISCSTIMER && execMain(function() {
		function execFunc(fdiv) {
			if (!fdiv) {
				return;
			}
			img = img || $('<img style="display:block;">');
			fdiv.empty().append(img);
			if (!genImage(tools.getCurScramble(), true)) {
				fdiv.html(IMAGE_UNAVAILABLE);
			}
		}

		$(function() {
			tools.regTool('image', TOOLS_IMAGE, execFunc);
		});
	});

	var colre = /#[0-9a-fA-F]{3}/g;

	return {
		draw: genImage,
		llImage: llImage,
		pyrllImage: pyrllImage,
		face3Image: face3Image,
		sqllImage: sq1Image.llImage
	}
})();
