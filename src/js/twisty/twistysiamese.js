/*
 * jlTimer: the Siamese Cubes (Special > Siamese Cube: 1x1x3, 1x2x3 and 2x2x2 block) as virtual puzzles: two 3x3x3
 * cubes sharing a block of cubies, drawn with the NxN cube's sticker planes (cube skins, body planes, double-sided
 * Classic stickers that peek through, colours, move-effect sticker tint), as twistycuboid.js draws the cuboids.
 *
 * The puzzle logic (which cube a key turns, which turns the shared block refuses, solved, notation) is in
 * lib/puzzlesiamese.js. Keys are the 3x3's in the frame of the whole puzzle: a face key turns that face of the cube
 * whose face it is (U / R / u / r the upper-right cube, D / L / d / l the lower-left one; F / B on the 2x2x2 block). A
 * turn no cube can make (through the shared block) is refused with a small shake and not entered. Keys are resolved
 * on the state after every move entered so far (qState), so fast input is judged on the position it will turn.
 */
(function() {
	var TYPES = ['sia113', 'sia123', 'sia222'];
	for (var t = 0; t < TYPES.length; t++) {
		twistyjs.registerTwisty(TYPES[t], createSiameseTwisty);
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
	var I = -2; // the middle slice
	// same conventions as twistynnn.js / twistycuboid.js
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

	// the 3x3 touch board (twistycuboid.js); entries no cube can make are left out
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

	// the 3x3 keyboard map (twistynnn.js): face keys one layer, u / d / r / l two, M / E / S the middle slice
	var KEYS = {
		73: [1, 1, "R", 1], 75: [1, 1, "R", -1], 87: [1, 1, "B", 1], 79: [1, 1, "B", -1], 83: [1, 1, "D", 1],
		76: [1, 1, "D", -1], 68: [1, 1, "L", 1], 69: [1, 1, "L", -1], 74: [1, 1, "U", 1], 70: [1, 1, "U", -1],
		72: [1, 1, "F", 1], 71: [1, 1, "F", -1], 186: [1, W, "U", 1], 65: [1, W, "U", -1], 85: [1, 2, "R", 1],
		82: [1, 2, "L", -1], 77: [1, 2, "R", -1], 86: [1, 2, "L", 1], 84: [1, W, "L", -1], 89: [1, W, "R", 1],
		78: [1, W, "R", -1], 66: [1, W, "L", 1], 190: [2, I, "R", 1], 88: [2, I, "L", -1], 53: [2, I, "L", 1],
		54: [2, I, "R", -1], 188: [2, I, "L", 1], 49: [2, I, "F", -1], 48: [2, I, "F", 1], 50: [2, I, "U", -1],
		57: [2, I, "U", 1], 80: [1, W, "F", 1], 81: [1, W, "F", -1], 90: [1, 2, "D", 1], 67: [1, 2, "U", -1],
		191: [1, 2, "D", -1]
	};

	// a short shake of the puzzle instead of the turn (a fade with reduced motion), as on the bandaged puzzles
	function shake(twistyScene) {
		var el = twistyScene.getCanvas && twistyScene.getCanvas();
		if (el && el.animate) {
			var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			el.animate(still ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }] : [
				{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' },
				{ transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }
			], { duration: 240, easing: 'ease-out' });
		}
		twistyScene.jlRefused = (twistyScene.jlRefused || 0) + 1; // for tests
	}

	function matrix4Power(inMatrix, power) {
		var matrix = power < 0 ? THREE.Matrix4.makeInvert(inMatrix, new THREE.Matrix4()) : inMatrix.clone();
		var out = new THREE.Matrix4();
		for (var i = 0; i < Math.abs(power); i++) {
			out.multiplySelf(matrix);
		}
		return out;
	}

	// m turned about the point o: T(o) m T(-o)
	function about(m, o) {
		return new THREE.Matrix4().multiply(new THREE.Matrix4().setTranslation(o[0], o[1], o[2]),
			new THREE.Matrix4().multiply(m, new THREE.Matrix4().setTranslation(-o[0], -o[1], -o[2])));
	}

	function createSiameseTwisty(twistyScene, twistyParameters) {
		var type = twistyParameters.type;
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
		var off = puzzleSiamese.OFF[type];
		// for move effects (js/fx.js), which draw around a cube: the half-extent of the puzzle in cubies
		cubeOptions.dimension = Math.max(off[0], off[1], off[2]) + 3;

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

		var state = puzzleSiamese.solved(type); // what is drawn (moves applied when their animation ends)
		var qState = puzzleSiamese.solved(type); // after every move entered so far, for reading new input
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

		// framed like an NxN cube as wide as the puzzle's longest half-extent, a little smaller as the two cubes
		// stand diagonally
		var actualScale = cubeOptions.scale * 0.46 / cubeOptions.dimension;
		obj3d.scale = new THREE.Vector3(actualScale, actualScale, actualScale);
		// turned a little to the right so the left faces show and the two cubes stand apart (display only: the keys
		// still read the puzzle's own frame)
		obj3d.rotation = new THREE.Vector3(0, 0.6, 0);

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

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			var rots = new THREE.Matrix4();
			rots.setRotationAxis(sidesRotAxis[currentMove[2]], moveStep * currentMove[3] * Math.TAU / 4);
			rots = about(rots, puzzleSiamese.pivot(state, currentMove));
			var idx = puzzleSiamese.turning(state, currentMove);
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
			var rott = about(matrix4Power(sidesRot[currentMove[2]], currentMove[3]), puzzleSiamese.pivot(state, currentMove));
			var idx = puzzleSiamese.turning(state, currentMove);
			for (var i = 0; i < idx.length; i++) {
				pieces[idx[i]][0].multiply(rott, pieces[idx[i]][0]);
			}
			// every piece snaps back to its exact matrix (a parallel move may have left it mid-way)
			for (var i = 0; i < pieces.length; i++) {
				pieces[i][1].matrix.copy(pieces[i][0]);
				pieces[i][1].update();
			}
			puzzleSiamese.apply(state, currentMove);
			if (pending > 0) {
				pending--;
			} else { // applied directly (scramble, replay): qState has not seen it yet
				puzzleSiamese.apply(qState, currentMove);
			}
		}

		// the scene tells every listener about moves entered with addMoves; keep qState ahead of the animation
		function onMoveAdded(move) {
			pending++;
			puzzleSiamese.apply(qState, move);
		}
		if (!twistyScene.jlSiameseHook) {
			twistyScene.jlSiameseHook = true;
			twistyScene.addMoveListener(function(move, step) {
				var tw = twistyScene.getTwisty();
				if (step == 0 && tw && tw.jlSiameseMoveAdded) {
					tw.jlSiameseMoveAdded(move);
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

		function keydownCallback(twisty, e) {
			if (e.altKey || e.ctrlKey) {
				return false;
			}
			var key = KEYS[e.keyCode];
			if (!key) {
				return false;
			}
			var move = puzzleSiamese.resolve(qState, key);
			if (move) {
				twistyScene.addMoves([move]);
			} else {
				shake(twistyScene);
			}
			return false;
		}

		function getTouchMoves() {
			var ret = {};
			for (var key in TOUCH) {
				var move = puzzleSiamese.resolve(qState, TOUCH[key]);
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
			return puzzleSiamese.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return move[1] >= W;
		}

		function isParallelMove(twisty, move1, move2) {
			return move1[1] < W && move2[1] < W && move1[4] == move2[4] &&
				FACES.indexOf(move1[2]) % 3 == FACES.indexOf(move2[2]) % 3;
		}

		// moves read from a scramble or a move log are resolved on a copy of the puzzle from solved. A scramble
		// (addPreScr) is followed by the rotations that undo its regrip, so the puzzle is shown upright; pre-scramble
		// rotations (Options > "Pre-scramble") are not used: they would hand the scramble's turns to the other cube
		function parseScramble(scramble, addPreScr) {
			if (addPreScr) {
				return puzzleSiamese.scrambleMoves(type, scramble);
			}
			return puzzleSiamese.resolveAll(puzzleSiamese.solved(type), puzzleSiamese.parse(scramble));
		}

		var counter = 0;
		var lastMove = '';

		// as the NxN: a turn counts unless it is a rotation or turns the same face of the same cube as the move before
		function cntMove(move) {
			if (move[1] >= W) {
				return;
			}
			var key = move[2] + move[4];
			if (key != lastMove) {
				counter++;
			}
			lastMove = key;
		}

		function moveCnt(clr) {
			if (clr) {
				counter = 0;
				lastMove = '';
			}
			return counter;
		}

		function move2str(move) {
			return puzzleSiamese.toStr(move);
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
			jlSiameseMoveAdded: onMoveAdded,
			jlSiameseState: function() {
				return puzzleSiamese.clone(state);
			}
		};
	}
})();
