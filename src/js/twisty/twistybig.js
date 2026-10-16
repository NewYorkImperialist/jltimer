// @ts-check
"use strict";

/*
 * jlTimer: big NxNxN cubes (Other > LxMxN > NxNxN, scramble id cubennn, the size is the scramble length box) for
 * the 3D view. A separate bundle (js/twistybig.js) that puzzleFactory loads only when such a cube is shown
 * (lib/puzzlefactory.js, size >= its bigCube.min), so normal downloads are unchanged.
 *
 * The old cube (twisty/twistynnn.js) keeps every sticker as a 3D object and the canvas renderer (lib/threemin.js)
 * projects, sorts and paints all 6N^2 of them every frame; a move walks every sticker too. Here instead:
 *  - the state is one byte per sticker (its colour), six N x N faces in a Uint8Array. A move cycles the rings of
 *    the turned layers (4N stickers per layer, one pass for all of them); turning a whole face only changes how
 *    that face's array is read (an index map per face), so a move costs O(N * layers), never O(N^2);
 *  - drawing is WebGL2: the state is a texture (one texel per sticker) and every sticker is an instance whose
 *    vertex shader places it from the instance number, so the CPU does the same small amount of work per frame at
 *    any size. During a turn the cube is cut along the turn's axis into blocks (the turning layers and the rest),
 *    each drawn with its own rotation.
 * It must look exactly like the old renderer (same camera, sticker sizes, gaps, colours, cube skins, the Classic
 * double-sided "peek-through", turn animation). Chrome draws that 2D canvas on the GPU with 4x multisampling, and
 * WebGL's 4x multisampling on the same GPU rasterizes the same triangles identically, so this draws the canvas's
 * own shapes (see the renderer below) in the canvas renderer's painting order. See docs/UI.md "Big cubes".
 *
 * Input, notation, move counting and solved detection are the old cube's (copied from twistynnn.js, which stays
 * the renderer for small cubes and for browsers without WebGL2).
 */
