/*
 * jlTimer: the 1x1x2 virtual puzzle (event "112"), drawn like the NxN cube (twistynnn.js) so cube skins, colours,
 * move effects' sticker tint, the keyboard map and the touch board all work the same way.
 *
 * The puzzle logic (which cubie a move turns, solved, notation) lives in lib/puzzle112.js; this file keeps the
 * THREE objects in step with it. Moves use the NxN move format [layerStart, layerEnd, face, quarterTurns]:
 * layerEnd 1 is a face turn, layerEnd 2 the whole puzzle (x / y / z). A face turn whose "layer" would be the whole
 * puzzle (R while the puzzle stands upright, U while it lies on its side) is entered as the rotation it really is,
 * so the move log, the move count and inspection treat it as one.
 */
(function() {
	twistyjs.registerTwisty("112", create112Twisty);

	var axify = twistyjs.axify;

	var xx = new THREE.Vector3(1, 0, 0);
	var yy = new THREE.Vector3(0, 1, 0);
	var zz = new THREE.Vector3(0, 0, 1);
	var xxi = new THREE.Vector3(-1, 0, 0);
	var yyi = new THREE.Vector3(0, -1, 0);
	var zzi = new THREE.Vector3(0, 0, -1);

	var FACES = "URFDLB";
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

	// the 3x3 keyboard map (twistynnn.js) on a 1x1x2: face turns stay face turns, wide moves are the whole puzzle,
	// slices (M, E, S) and the layer-depth keys do nothing
	var KEYMAP = {
		73: [1, 1, "R", 1], //I R
		75: [1, 1, "R", -1], //K R'
		87: [1, 1, "B", 1], //W B
		79: [1, 1, "B", -1], //O B'
		83: [1, 1, "D", 1], //S D
		76: [1, 1, "D", -1], //L D'
		68: [1, 1, "L", 1], //D L
		69: [1, 1, "L", -1], //E L'
		74: [1, 1, "U", 1], //J U
		70: [1, 1, "U", -1], //F U'
		72: [1, 1, "F", 1], //H F
		71: [1, 1, "F", -1], //G F'
		186: [1, 2, "U", 1], //; y
		65: [1, 2, "U", -1], //A y'
		85: [1, 2, "R", 1], //U r = x
		82: [1, 2, "L", -1], //R l' = x
		77: [1, 2, "R", -1], //M r' = x'
		86: [1, 2, "L", 1], //V l = x'
		84: [1, 2, "L", -1], //T x
		89: [1, 2, "R", 1], //Y x
		78: [1, 2, "R", -1], //N x'
		66: [1, 2, "L", 1], //B x'
		80: [1, 2, "F", 1], //P z
		81: [1, 2, "F", -1], //Q z'
		90: [1, 2, "D", 1], //Z d = y'
		67: [1, 2, "U", -1], //C u' = y'
		191: [1, 2, "D", -1] /// d' = y
	};

	// the touch board of the 3x3 (twistynnn.js getTouchMoves), as notation; slices are dropped
	var TOUCH = {
		61: "u2", 62: "B", 63: "R", 64: "y2", 65: "y", 67: "F2", 69: "F",
		41: "L'", 42: "B'", 43: "u2'", 45: "y'", 46: "y2'", 47: "F'", 49: "F2'",
		31: "U2", 32: "U", 34: "u2", 35: "u", 36: "R'", 37: "z'", 39: "R2'",
		12: "U'", 13: "U2'", 14: "L", 15: "u'", 16: "u2'", 17: "L2", 19: "z",
		91: "z'", 92: "B2", 93: "R2", 94: "F2'", 95: "r", 96: "F'", 97: "D2'", 98: "D'",
		73: "z", 72: "B2'", 71: "L2'", 76: "F2", 75: "l'", 74: "F", 79: "D2", 78: "D",
		21: "U", 23: "U'", 24: "B", 25: "x'", 26: "B'", 27: "B2", 28: "x2'", 29: "B2'",
		51: "u", 52: "x", 53: "u'", 54: "y", 56: "y'", 57: "l", 58: "x'", 59: "r'",
		82: "x2", 85: "x", 87: "D'", 89: "D"
	};

	function toModel(move) {
		return { face: move[2], pow: move[3], whole: move[1] >= 2 };
	}

	function fromModel(mv) {
		return [1, mv.whole ? 2 : 1, mv.face, mv.pow];
	}

	function matrix4Power(inMatrix, power) {
		var matrix = power < 0 ? THREE.Matrix4.makeInvert(inMatrix, new THREE.Matrix4()) : inMatrix.clone();
		var out = new THREE.Matrix4();
		for (var i = 0; i < Math.abs(power); i++) {
			out.multiplySelf(matrix);
		}
		return out;
	}

	function create112Twisty(twistyScene, twistyParameters) {
		var obj3d = new THREE.Object3D();

		var cubeOptions = {
			stickerBorder: true,
			opacity: 1,
			faceColors: [0xffffff, 0xff0000, 0x00ff00, 0xffff00, 0xff9000, 0x0000ff],
			scale: 1
		};
		for (var option in cubeOptions) {
			if (option in twistyParameters) {
				cubeOptions[option] = twistyParameters[option];
			}
		}
		cubeOptions.dimension = 2; // for move effects (js/fx.js): the puzzle is two cubies tall

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
		var coreMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, opacity: cubeOptions.opacity }); // faces at the cut
		var bodyGeometry = new THREE.Plane(2.02, 2.02);
		var stickerGeometry = new THREE.Plane(2, 2);

		// the model and the drawn pieces: pieces[i] = [baseMatrix, object, cubie, isCore]
		var state = puzzle112.solved(); // what is drawn (moves applied when their animation ends)
		var qState = puzzle112.solved(); // after every move entered so far, for reading new input
		var pending = 0; // moves entered with addMoves that have not been applied yet
		var pieces = [];

		function addPiece(f, cubie, isCore) {
			var center = cubie == 0 ? 1 : -1;
			var base = new THREE.Matrix4().multiply(
				new THREE.Matrix4().setTranslation(0, center, 0),
				new THREE.Matrix4().multiply(sidesUV[f], new THREE.Matrix4().setTranslation(0, 0, 1))
			);
			var obj = new THREE.Object3D();
			var interior;
			if (isCore) {
				interior = new THREE.Mesh(bodyGeometry, [coreMaterial]);
				interior.jlMat = coreMaterial;
			} else {
				interior = new THREE.Mesh(stickerGeometry, [materials[f], borderMaterial]);
				interior.jlMat = materials[f];
				interior.jlFace = f;
			}
			interior.doubleSided = false; // a convex puzzle: back faces are never seen
			obj.addChild(interior);
			var body = new THREE.Mesh(bodyGeometry, [bodyMaterial]);
			body.position.z = -0.02;
			body.visible = false;
			obj.addChild(body);
			obj.matrix.copy(base);
			obj.matrixAutoUpdate = false;
			obj.update();
			pieces.push([base, obj, cubie, isCore]);
			obj3d.addChild(obj);
		}

		for (var c = 0; c < 2; c++) {
			for (var f = 0; f < 6; f++) {
				var inner = f == (c == 0 ? 3 : 0);
				addPiece(f, c, inner);
			}
		}

		var actualScale = cubeOptions.scale * 0.5 / 2.15;
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
				coreMaterial.color.setHex(skin.body);
			}
			coreMaterial.jlShade = hasBody ? bodyMaterial.jlShade : 0;
			var bodyMats = hasBody && skin.bodyEdge != null ? [bodyMaterial, bodyEdgeMaterial] : [bodyMaterial];
			var scale = skin.stickerWidth / 2;
			for (var i = 0; i < pieces.length; i++) {
				var obj = pieces[i][1];
				var interior = obj.children[0];
				if (pieces[i][3]) { // the faces at the cut belong to the body: without one the cubies are hollow, as on the NxN
					obj.visible = interior.visible = hasBody;
					continue;
				}
				interior.scale.x = interior.scale.y = scale;
				interior.materials = cubeOptions.stickerBorder && skin.border ? [interior.jlMat, borderMaterial] : [interior.jlMat];
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
			if (piece[3] || mesh.jlTinted) {
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

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			var rots = new THREE.Matrix4();
			rots.setRotationAxis(sidesRotAxis[currentMove[2]], moveStep * currentMove[3] * Math.TAU / 4);
			var layer = puzzle112.layerOf(state, toModel(currentMove));
			for (var i = 0; i < pieces.length; i++) {
				if (layer.indexOf(pieces[i][2]) != -1) {
					var obj = pieces[i][1];
					obj.matrix.multiply(rots, obj.matrix);
					obj.update();
					if (twisty.stickerTint && layer.length == 1) {
						tintPiece(twisty, pieces[i]);
					}
				}
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			var mv = toModel(currentMove);
			cntMove(mv);
			untintAll();
			var rott = matrix4Power(sidesRot[currentMove[2]], currentMove[3]);
			var layer = puzzle112.layerOf(state, mv);
			for (var i = 0; i < pieces.length; i++) {
				if (layer.indexOf(pieces[i][2]) != -1) {
					pieces[i][0].multiply(rott, pieces[i][0]);
				}
				// every piece snaps back to its exact matrix (a parallel move may have left it mid-way)
				pieces[i][1].matrix.copy(pieces[i][0]);
				pieces[i][1].update();
			}
			puzzle112.apply(state, mv);
			if (pending > 0) {
				pending--;
			} else { // applied directly (scramble, replay): qState has not seen it yet
				puzzle112.apply(qState, mv);
			}
		}

		// the scene tells every listener about moves entered with addMoves; keep qState ahead of the animation
		function onMoveAdded(move) {
			pending++;
			puzzle112.apply(qState, toModel(move));
		}
		if (!twistyScene.jl112Hook) {
			twistyScene.jl112Hook = true;
			twistyScene.addMoveListener(function(move, step) {
				var tw = twistyScene.getTwisty();
				if (step == 0 && tw && tw.jl112MoveAdded) {
					tw.jl112MoveAdded(move);
				}
			});
		}

		// a face turn whose layer is the whole puzzle is the rotation it really is
		function resolve(move) {
			if (move[1] < 2 && puzzle112.layerOf(qState, toModel(move)).length == 2) {
				return [1, 2, move[2], move[3]];
			}
			return move.slice();
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
			if (e.keyCode in KEYMAP) {
				twistyScene.addMoves([resolve(KEYMAP[e.keyCode])]);
			}
			return false;
		}

		function getTouchMoves() {
			var ret = {};
			for (var key in TOUCH) {
				var mv = puzzle112.parse(TOUCH[key])[0];
				if (!mv) {
					continue;
				}
				var move = resolve(fromModel(mv));
				ret[key] = [move2str(move), move];
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
			return puzzle112.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return move[1] >= 2;
		}

		function isParallelMove(twisty, move1, move2) {
			return FACES.indexOf(move1[2]) % 3 == FACES.indexOf(move2[2]) % 3;
		}

		// pre-scramble rotations (Options > "Pre-scramble") are kept only if they leave the puzzle upright: the
		// scramble turns U, which on a puzzle lying on its side would just turn the whole puzzle
		function parseScramble(scramble, addPreScr) {
			var moves = puzzle112.parse(scramble);
			if (addPreScr) {
				var pre = puzzle112.parse(kernel.getProp(tools.isCurTrainScramble() ? 'preScrT' : 'preScr'));
				var st = puzzle112.solved();
				for (var i = 0; i < pre.length; i++) {
					puzzle112.apply(st, pre[i]);
				}
				if (Math.abs(puzzle112.longAxis(st)[1]) == 1) {
					moves = pre.concat(moves);
				}
			}
			return moves.map(fromModel);
		}

		var counter = 0;
		var lastMove = -1;

		// turns of the top against the bottom (the whole puzzle turning is not a move); U U counts once, like NxN
		function cntMove(mv) {
			if (puzzle112.isTurn(state, mv) && mv.face != lastMove) {
				counter++;
			}
			lastMove = mv.face;
		}

		function moveCnt(clr) {
			if (clr) {
				counter = 0;
				lastMove = -1;
			}
			return counter;
		}

		function move2str(move) {
			return puzzle112.toStr(toModel(move));
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
			jl112MoveAdded: onMoveAdded,
			jl112State: function() {
				return puzzle112.clone(state);
			}
		};
	}
})();
