/*
 * jlTimer: the Floppy Cube (3x3x1, event "133") and Super Floppy (event "sfl") virtual puzzles, drawn like the NxN cube (twistynnn.js) so cube
 * skins, colours, move effects' sticker tint, the keyboard map and the touch board work the same way.
 *
 * The puzzle logic (which pieces a move turns, solved, notation) lives in lib/puzzlefloppy.js; this file keeps the
 * THREE objects in step with it. Every piece is a cubie with six faces: the faces that are outward when solved carry
 * stickers, the others are the body (in Classic, which has no body, dark sticker-sized tiles). A face is drawn only while nothing sits
 * against it, so the faces a turn uncovers appear for that turn. Moves use the NxN move format
 * [layerStart, layerEnd, face, quarterTurns]: layerEnd 1 is a face turn, layerEnd 2 the whole puzzle (x / y / z). A
 * face turn of one of the big faces (U while the puzzle lies flat) is entered as the rotation it really is, and on
 * the Floppy every side turn is a half turn (a quarter-turn key turns 180 degrees), so the move log, the move count
 * and inspection see the move as it happened. On the official Super Floppy a side holding no corner is locked: the
 * turn is refused with a small shake and never entered, so it is neither logged nor timed.
 */
(function() {
	twistyjs.registerTwisty("133", createFloppyTwisty);
	twistyjs.registerTwisty("sfl", createFloppyTwisty);
	twistyjs.registerTwisty("sfli", createFloppyTwisty);

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

	// the 3x3 keyboard map (twistynnn.js): face turns stay face turns (U / D, the big faces of the flat puzzle, are
	// whole-puzzle turns), wide moves are the whole puzzle, slices (M, E, S) and the layer-depth keys do nothing
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

	function createFloppyTwisty(twistyScene, twistyParameters) {
		var kind = twistyParameters.type; // "133", "sfl" (official rules) or "sfli" (imitation rules)
		var half = kind == "133"; // the Floppy turns its sides 180 degrees only

		// official Super Floppy rules (scramble type "sfl"; "sfli" = imitation, every side turns): a bare edge can't turn
		function official() {
			return kind == "sfl";
		}
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
		cubeOptions.dimension = 3; // for move effects (js/fx.js): three cubies across, like a 3x3

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
		var coreMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, opacity: cubeOptions.opacity }); // faces without a sticker
		var bodyGeometry = new THREE.Plane(2.02, 2.02);
		var stickerGeometry = new THREE.Plane(2, 2);

		var state = puzzleFloppy.solved(); // what is drawn (moves applied when their animation ends)
		var qState = puzzleFloppy.solved(); // after every move entered so far, for reading new input
		var pending = 0; // moves entered with addMoves that have not been applied yet
		// faces[i] = [baseMatrix, object, piece, face (URFDLB, home direction), hasSticker, interiorMesh, bodyMesh]
		var faces = [];
		var hasBody = false;

		function addFace(p, f, sticker) {
			var h = puzzleFloppy.HOMES[p];
			var base = new THREE.Matrix4().multiply(
				new THREE.Matrix4().setTranslation(2 * h[0], 2 * h[1], 2 * h[2]),
				new THREE.Matrix4().multiply(sidesUV[f], new THREE.Matrix4().setTranslation(0, 0, 1))
			);
			var obj = new THREE.Object3D();
			var interior;
			if (sticker) {
				interior = new THREE.Mesh(stickerGeometry, [materials[f], borderMaterial]);
				interior.jlMat = materials[f];
				interior.jlFace = f;
			} else {
				interior = new THREE.Mesh(bodyGeometry, [coreMaterial]);
				interior.jlMat = coreMaterial;
			}
			obj.addChild(interior);
			var body = new THREE.Mesh(bodyGeometry, [bodyMaterial]);
			body.position.z = -0.02;
			body.visible = false;
			obj.addChild(body);
			obj.matrix.copy(base);
			obj.matrixAutoUpdate = false;
			obj.update();
			faces.push([base, obj, p, f, sticker, interior, body]);
			obj3d.addChild(obj);
		}

		for (var p = 0; p < puzzleFloppy.HOMES.length; p++) {
			var st = puzzleFloppy.stickerFaces(p);
			for (var f = 0; f < 6; f++) {
				addFace(p, f, st.indexOf(f) != -1);
			}
		}

		var actualScale = cubeOptions.scale * 0.5 / 3; // three cubies across, drawn the size of a 3x3
		obj3d.scale = new THREE.Vector3(actualScale, actualScale, actualScale);

		// which faces can be seen: those with nothing against them. moving[i] tells which of the moves being animated
		// turn piece i; a face against a piece that moves differently is uncovered for the turn.
		function updateVisibility(moving) {
			var at = {};
			for (var i = 0; i < state.p.length; i++) {
				at[state.p[i].pos.join(',')] = i;
			}
			for (var i = 0; i < faces.length; i++) {
				var fc = faces[i];
				var pc = state.p[fc[2]];
				var d = puzzleFloppy.dirOf(pc, puzzleFloppy.NORMALS[fc[3]]);
				var j = at[(pc.pos[0] + d[0]) + ',' + (pc.pos[1] + d[1]) + ',' + (pc.pos[2] + d[2])];
				var open = j === undefined || (moving && moving[j] != moving[fc[2]]);
				if (fc[4]) {
					fc[5].visible = open;
					fc[6].visible = open && hasBody;
				} else {
					// a face without a sticker: drawn even without a body (Classic), as black plastic, so an empty location
					// or a corner standing out of the plane reads as the solid shape it is
					fc[5].visible = open;
					fc[6].visible = false;
				}
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
			hasBody = skin.body != null;
			if (hasBody) {
				bodyMaterial.color.setHex(skin.body);
				bodyMaterial.jlShade = skin.shade ? Math.min(0.45, skin.shade * 2.2) : 0;
				if (skin.bodyEdge != null) {
					bodyEdgeMaterial.color.setHex(skin.bodyEdge);
				}
				coreMaterial.color.setHex(skin.body);
			} else {
				coreMaterial.color.setHex(0x1a1a1a);
			}
			coreMaterial.jlShade = hasBody ? bodyMaterial.jlShade : 0;
			var bodyMats = hasBody && skin.bodyEdge != null ? [bodyMaterial, bodyEdgeMaterial] : [bodyMaterial];
			var scale = skin.stickerWidth / 2;
			for (var i = 0; i < faces.length; i++) {
				if (!faces[i][4]) {
					faces[i][5].materials = hasBody && skin.bodyEdge != null ? [coreMaterial, bodyEdgeMaterial] : [coreMaterial];
					// without a body (Classic) it is a dark floating tile the size of a sticker, like the stickers around it
					faces[i][5].scale.x = faces[i][5].scale.y = hasBody ? 1 : skin.stickerWidth / 2.02;
					continue;
				}
				var interior = faces[i][5];
				interior.scale.x = interior.scale.y = scale;
				interior.materials = cubeOptions.stickerBorder && skin.border ? [interior.jlMat, borderMaterial] : [interior.jlMat];
				// as on the NxN: floating stickers are double-sided, so the stickers at the back and below peek through
				// the gaps (seen from inside); with a body in front of them they can never be seen
				interior.doubleSided = !hasBody;
				faces[i][6].materials = bodyMats;
			}
			updateVisibility(null);
			return true;
		}

		// move effects (js/fx.js) may tint the turning stickers: twisty.stickerTint = {color, amount}
		var tintedMeshes = [];
		var tintCache = {};

		function tintFace(twisty, fc) {
			var mesh = fc[5];
			var tint = twisty.stickerTint;
			if (!fc[4] || mesh.jlTinted) {
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

		var animating = []; // the moves whose animation has started, for the faces they uncover

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			var mv = puzzleFloppy.resolve(state, toModel(currentMove), half);
			var layer = puzzleFloppy.layerOf(state, mv);
			if (animating.indexOf(currentMove) == -1) {
				animating.push(currentMove);
				var moving = [];
				for (var a = 0; a < animating.length; a++) {
					var la = puzzleFloppy.layerOf(state, toModel(animating[a]));
					for (var i = 0; i < la.length; i++) {
						moving[la[i]] = (moving[la[i]] || 0) | 1 << a;
					}
				}
				for (var i = 0; i < state.p.length; i++) {
					moving[i] = moving[i] || 0;
				}
				updateVisibility(moving);
			}
			var rots = new THREE.Matrix4();
			rots.setRotationAxis(sidesRotAxis[mv.face], moveStep * mv.pow * Math.TAU / 4);
			for (var i = 0; i < faces.length; i++) {
				if (layer.indexOf(faces[i][2]) != -1) {
					var obj = faces[i][1];
					obj.matrix.multiply(rots, obj.matrix);
					obj.update();
					if (twisty.stickerTint && !mv.whole) {
						tintFace(twisty, faces[i]);
					}
				}
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			var mv = puzzleFloppy.resolve(state, toModel(currentMove), half);
			cntMove(mv);
			untintAll();
			var rott = matrix4Power(sidesRot[mv.face], mv.pow);
			var layer = puzzleFloppy.layerOf(state, mv);
			for (var i = 0; i < faces.length; i++) {
				if (layer.indexOf(faces[i][2]) != -1) {
					faces[i][0].multiply(rott, faces[i][0]);
				}
				// every face snaps back to its exact matrix (a parallel move may have left it mid-way)
				faces[i][1].matrix.copy(faces[i][0]);
				faces[i][1].update();
			}
			puzzleFloppy.apply(state, mv, half);
			animating = [];
			updateVisibility(null);
			if (pending > 0) {
				pending--;
			} else { // applied directly (scramble, replay): qState has not seen it yet
				puzzleFloppy.apply(qState, mv, half);
			}
		}

		// the scene tells every listener about moves entered with addMoves; keep qState ahead of the animation
		function onMoveAdded(move) {
			pending++;
			puzzleFloppy.apply(qState, toModel(move), half);
		}
		if (!twistyScene.jlFloppyHook) {
			twistyScene.jlFloppyHook = true;
			twistyScene.addMoveListener(function(move, step) {
				var tw = twistyScene.getTwisty();
				if (step == 0 && tw && tw.jlFloppyMoveAdded) {
					tw.jlFloppyMoveAdded(move);
				}
			});
		}

		// the move as it is in the hand: a big face is the whole puzzle turning, a Floppy side turn is a half turn
		function resolve(move) {
			return fromModel(puzzleFloppy.resolve(qState, toModel(move), half));
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

		// a locked side (official Super Floppy): a short shake of the puzzle instead of the turn (a fade with reduced
		// motion); the canvas is moved by the compositor, so nothing is redrawn
		function refuseMove(twisty, move) {
			if (puzzleFloppy.isLegal(qState, toModel(move), official())) {
				return false;
			}
			var el = twistyScene.getCanvas && twistyScene.getCanvas();
			if (el && el.animate) {
				var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				el.animate(still ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }] : [
					{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' },
					{ transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }
				], { duration: 240, easing: 'ease-out' });
			}
			twistyScene.jlRefused = (twistyScene.jlRefused || 0) + 1; // for tests
			return true;
		}

		function keydownCallback(twisty, e) {
			if (e.altKey || e.ctrlKey) {
				return false;
			}
			if (e.keyCode in KEYMAP) {
				var move = resolve(KEYMAP[e.keyCode]);
				if (!refuseMove(twisty, move)) {
					twistyScene.addMoves([move]);
				}
			}
			return false;
		}

		function getTouchMoves() {
			var ret = {};
			for (var key in TOUCH) {
				var mv = puzzleFloppy.parse(TOUCH[key])[0];
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
			return puzzleFloppy.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return move[1] >= 2;
		}

		function isParallelMove(twisty, move1, move2) {
			return FACES.indexOf(move1[2]) % 3 == FACES.indexOf(move2[2]) % 3;
		}

		// pre-scramble rotations (Options > "Pre-scramble") are kept only if the puzzle still lies flat (upside down
		// is fine): the scramble turns R F L B, which on a puzzle standing up would partly turn the whole puzzle
		function parseScramble(scramble, addPreScr) {
			// old csTimer Super Floppy scrambles (R L U D, held upright) are applied laid flat (U = B, D = F); scramble
			// moves are applied without the official lock, as those old scrambles ignored it
			var moves = puzzleFloppy.parse(kind != "133" ? puzzleFloppy.legacySfl(scramble) : scramble);
			if (addPreScr) {
				var pre = puzzleFloppy.parse(kernel.getProp(tools.isCurTrainScramble() ? 'preScrT' : 'preScr'));
				var st = puzzleFloppy.solved();
				for (var i = 0; i < pre.length; i++) {
					puzzleFloppy.apply(st, pre[i], half);
				}
				if (Math.abs(puzzleFloppy.flatAxis(st)[1]) == 1) {
					moves = pre.concat(moves);
				}
			}
			return moves.map(fromModel);
		}

		var counter = 0;
		var lastMove = -1;

		// side turns (the whole puzzle turning is not a move); R R counts once, like the NxN
		function cntMove(mv) {
			if (puzzleFloppy.isTurn(state, mv) && mv.face != lastMove) {
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
			return puzzleFloppy.toStr(toModel(move));
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
			pieces: faces,
			animateMoveCallback: animateMoveCallback,
			advanceMoveCallback: advanceMoveCallback,
			toggleColorVisible: toggleColorVisible,
			keydownCallback: keydownCallback,
			refuseMove: refuseMove,
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
			jlFloppyMoveAdded: onMoveAdded,
			jlFloppyState: function() {
				return puzzleFloppy.clone(state);
			}
		};
	}
})();
