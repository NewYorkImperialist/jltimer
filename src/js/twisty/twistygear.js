/*
 * jlTimer: the Gear Cube virtual puzzle (twisty type "gear"). The model (stickers, moves, cogs) is lib/puzzlegear.js.
 *
 * Drawn like the NxN cube (sticker planes, cube skins, body planes, double-sided Classic stickers that peek
 * through, colours and move-effect tint) on a 3x3 grid. Corners and centres are square stickers; an edge is a cog:
 * on each of its two faces a half disk, split by the cog's colour boundary (a diameter of the disk) into two parts,
 * drawn as two wedges from the middle of the cube edge, the way csTimer's scramble image draws them. A face turn
 * animates the face half a turn, the middle layer a quarter turn and the middle layer's cogs spinning 60 degrees,
 * their colour boundaries sweeping round.
 *
 * Moves: [1, 1, face, halfTurns] for face turns, [1, 99, axisFace, quarterTurns] for rotations (puzzlegear.js).
 */
(function() {
	twistyjs.registerTwisty('gear', createGearTwisty);

	var W = 99;

	// the touch board of the 3x3 (twistynnn.js getTouchMoves): face turns (a 3x3 half turn = 2 half turns here, a
	// full face turn) and rotations; slices and wide moves have no gear move
	var TOUCH = {
		62: [1, 1, "B", 1], 63: [1, 1, "R", 1], 64: [1, W, "U", 2], 65: [1, W, "U", 1], 67: [1, 1, "F", 2], 69: [1, 1, "F", 1],
		41: [1, 1, "L", -1], 42: [1, 1, "B", -1], 45: [1, W, "U", -1], 46: [1, W, "U", -2], 47: [1, 1, "F", -1], 49: [1, 1, "F", -2],
		31: [1, 1, "U", 2], 32: [1, 1, "U", 1], 36: [1, 1, "R", -1], 37: [1, W, "F", -1], 39: [1, 1, "R", -2],
		12: [1, 1, "U", -1], 13: [1, 1, "U", -2], 14: [1, 1, "L", 1], 17: [1, 1, "L", 2], 19: [1, W, "F", 1],
		91: [1, W, "F", -1], 92: [1, 1, "B", 2], 93: [1, 1, "R", 2], 94: [1, 1, "F", -2], 96: [1, 1, "F", -1],
		97: [1, 1, "D", -2], 98: [1, 1, "D", -1],
		73: [1, W, "F", 1], 72: [1, 1, "B", -2], 71: [1, 1, "L", -2], 76: [1, 1, "F", 2], 74: [1, 1, "F", 1],
		79: [1, 1, "D", 2], 78: [1, 1, "D", 1],
		21: [1, 1, "U", 1], 23: [1, 1, "U", -1], 24: [1, 1, "B", 1], 25: [1, W, "R", -1], 26: [1, 1, "B", -1],
		27: [1, 1, "B", 2], 28: [1, W, "R", -2], 29: [1, 1, "B", -2],
		52: [1, W, "R", 1], 54: [1, W, "U", 1], 56: [1, W, "U", -1], 58: [1, W, "R", -1],
		82: [1, W, "R", 2], 85: [1, W, "R", 1], 87: [1, 1, "D", -1], 89: [1, 1, "D", 1]
	};

	// the 3x3 keyboard map: face keys turn the face a half turn (the gear cube's only turn), rotations as usual
	var KEYS = {
		73: [1, 1, "R", 1], 75: [1, 1, "R", -1], 87: [1, 1, "B", 1], 79: [1, 1, "B", -1], //I K W O
		83: [1, 1, "D", 1], 76: [1, 1, "D", -1], 68: [1, 1, "L", 1], 69: [1, 1, "L", -1], //S L D E
		74: [1, 1, "U", 1], 70: [1, 1, "U", -1], 72: [1, 1, "F", 1], 71: [1, 1, "F", -1], //J F H G
		186: [1, W, "U", 1], 65: [1, W, "U", -1], //; A  y y'
		84: [1, W, "R", 1], 89: [1, W, "R", 1], 78: [1, W, "R", -1], 66: [1, W, "R", -1], //T Y N B  x x x' x'
		80: [1, W, "F", 1], 81: [1, W, "F", -1] //P Q  z z'
	};

	var CORNER1 = Math.atan2(2, 1) * 180 / Math.PI; // where a ray from the middle of the sticker's outer edge meets its far corners
	var CORNER2 = 180 - CORNER1;

	function v3(a) {
		return new THREE.Vector3(a[0], a[1], a[2]);
	}

	function vcross(a, b) {
		return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	}

	function vdot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	// object matrix: local x, y, z = ex, ey, ez, origin at o
	function frame(ex, ey, ez, o) {
		var m = twistyjs.axify(v3(ex), v3(ey), v3(ez));
		m.n14 = o[0];
		m.n24 = o[1];
		m.n34 = o[2];
		return m;
	}

	function createGearTwisty(twistyScene, twistyParameters) {
		var obj3d = new THREE.Object3D();
		var STK = puzzleGear.STK;
		var EDGES = puzzleGear.EDGES;

		var cubeOptions = {
			stickerBorder: true,
			doubleSided: true,
			opacity: 1,
			faceColors: [0xffffff, 0xff0000, 0x00ff00, 0xffff00, 0xff9000, 0x0000ff],
			scale: 1
		};
		for (var option in cubeOptions) {
			if (option in twistyParameters) {
				cubeOptions[option] = twistyParameters[option];
			}
		}
		cubeOptions.dimension = 3; // for move effects (js/fx.js)

		var skin = getSkin();

		function getSkin() {
			var sk = window['jlCubeSkin'] && window['jlCubeSkin']['style'] && window['jlCubeSkin']['style']();
			if (!sk || sk['id'] == 'classic' && sk['body'] == null) {
				return { stickerWidth: 1.7, round: 0, border: true, sheen: false, shade: 0, body: null, bodyEdge: null };
			}
			return {
				stickerWidth: sk['stickerWidth'], round: sk['round'], border: sk['border'], sheen: sk['sheen'],
				shade: sk['shade'], body: sk['body'], bodyEdge: sk['bodyEdge']
			};
		}

		var materials = [];
		for (var i = 0; i < 6; i++) {
			materials[i] = new THREE.MeshBasicMaterial({ color: cubeOptions.faceColors[i], opacity: cubeOptions.opacity });
		}
		var borderMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, wireframeLinewidth: 1, opacity: cubeOptions.opacity });
		var bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, opacity: cubeOptions.opacity });
		var bodyEdgeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, wireframeLinewidth: 1, opacity: cubeOptions.opacity });
		var bodyGeometry = new THREE.Plane(1.01, 1.01);
		var stickerGeometry = new THREE.Plane(1, 1);

		var state = puzzleGear.solved();

		// squares[k] = {i: sticker, base, obj, mesh, body}; halves[k] = {edge, side 0 (face A) / 1 (face B), base, obj,
		// wedges: [mesh, mesh], body, sgn: +-1 (local angle = theta or 180 - theta on A; 360 - theta / theta - 180 on B)}
		var squares = [];
		var halves = [];

		function addBody(obj, y) {
			var body = new THREE.Mesh(bodyGeometry, [bodyMaterial]);
			body.position.y = y;
			body.position.z = -0.01;
			body.visible = false;
			obj.addChild(body);
			return body;
		}

		for (var i = 0; i < STK.length; i++) {
			var st = STK[i];
			if (st.d) {
				continue;
			}
			var n = st.n;
			var u = n[1] != 0 ? [1, 0, 0] : [0, 1, 0];
			var base = frame(u, vcross(n, u), n, st.p);
			var obj = new THREE.Object3D();
			var mesh = new THREE.Mesh(stickerGeometry, [materials[0], borderMaterial]);
			obj.addChild(mesh);
			var body = addBody(obj, 0);
			obj.matrix.copy(base);
			obj.matrixAutoUpdate = false;
			obj.update();
			obj3d.addChild(obj);
			squares.push({ i: i, base: base, obj: obj, mesh: mesh, body: body });
		}

		for (var e = 0; e < EDGES.length; e++) {
			var E = EDGES[e];
			for (var side = 0; side < 2; side++) {
				var n = puzzleGear.NORM[E.faces[side]];
				var other = puzzleGear.NORM[E.faces[1 - side]];
				var ey = [-other[0], -other[1], -other[2]]; // into this face
				var ex = vcross(ey, n);
				var base = frame(ex, ey, n, E.m);
				var obj = new THREE.Object3D();
				var wedges = [];
				for (var k = 0; k < 2; k++) {
					// any convex pentagon: its triangulation stays valid while the wedge's 5 points move convexly
					var mesh = new THREE.Mesh(new THREE.Ploy([[0, -0.2], [1, 0], [0.6, 1], [-0.6, 1], [-1, 0]]), [materials[0], borderMaterial]);
					obj.addChild(mesh);
					wedges.push(mesh);
				}
				var body = addBody(obj, 0.5);
				obj.matrix.copy(base);
				obj.matrixAutoUpdate = false;
				obj.update();
				obj3d.addChild(obj);
				halves.push({ edge: e, side: side, base: base, obj: obj, wedges: wedges, body: body, sgn: vdot(E.e, ex) > 0 ? 1 : -1 });
			}
		}

		var actualScale = cubeOptions.scale * 0.5 / 1.5; // the NxN cube's size
		obj3d.scale = new THREE.Vector3(actualScale, actualScale, actualScale);

		var hs = 0.425; // half the sticker size

		// a point where the ray from the middle of the sticker's outer edge at local angle phi (degrees) leaves the sticker
		function rayPoint(phi) {
			var a = phi * Math.PI / 180;
			var c = Math.cos(a), s = Math.sin(a);
			var t = Math.abs(c) > 1e-9 ? hs / Math.abs(c) : 1e9;
			if (s > 1e-9) {
				t = Math.min(t, 2 * hs / s);
			}
			return [c * t, 0.5 - hs + s * t];
		}

		function setWedge(mesh, a, b, col) {
			mesh.visible = b - a > 0.05;
			if (!mesh.visible) {
				return;
			}
			var clamp = function(x) {
				return Math.max(a, Math.min(b, x));
			};
			var pts = [[0, 0.5 - hs], rayPoint(a), rayPoint(clamp(CORNER1)), rayPoint(clamp(CORNER2)), rayPoint(b)];
			var vs = mesh.geometry.vertices;
			for (var i = 0; i < 5; i++) {
				vs[i].position.x = pts[i][0];
				vs[i].position.y = pts[i][1];
			}
			// the canvas renderer sorts faces by their centroids: put every triangle of a wedge at the sticker's centre,
			// just in front of its body plane, as a square sticker is (else the body may be drawn over part of it)
			var faces = mesh.geometry.faces;
			for (var i = 0; i < faces.length; i++) {
				faces[i].centroid.set(0, 0.5, 0.005);
			}
			mesh.jlFace = col;
			mesh.jlTinted = false;
			mesh.materials = skin.border && cubeOptions.stickerBorder ? [materials[col], borderMaterial] : [materials[col]];
		}

		// theta (the edge's disk angle, puzzlegear.js EDGES) -> this half's local angle
		function local(h, theta) {
			if (h.side == 0) {
				return h.sgn > 0 ? theta : 180 - theta;
			}
			return h.sgn > 0 ? 360 - theta : theta - 180;
		}

		// lay out one half for a cog with colour P on theta [gamma, gamma + 180] and Q on the rest
		function layHalf(h, gamma, P, Q) {
			gamma = ((gamma % 360) + 360) % 360;
			var beta = gamma % 180;
			var first = h.side == 0 ? 0 : 180; // the half is theta [first, first + 180], split at first + beta
			var colFirst = (gamma < 180) == (h.side == 0) ? Q : P;
			var parts = [[first, first + beta, colFirst], [first + beta, first + 180, colFirst == P ? Q : P]];
			for (var k = 0; k < 2; k++) {
				var a = local(h, parts[k][0]), b = local(h, parts[k][1]);
				setWedge(h.wedges[k], Math.min(a, b), Math.max(a, b), parts[k][2]);
			}
		}

		var cogs = []; // cog of every edge in the drawn state

		function paint() {
			for (var k = 0; k < squares.length; k++) {
				var sq = squares[k];
				var col = state[sq.i];
				sq.mesh.jlFace = col;
				sq.mesh.materials = skin.border && cubeOptions.stickerBorder ? [materials[col], borderMaterial] : [materials[col]];
			}
			for (var e = 0; e < EDGES.length; e++) {
				cogs[e] = puzzleGear.cog(state, e);
			}
			for (var k = 0; k < halves.length; k++) {
				var h = halves[k];
				var c = cogs[h.edge];
				layHalf(h, c.gamma, c.P, c.Q);
			}
		}

		function applySkin(twisty, newSkin, faceColors) {
			untintAll();
			skin = newSkin || getSkin();
			if (faceColors) {
				cubeOptions.faceColors = faceColors;
			}
			for (var i = 0; i < 6; i++) {
				var mat = materials[i];
				if (faceColors && (!twisty || twisty.visible !== false)) {
					mat.color.setHex(cubeOptions.faceColors[i]);
				}
				mat.jlRound = skin.round;
				mat.jlSheen = skin.sheen;
				mat.jlShade = skin.shade;
			}
			borderMaterial.jlRound = skin.round;
			var hasBody = skin.body != null;
			if (hasBody) {
				bodyMaterial.color.setHex(skin.body);
				bodyMaterial.jlShade = skin.shade ? Math.min(0.45, skin.shade * 2.2) : 0;
				if (skin.bodyEdge != null) {
					bodyEdgeMaterial.color.setHex(skin.bodyEdge);
				}
			}
			var bodyMats = hasBody && skin.bodyEdge != null ? [bodyMaterial, bodyEdgeMaterial] : [bodyMaterial];
			hs = skin.stickerWidth / 4;
			// as on the NxN: floating stickers are double-sided so the far ones peek through the gaps; never behind a body
			var dbl = hasBody ? false : cubeOptions.doubleSided;
			for (var k = 0; k < squares.length; k++) {
				squares[k].mesh.scale.x = squares[k].mesh.scale.y = skin.stickerWidth / 2;
				squares[k].mesh.doubleSided = dbl;
				squares[k].body.visible = hasBody;
				squares[k].body.materials = bodyMats;
			}
			for (var k = 0; k < halves.length; k++) {
				halves[k].wedges[0].doubleSided = halves[k].wedges[1].doubleSided = dbl;
				halves[k].body.visible = hasBody;
				halves[k].body.materials = bodyMats;
			}
			paint();
			return true;
		}

		// move effects (js/fx.js) may tint the turning stickers: twisty.stickerTint = {color, amount}
		var tintedMeshes = [];
		var tintCache = {};

		function tintMesh(twisty, mesh) {
			var tint = twisty.stickerTint;
			if (mesh.jlTinted || !mesh.visible) {
				return;
			}
			var orig = mesh.materials[0];
			var key = mesh.jlFace + ':' + tint.color + ':' + tint.amount;
			if (!tintCache[key]) {
				var tc = new THREE.Color(tint.color), k = tint.amount;
				var col = new THREE.Color(0);
				col.setRGB(orig.color.r + (tc.r - orig.color.r) * k, orig.color.g + (tc.g - orig.color.g) * k,
					orig.color.b + (tc.b - orig.color.b) * k);
				tintCache[key] = new THREE.MeshBasicMaterial({ color: col.hex, opacity: orig.opacity });
			}
			tintCache[key].jlRound = orig.jlRound;
			tintCache[key].jlSheen = orig.jlSheen;
			tintCache[key].jlShade = orig.jlShade;
			mesh.jlOrig = orig;
			mesh.jlTinted = true;
			mesh.materials[0] = tintCache[key];
			tintedMeshes.push(mesh);
		}

		function untintAll() {
			for (var i = 0; i < tintedMeshes.length; i++) {
				if (tintedMeshes[i].jlTinted) { // a wedge laid out again mid-turn has fresh materials already
					tintedMeshes[i].materials[0] = tintedMeshes[i].jlOrig;
					tintedMeshes[i].jlTinted = false;
				}
			}
			tintedMeshes = [];
			tintCache = {};
		}

		// for a move: [square group per square, half group per half]: 0 still, 1 with the face, 2 middle layer, 3 all
		var groupCache = {};

		function moveGroups(move) {
			var key = move[2] + (move[1] >= W ? 'w' : 'f');
			if (!groupCache[key]) {
				var n = puzzleGear.NORM[puzzleGear.FACES.indexOf(move[2])];
				var g = function(p) {
					var l = vdot(p, n);
					return move[1] >= W ? 3 : l > 0.75 ? 1 : Math.abs(l) < 0.5 ? 2 : 0;
				};
				groupCache[key] = [squares.map(function(sq) {
					return g(STK[sq.i].p);
				}), halves.map(function(h) {
					return g(EDGES[h.edge].m);
				})];
			}
			return groupCache[key];
		}

		function animateMoveCallback(twisty, move, moveProgress, moveStep) {
			var n = puzzleGear.NORM[puzzleGear.FACES.indexOf(move[2])];
			var axis = new THREE.Vector3(-n[0], -n[1], -n[2]); // clockwise looking at the face
			var whole = move[1] >= W;
			var rotFace = new THREE.Matrix4(), rotMid = new THREE.Matrix4();
			rotFace.setRotationAxis(axis, moveStep * move[3] * Math.PI);
			rotMid.setRotationAxis(axis, moveStep * move[3] * Math.PI / 2);
			var gr = moveGroups(move);
			var tint = twisty.stickerTint && !whole;
			var rots = [null, rotFace, rotMid, rotMid];
			for (var k = 0; k < squares.length; k++) {
				var r = rots[gr[0][k]];
				if (r) {
					squares[k].obj.matrix.multiply(r, squares[k].obj.matrix);
					squares[k].obj.update();
					tint && tintMesh(twisty, squares[k].mesh);
				}
			}
			for (var k = 0; k < halves.length; k++) {
				var h = halves[k];
				var r = rots[gr[1][k]];
				if (!r) {
					continue;
				}
				h.obj.matrix.multiply(r, h.obj.matrix);
				h.obj.update();
				if (gr[1][k] == 2) { // a gear of the middle layer spins -60 degrees per half turn about its outward axis
					var E = EDGES[h.edge];
					var sgn = vdot(vcross(E.e, E.w), E.r) > 0 ? 1 : -1;
					var c = cogs[h.edge];
					var p = Math.min(moveProgress, 1);
					layHalf(h, c.gamma - 60 * move[3] * p * sgn, c.P, c.Q);
				}
				if (tint) {
					tintMesh(twisty, h.wedges[0]);
					tintMesh(twisty, h.wedges[1]);
				}
			}
		}

		function advanceMoveCallback(twisty, move) {
			cntMove(move);
			untintAll();
			puzzleGear.apply(state, move);
			for (var k = 0; k < squares.length; k++) {
				squares[k].obj.matrix.copy(squares[k].base);
				squares[k].obj.update();
			}
			for (var k = 0; k < halves.length; k++) {
				halves[k].obj.matrix.copy(halves[k].base);
				halves[k].obj.update();
			}
			paint();
		}

		function toggleColorVisible(twisty, visible) {
			if (twisty.visible == visible) {
				return;
			}
			twisty.visible = visible;
			for (var i = 0; i < 6; i++) {
				materials[i].color.setHex(visible ? cubeOptions.faceColors[i] : 0x7f7f7f);
			}
		}

		function keydownCallback(twisty, e) {
			if (e.altKey || e.ctrlKey) {
				return false;
			}
			var move = KEYS[e.keyCode];
			if (move) {
				twistyScene.addMoves([move.slice()]);
			}
			return false;
		}

		function getTouchMoves() {
			var ret = {};
			for (var key in TOUCH) {
				ret[key] = [move2str(TOUCH[key]), TOUCH[key].slice()];
			}
			return ret;
		}

		//return 0 if solved, 1 if not
		function isSolved(twisty) {
			if (!twistyScene.isAnimationFinished()) {
				return 99;
			}
			if (!twistyScene.isMoveFinished()) {
				return 1;
			}
			return puzzleGear.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return move[1] >= W;
		}

		// moves on one axis share the middle layer: never animated together
		function isParallelMove(twisty, move1, move2) {
			return false;
		}

		function parseScramble(scramble, addPreScr) {
			var moves = puzzleGear.parse(scramble);
			if (addPreScr) {
				moves = puzzleGear.parse(kernel.getProp(tools.isCurTrainScramble() ? 'preScrT' : 'preScr')).concat(moves);
			}
			return moves;
		}

		var counter = 0;
		var lastMove = -1;

		// multiple-turn metric (jaapsch.net): turns of one face in a row count once; rotations never
		function cntMove(move) {
			if (move[1] < W && move[2] != lastMove) {
				counter++;
			}
			lastMove = move[1] < W ? move[2] : lastMove;
		}

		function moveCnt(clr) {
			if (clr) {
				counter = 0;
				lastMove = -1;
			}
			return counter;
		}

		function move2str(move) {
			return puzzleGear.toStr(move);
		}

		function moveInv(move) {
			move = move.slice();
			move[3] = -move[3];
			return move;
		}

		applySkin(null, skin);

		return {
			type: twistyParameters,
			options: cubeOptions,
			_3d: obj3d,
			animateMoveCallback: animateMoveCallback,
			advanceMoveCallback: advanceMoveCallback,
			toggleColorVisible: toggleColorVisible,
			keydownCallback: keydownCallback,
			getTouchMoves: getTouchMoves,
			isSolved: isSolved,
			isInspectionLegalMove: isInspectionLegalMove,
			isParallelMove: isParallelMove,
			parseScramble: parseScramble,
			moveCnt: moveCnt,
			borderMaterial: borderMaterial,
			applySkin: applySkin,
			move2str: move2str,
			moveInv: moveInv,
			jlGearState: function() {
				return state.slice();
			}
		};
	}
})();
