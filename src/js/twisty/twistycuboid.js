/*
 * jlTimer: the LxMxN cuboid virtual puzzles (2x2x3 Tower "223", 2x3x3 Domino "233", 3x3x4 .. 3x3x7 "334" .. "337"),
 * drawn exactly like the NxN cube (twistynnn.js: the same sticker planes, cube skins, body planes, double-sided
 * Classic stickers that peek through, colours and move-effect sticker tint), but with a different number of layers
 * along each axis.
 *
 * The puzzle logic (which stickers a move turns, which layers may make quarter turns, solved, notation) lives in
 * lib/puzzlecuboid.js; this file keeps the THREE objects in step with it. Moves use the NxN move format
 * [layerStart, layerEnd, face, quarterTurns] with layerEnd 99 = the whole puzzle and -2 = all inner layers (M E S).
 * Keys are resolved against the state after every move entered so far (qState): a quarter turn of a face that can
 * only make half turns becomes a half turn, layers covering the whole puzzle become the rotation.
 */
(function() {
	var TYPES = ['223', '233', '334', '336']; // 335 / 337 change shape: twisty/twistyshift.js
	for (var t = 0; t < TYPES.length; t++) {
		twistyjs.registerTwisty(TYPES[t], createCuboidTwisty);
	}

	var axify = twistyjs.axify;

	var xx = new THREE.Vector3(1, 0, 0);
	var yy = new THREE.Vector3(0, 1, 0);
	var zz = new THREE.Vector3(0, 0, 1);
	var xxi = new THREE.Vector3(-1, 0, 0);
	var yyi = new THREE.Vector3(0, -1, 0);
	var zzi = new THREE.Vector3(0, 0, -1);

	var FACES = "URFDLB";
	var W = 99; // whole puzzle
	var I = -2; // all inner layers
	// same conventions as twistynnn.js
	var sidesRot = {
		"U": axify(zz, yy, xxi),
		"L": axify(xx, zz, yyi),
		"F": axify(yyi, xx, zz),
		"R": axify(xx, zzi, yy),
		"B": axify(yy, xxi, zz),
		"D": axify(zzi, yy, xx)
	};
	var sidesRotAxis = {
		"U": yyi,
		"L": xx,
		"F": zzi,
		"R": xxi,
		"B": zz,
		"D": yy
	};
	var sidesUV = [
		axify(xx, zzi, yy), //U
		axify(zzi, yy, xx), //R
		axify(xx, yy, zz), //F
		axify(xx, zz, yyi), //D
		axify(zz, yy, xxi), //L
		axify(xxi, yy, zzi) //B
	];

	// the touch board of the 3x3 (twistynnn.js getTouchMoves with single layers): M = [2, -2], rotations [1, 99]
	var TOUCH = {
		61: [1, 2, "U", 2], 62: [1, 1, "B", 1], 63: [1, 1, "R", 1], 64: [1, W, "U", 2], 65: [1, W, "U", 1],
		67: [1, 1, "F", 2], 68: [2, I, "R", -1], 69: [1, 1, "F", 1],
		41: [1, 1, "L", -1], 42: [1, 1, "B", -1], 43: [1, 2, "U", -2], 45: [1, W, "U", -1], 46: [1, W, "U", -2],
		47: [1, 1, "F", -1], 48: [2, I, "L", 1], 49: [1, 1, "F", -2],
		31: [1, 1, "U", 2], 32: [1, 1, "U", 1], 34: [1, 2, "U", 2], 35: [1, 2, "U", 1], 36: [1, 1, "R", -1],
		37: [1, W, "F", -1], 38: [2, I, "R", -2], 39: [1, 1, "R", -2],
		12: [1, 1, "U", -1], 13: [1, 1, "U", -2], 14: [1, 1, "L", 1], 15: [1, 2, "U", -1], 16: [1, 2, "U", -2],
		17: [1, 1, "L", 2], 18: [2, I, "L", 2], 19: [1, W, "F", 1],
		91: [1, W, "F", -1], 92: [1, 1, "B", 2], 93: [1, 1, "R", 2], 94: [1, 1, "F", -2], 95: [1, 2, "R", 1],
		96: [1, 1, "F", -1], 97: [1, 1, "D", -2], 98: [1, 1, "D", -1],
		73: [1, W, "F", 1], 72: [1, 1, "B", -2], 71: [1, 1, "L", -2], 76: [1, 1, "F", 2], 75: [1, 2, "L", -1],
		74: [1, 1, "F", 1], 79: [1, 1, "D", 2], 78: [1, 1, "D", 1],
		21: [1, 1, "U", 1], 23: [1, 1, "U", -1], 24: [1, 1, "B", 1], 25: [1, W, "R", -1], 26: [1, 1, "B", -1],
		27: [1, 1, "B", 2], 28: [1, W, "R", -2], 29: [1, 1, "B", -2],
		51: [1, 2, "U", 1], 52: [1, W, "R", 1], 53: [1, 2, "U", -1], 54: [1, W, "U", 1], 56: [1, W, "U", -1],
		57: [1, 2, "L", 1], 58: [1, W, "R", -1], 59: [1, 2, "R", -1],
		81: [2, I, "L", -2], 82: [1, W, "R", 2], 83: [2, I, "R", 2], 84: [2, I, "L", -1], 85: [1, W, "R", 1],
		86: [2, I, "R", 1], 87: [1, 1, "D", -1], 89: [1, 1, "D", 1]
	};

	// the 3x3 keyboard map (twistynnn.js). Face keys turn one layer (U / D: du / dd layers), wide keys two
	// (u / d: one more than U / D), M / E / S all inner layers (E: the layers between the U and D turns)
	function keyMove(keyCode, du, dd) {
		switch (keyCode) {
			case 73: return [1, 1, "R", 1]; //I R
			case 75: return [1, 1, "R", -1]; //K R'
			case 87: return [1, 1, "B", 1]; //W B
			case 79: return [1, 1, "B", -1]; //O B'
			case 83: return [1, dd, "D", 1]; //S D
			case 76: return [1, dd, "D", -1]; //L D'
			case 68: return [1, 1, "L", 1]; //D L
			case 69: return [1, 1, "L", -1]; //E L'
			case 74: return [1, du, "U", 1]; //J U
			case 70: return [1, du, "U", -1]; //F U'
			case 72: return [1, 1, "F", 1]; //H F
			case 71: return [1, 1, "F", -1]; //G F'
			case 186: return [1, W, "U", 1]; //; y
			case 65: return [1, W, "U", -1]; //A y'
			case 85: return [1, 2, "R", 1]; //U r
			case 82: return [1, 2, "L", -1]; //R l'
			case 77: return [1, 2, "R", -1]; //M r'
			case 86: return [1, 2, "L", 1]; //V l
			case 84: return [1, W, "L", -1]; //T x
			case 89: return [1, W, "R", 1]; //Y x
			case 78: return [1, W, "R", -1]; //N x'
			case 66: return [1, W, "L", 1]; //B x'
			case 190: return [2, I, "R", 1]; //. M'
			case 88: return [2, I, "L", -1]; //X M'
			case 53: return [2, I, "L", 1]; //5 M
			case 54: return [2, I, "R", -1]; //6 M
			case 188: return [2, I, "L", 1]; //, M
			case 49: return [2, I, "F", -1]; //1 S'
			case 48: return [2, I, "F", 1]; //0 S
			case 50: return du == 1 && dd == 1 ? [2, I, "U", -1] : [du + 1, -dd - 1, "U", -1]; //2 E
			case 57: return du == 1 && dd == 1 ? [2, I, "U", 1] : [du + 1, -dd - 1, "U", 1]; //9 E'
			case 80: return [1, W, "F", 1]; //P z
			case 81: return [1, W, "F", -1]; //Q z'
			case 90: return [1, dd + 1, "D", 1]; //Z d
			case 67: return [1, du + 1, "U", -1]; //C u'
			case 191: return [1, dd + 1, "D", -1]; /// d'
		}
		return null;
	}

	// shared with the shape-shifting 3x3x5 / 3x3x7 (twisty/twistyshift.js)
	twistyjs.jlCuboidKeys = { keyMove: keyMove, TOUCH: TOUCH };

	function matrix4Power(inMatrix, power) {
		var matrix = power < 0 ? THREE.Matrix4.makeInvert(inMatrix, new THREE.Matrix4()) : inMatrix.clone();
		var out = new THREE.Matrix4();
		for (var i = 0; i < Math.abs(power); i++) {
			out.multiplySelf(matrix);
		}
		return out;
	}

	function createCuboidTwisty(twistyScene, twistyParameters) {
		var dims0 = puzzleCuboid.DIMS[twistyParameters.type];
		var obj3d = new THREE.Object3D();

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
		// for move effects (js/fx.js), which draw around a cube: the longest side
		cubeOptions.dimension = Math.max(dims0[0], dims0[1], dims0[2]);

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
		var bodyGeometry = new THREE.Plane(2.02, 2.02);
		var stickerGeometry = new THREE.Plane(2, 2);

		var state = puzzleCuboid.solved(dims0); // what is drawn (moves applied when their animation ends)
		var qState = puzzleCuboid.solved(dims0); // after every move entered so far, for reading new input
		var pending = 0; // moves entered with addMoves that have not been applied yet
		// pieces[i] = [baseMatrix, object] for state.stickers[i]
		var pieces = [];
		for (var i = 0; i < state.stickers.length; i++) {
			var s = state.stickers[i];
			var base = new THREE.Matrix4().multiply(
				new THREE.Matrix4().setTranslation(s.c[0], s.c[1], s.c[2]),
				new THREE.Matrix4().multiply(sidesUV[s.col], new THREE.Matrix4().setTranslation(0, 0, 1))
			);
			var obj = new THREE.Object3D();
			var interior = new THREE.Mesh(stickerGeometry, [materials[s.col], borderMaterial]);
			interior.jlMat = materials[s.col];
			interior.jlFace = s.col;
			interior.doubleSided = cubeOptions.doubleSided;
			obj.addChild(interior);
			var body = new THREE.Mesh(bodyGeometry, [bodyMaterial]);
			body.position.z = -0.02;
			body.visible = false;
			obj.addChild(body);
			obj.matrix.copy(base);
			obj.matrixAutoUpdate = false;
			obj.update();
			pieces.push([base, obj]);
			obj3d.addChild(obj);
		}

		// framed like the NxN cube of its longest side (twistynnn.js: 0.5 / dimension), so it fits the view in any
		// orientation with the cubies of that NxN
		var actualScale = cubeOptions.scale * 0.5 / cubeOptions.dimension;
		obj3d.scale = new THREE.Vector3(actualScale, actualScale, actualScale);

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
			var scale = skin.stickerWidth / 2;
			for (var i = 0; i < pieces.length; i++) {
				var obj = pieces[i][1];
				var interior = obj.children[0];
				interior.scale.x = interior.scale.y = scale;
				interior.materials = cubeOptions.stickerBorder && skin.border ? [interior.jlMat, borderMaterial] : [interior.jlMat];
				// as on the NxN: floating stickers are double-sided, so the far stickers peek through the gaps; with a
				// body in front of them they can never be seen
				interior.doubleSided = hasBody ? false : cubeOptions.doubleSided;
				obj.children[1].visible = hasBody;
				obj.children[1].materials = bodyMats;
			}
			return true;
		}

		// move effects (js/fx.js) may tint the turning stickers: twisty.stickerTint = {color, amount}
		var tintedMeshes = [];
		var tintCache = {};

		function tintPiece(twisty, piece) {
			var mesh = piece[1].children[0];
			var tint = twisty.stickerTint;
			if (mesh.jlTinted) {
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
				tintedMeshes[i].materials[0] = tintedMeshes[i].jlOrig;
				tintedMeshes[i].jlTinted = false;
			}
			tintedMeshes = [];
			tintCache = {};
		}

		applySkin(null, skin);

		// indices of the stickers a move turns in the drawn state
		function turning(move) {
			var r = puzzleCuboid.layerRange(state, move);
			var ret = [];
			if (!r) {
				return ret;
			}
			var f = FACES.indexOf(move[2]);
			for (var i = 0; i < state.stickers.length; i++) {
				var l = puzzleCuboid.layerOf(state, state.stickers[i], f);
				if (l >= r[0] && l <= r[1]) {
					ret.push(i);
				}
			}
			return ret;
		}

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			var rots = new THREE.Matrix4();
			rots.setRotationAxis(sidesRotAxis[currentMove[2]], moveStep * currentMove[3] * Math.TAU / 4);
			var idx = turning(currentMove);
			var tint = twisty.stickerTint && currentMove[1] < W;
			for (var i = 0; i < idx.length; i++) {
				var obj = pieces[idx[i]][1];
				obj.matrix.multiply(rots, obj.matrix);
				obj.update();
				if (tint) {
					tintPiece(twisty, pieces[idx[i]]);
				}
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			cntMove(currentMove);
			untintAll();
			var rott = matrix4Power(sidesRot[currentMove[2]], currentMove[3]);
			var idx = turning(currentMove);
			for (var i = 0; i < idx.length; i++) {
				pieces[idx[i]][0].multiply(rott, pieces[idx[i]][0]);
			}
			// every piece snaps back to its exact matrix (a parallel move may have left it mid-way)
			for (var i = 0; i < pieces.length; i++) {
				pieces[i][1].matrix.copy(pieces[i][0]);
				pieces[i][1].update();
			}
			puzzleCuboid.apply(state, currentMove);
			if (pending > 0) {
				pending--;
			} else { // applied directly (scramble, replay): qState has not seen it yet
				puzzleCuboid.apply(qState, currentMove);
			}
		}

		// the scene tells every listener about moves entered with addMoves; keep qState ahead of the animation
		function onMoveAdded(move) {
			pending++;
			puzzleCuboid.apply(qState, move);
		}
		if (!twistyScene.jlCuboidHook) {
			twistyScene.jlCuboidHook = true;
			twistyScene.addMoveListener(function(move, step) {
				var tw = twistyScene.getTwisty();
				if (step == 0 && tw && tw.jlCuboidMoveAdded) {
					tw.jlCuboidMoveAdded(move);
				}
			});
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

		// layer depth of the U-side and D-side keys (keys 7 / 8 and 3 / 4, space resets; as the NxN's R / L depth)
		var du = 1, dd = 1;

		function keydownCallback(twisty, e) {
			if (e.altKey || e.ctrlKey) {
				return false;
			}
			var keyCode = e.keyCode;
			var maxDepth = Math.max(1, qState.dims[1] - 1);
			if (keyCode == 51 || keyCode == 52 || keyCode == 55 || keyCode == 56 || keyCode == 32) {
				if (keyCode == 51) {
					dd = Math.max(1, dd - 1);
				} else if (keyCode == 52) {
					dd = Math.min(dd + 1, maxDepth);
				} else if (keyCode == 55) {
					du = Math.min(du + 1, maxDepth);
				} else if (keyCode == 56) {
					du = Math.max(1, du - 1);
				} else {
					du = dd = 1;
				}
				return false;
			}
			du = Math.min(du, maxDepth);
			dd = Math.min(dd, maxDepth);
			var move = keyMove(keyCode, du, dd);
			move = move && puzzleCuboid.resolve(qState, move);
			if (move) {
				twistyScene.addMoves([move]);
			}
			return false;
		}

		function getTouchMoves() {
			var ret = {};
			for (var key in TOUCH) {
				var move = puzzleCuboid.resolve(qState, TOUCH[key]);
				if (move) {
					ret[key] = [move2str(move), move];
				}
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
			return puzzleCuboid.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return move[1] >= W;
		}

		function isParallelMove(twisty, move1, move2) {
			return FACES.indexOf(move1[2]) % 3 == FACES.indexOf(move2[2]) % 3;
		}

		// moves read from a scramble or a move log are resolved on a copy of the puzzle from solved. Pre-scramble
		// rotations (Options > "Pre-scramble") are kept only if they leave the cuboid standing as it is (z2, y, x2...):
		// one that tips it over would turn the scramble's quarter turns into other moves
		function parseScramble(scramble, addPreScr) {
			var moves = puzzleCuboid.parse(scramble);
			if (addPreScr) {
				var pre = puzzleCuboid.parse(kernel.getProp(tools.isCurTrainScramble() ? 'preScrT' : 'preScr'));
				var st = puzzleCuboid.solved(dims0);
				for (var i = 0; i < pre.length; i++) {
					puzzleCuboid.apply(st, pre[i]);
				}
				if (st.dims.join() == dims0.join()) {
					moves = pre.concat(moves);
				}
			}
			var sim = puzzleCuboid.solved(dims0);
			var ret = [];
			for (var i = 0; i < moves.length; i++) {
				var mv = puzzleCuboid.resolve(sim, moves[i]);
				if (mv) {
					puzzleCuboid.apply(sim, mv);
					ret.push(mv);
				}
			}
			return ret;
		}

		var counter = 0;
		var lastMove = -1;

		// as the NxN: a turn counts unless it is a rotation or turns the same face as the move before
		function cntMove(move) {
			if (move[1] < W && move[2] != lastMove) {
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
			return puzzleCuboid.toStr(move);
		}

		function moveInv(move) {
			move = move.slice();
			move[3] = -move[3];
			return move;
		}

		return {
			type: twistyParameters,
			options: cubeOptions,
			_3d: obj3d,
			pieces: pieces,
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
			jlCuboidMoveAdded: onMoveAdded,
			jlCuboidState: function() {
				return puzzleCuboid.clone(state);
			}
		};
	}
})();
