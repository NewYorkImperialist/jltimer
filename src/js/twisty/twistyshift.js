/*
 * jlTimer: the shape-shifting cuboids 3x3x5 ("335") and 3x3x7 ("337"), drawn like the NxN cube (twistynnn.js: the same
 * sticker planes, cube skins, body, double-sided Classic stickers, colours and move-effect sticker tint).
 *
 * The puzzle logic (a 3x3x3 core carrying the outer pieces, which turns are possible in which shape, solved, notation)
 * lives in lib/puzzleshift.js; this file keeps the THREE objects in step with it. As on the Floppy (twistyfloppy.js)
 * every cubie has six faces: the faces that are outside on the solved cuboid carry stickers, the others are the body
 * (in Classic, which has no body, dark sticker-sized tiles), and a face is drawn only while nothing sits against it,
 * so pieces sticking out and the gaps they leave read as the solid shape they are, and a turn uncovers the faces it
 * should. Keys and the touch board are the other cuboids' (twisty/twistycuboid.js); a turn the puzzle can't make in
 * its current shape is refused with a small shake and never entered, so it is neither logged nor timed.
 */
(function() {
	twistyjs.registerTwisty('335', createShiftTwisty);
	twistyjs.registerTwisty('337', createShiftTwisty);
	twistyjs.registerTwisty('335f', createShiftTwisty); // the flexible rules (lib/puzzleshift.js)
	twistyjs.registerTwisty('337f', createShiftTwisty);

	var axify = twistyjs.axify;

	var xx = new THREE.Vector3(1, 0, 0);
	var yy = new THREE.Vector3(0, 1, 0);
	var zz = new THREE.Vector3(0, 0, 1);
	var xxi = new THREE.Vector3(-1, 0, 0);
	var yyi = new THREE.Vector3(0, -1, 0);
	var zzi = new THREE.Vector3(0, 0, -1);

	var FACES = "URFDLB";
	var W = 99; // whole puzzle
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

	function matrix4Power(inMatrix, power) {
		var matrix = power < 0 ? THREE.Matrix4.makeInvert(inMatrix, new THREE.Matrix4()) : inMatrix.clone();
		var out = new THREE.Matrix4();
		for (var i = 0; i < Math.abs(power); i++) {
			out.multiplySelf(matrix);
		}
		return out;
	}

	function createShiftTwisty(twistyScene, twistyParameters) {
		var dims0 = puzzleShift.DIMS[twistyParameters.type];
		var flex0 = !!puzzleShift.FLEX[twistyParameters.type];
		var keys = twistyjs.jlCuboidKeys;
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
		cubeOptions.dimension = dims0[1];

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

		var state = puzzleShift.solved(dims0, flex0); // what is drawn (moves applied when their animation ends)
		var qState = puzzleShift.solved(dims0, flex0); // after every move entered so far, for reading new input
		var pending = 0; // moves entered with addMoves that have not been applied yet
		// faces[i] = [baseMatrix, object, cubie, face (URFDLB, home direction), hasSticker, interiorMesh, bodyMesh]
		var faces = [];
		var hasBody = false;

		function addFace(ci, f, sticker) {
			var h = state.cubies[ci].p;
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
			faces.push([base, obj, ci, f, sticker, interior, body]);
			obj3d.addChild(obj);
		}

		for (var ci = 0; ci < state.cubies.length; ci++) {
			var cb = state.cubies[ci];
			if (cb.p[0] == 0 && cb.p[1] == 0 && cb.p[2] == 0) {
				continue; // the core's centre: never seen (it only fills the middle, for the faces against it)
			}
			for (var f = 0; f < 6; f++) {
				addFace(ci, f, cb.st[f]);
			}
		}

		// framed like the NxN cube of its longest side (twistynnn.js: 0.5 / dimension)
		var actualScale = cubeOptions.scale * 0.5 / cubeOptions.dimension;
		obj3d.scale = new THREE.Vector3(actualScale, actualScale, actualScale);

		// which faces can be seen: those with nothing against them. moving[i] tells which of the moves being animated
		// turn cubie i; a face against a cubie that moves differently is uncovered for the turn.
		function updateVisibility(moving) {
			var at = {};
			for (var i = 0; i < state.cubies.length; i++) {
				at[state.cubies[i].p.join(',')] = i;
			}
			for (var i = 0; i < faces.length; i++) {
				var fc = faces[i];
				var cb = state.cubies[fc[2]];
				var d = cb.n[fc[3]];
				var j = at[(cb.p[0] + d[0]) + ',' + (cb.p[1] + d[1]) + ',' + (cb.p[2] + d[2])];
				var open = j === undefined || (moving && moving[j] != moving[fc[2]]);
				fc[5].visible = open;
				fc[6].visible = open && hasBody && fc[4];
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
					// without a body (Classic) a dark floating tile the size of a sticker, like the stickers around it
					faces[i][5].scale.x = faces[i][5].scale.y = hasBody ? 1 : skin.stickerWidth / 2.02;
					continue;
				}
				var interior = faces[i][5];
				interior.scale.x = interior.scale.y = scale;
				interior.materials = cubeOptions.stickerBorder && skin.border ? [interior.jlMat, borderMaterial] : [interior.jlMat];
				// as on the NxN: floating stickers are double-sided, so the far stickers peek through the gaps; with a
				// body in front of them they can never be seen
				interior.doubleSided = hasBody ? false : cubeOptions.doubleSided;
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

		// faces of the cubies in idx (cubie index -> true)
		function facesOf(idx) {
			var set = {};
			for (var i = 0; i < idx.length; i++) {
				set[idx[i]] = true;
			}
			return set;
		}

		var animating = []; // [move, its cubies] whose animation has started, for the faces they uncover

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			var entry = null;
			for (var a = 0; a < animating.length; a++) {
				if (animating[a][0] === currentMove) {
					entry = animating[a];
				}
			}
			if (!entry) {
				entry = [currentMove, facesOf(puzzleShift.turning(state, currentMove))];
				animating.push(entry);
				var moving = [];
				for (var i = 0; i < state.cubies.length; i++) {
					moving[i] = 0;
					for (var a = 0; a < animating.length; a++) {
						if (animating[a][1][i]) {
							moving[i] |= 1 << a;
						}
					}
				}
				updateVisibility(moving);
			}
			var rots = new THREE.Matrix4();
			rots.setRotationAxis(sidesRotAxis[currentMove[2]], moveStep * currentMove[3] * Math.TAU / 4);
			var tint = twisty.stickerTint && currentMove[1] < W;
			for (var i = 0; i < faces.length; i++) {
				if (entry[1][faces[i][2]]) {
					var obj = faces[i][1];
					obj.matrix.multiply(rots, obj.matrix);
					obj.update();
					if (tint) {
						tintFace(twisty, faces[i]);
					}
				}
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			cntMove(currentMove);
			untintAll();
			var rott = matrix4Power(sidesRot[currentMove[2]], currentMove[3]);
			var turn = facesOf(puzzleShift.turning(state, currentMove));
			for (var i = 0; i < faces.length; i++) {
				if (turn[faces[i][2]]) {
					faces[i][0].multiply(rott, faces[i][0]);
				}
				// every face snaps back to its exact matrix (a parallel move may have left it mid-way)
				faces[i][1].matrix.copy(faces[i][0]);
				faces[i][1].update();
			}
			puzzleShift.apply(state, currentMove);
			animating = [];
			updateVisibility(null);
			if (pending > 0) {
				pending--;
			} else { // applied directly (scramble, replay): qState has not seen it yet
				puzzleShift.apply(qState, currentMove);
			}
		}

		// the scene tells every listener about moves entered with addMoves; keep qState ahead of the animation
		function onMoveAdded(move) {
			pending++;
			puzzleShift.apply(qState, move);
		}
		if (!twistyScene.jlShiftHook) {
			twistyScene.jlShiftHook = true;
			twistyScene.addMoveListener(function(move, step) {
				var tw = twistyScene.getTwisty();
				if (step == 0 && tw && tw.jlShiftMoveAdded) {
					tw.jlShiftMoveAdded(move);
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

		// a turn the puzzle can't make in this shape (an outer layer that is not complete): a short shake of the
		// puzzle instead of the turn (a fade with reduced motion), as on the Super Floppy and the bandaged puzzles
		function refuseMove(twisty, move) {
			if (!move || puzzleShift.isLegal(qState, move)) {
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

		// layer depth of the U-side and D-side keys (keys 7 / 8 and 3 / 4, space resets), as on the other cuboids
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
			var move = keys.keyMove(keyCode, du, dd);
			move = move && puzzleShift.resolve(qState, move);
			// U / D keys (j f / s l) that can't turn while shape-shifted take the shallowest block that can, as a hand
			// grabbing the top would: on the 3x3x5 after R, j is the lid with the core's top layer
			if (move && (keyCode == 74 || keyCode == 70 || keyCode == 83 || keyCode == 76) && !puzzleShift.isLegal(qState, move)) {
				for (var d = (keyCode == 83 || keyCode == 76 ? dd : du) + 1; d <= maxDepth; d++) {
					var deeper = puzzleShift.resolve(qState, keys.keyMove(keyCode, keyCode == 83 || keyCode == 76 ? du : d, keyCode == 83 || keyCode == 76 ? d : dd));
					if (deeper && puzzleShift.isLegal(qState, deeper)) {
						move = deeper;
						break;
					}
				}
			}
			if (move && !refuseMove(twisty, move)) {
				twistyScene.addMoves([move]);
			}
			return false;
		}

		function getTouchMoves() {
			var ret = {};
			for (var key in keys.TOUCH) {
				var move = puzzleShift.resolve(qState, keys.TOUCH[key]);
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
			return puzzleShift.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return move[1] >= W;
		}

		function isParallelMove(twisty, move1, move2) {
			return FACES.indexOf(move1[2]) % 3 == FACES.indexOf(move2[2]) % 3;
		}

		// a scramble or a move log as moves. Pre-scramble rotations (Options > "Pre-scramble") are kept only if they
		// leave the cuboid standing as it is (z2, y, x2...). The core turns of csTimer's old "... / 3x3x3" scrambles
		// are written out in the notation of the puzzle as it is at that point (Uw, R...); everything else is passed
		// as it is: the moves are read against the puzzle they are applied to, so a move log reads back exactly as it
		// was played, whatever shape the puzzle was in
		function parseScramble(scramble, addPreScr) {
			var moves = puzzleShift.parse(scramble);
			if (addPreScr) {
				var pre = puzzleShift.parse(kernel.getProp(tools.isCurTrainScramble() ? 'preScrT' : 'preScr'));
				var st = puzzleShift.solved(dims0, flex0);
				for (var i = 0; i < pre.length; i++) {
					puzzleShift.apply(st, pre[i]);
				}
				if (st.dims.join() == dims0.join()) {
					moves = pre.concat(moves);
				}
			}
			var sim = puzzleShift.solved(dims0, flex0);
			var ret = [];
			for (var i = 0; i < moves.length; i++) {
				var mv = moves[i][1] == puzzleShift.CORE ? puzzleShift.resolve(sim, moves[i]) : moves[i];
				if (mv) {
					puzzleShift.apply(sim, mv);
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
			return puzzleShift.toStr(move);
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
			jlShiftMoveAdded: onMoveAdded,
			jlShiftState: function() {
				return puzzleShift.clone(state);
			}
		};
	}
})();