(function() {
	var W = /** @type {any} */ (window);
	var twistyjs = W.twistyjs;
	var THREE = W.THREE;

	// ---------- geometry (same frames as twistynnn.js) ----------
	var FACES = 'URFDLB';
	// sidesUV: columns v1, v2, v3 (local sticker x, local y, face normal) of each face's frame
	var UV = [
		[[1, 0, 0], [0, 0, -1], [0, 1, 0]], // U
		[[0, 0, -1], [0, 1, 0], [1, 0, 0]], // R
		[[1, 0, 0], [0, 1, 0], [0, 0, 1]], // F
		[[1, 0, 0], [0, 0, 1], [0, -1, 0]], // D
		[[0, 0, 1], [0, 1, 0], [-1, 0, 0]], // L
		[[-1, 0, 0], [0, 1, 0], [0, 0, -1]] // B
	];
	// outward normals (sidesNorm) and rotation axes of a turn (sidesRotAxis)
	var NORM = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
	var ROTAXIS = [[0, -1, 0], [-1, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0], [0, 0, 1]];
	// sidesRot: a quarter turn of each face as p -> M p (rows)
	var ROT = [
		[[0, 0, -1], [0, 1, 0], [1, 0, 0]], // U: (-z, y, x)
		[[1, 0, 0], [0, 0, 1], [0, -1, 0]], // R: (x, z, -y)
		[[0, 1, 0], [-1, 0, 0], [0, 0, 1]], // F: (y, -x, z)
		[[0, 0, 1], [0, 1, 0], [-1, 0, 0]], // D: (z, y, -x)
		[[1, 0, 0], [0, 0, -1], [0, 1, 0]], // L: (x, -z, y)
		[[0, -1, 0], [1, 0, 0], [0, 0, 1]] // B: (-y, x, z)
	];
	var LIGHT = [-0.36, 0.84, 0.4]; // the skins' light (lib/threemin.js jlSkinQuad)

	function dot3(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	function matVec(m, v) {
		return [dot3(m[0], v), dot3(m[1], v), dot3(m[2], v)];
	}

	function matMul3(a, b) {
		var r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 3; j++) {
				r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
			}
		}
		return r;
	}

	function transpose3(a) {
		return [[a[0][0], a[1][0], a[2][0]], [a[0][1], a[1][1], a[2][1]], [a[0][2], a[1][2], a[2][2]]];
	}

	// p -> rotation of a face turned pow quarter turns (matrix4Power(sidesRot[face], pow) in twistynnn.js)
	function turnMatrix(face, pow) {
		var m = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
		var q = pow < 0 ? transpose3(ROT[face]) : ROT[face];
		for (var i = 0; i < Math.abs(pow); i++) {
			m = matMul3(q, m);
		}
		return m;
	}

	// THREE.Matrix4.setRotationAxis, as rows of a 3x3
	function axisRotation(axis, angle) {
		var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
		var x = axis[0], y = axis[1], z = axis[2], tx = t * x, ty = t * y;
		return [
			[tx * x + c, tx * y - s * z, tx * z + s * y],
			[tx * y + s * z, ty * y + c, ty * z - s * x],
			[tx * z - s * y, ty * z + s * x, t * z * z + c]
		];
	}

	function createBigCube(twistyScene, twistyParameters) {
		var cubeOptions = {
			stickerBorder: true,
			stickerWidth: 1.8,
			doubleSided: true,
			opacity: 1,
			dimension: 3,
			faceColors: [0xffffff, 0xff0000, 0x00ff00, 0xffff00, 0xff9000, 0x0000ff],
			scale: 1
		};
		for (var option in cubeOptions) {
			if (option in twistyParameters) {
				cubeOptions[option] = twistyParameters[option];
			}
		}
		var N = cubeOptions.dimension;
		var NN = N * N;

		// ---------- skin (as in twistynnn.js getSkin) ----------
		var skin = getSkin();

		function getSkin() {
			var sk = W['jlCubeSkin'] && W['jlCubeSkin']['style'] && W['jlCubeSkin']['style']();
			if (!sk || sk['id'] == 'classic' && sk['body'] == null) {
				return { stickerWidth: cubeOptions.stickerWidth, round: 0, border: true, sheen: false, shade: 0, body: null, bodyEdge: null };
			}
			return {
				stickerWidth: sk['stickerWidth'], round: sk['round'], border: sk['border'], sheen: sk['sheen'],
				shade: sk['shade'], body: sk['body'], bodyEdge: sk['bodyEdge']
			};
		}

		// ---------- state ----------
		// face f, logical (su, sv) as in twistynnn.js (su across, sv down the face's own frame); stored at
		// f * NN + y * N + x with (x, y) = map(su, sv); a face turn only changes the map
		var state = new Uint8Array(6 * NN);
		var maps = [];
		for (var f = 0; f < 6; f++) {
			state.fill(f, f * NN, (f + 1) * NN);
			maps.push([1, 0, 0, 0, 1, 0]); // x = a*su + b*sv + c, y = d*su + e*sv + g
		}
		var stateVersion = 1; // bumped on every change: the renderer uploads the texture when it differs

		function storeIdx(f, su, sv) {
			var m = maps[f];
			return f * NN + (m[3] * su + m[4] * sv + m[5]) * N + (m[0] * su + m[1] * sv + m[2]);
		}

		// sticker position (doubled cubie units: the faces lie at +-N) of face f, (su, sv)
		function pos(f, su, sv) {
			var X = 2 * su - N + 1, Y = N - 1 - 2 * sv;
			var v = UV[f];
			return [v[0][0] * X + v[1][0] * Y + v[2][0] * N, v[0][1] * X + v[1][1] * Y + v[2][1] * N, v[0][2] * X + v[1][2] * Y + v[2][2] * N];
		}

		// position -> [face, su, sv]
		function unpos(p) {
			for (var f = 0; f < 6; f++) {
				if (dot3(p, NORM[f]) == N) {
					var v = UV[f];
					return [f, (dot3(p, v[0]) + N - 1) / 2, (N - 1 - dot3(p, v[1])) / 2];
				}
			}
			return null;
		}

		// apply [l1, l2, face, pow] to the state (twistynnn.js advanceMoveCallback)
		function applyMove(move) {
			var face = FACES.indexOf(move[2]);
			var pow = move[3];
			if (face < 0 || !(pow % 4)) {
				return;
			}
			var l1 = move[0], l2 = move[1];
			if (l2 < 0) {
				l2 = N + 1 + l2;
			}
			var r = (pow % 4 + 4) % 4; // quarter turns of sidesRot
			var cLo = Math.max(1, l1), cHi = Math.min(N, l2);
			if (cLo <= cHi) {
				turnRings(face, cLo, cHi, r);
			}
			var rot = turnMatrix(face, pow);
			if (l1 <= 1) {
				turnFace(face, rot);
			}
			if (l2 >= N) {
				turnFace((face + 3) % 6, rot);
			}
			stateVersion++;
		}

		// the rings of layers cLo..cHi (1 = the turned face's own layer) on the four side faces: a block of
		// (cHi - cLo + 1) x N stickers per face. P0 is the block on one side face, P1..P3 its images after 1..3
		// quarter turns; the stored index of each is linear in (layer, position along the ring), so one pass
		// cycles the four blocks.
		function turnRings(face, cLo, cHi, r) {
			var n = NORM[face];
			var g0 = (face + 1) % 6; // a side face
			var v = UV[g0];
			var s0 = dot3(v[0], n), s1 = dot3(v[1], n);
			// logical (su, sv) on g0 for (layer offset c, position t)
			function ref(c, t) {
				var coord = N + 1 - 2 * (cLo + c);
				return s0 != 0 ? [(s0 * coord + N - 1) / 2, t] : [t, (N - 1 - s1 * coord) / 2];
			}
			var pts = [ref(0, 0), ref(1, 0), ref(0, 1)].map(function(L) {
				return pos(g0, L[0], L[1]);
			});
			var q = ROT[face];
			var base = [], dc = [], dt = [];
			for (var i = 0; i < 4; i++) {
				var idx = pts.map(function(p) {
					var u = unpos(p);
					return storeIdx(u[0], u[1], u[2]);
				});
				base.push(idx[0]);
				dc.push(idx[1] - idx[0]);
				dt.push(idx[2] - idx[0]);
				pts = pts.map(function(p) {
					return matVec(q, p);
				});
			}
			var st = state;
			var k = cHi - cLo + 1;
			var t0 = dt[0], t1 = dt[1], t2 = dt[2], t3 = dt[3];
			for (var c = 0; c < k; c++) {
				var i0 = base[0] + c * dc[0], i1 = base[1] + c * dc[1], i2 = base[2] + c * dc[2], i3 = base[3] + c * dc[3];
				var x;
				if (r == 1) { // P0 -> P1 -> P2 -> P3 -> P0
					for (var t = 0; t < N; t++, i0 += t0, i1 += t1, i2 += t2, i3 += t3) {
						x = st[i3];
						st[i3] = st[i2];
						st[i2] = st[i1];
						st[i1] = st[i0];
						st[i0] = x;
					}
				} else if (r == 3) {
					for (var t = 0; t < N; t++, i0 += t0, i1 += t1, i2 += t2, i3 += t3) {
						x = st[i0];
						st[i0] = st[i1];
						st[i1] = st[i2];
						st[i2] = st[i3];
						st[i3] = x;
					}
				} else {
					for (var t = 0; t < N; t++, i0 += t0, i1 += t1, i2 += t2, i3 += t3) {
						x = st[i0];
						st[i0] = st[i2];
						st[i2] = x;
						x = st[i1];
						st[i1] = st[i3];
						st[i3] = x;
					}
				}
			}
		}

		// the face g turns with rot: the sticker now at logical L' is the one that was at L with rot*pos(L) = pos(L')
		function turnFace(g, rot) {
			var inv = transpose3(rot);
			var L = [];
			var pts = [[0, 0], [1, 0], [0, 1]];
			for (var i = 0; i < 3; i++) {
				var u = unpos(matVec(inv, pos(g, pts[i][0], pts[i][1])));
				L.push([u[1], u[2]]);
			}
			var j0 = L[1][0] - L[0][0], j1 = L[2][0] - L[0][0];
			var j2 = L[1][1] - L[0][1], j3 = L[2][1] - L[0][1];
			var m = maps[g];
			// new map = old map o Phi^-1 with Phi^-1(su, sv) = L0 + su * (L1 - L0) + sv * (L2 - L0)
			maps[g] = [
				m[0] * j0 + m[1] * j2, m[0] * j1 + m[1] * j3, m[0] * L[0][0] + m[1] * L[0][1] + m[2],
				m[3] * j0 + m[4] * j2, m[3] * j1 + m[4] * j3, m[3] * L[0][0] + m[4] * L[0][1] + m[5]
			];
		}

		function colorAt(f, su, sv) {
			return state[storeIdx(f, su, sv)];
		}

		function resetState() {
			queue = [];
			qHead = 0;
			viewMaps = viewState = null;
			for (var f = 0; f < 6; f++) {
				state.fill(f, f * NN, (f + 1) * NN);
				maps[f] = [1, 0, 0, 0, 1, 0];
			}
			stateVersion++;
		}

		// ---------- moves being animated ----------
		// like twistynnn.js, a turn is drawn at the angle its animation steps added up to; a finished turn stays where
		// it was drawn until every parallel turn has finished and advanceMoveCallback applies them all
		var anim = []; // {move, angle (radians about ROTAXIS[face]), touched}

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			var e = null;
			for (var i = 0; i < anim.length; i++) {
				if (anim[i].move === currentMove && !anim[i].touched) {
					e = anim[i];
					break;
				}
			}
			if (!e) {
				e = { move: currentMove, angle: 0, touched: false };
				anim.push(e);
			}
			e.angle += moveStep * currentMove[3] * Math.PI / 2;
			e.touched = true;
		}

		// A huge scramble (thousands of wide turns on a 300x300x300) takes a few hundred ms to apply. Turns are applied
		// at once until 40 ms have been spent in the current task; the rest are queued and applied in 40 ms slices
		// with the page free in between, while the screen keeps the last complete state (texture and face maps are
		// only taken from a finished state). Anything that needs the state (solved check, facelets) finishes first.
		var BUDGET = 40;
		var queue = [], qHead = 0, sliceStart = -1, drainTid = 0;
		var viewMaps = null; // face maps and stickers of the state on screen while turns are queued
		var viewState = null;

		function queued() {
			return qHead < queue.length;
		}

		function enqueue(move) {
			if (!queued()) {
				viewMaps = maps.map(function(m) {
					return m.slice();
				});
				viewState = state.slice();
				shownVersion = stateVersion;
			}
			queue.push(move);
			if (!drainTid) {
				drainTid = setTimeout(drain, 0);
			}
		}

		function drain() {
			drainTid = 0;
			if (twistyScene.getTwisty && twistyScene.getTwisty() !== twisty) {
				queue = [];
				qHead = 0;
				return; // this cube is gone
			}
			var t0 = performance.now();
			while (queued() && performance.now() - t0 < BUDGET) {
				applyMove(queue[qHead++]);
			}
			if (queued()) {
				drainTid = setTimeout(drain, 0);
				return;
			}
			queue = [];
			qHead = 0;
			viewMaps = viewState = null;
			twistyScene.redraw && twistyScene.redraw();
		}

		// apply every queued turn now
		function flush() {
			while (queued()) {
				applyMove(queue[qHead++]);
			}
			queue = [];
			qHead = 0;
			viewMaps = viewState = null;
		}

		var shownVersion = 0;

		function applyTimed(move) {
			if (queued()) {
				enqueue(move);
				return;
			}
			var now = performance.now();
			if (sliceStart < 0) {
				sliceStart = now;
				Promise.resolve().then(function() {
					sliceStart = -1; // the next task starts a new slice
				});
			}
			if (now - sliceStart < BUDGET) {
				applyMove(move);
			} else {
				enqueue(move);
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			cntMove(twisty, currentMove);
			var found = -1;
			for (var i = 0; i < anim.length && found < 0; i++) {
				if (anim[i].move === currentMove) {
					found = i;
				}
			}
			for (var i = 0; i < anim.length && found < 0; i++) { // the same move as another array
				if (anim[i].move.join() == currentMove.join()) {
					found = i;
				}
			}
			found >= 0 && anim.splice(found, 1);
			applyTimed(currentMove);
		}

		// ---------- colours / options ----------
		var allGrey = false; // toggleColorVisible (blindfolded events)
		var ah = null; // vrcAH after a depth key: [colorVisible, borderVisible] or null (all normal)

		function applySkin(twisty, newSkin, faceColors) {
			skin = newSkin || getSkin();
			if (faceColors) {
				cubeOptions.faceColors = faceColors;
				allGrey = false;
			}
			ah = null;
			return true;
		}

		function toggleColorVisible(twisty, visible) {
			allGrey = !visible;
		}

		// ---------- input: as twistynnn.js ----------
		var oSl = 1;
		var oSr = 1;
		var iSi = N;

		function generateCubeKeyMapping(oSl, oSr, iSi) {
			return {
				73: [1, oSr, "R", 1], //I R
				75: [1, oSr, "R", -1], //K R'
				87: [1, 1, "B", 1], //W B
				79: [1, 1, "B", -1], //O B'
				83: [1, 1, "D", 1], //S D
				76: [1, 1, "D", -1], //L D'
				68: [1, oSl, "L", 1], //D L
				69: [1, oSl, "L", -1], //E L'
				74: [1, 1, "U", 1], //J U
				70: [1, 1, "U", -1], //F U'
				72: [1, 1, "F", 1], //H F
				71: [1, 1, "F", -1], //G F'
				186: [1, iSi, "U", 1], //; y
				65: [1, iSi, "U", -1], //A y'
				85: [1, oSr + 1, "R", 1], //U r
				82: [1, oSl + 1, "L", -1], //R l'
				77: [1, oSr + 1, "R", -1], //M r'
				86: [1, oSl + 1, "L", 1], //V l
				84: [1, iSi, "L", -1], //T x
				89: [1, iSi, "R", 1], //Y x
				78: [1, iSi, "R", -1], //N x'
				66: [1, iSi, "L", 1], //B x'
				190: [oSr + 1, oSr + 1, "R", 1], //. M'
				88: [oSl + 1, oSl + 1, "L", -1], //X M'
				53: [oSl + 1, oSl + 1, "L", 1], //5 M
				54: [oSr + 1, oSr + 1, "R", -1], //6 M
				49: [2, iSi - 1, "F", -1], //1 S'
				50: [2, iSi - 1, "U", -1], //2 E
				57: [2, iSi - 1, "U", 1], //9 E'
				48: [2, iSi - 1, "F", 1], //0 S
				80: [1, iSi, "F", 1], //P z
				81: [1, iSi, "F", -1], //Q z'
				90: [1, 2, "D", 1], //Z d
				67: [1, 2, "U", -1], //C u'
				188: [oSl + 1, oSl + 1, "L", 1], //, M (jlTimer; csTimer: u)
				191: [1, 2, "D", -1] /// d'
			};
		}

		var cubeKeyMapping = generateCubeKeyMapping(oSl, oSr, iSi);

		function keydownCallback(twisty, e) {
			if (e.altKey || e.ctrlKey) {
				return;
			}
			var keyCode = e.keyCode;
			var ret = false;
			if (keyCode == 51 || keyCode == 52 || keyCode == 55 || keyCode == 56 || keyCode == 32) {
				if (keyCode == 51) {
					oSl = Math.max(1, oSl - 1);
				} else if (keyCode == 52) {
					oSl = Math.min(oSl + 1, iSi - 1);
				} else if (keyCode == 55) {
					oSr = Math.min(oSr + 1, iSi - 1);
				} else if (keyCode == 56) {
					oSr = Math.max(1, oSr - 1);
				} else if (keyCode == 32) {
					oSl = oSr = 1;
				}
				cubeKeyMapping = generateCubeKeyMapping(oSl, oSr, iSi);
				// twistynnn.js toggleColorVisibleHuge: grey / outline-less stickers outside the layers the keys reach
				if (N > 7) {
					var vrcAH = kernel.getProp('vrcAH', '01');
					ah = [vrcAH[0] != '0', vrcAH[1] != '0'];
				}
				ret = true;
			}
			if (keyCode in cubeKeyMapping && !(twisty.refuseMove && twisty.refuseMove(twisty, cubeKeyMapping[keyCode]))) {
				twistyScene.addMoves([cubeKeyMapping[keyCode]]);
			}
			return ret;
		}

		function isSolved(twisty) {
			if (!twistyScene.isAnimationFinished()) {
				return 99;
			}
			if (!twistyScene.isMoveFinished()) {
				return 1;
			}
			flush();
			for (var f = 0; f < 6; f++) {
				var c = state[f * NN];
				for (var i = f * NN + 1, e = (f + 1) * NN; i < e; i++) {
					if (state[i] != c) {
						return 1;
					}
				}
			}
			return 0;
		}

		// the facelet string of twistynnn.js getFacelet
		function getFacelet(twisty) {
			flush();
			var ret = [];
			var xyXchg = [1, 0, 0, 1, 0, 0];
			var xInv = [1, -1, -1, -1, -1, -1];
			var yInv = [1, -1, 1, 1, 1, -1];
			for (var f = 0; f < 6; f++) {
				for (var su = 0; su < N; su++) {
					for (var sv = 0; sv < N; sv++) {
						var p = pos(f, su, sv);
						var coord = [p[1], p[0], p[2]];
						var idx = coord.indexOf(N) + coord.indexOf(-N) + 1;
						var axis = idx + (coord[idx] > 0 ? 0 : 3);
						coord.splice(idx, 1);
						var xy = xyXchg[axis];
						var x = (coord[xy] * xInv[axis] + N - 1) / 2;
						var y = (coord[1 - xy] * yInv[axis] + N - 1) / 2;
						ret[axis * NN + x * N + y] = FACES[colorAt(f, su, sv)];
					}
				}
			}
			return ret.join("");
		}

		function isInspectionLegalMove(twisty, move) {
			return move[0] <= 1 && move[1] >= N;
		}

		function isParallelMove(twisty, move1, move2) {
			return "URFDLB".indexOf(move1[2]) % 3 == "URFDLB".indexOf(move2[2]) % 3;
		}

		function generateScramble(twisty) {
			var newMoves = [];
			for (var i = 0; i < 32; i++) {
				var random1 = 1 + ~~(Math.random() * N / 2);
				var random2 = random1 + ~~(Math.random() * N / 2);
				var random3 = ~~(Math.random() * 6);
				var random4 = [-2, -1, 1, 2][~~(Math.random() * 4)];
				newMoves.push([random1, random2, ["U", "L", "F", "R", "B", "D"][random3], random4]);
			}
			return newMoves;
		}

		function parseScramble(scramble, addPreScr) {
			if (!scramble || /^\s*$/.exec(scramble)) {
				return generateScramble(this);
			}
			var moves = cubeutil.parseScramble(scramble, "URFDLB", addPreScr);
			var ret = [];
			for (var i = 0; i < moves.length; i++) {
				if (moves[i][1] > 0) {
					var l1 = moves[i][1];
					var l2 = moves[i][3] == -1 ? 1 : moves[i][3];
					ret.push([Math.min(l1, l2), Math.max(l1, l2), "URFDLB".charAt(moves[i][0]), [1, 2, -1][moves[i][2] - 1]]);
				} else {
					// a cube rotation turns every layer (twistynnn.js uses 100 layers, too few above 100x100x100)
					ret.push([1, Math.max(100, N), "URFDLB".charAt(moves[i][0]), [1, 2, -1][-moves[i][2] - 1]]);
				}
			}
			return ret;
		}

		var counter = 0;
		var lastMove = -1;

		function cntMove(twisty, move) {
			if (!isInspectionLegalMove(twisty, move) && move[2] != lastMove) {
				counter++;
			}
			lastMove = move[2];
		}

		function moveCnt(clr) {
			if (clr) {
				counter = 0;
				lastMove = -1;
			}
			return counter;
		}

		function move2str(move) {
			var axis = move[2];
			var nlayer = move[1];
			var pow = (move[3] + 3) % 4;
			if (nlayer >= iSi) {
				return "yxz".charAt("URFDLB".indexOf(move[2]) % 3) +
					" 2'".charAt("URF".indexOf(move[2]) == -1 ? (2 - pow) : pow);
			} else if (move[0] == 1) {
				return (nlayer > 2 ? nlayer : '') + axis + (nlayer >= 2 ? 'w' : '') + " 2'".charAt(pow);
			} else {
				return move[0] + '-' + move[1] + move[2] + 'w' + " 2'".charAt(pow);
			}
		}

		function moveInv(move) {
			move = move.slice();
			move[3] = -move[3];
			return move;
		}

		function getTouchMoves() {
			return {
				61: ["u2", [1, 2, "U", 2]],
				62: ["B", [1, 1, "B", 1]],
				63: ["R", [1, oSr, "R", 1]],
				64: ["y2", [1, iSi, "U", 2]],
				65: ["y", [1, iSi, "U", 1]],
				67: ["F2", [1, 1, "F", 2]],
				68: ["M", [oSr + 1, oSr + 1, "R", -1]],
				69: ["F", [1, 1, "F", 1]],

				41: ["L'", [1, oSl, "L", -1]],
				42: ["B'", [1, 1, "B", -1]],
				43: ["u2'", [1, 2, "U", -2]],
				45: ["y'", [1, iSi, "U", -1]],
				46: ["y2'", [1, iSi, "U", -2]],
				47: ["F'", [1, 1, "F", -1]],
				48: ["M", [oSl + 1, oSl + 1, "L", 1]],
				49: ["F2'", [1, 1, "F", -2]],

				31: ["U2", [1, 1, "U", 2]],
				32: ["U", [1, 1, "U", 1]],
				34: ["u2", [1, 2, "U", 2]],
				35: ["u", [1, 2, "U", 1]],
				36: ["R'", [1, oSr, "R", -1]],
				37: ["z'", [1, iSi, "F", -1]],
				38: ["M2", [oSr + 1, oSr + 1, "R", -2]],
				39: ["R2'", [1, oSr, "R", -2]],

				12: ["U'", [1, 1, "U", -1]],
				13: ["U2'", [1, 1, "U", -2]],
				14: ["L", [1, oSl, "L", 1]],
				15: ["u'", [1, 2, "U", -1]],
				16: ["u2'", [1, 2, "U", -2]],
				17: ["L2", [1, oSl, "L", 2]],
				18: ["M2", [oSl + 1, oSl + 1, "L", 2]],
				19: ["z", [1, iSi, "F", 1]],

				91: ["z'", [1, iSi, "F", -1]],
				92: ["B2", [1, 1, "B", 2]],
				93: ["R2", [1, oSr, "R", 2]],
				94: ["F2'", [1, 1, "F", -2]],
				95: ["r", [1, oSr + 1, "R", 1]],
				96: ["F'", [1, 1, "F", -1]],
				97: ["D2'", [1, 1, "D", -2]],
				98: ["D'", [1, 1, "D", -1]],

				73: ["z", [1, iSi, "F", 1]],
				72: ["B2'", [1, 1, "B", -2]],
				71: ["L2'", [1, oSl, "L", -2]],
				76: ["F2", [1, 1, "F", 2]],
				75: ["l'", [1, oSl + 1, "L", -1]],
				74: ["F", [1, 1, "F", 1]],
				79: ["D2", [1, 1, "D", 2]],
				78: ["D", [1, 1, "D", 1]],

				21: ["U", [1, 1, "U", 1]],
				23: ["U'", [1, 1, "U", -1]],
				24: ["B", [1, 1, "B", 1]],
				25: ["x'", [1, iSi, "R", -1]],
				26: ["B'", [1, 1, "B", -1]],
				27: ["B2", [1, 1, "B", 2]],
				28: ["x2'", [1, iSi, "R", -2]],
				29: ["B2'", [1, 1, "B", -2]],

				51: ["u", [1, 2, "U", 1]],
				52: ["x", [1, iSi, "R", 1]],
				53: ["u'", [1, 2, "U", -1]],
				54: ["y", [1, iSi, "U", 1]],
				56: ["y'", [1, iSi, "U", -1]],
				57: ["l", [1, oSl + 1, "L", 1]],
				58: ["x'", [1, iSi, "R", -1]],
				59: ["r'", [1, oSr + 1, "R", -1]],

				81: ["M2'", [oSl + 1, oSl + 1, "L", -2]],
				82: ["x2", [1, iSi, "R", 2]],
				83: ["M2'", [oSr + 1, oSr + 1, "R", 2]],
				84: ["M'", [oSl + 1, oSl + 1, "L", -1]],
				85: ["x", [1, iSi, "R", 1]],
				86: ["M'", [oSr + 1, oSr + 1, "R", 1]],
				87: ["D'", [1, 1, "D", -1]],
				89: ["D", [1, 1, "D", 1]],
			};
		}

		var twisty = {
			type: twistyParameters,
			options: cubeOptions,
			_3d: new THREE.Object3D(),
			animateMoveCallback: animateMoveCallback,
			advanceMoveCallback: advanceMoveCallback,
			toggleColorVisible: toggleColorVisible,
			keydownCallback: keydownCallback,
			getTouchMoves: getTouchMoves,
			isSolved: isSolved,
			isInspectionLegalMove: isInspectionLegalMove,
			isParallelMove: isParallelMove,
			generateScramble: generateScramble,
			parseScramble: parseScramble,
			getFacelet: getFacelet,
			moveCnt: moveCnt,
			applySkin: applySkin,
			move2str: move2str,
			moveInv: moveInv,
			getRenderer: function(scene) {
				var r = rendererFor(scene);
				r.twisty = this;
				return r;
			},
			// for the renderer and tests
			big: {
				N: N,
				state: state,
				version: function() { // of the state on screen
					return queued() ? shownVersion : stateVersion;
				},
				maps: function() { // face maps of the state on screen
					return viewMaps || maps;
				},
				view: function() { // stickers of the state on screen
					return viewState || state;
				},
				flush: flush,
				colorAt: colorAt,
				pos: pos,
				applyMove: applyMove,
				reset: resetState,
				anim: anim,
				skin: function() {
					return skin;
				},
				options: cubeOptions,
				allGrey: function() {
					return allGrey;
				},
				ah: function() {
					return ah;
				},
				depth: function() {
					return [oSl, oSr];
				},
				untouch: function() {
					for (var i = 0; i < anim.length; i++) {
						anim[i].touched = false;
					}
				}
			}
		};
		return twisty;
	}

	// ======================================================================================================
	// WebGL2 renderer: one per twisty scene (main cube, replay), kept across rebuilds of the cube
	// ======================================================================================================
	//
	// Chrome draws the old cube's 2D canvas on the GPU with 4x multisampling. WebGL's 4x multisampling on the same
	// GPU rasterizes identically (same sample positions, vertex snapping and fill rule) when the picture is drawn
	// upside down, so the shapes are drawn as triangles into a multisampled framebuffer in canvas pixels (y down),
	// resolved, and copied to the canvas the right way up. The shapes are the canvas renderer's own paths:
	//  - a sticker (or the skin body behind it) is its projected quad;
	//  - its 1 px outline (round join, which Chrome draws as a bevel at this size) together with the fill is the
	//    outline's outer octagon in the outline colour and then the fill colour on the quad shrunk by half a pixel
	//    (the same pixels as fill-then-stroke);
	//  - a skin's rounded quad is the octagon of its corner points plus each corner's cubic, flattened like
	//    Chrome flattens it (Wang's formula at 1/4 px, rounded up to a power of two); the Glossy sheen likewise.
	// Everything is painted in the canvas renderer's order (back to front, see planFrame), so later shapes cover
	// earlier ones sample by sample, as on the canvas.

	var VS = [
		'#version 300 es',
		'precision highp float;',
		'precision highp int;',
		'precision highp usampler2D;',
		'uniform vec4 uC0;', // clip position of sticker (0, 0)'s centre on the face plane
		'uniform vec4 uCu;', // clip step per su
		'uniform vec4 uCv;', // clip step per sv
		'uniform vec4 uCs[4];', // clip offsets of a sticker's corners
		'uniform float uFill;', // a plain sticker's scale that fills its whole cell (2 / sticker width)
		'uniform vec4 uCb[4];', // clip offsets of a body quad's corners
		'uniform vec2 uView;',
		'uniform int uN;',
		'uniform ivec4 uRect;', // su0, sv0, nu, nv
		'uniform ivec4 uOrd;', // outer is su, su direction, sv direction, group size
		'uniform int uParts;', // 1: sticker only, 2: body then sticker
		'uniform int uInst0;', // first instance of this draw (a draw can be part of a face's rows)
		'uniform vec3 uDep;', // depth of sticker (0, 0)'s centre, per su, per sv
		'uniform vec2 uBand;', // only stickers with uBand.x < depth <= uBand.y
		'uniform ivec4 uKinds;', // part 0 base, part 0 overlay, part 1 base, part 1 overlay
		'uniform int uSeg;', // most segments of a rounded corner in this draw
		'uniform int uSegS;', // most segments of the sheen curve
		'uniform float uRound;',
		'uniform usampler2D uState;',
		'uniform ivec3 uMapX;',
		'uniform ivec3 uMapY;',
		'uniform ivec2 uTile;',
		'uniform vec3 uPal[8];',
		'uniform vec3 uBody;',
		'uniform vec4 uOver;', // overlay of the sticker part: outline colour, or sheen colour and alpha
		'uniform vec3 uEdge;', // outline of the body part
		'uniform ivec4 uAH;', // on, colours, outlines
		'uniform int uEff[8];',
		'uniform int uCustom;', // 1: one polygon given in pixels (the hand marks)
		'uniform vec2 uPoly[3];',
		'uniform vec3 uPolyCol;',
		'flat out vec4 vCol;',
		'vec2 Q[4];',
		'int NV;',
		'bool eff(int c) {',
		'  for (int i = 0; i < 8; i++) { if (uEff[i] == c) return true; }',
		'  return false;',
		'}',
		'vec2 px(vec4 c) {', // clip -> canvas pixels, y down
		'  vec2 n = c.xy / c.w;',
		'  return vec2((n.x + 1.0) * 0.5 * uView.x, (1.0 - n.y) * 0.5 * uView.y);',
		'}',
		'vec2 bez(vec2 a, vec2 c1, vec2 c2, vec2 b, float t) {',
		'  float u = 1.0 - t;',
		'  return u * u * u * a + 3.0 * u * u * t * c1 + 3.0 * u * t * t * c2 + t * t * t * b;',
		'}',
		'int segs(float x) {', // Wang's formula result rounded up to a power of two
		'  float n = ceil(sqrt(max(x, 0.0)));',
		'  return n <= 1.0 ? 1 : n <= 2.0 ? 2 : n <= 4.0 ? 4 : 8;',
		'}',
		'float orientQ() {',
		'  float s = 0.0;',
		'  for (int i = 0; i < 4; i++) { if (i >= NV) break; vec2 p = Q[i], q = Q[i + 1 < NV ? i + 1 : 0]; s += p.x * q.y - p.y * q.x; }',
		'  return s >= 0.0 ? 1.0 : -1.0;',
		'}',
		// outward normal of edge i, half a pixel long; on stickers under 8 px (longer side, so a face seen edge-on keeps its look) the 1 px outline thins with them
		// (see uFill), so on huge cubes the colours are not buried under black (8 px and up: the canvas renderer's stroke)
		'float lineW() {',
		'  float m = 0.0;',
		'  for (int i = 0; i < 4; i++) { if (i >= NV) break; m = max(m, length(Q[i + 1 < NV ? i + 1 : 0] - Q[i])); }',
		'  float t = min(1.0, m / 8.0);',
		'  return t * t;',
		'}',
		'vec2 nrm(int i, float or) {',
		'  vec2 e = Q[i + 1 < NV ? i + 1 : 0] - Q[i];',
		'  float l = length(e);',
		'  return l < 1e-6 ? vec2(0.0) : or * vec2(e.y, -e.x) / l * 0.5 * lineW();',
		'}',
		// fill + outline: triangle t of [outer octagon (2 NV - 2 triangles), quad shrunk by 0.5 px (NV - 2)];
		// colour 0 = outline, 1 = fill; a = false when the triangle is unused
		'vec2 strokeTri(int t, int v, out int col, out bool ok) {',
		'  float or = orientQ();',
		'  int no = 2 * NV - 2;',
		'  ok = true;',
		'  if (t < no) {',
		'    col = 0;',
		'    int idx = v == 0 ? 0 : t + v;', // fan over octagon vertex 0
		'    int ci = idx / 2;',
		'    vec2 n = (idx & 1) == 1 ? nrm(ci, or) : nrm(ci == 0 ? NV - 1 : ci - 1, or);',
		'    return Q[ci] + n;',
		'  }',
		'  col = 1;',
		'  int ti = t - no;',
		'  if (ti >= NV - 2) { ok = false; return vec2(0.0); }',
		'  int idx = v == 0 ? 0 : ti + v;',
		// inset corner idx: lines of edge idx-1 and edge idx moved in by half a pixel
		'  int ip = idx == 0 ? NV - 1 : idx - 1;',
		'  vec2 n1 = nrm(ip, or), n2 = nrm(idx, or);',
		'  vec2 p1 = Q[ip] - n1, d1 = Q[idx] - Q[ip];',
		'  vec2 p2 = Q[idx] - n2, d2 = Q[idx + 1 < NV ? idx + 1 : 0] - Q[idx];',
		'  float den = d1.x * d2.y - d1.y * d2.x;',
		'  if (abs(den) < 1e-9) { ok = false; return vec2(0.0); }',
		'  float s = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;',
		'  return p1 + d1 * s;',
		'}',
		// is the shrunk quad a proper (same-orientation, non-crossed) polygon?
		'bool insetOk() {',
		'  float or = orientQ();',
		'  vec2 I[4];',
		'  for (int i = 0; i < 4; i++) {',
		'    if (i >= NV) break;',
		'    int ip = i == 0 ? NV - 1 : i - 1;',
		'    vec2 n1 = nrm(ip, or), n2 = nrm(i, or);',
		'    vec2 p1 = Q[ip] - n1, d1 = Q[i] - Q[ip];',
		'    vec2 p2 = Q[i] - n2, d2 = Q[i + 1 < NV ? i + 1 : 0] - Q[i];',
		'    float den = d1.x * d2.y - d1.y * d2.x;',
		'    if (abs(den) < 1e-9) return false;',
		'    I[i] = p1 + d1 * (((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den);',
		'  }',
		'  for (int i = 0; i < 4; i++) {',
		'    if (i >= NV) break;',
		'    int j = i + 1 < NV ? i + 1 : 0;',
		'    if (dot(I[j] - I[i], Q[j] - Q[i]) <= 0.0) return false;',
		'  }',
		'  return true;',
		'}',
		// rounded quad: octagon a0 b0 a1 b1 .. (6 triangles), then per corner (uSeg - 1) fan triangles over its cubic
		'vec2 roundTri(int t, int v, out bool ok) {',
		'  ok = true;',
		'  if (t < 6) {',
		'    int idx = v == 0 ? 0 : t + v;',
		'    int ci = idx / 2;',
		'    vec2 p = Q[ci];',
		'    return (idx & 1) == 0 ? p + (Q[(ci + 3) & 3] - p) * uRound : p + (Q[(ci + 1) & 3] - p) * uRound;',
		'  }',
		'  int per = uSeg - 1;',
		'  int ci = (t - 6) / per, j = (t - 6) - ci * per + 1;', // triangle (a, P_j, P_j+1)
		'  vec2 p = Q[ci];',
		'  vec2 a = p + (Q[(ci + 3) & 3] - p) * uRound, b = p + (Q[(ci + 1) & 3] - p) * uRound;',
		'  vec2 c1 = a + (p - a) * 0.55, c2 = b + (p - b) * 0.55;',
		'  int sg = min(segs(max(length(a - 2.0 * c1 + c2), length(c1 - 2.0 * c2 + b)) * 3.0), uSeg);',
		'  if (j >= sg) { ok = false; return vec2(0.0); }',
		'  if (v == 0) return a;',
		'  return bez(a, c1, c2, b, float(j + v - 1) / float(sg));',
		'}',
		// the Glossy sheen: from the corner nearest the top left of the screen, fan from A over the quadratic B -> D
		'vec2 sheenTri(int t, int v, out bool ok) {',
		'  ok = true;',
		'  int best = 0;',
		'  for (int jj = 1; jj < 4; jj++) { if (Q[jj].x + Q[jj].y < Q[best].x + Q[best].y) best = jj; }',
		'  vec2 o = Q[best];',
		'  vec2 u = Q[(best + 1) & 3] - o, w = Q[(best + 3) & 3] - o;',
		'  vec2 A = o + u * 0.13 + w * 0.13, B = o + u * 0.7 + w * 0.13, D = o + u * 0.13 + w * 0.7;',
		'  vec2 C = o + (u + w) * 0.3;',
		'  int sg = min(segs(length(B - 2.0 * C + D)), uSegS);',
		'  if (t >= sg) { ok = false; return vec2(0.0); }',
		'  if (v == 0) return A;',
		'  float tt = float(t + v - 1) / float(sg), r = 1.0 - tt;',
		'  return r * r * B + 2.0 * r * tt * C + tt * tt * D;',
		'}',
		'void main() {',
		'  int tri = gl_VertexID / 3;',
		'  int v = gl_VertexID - tri * 3;',
		'  int j = gl_InstanceID + uInst0;',
		'  int part = 0;',
		'  int k = j;',
		'  if (uParts == 2) {',
		'    int G = uOrd.w;',
		'    int grp = j / (2 * G);',
		'    int w = j - grp * 2 * G;',
		'    part = w / G;',
		'    k = grp * G + (w - part * G);',
		'  }',
		'  int base = part == 0 ? uKinds.x : uKinds.z;',
		'  int over = part == 0 ? uKinds.y : uKinds.w;',
		'  vec3 col = vec3(0.0);',
		'  vec4 col2 = vec4(0.0, 0.0, 0.0, 1.0);',
		'  if (uCustom == 1) {',
		'    for (int i = 0; i < 3; i++) Q[i] = uPoly[i];',
		'    Q[3] = uPoly[0];',
		'    NV = 3;',
		'    col = uPolyCol;',
		'  } else {',
		'    NV = 4;',
		'    int nu = uRect.z, nvv = uRect.w;',
		'    int nInner = uOrd.x == 1 ? nvv : nu;',
		'    int o = k / nInner;',
		'    int ti = k - o * nInner;',
		'    int ui = uOrd.x == 1 ? o : ti;',
		'    int vi = uOrd.x == 1 ? ti : o;',
		'    int su = uRect.x + (uOrd.y > 0 ? ui : nu - 1 - ui);',
		'    int sv = uRect.y + (uOrd.z > 0 ? vi : nvv - 1 - vi);',
		'    float dd = uDep.x + uDep.y * float(su) + uDep.z * float(sv);',
		'    if (!(dd > uBand.x && dd <= uBand.y)) base = 0;',
		'    vec4 c = uC0 + float(su) * uCu + float(sv) * uCv;',
		'    float grow = 1.0;',
		// plain stickers under 8 px apart (the longer way) grow into the black gap between them (filling it at 0 px),
		// so huge cubes show their colours; 8 px and up they are exactly the canvas renderer's
		'    if (base == 1) {',
		'      vec2 p0 = px(c);',
		'      float cell = max(length(px(c + uCu) - p0), length(px(c + uCv) - p0));',
		'      grow = mix(uFill, 1.0, min(1.0, cell / 8.0));',
		'    }',
		'    for (int i = 0; i < 4; i++) Q[i] = px(c + (base == 3 ? uCb[i] : uCs[i] * grow));',
		'    bool hit = true;',
		'    if (uAH.x == 1) hit = eff(sv) || eff(uN - 1 - sv) || eff(su) || eff(uN - 1 - su);',
		'    if (base == 3) {',
		'      col = uBody;',
		'      col2 = vec4(uEdge, 1.0);',
		'    } else {',
		'      int x = uMapX.x * su + uMapX.y * sv + uMapX.z;',
		'      int y = uMapY.x * su + uMapY.y * sv + uMapY.z;',
		'      int ci = int(texelFetch(uState, ivec2(uTile.x + x, uTile.y + y), 0).r);',
		'      if (uAH.x == 1 && uAH.y == 0 && !hit) ci = 6;',
		'      col = uPal[ci];',
		'      col2 = uOver;',
		'      if (over == 1 && uAH.x == 1 && uAH.z == 0 && !hit) over = 0;',
		'    }',
		'  }',
		'  vec2 p = vec2(0.0);',
		'  bool ok = base != 0;',
		'  vec4 outc = vec4(col, 1.0);',
		'  if (ok) {',
		'    int nb;',
		'    if (over == 1) {', // fill + outline
		'      int c;',
		'      if (tri < 2 * NV - 2 || insetOk()) p = strokeTri(tri, v, c, ok); else ok = false;',
		'      outc = c == 0 ? vec4(col2.rgb, 1.0) : vec4(col, 1.0);',
		'    } else {',
		'      nb = base == 2 ? 6 + 4 * (uSeg - 1) : NV - 2;',
		'      if (tri < nb) {',
		'        if (base == 2) p = roundTri(tri, v, ok);',
		'        else { int idx = v == 0 ? 0 : tri + v; p = Q[idx]; }',
		'      } else if (over == 2 && tri - nb < uSegS) {',
		'        p = sheenTri(tri - nb, v, ok);',
		'        outc = vec4(col2.rgb * col2.a, col2.a);',
		'      } else ok = false;',
		'    }',
		'  }',
		'  if (!ok) {',
		'    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
		'    return;',
		'  }',
		// upside down: canvas row r lands on framebuffer row r
		'  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, p.y / uView.y * 2.0 - 1.0, 0.0, 1.0);',
		'  vCol = outc;',
		'}'
	].join('\n');

	var FS = [
		'#version 300 es',
		'precision highp float;',
		'flat in vec4 vCol;',
		'out vec4 outColor;',
		'void main() {',
		'  outColor = vCol;',
		'}'
	].join('\n');

	// copy the resolved (upside down) picture to the canvas
	var VS2 = [
		'#version 300 es',
		'void main() {',
		'  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);',
		'  gl_Position = vec4(p, 0.0, 1.0);',
		'}'
	].join('\n');
	var FS2 = [
		'#version 300 es',
		'precision highp float;',
		'uniform sampler2D uS;',
		'uniform float uH;',
		'out vec4 outColor;',
		'void main() {',
		'  ivec2 c = ivec2(gl_FragCoord.xy);',
		'  outColor = texelFetch(uS, ivec2(c.x, int(uH) - 1 - c.y), 0);',
		'}'
	].join('\n');

	var renderers = [];

	function rendererFor(scene) {
		for (var i = 0; i < renderers.length; i++) {
			if (renderers[i].scene === scene) {
				return renderers[i];
			}
		}
		var r = new GLRenderer();
		r.scene = scene;
		renderers.push(r);
		return r;
	}

	var supported = null;

	// WebGL2 with 4x multisampling, else puzzleFactory keeps the old renderer
	function isSupported() {
		if (supported === null) {
			try {
				var c = document.createElement('canvas');
				var gl = /** @type {WebGL2RenderingContext} */ (c.getContext('webgl2'));
				supported = !!gl && gl.getParameter(gl.MAX_SAMPLES) >= 4 && !!buildProgram(gl, VS, FS) && !!buildProgram(gl, VS2, FS2);
				var lose = gl && gl.getExtension('WEBGL_lose_context');
				lose && lose.loseContext();
			} catch (e) {
				supported = false;
			}
		}
		return supported;
	}

	function compile(gl, type, src) {
		var sh = gl.createShader(type);
		gl.shaderSource(sh, src);
		gl.compileShader(sh);
		if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
			W.DEBUG && console.log('[bigcube]', gl.getShaderInfoLog(sh));
			return null;
		}
		return sh;
	}

	function buildProgram(gl, vsSrc, fsSrc) {
		var vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
		var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
		if (!vs || !fs) {
			return null;
		}
		var p = gl.createProgram();
		gl.attachShader(p, vs);
		gl.attachShader(p, fs);
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			W.DEBUG && console.log('[bigcube]', gl.getProgramInfoLog(p));
			return null;
		}
		return p;
	}

	var UNIFORMS = ['uC0', 'uCu', 'uCv', 'uCs', 'uFill', 'uCb', 'uView', 'uN', 'uRect', 'uOrd', 'uParts', 'uInst0', 'uDep', 'uBand', 'uKinds', 'uSeg', 'uSegS',
		'uRound', 'uState', 'uMapX', 'uMapY', 'uTile', 'uPal', 'uBody', 'uOver', 'uEdge', 'uAH', 'uEff', 'uCustom', 'uPoly',
		'uPolyCol'];

	function GLRenderer() {
		var self = this;
		var canvas = document.createElement('canvas');
		this.domElement = canvas;
		this.twisty = null;
		var gl = null, prog = null, prog2 = null, vao = null, tex = null, loc = {}, loc2 = {};
		var msFbo = null, msColor = null, rsFbo = null, rsTex = null, fboW = 0, fboH = 0;
		var texN = 0, texVersion = -1, texTwisty = null;
		var width = 0, height = 0;

		function init() {
			gl = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2', {
				alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false
			}));
			if (!gl) {
				return false;
			}
			prog = buildProgram(gl, VS, FS);
			prog2 = buildProgram(gl, VS2, FS2);
			if (!prog || !prog2) {
				gl = null;
				return false;
			}
			for (var i = 0; i < UNIFORMS.length; i++) {
				loc[UNIFORMS[i]] = gl.getUniformLocation(prog, UNIFORMS[i]);
			}
			loc2.uS = gl.getUniformLocation(prog2, 'uS');
			loc2.uH = gl.getUniformLocation(prog2, 'uH');
			vao = gl.createVertexArray();
			tex = gl.createTexture();
			msFbo = gl.createFramebuffer();
			msColor = gl.createRenderbuffer();
			rsFbo = gl.createFramebuffer();
			rsTex = gl.createTexture();
			fboW = fboH = 0;
			texN = 0;
			texVersion = -1;
			return true;
		}

		canvas.addEventListener('webglcontextlost', function(e) {
			e.preventDefault();
			gl = null;
		});
		canvas.addEventListener('webglcontextrestored', function() {
			init();
			self.twisty && lastCamera && self.render(null, lastCamera);
		});

		this.setSize = function(w, h) {
			width = w;
			height = h;
			canvas.width = w;
			canvas.height = h;
		};

		var lastCamera = null;

		// twisty.js renders after every key and every animation step; a frame needs only one picture, and asking the
		// GPU for more than it can draw in a frame (holding a depth key on a 300x300x300) would pile up work. So a
		// second render within the same frame is drawn once, at the start of the next one.
		var drawnThisFrame = false, drawLater = false;

		this.render = function(scene, camera) {
			lastCamera = camera;
			var twisty = self.twisty;
			if (!twisty || !camera || !width || !height) {
				return;
			}
			twisty.big.untouch();
			if (drawnThisFrame) {
				drawLater = true;
				return;
			}
			drawNow();
			drawnThisFrame = true;
			requestAnimationFrame(function() {
				drawnThisFrame = false;
				if (drawLater) {
					drawLater = false;
					self.render(null, lastCamera);
				}
			});
		};

		function drawNow() {
			if (!gl && !init()) {
				return;
			}
			self.twisty && lastCamera && draw(gl, self.twisty, lastCamera);
		}

		// for tests: the pixels of a fresh frame (RGBA, premultiplied, top row first)
		this.readPixels = function(camera) {
			lastCamera = camera || lastCamera;
			drawNow();
			var px = new Uint8Array(width * height * 4);
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
			var out = new Uint8Array(px.length);
			var row = width * 4;
			for (var y = 0; y < height; y++) {
				out.set(px.subarray((height - 1 - y) * row, (height - y) * row), y * row);
			}
			return out;
		};

		function targets() {
			if (fboW == width && fboH == height) {
				return;
			}
			gl.bindRenderbuffer(gl.RENDERBUFFER, msColor);
			gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, width, height);
			gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, rsTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.bindFramebuffer(gl.FRAMEBUFFER, rsFbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rsTex, 0);
			fboW = width;
			fboH = height;
		}

		function upload(big) {
			var N = big.N;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
			if (texN != N || texTwisty !== big) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 3 * N, 2 * N, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				texN = N;
				texTwisty = big;
			}
			// face f in tile (f % 3, f / 3), its stored rows as they are
			for (var f = 0; f < 6; f++) {
				gl.texSubImage2D(gl.TEXTURE_2D, 0, (f % 3) * N, ~~(f / 3) * N, N, N, gl.RED_INTEGER, gl.UNSIGNED_BYTE,
					big.view().subarray(f * N * N, (f + 1) * N * N));
			}
			texVersion = big.version();
		}

		var palBuf = new Float32Array(24);
		var vecBuf = new Float32Array(16);

		function draw(gl, twisty, camera) {
			var big = twisty.big;
			var N = big.N;
			targets();
			gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
			gl.viewport(0, 0, width, height);
			gl.disable(gl.DEPTH_TEST);
			gl.disable(gl.CULL_FACE);
			gl.disable(gl.SCISSOR_TEST);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(prog);
			gl.bindVertexArray(vao);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			if (texVersion != big.version() || texTwisty !== big || texN != N) {
				upload(big);
			} else {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, tex);
			}
			gl.uniform1i(loc.uState, 0);
			gl.uniform2f(loc.uView, width, height);
			gl.uniform1i(loc.uN, N);

			camera.jlW = width;
			camera.jlH = height;
			var plan = planFrame(twisty, camera);
			var skin = big.skin();
			var ah = big.ah();
			var dep = big.depth();
			gl.uniform4i(loc.uAH, ah ? 1 : 0, ah && ah[0] ? 1 : 0, ah && ah[1] ? 1 : 0, 0);
			var oSl = dep[0], oSr = dep[1];
			gl.uniform1iv(loc.uEff, [0, 1, oSl - 1, oSl, oSl + 1, oSr - 1, oSr, oSr + 1]);
			gl.uniform1f(loc.uRound, skin.round || 0);
			gl.uniform1i(loc.uCustom, 0);

			// the hand marks go into the painting order by depth, as the canvas renderer sorts them: each face's
			// stickers are drawn in bands between the marks' depths, farthest band first (faces turned away, then
			// faces turned towards the camera, in each band). During a turn the marks come after the faces turned away.
			var marks = markList(twisty, plan);
			var banded = [];
			for (var i = 0; i < plan.patches.length; i++) {
				var pt = plan.patches[i];
				if (plan.blocks == 1) {
					banded.push(pt);
					continue;
				}
				if (pt.front && marks.length) {
					for (var m = 0; m < marks.length; m++) {
						drawMark(gl, twisty, marks[m]);
					}
					marks = [];
				}
				drawPatch(gl, twisty, plan, pt, 0, pt.rows);
			}
			// a mark away from the cube on screen can't be covered or cover anything: drawn last, without bands
			var free = marks.filter(function(mk) {
				return !overlaps(mk.pts, plan.box);
			});
			marks = marks.filter(function(mk) {
				return overlaps(mk.pts, plan.box);
			});
			marks.sort(function(a, b) {
				return b.depth - a.depth;
			});
			// per face: the stickers between two marks' depths (the rows they can be in, the rest filtered out)
			var hi = Infinity;
			for (var m = 0; m <= marks.length; m++) {
				var lo = m < marks.length ? marks[m].depth : -Infinity;
				for (var i = 0; i < banded.length; i++) {
					var rr = rowsBetween(banded[i], lo, hi);
					rr[1] > rr[0] && drawPatch(gl, twisty, plan, banded[i], rr[0], rr[1], lo, hi);
				}
				m < marks.length && drawMark(gl, twisty, marks[m]);
				hi = lo;
			}
			for (var m = 0; m < free.length; m++) {
				drawMark(gl, twisty, free[m]);
			}
			// resolve the samples, then copy to the canvas the right way up
			gl.disable(gl.BLEND);
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo);
			gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rsFbo);
			gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, width, height);
			gl.useProgram(prog2);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, rsTex);
			gl.uniform1i(loc2.uS, 1);
			gl.uniform1f(loc2.uH, height);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.activeTexture(gl.TEXTURE0);
		}

		function rgb(hex) {
			return [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
		}

		// jlSkinQuad's fill colour: each channel round(c * f) with f = 1 - shade * (1 - lvl / 15)
		function shaded(hex, shade, lvl) {
			if (!shade) {
				return hex;
			}
			var f = 1 - shade * (1 - lvl / 15);
			return Math.round((hex >> 16 & 255) / 255 * f * 255) << 16 | Math.round((hex >> 8 & 255) / 255 * f * 255) << 8 | Math.round((hex & 255) / 255 * f * 255);
		}

		// the move effects' tint (twistynnn.js tintSticker): THREE.Color truncates each channel
		function tinted(hex, tint) {
			var c = rgb(hex), t = rgb(tint.color), k = tint.amount;
			var r = c[0] + (t[0] - c[0]) * k, g = c[1] + (t[1] - c[1]) * k, b = c[2] + (t[2] - c[2]) * k;
			return ~~(r * 255) << 16 ^ ~~(g * 255) << 8 ^ ~~(b * 255);
		}

		function clip(m, x, y, z, w) {
			return [
				m[0] * x + m[1] * y + m[2] * z + m[3] * w,
				m[4] * x + m[5] * y + m[6] * z + m[7] * w,
				m[8] * x + m[9] * y + m[10] * z + m[11] * w,
				m[12] * x + m[13] * y + m[14] * z + m[15] * w
			];
		}

		function setVec4s(l, arr) {
			for (var i = 0; i < arr.length; i++) {
				vecBuf.set(arr[i], i * 4);
			}
			gl.uniform4fv(l, vecBuf.subarray(0, arr.length * 4));
		}

		function toPx(c) {
			return [(c[0] / c[3] + 1) * 0.5 * width, (1 - c[1] / c[3]) * 0.5 * height];
		}

		// segments of the rounded corners and of the sheen for the largest sticker of a patch (at one of its corners)
		function patchSegs(pt, h, round) {
			var N = pt.N, m = pt.mvp;
			var s1 = 1, s2 = 1;
			var cells = [[pt.rect[0], pt.rect[1]], [pt.rect[0] + pt.rect[2] - 1, pt.rect[1]], [pt.rect[0], pt.rect[1] + pt.rect[3] - 1],
				[pt.rect[0] + pt.rect[2] - 1, pt.rect[1] + pt.rect[3] - 1]];
			var L = [[-1, 1], [-1, -1], [1, -1], [1, 1]];
			for (var c = 0; c < 4; c++) {
				var X = 2 * cells[c][0] - N + 1, Y = N - 1 - 2 * cells[c][1];
				var q = [];
				for (var i = 0; i < 4; i++) {
					q.push(toPx(clip(m, X + L[i][0] * h, Y + L[i][1] * h, N, 1)));
				}
				for (var i = 0; i < 4 && round > 0; i++) {
					var p = q[i], pv = q[(i + 3) & 3], nx = q[(i + 1) & 3];
					var a = [p[0] + (pv[0] - p[0]) * round, p[1] + (pv[1] - p[1]) * round];
					var b = [p[0] + (nx[0] - p[0]) * round, p[1] + (nx[1] - p[1]) * round];
					var c1 = [a[0] + (p[0] - a[0]) * 0.55, a[1] + (p[1] - a[1]) * 0.55];
					var c2 = [b[0] + (p[0] - b[0]) * 0.55, b[1] + (p[1] - b[1]) * 0.55];
					var d1 = Math.hypot(a[0] - 2 * c1[0] + c2[0], a[1] - 2 * c1[1] + c2[1]);
					var d2 = Math.hypot(c1[0] - 2 * c2[0] + b[0], c1[1] - 2 * c2[1] + b[1]);
					s1 = Math.max(s1, segCount(Math.max(d1, d2) * 3));
				}
				// sheen curve: B - 2C + D = (u + v) * (0.7 + 0.13 - 0.6) for its corner's edge vectors
				for (var i = 0; i < 4; i++) {
					var o = q[i], u = [q[(i + 1) & 3][0] - o[0], q[(i + 1) & 3][1] - o[1]], w = [q[(i + 3) & 3][0] - o[0], q[(i + 3) & 3][1] - o[1]];
					s2 = Math.max(s2, segCount(Math.hypot(u[0] + w[0], u[1] + w[1]) * 0.23));
				}
			}
			return [s1, s2];
		}

		function segCount(x) {
			var n = Math.ceil(Math.sqrt(Math.max(x, 0)));
			return n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : 8;
		}

		// does a mark's triangle (canvas px) come within a pixel of the box [x0, y0, x1, y1]?
		function overlaps(pts, box) {
			var x0 = Math.min(pts[0], pts[2], pts[4]), x1 = Math.max(pts[0], pts[2], pts[4]);
			var y0 = Math.min(pts[1], pts[3], pts[5]), y1 = Math.max(pts[1], pts[3], pts[5]);
			return x1 > box[0] - 2 && x0 < box[2] + 2 && y1 > box[1] - 2 && y0 < box[3] + 2;
		}

		// the rows of a patch (in drawing order, far to near) that can hold a sticker with lo < depth <= hi
		function rowsBetween(pt, lo, hi) {
			var r0 = 0, r1 = pt.rows;
			while (r0 < r1 && pt.depth(r0) - pt.spread > hi) {
				r0++;
			}
			while (r1 > r0 && pt.depth(r1 - 1) + pt.spread <= lo) {
				r1--;
			}
			return [r0, r1];
		}

		// rows r0..r1 (outer index, in drawing order) of a patch, the stickers with lo < depth <= hi
		function drawPatch(gl, twisty, plan, pt, r0, r1, lo, hi) {
			gl.uniform3f(loc.uDep, pt.dep[0], pt.dep[1], pt.dep[2]);
			gl.uniform2f(loc.uBand, lo == null ? -Infinity : lo, hi == null ? Infinity : hi);
			var big = twisty.big;
			var N = big.N;
			var skin = big.skin();
			var opts = big.options;
			var lvl = pt.lvl;
			var hasBody = skin.body != null;
			// palette: six faces + grey, tinted on a turning block, shaded by the light
			var cols = opts.faceColors.slice(0, 6);
			cols.push(0x7f7f7f);
			if (big.allGrey()) {
				for (var i = 0; i < 6; i++) {
					cols[i] = 0x7f7f7f;
				}
			}
			var tint = pt.tint && twisty.stickerTint;
			for (var i = 0; i < 7; i++) {
				var hx = tint ? tinted(cols[i], tint) : cols[i];
				var c = rgb(shaded(hx, skin.shade, lvl));
				palBuf[i * 3] = c[0];
				palBuf[i * 3 + 1] = c[1];
				palBuf[i * 3 + 2] = c[2];
			}
			gl.uniform3fv(loc.uPal, palBuf);
			if (hasBody) {
				var bshade = skin.shade ? Math.min(0.45, skin.shade * 2.2) : 0;
				var bc = rgb(shaded(skin.body, bshade, lvl));
				gl.uniform3f(loc.uBody, bc[0], bc[1], bc[2]);
				var ec = rgb(skin.bodyEdge != null ? skin.bodyEdge : 0);
				gl.uniform3f(loc.uEdge, ec[0], ec[1], ec[2]);
			}
			var border = opts.stickerBorder && skin.border;
			var round = skin.round || 0;
			var stickerBase = round > 0 ? 2 : 1;
			var stickerOver = border && stickerBase == 1 ? 1 : skin.sheen ? 2 : 0;
			if (stickerOver == 2) {
				gl.uniform4f(loc.uOver, 1, 1, 1, parseFloat((0.05 + 0.15 * lvl / 15).toFixed(3)));
			} else {
				gl.uniform4f(loc.uOver, 0, 0, 0, 1);
			}
			var h = skin.stickerWidth / 2;
			gl.uniform1f(loc.uFill, 1 / h);
			var m = pt.mvp;
			setVec4s(loc.uCs, [clip(m, -h, h, 0, 0), clip(m, -h, -h, 0, 0), clip(m, h, -h, 0, 0), clip(m, h, h, 0, 0)]);
			setVec4s(loc.uCb, [clip(m, -1.01, 1.01, -0.02, 0), clip(m, -1.01, -1.01, -0.02, 0), clip(m, 1.01, -1.01, -0.02, 0), clip(m, 1.01, 1.01, -0.02, 0)]);
			setVec4s(loc.uC0, [clip(m, -N + 1, N - 1, N, 1)]);
			setVec4s(loc.uCu, [clip(m, 2, 0, 0, 0)]);
			setVec4s(loc.uCv, [clip(m, 0, -2, 0, 0)]);
			// triangles per instance: the larger of the parts
			var sg = [1, 1];
			if (stickerBase == 2 || stickerOver == 2) {
				pt.N = N;
				sg = patchSegs(pt, h, round);
			}
			gl.uniform1i(loc.uSeg, sg[0]);
			gl.uniform1i(loc.uSegS, sg[1]);
			var trisSticker = stickerOver == 1 ? 8 : (stickerBase == 2 ? 6 + 4 * (sg[0] - 1) : 2) + (stickerOver == 2 ? sg[1] : 0);
			var tris = trisSticker;
			if (hasBody) {
				var edge = skin.bodyEdge != null;
				gl.uniform1i(loc.uParts, 2);
				gl.uniform4i(loc.uKinds, 3, edge ? 1 : 0, stickerBase, stickerOver);
				tris = Math.max(tris, edge ? 8 : 2);
			} else {
				gl.uniform1i(loc.uParts, 1);
				gl.uniform4i(loc.uKinds, stickerBase, stickerOver, 0, 0);
			}
			var mp = big.maps()[pt.face];
			gl.uniform3i(loc.uMapX, mp[0], mp[1], mp[2]);
			gl.uniform3i(loc.uMapY, mp[3], mp[4], mp[5]);
			gl.uniform2i(loc.uTile, (pt.face % 3) * N, ~~(pt.face / 3) * N);
			gl.uniform4i(loc.uRect, pt.rect[0], pt.rect[1], pt.rect[2], pt.rect[3]);
			var nInner = pt.outerU ? pt.rect[3] : pt.rect[2];
			var G = pt.group == 2 ? pt.rect[2] * pt.rect[3] : pt.group == 1 ? nInner : 1;
			gl.uniform4i(loc.uOrd, pt.outerU ? 1 : 0, pt.dirU, pt.dirV, G);
			var per = nInner * (hasBody ? 2 : 1); // instances per row
			gl.uniform1i(loc.uInst0, r0 * per);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, 3 * tris, (r1 - r0) * per);
		}

		// the hand marks above the cube (twistynnn.js updateHandMarks, N > 5): small triangles in the L and R
		// colours, always outlined; [{pts (canvas px), depth of the centroid, colour}]
		function markList(twisty, plan) {
			var big = twisty.big;
			var N = big.N;
			var out = [];
			if (N <= 5) {
				return out;
			}
			var dep = big.depth();
			var mw = N / 15;
			var hsq2 = Math.sqrt(2) / 2;
			var tri = [[0, 0], [mw / 2, mw], [-mw / 2, mw]];
			for (var i = 0; i < 4; i++) {
				var offset = (i + 1 & 2) ? dep[0] : dep[1];
				var su = (i & 1) ? 1 : -1;
				var sv = (i & 2) ? 1 : -1;
				var tx = su * (N - 2 * offset), ty = N * (hsq2 * 2 + 0.05);
				var flat = [];
				var c = [0, 0, 0];
				for (var k = 0; k < 3; k++) {
					// axify((sv,0,0), (0,hsq2*sv,-hsq2*sv), (0,hsq2,hsq2)) * translate(tx, ty, 0)
					var lx = tri[k][0] + tx, ly = tri[k][1] + ty;
					var w = [sv * lx * plan.scale, hsq2 * sv * ly * plan.scale, -hsq2 * sv * ly * plan.scale];
					var p = toPx(clip(plan.pv, w[0], w[1], w[2], 1));
					flat.push(p[0], p[1]);
					c[0] += w[0] / 3;
					c[1] += w[1] / 3;
					c[2] += w[2] / 3;
				}
				// up to 7x7x7 the marks share the R / L stickers' materials, so the blindfold grey reaches them too
				var col = big.allGrey() && N <= 7 ? 0x7f7f7f : (i + 1 & 2) ? big.options.faceColors[4] : big.options.faceColors[1];
				out.push({ pts: flat, depth: plan.depthOf(c), col: col });
			}
			return out;
		}

		function drawMark(gl, twisty, mark) {
			gl.uniform1i(loc.uCustom, 1);
			gl.uniform1i(loc.uParts, 1);
			gl.uniform1i(loc.uInst0, 0);
			gl.uniform4i(loc.uKinds, 1, 1, 0, 0);
			gl.uniform4f(loc.uOver, 0, 0, 0, 1);
			gl.uniform2fv(loc.uPoly, mark.pts);
			var col = rgb(mark.col);
			gl.uniform3f(loc.uPolyCol, col[0], col[1], col[2]);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, 3 * 8, 1);
			gl.uniform1i(loc.uCustom, 0);
		}
	}

	function mat4(m) { // THREE.Matrix4 -> row-major array
		return [m.n11, m.n12, m.n13, m.n14, m.n21, m.n22, m.n23, m.n24, m.n31, m.n32, m.n33, m.n34, m.n41, m.n42, m.n43, m.n44];
	}

	function mul4(a, b) {
		var r = new Array(16);
		for (var i = 0; i < 4; i++) {
			for (var j = 0; j < 4; j++) {
				r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + a[i * 4 + 3] * b[12 + j];
			}
		}
		return r;
	}

	// what to draw this frame, in the canvas renderer's back-to-front order:
	// blocks along the turn axis (one when nothing turns), per block the faces' rectangles (patches)
	function planFrame(twisty, camera) {
		var big = twisty.big;
		var N = big.N;
		camera.update(undefined, true);
		var P = mat4(camera.projectionMatrix);
		var V = mat4(camera.matrixWorldInverse);
		var PV = mul4(P, V);
		var scale = big.options.scale * 0.5 / N;
		var campos = [camera.position.x, camera.position.y, camera.position.z];
		var zaxis = [V[8], V[9], V[10]]; // view space z (towards the camera) in world space
		var skin = big.skin();
		var hasBody = skin.body != null;
		var single = hasBody || !big.options.doubleSided;

		// angle of each layer slot q (0 .. N-1 from the negative side of the axis) about the +axis
		var axis = -1;
		var slotAngle = null;
		var anim = big.anim;
		for (var i = 0; i < anim.length; i++) {
			var mv = anim[i].move;
			var face = FACES.indexOf(mv[2]);
			if (face < 0) {
				continue;
			}
			var a = face % 3 == 0 ? 1 : face % 3 == 1 ? 0 : 2; // U/D: y, R/L: x, F/B: z
			if (axis == -1) {
				axis = a;
				slotAngle = new Float64Array(N);
			} else if (a != axis) {
				continue;
			}
			var sign = NORM[face][a]; // +1 for U R F
			var l1 = mv[0], l2 = mv[1];
			if (l2 < 0) {
				l2 = N + 1 + l2;
			}
			var ang = anim[i].angle * ROTAXIS[face][a];
			for (var c = Math.max(1, l1); c <= Math.min(N, l2); c++) {
				slotAngle[sign > 0 ? N - c : c - 1] += ang;
			}
		}
		var blocks = [];
		if (axis == -1) {
			blocks.push({ lo: 0, hi: N - 1, angle: 0, turning: false });
		} else {
			var start = 0;
			for (var q = 1; q <= N; q++) {
				if (q == N || slotAngle[q] != slotAngle[start]) {
					blocks.push({ lo: start, hi: q - 1, angle: slotAngle[start], turning: slotAngle[start] != 0 });
					start = q;
				}
			}
		}
		// blocks are separated by planes across the axis: the ones beyond the camera's axis position first,
		// farthest first, the block around the camera last
		if (blocks.length > 1) {
			var ca = campos[axis] / scale; // camera on the axis in sticker units (the cube spans -N .. N)
			var below = [], above = [], around = [];
			for (var i = 0; i < blocks.length; i++) {
				var b = blocks[i];
				var lo = 2 * b.lo - N, hi = 2 * b.hi + 2 - N;
				(hi <= ca ? below : lo >= ca ? above : around).push(b);
			}
			above.reverse();
			blocks = below.concat(above, around);
		}

		var patches = [];
		for (var bi = 0; bi < blocks.length; bi++) {
			var b = blocks[bi];
			var R = axis == -1 || b.angle == 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : axisRotation(axis == 0 ? [1, 0, 0] : axis == 1 ? [0, 1, 0] : [0, 0, 1], b.angle);
			var bp = [];
			for (var f = 0; f < 6; f++) {
				var rect = patchRect(f, axis, b, N);
				if (!rect) {
					continue;
				}
				var v = UV[f];
				var n = matVec(R, v[2]);
				// facing: towards the camera from the face's plane
				var c0 = [n[0] * N * scale, n[1] * N * scale, n[2] * N * scale];
				var front = dot3(n, [campos[0] - c0[0], campos[1] - c0[1], campos[2] - c0[2]]) > 0;
				if (!front && single) {
					continue;
				}
				// depth gradients along su and sv (depth = distance along the view axis): draw far to near
				var gu = -dot3(matVec(R, v[0]), zaxis) * 2;
				var gv = dot3(matVec(R, v[1]), zaxis) * 2;
				var eps = 1e-12;
				var outerU = Math.abs(gu) >= Math.abs(gv);
				var gIn = outerU ? gv : gu, gOut = outerU ? gu : gv;
				var group = Math.abs(gIn) < eps ? (Math.abs(gOut) < eps ? 2 : 1) : 0;
				// light level (jlSkinQuad): normal flipped to face the camera
				var d = dot3(n, LIGHT);
				if (!front) {
					d = -d;
				}
				var lvl = Math.round((d + 1) * 7.5);
				// local face frame -> clip: PV * scale * R * [v1 v2 v3]
				var RM = matMul3(R, transpose3(v)); // columns of transpose3(v)... rows of v are the columns
				var M = [
					RM[0][0] * scale, RM[0][1] * scale, RM[0][2] * scale, 0,
					RM[1][0] * scale, RM[1][1] * scale, RM[1][2] * scale, 0,
					RM[2][0] * scale, RM[2][1] * scale, RM[2][2] * scale, 0,
					0, 0, 0, 1
				];
				// depth (distance along the view axis) of sticker (su, sv)'s centre, and of row o in drawing order
				var dC = dot3(campos, zaxis) - scale * dot3(matVec(RM, [-N + 1, N - 1, N]), zaxis);
				var dU = -scale * dot3(matVec(RM, [2, 0, 0]), zaxis);
				var dV = -scale * dot3(matVec(RM, [0, -2, 0]), zaxis);
				var nOut = outerU ? rect[2] : rect[3];
				bp.push({
					face: f,
					rect: rect,
					rows: nOut,
					dep: [dC, dU, dV],
					spread: Math.abs(outerU ? dV : dU) * ((outerU ? rect[3] : rect[2]) - 1) / 2 + 1e-9,
					depth: rowDepth(rect, outerU, gu > eps ? -1 : 1, gv > eps ? -1 : 1, dC, dU, dV),
					front: front,
					dz: dot3(n, zaxis),
					outerU: outerU,
					dirU: gu > eps ? -1 : 1,
					dirV: gv > eps ? -1 : 1,
					group: group,
					lvl: lvl,
					tint: b.turning,
					mvp: mul4(PV, M)
				});
			}
			// inside a block (a box): faces turned away first, then by how much they face the camera
			bp.sort(function(p1, p2) {
				if (p1.front != p2.front) {
					return p1.front ? 1 : -1;
				}
				return p1.dz - p2.dz || p1.face - p2.face;
			});
			patches = patches.concat(bp);
		}
		// the cube on screen (its 8 corners; a turning block can stick out, so then the corners of a larger cube)
		var ext = N * scale * (blocks.length > 1 ? Math.SQRT2 : 1) * 1.02;
		var box = [Infinity, Infinity, -Infinity, -Infinity];
		for (var i = 0; i < 8; i++) {
			var cc = clipOf(PV, [(i & 1 ? 1 : -1) * ext, (i & 2 ? 1 : -1) * ext, (i & 4 ? 1 : -1) * ext]);
			var sx = (cc[0] / cc[3] + 1) * 0.5 * camera.jlW, sy = (1 - cc[1] / cc[3]) * 0.5 * camera.jlH;
			box = [Math.min(box[0], sx), Math.min(box[1], sy), Math.max(box[2], sx), Math.max(box[3], sy)];
		}
		return {
			box: box,
			patches: patches,
			blocks: blocks.length,
			pv: PV,
			scale: scale,
			depthOf: function(w) {
				return dot3([campos[0] - w[0], campos[1] - w[1], campos[2] - w[2]], zaxis);
			}
		};
	}

	function clipOf(m, p) {
		return [
			m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
			m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
			m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
			m[12] * p[0] + m[13] * p[1] + m[14] * p[2] + m[15]
		];
	}

	// depth of row o (outer index, drawing order) of a patch: at the middle of the row
	function rowDepth(rect, outerU, dirU, dirV, dC, dU, dV) {
		return function(o) {
			var su, sv;
			if (outerU) {
				su = rect[0] + (dirU > 0 ? o : rect[2] - 1 - o);
				sv = rect[1] + (rect[3] - 1) / 2;
			} else {
				sv = rect[1] + (dirV > 0 ? o : rect[3] - 1 - o);
				su = rect[0] + (rect[2] - 1) / 2;
			}
			return dC + dU * su + dV * sv;
		};
	}

	// the stickers of face f inside block b ([su0, sv0, nu, nv]) or null
	function patchRect(f, axis, b, N) {
		if (axis == -1) {
			return [0, 0, N, N];
		}
		var v = UV[f];
		if (v[2][axis] != 0) { // the face lies across the axis: only in the block at its end
			var q = v[2][axis] > 0 ? N - 1 : 0;
			return b.lo <= q && q <= b.hi ? [0, 0, N, N] : null;
		}
		// slot q of a sticker: along su (x of the face frame) or sv (y)
		if (v[0][axis] != 0) {
			var lo = v[0][axis] > 0 ? b.lo : N - 1 - b.hi;
			return [lo, 0, b.hi - b.lo + 1, N];
		}
		var lo2 = v[1][axis] < 0 ? b.lo : N - 1 - b.hi;
		return [0, lo2, N, b.hi - b.lo + 1];
	}

	twistyjs.registerTwisty('bigcube', createBigCube);
	twistyjs.bigcube = {
		api: 1, // puzzleFactory uses this bundle only when it speaks the same version
		supported: isSupported
	};
})();
