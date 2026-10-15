/*
 * jlTimer: Rubik's Ufo (Special > UFO > "Jaap style", event "ufo") as a virtual puzzle. The puzzle logic (positions,
 * the A / B / C twists, solved, notation) is in lib/puzzleufo.js; this file draws it and turns it.
 *
 * The saucer: two disks of six 60-degree segments, each segment a wedge with a share of the central dome, a flat top
 * and a sloped rim; light grey segments belong in the top disk, dark grey ones in the bottom. Each side of a segment
 * carries its seam colour (on the side face and as a coloured band along the edge of the top and the rim), so
 * matching seams show as one colour. Turned over into the other disk a segment is upside down, so its bands swap
 * sides, exactly as on the real puzzle. Below the saucer hangs its reflection, which shows the bottom disk (seen from
 * underneath, each segment straight below its place). Faces are shaded by their direction (the cube skins' shading).
 *
 * Keys (in the spirit of the 3x3 map): j / f U / U' (a sixth), s / l D / D', i / k B (turn over the right half, split
 * front to back), h / g C (the front-right half, split at the front-left seam), w / o A (the back-right half, split
 * at the front-right seam), ; / a y / y' (the whole puzzle a sixth), p / q z2 and t y n b x2 (turn it over). The two
 * keys of a twist only differ in the direction it is animated.
 */
(function() {
	twistyjs.registerTwisty('ufo', createUfoTwisty);

	var TAU = Math.TAU;
	var DEG = TAU / 360;
	var SEAM = [0x7ed67e, 0x7cb8f2, 0xe0403a, 0xf2d23c, 0xf28fa0, 0xb8732e]; // Jaap's colours, a little calmer
	var BODY = [0xdadad6, 0x77777c]; // top / bottom disk
	var INSIDE = 0x3a3a3c;
	// the profile of a segment's outer surface, (radius, height) from the axis to the rim; the disk is 1 wide
	var PROFILE = [[0, 0.44], [0.13, 0.42], [0.22, 0.35], [0.28, 0.29], [0.6, 0.27], [0.93, 0.1], [1, 0.03], [1, 0]];
	var FIN_FROM = 2; // the coloured bands run along the profile from this point to the rim
	var HALF = 29.2; // half the angle of a segment (a hair less than 30: the seams show)
	var FIN = 6.5; // angular width of a seam band
	var MIRROR_Y = -0.9; // the plane of the reflection

	var KEYS = {
		74: ['U', 1], 70: ['U', -1], 83: ['D', 1], 76: ['D', -1],
		73: ['B', 1], 75: ['B', -1], 72: ['C', 1], 71: ['C', -1], 87: ['A', 1], 79: ['A', -1],
		186: ['y', 1], 65: ['y', -1], 80: ['z', 1], 81: ['z', -1],
		84: ['x', 1], 89: ['x', 1], 78: ['x', -1], 66: ['x', -1]
	};
	// the touch board (cells 1-9, key = from * 10 + to): top row the top disk (swipe right U', left U), bottom row the
	// bottom disk, right column B, from the centre up-right A and down-right C, left column z2, middle row y
	var TOUCH = {
		12: ['U', -1], 23: ['U', -1], 21: ['U', 1], 32: ['U', 1], 13: ['U', -2], 31: ['U', 2],
		78: ['D', 1], 89: ['D', 1], 87: ['D', -1], 98: ['D', -1], 79: ['D', 2], 97: ['D', -2],
		36: ['B', 1], 63: ['B', -1], 69: ['B', 1], 96: ['B', -1], 39: ['B', 1], 93: ['B', -1],
		53: ['A', 1], 35: ['A', -1], 59: ['C', 1], 95: ['C', -1],
		14: ['z', 1], 41: ['z', -1], 47: ['z', 1], 74: ['z', -1], 17: ['z', 1], 71: ['z', -1],
		45: ['y', -1], 56: ['y', -1], 46: ['y', -1], 54: ['y', 1], 65: ['y', 1], 64: ['y', 1]
	};

	function vec(phi, r, y) {
		return new THREE.Vector3(r * Math.sin(phi * DEG), y, r * Math.cos(phi * DEG));
	}

	// the rotation of a move by a fraction of it (angle in radians about a unit axis through the centre)
	function moveAxis(mv) {
		var t = mv[0];
		if (t == 'U' || t == 'y') {
			return [new THREE.Vector3(0, 1, 0), -mv[1] * TAU / 6];
		} else if (t == 'D') {
			return [new THREE.Vector3(0, 1, 0), mv[1] * TAU / 6];
		} else if (t == 'z') {
			return [new THREE.Vector3(0, 0, 1), mv[1] * TAU / 2];
		} else if (t == 'x') {
			return [new THREE.Vector3(1, 0, 0), mv[1] * TAU / 2];
		}
		var a = (puzzleUfo.TWIST[t] + 90) * DEG; // the axis lies across the cut
		return [new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), mv[1] * TAU / 2];
	}

	function createUfoTwisty(twistyScene, twistyParameters) {
		var obj3d = new THREE.Object3D();
		var opts = { scale: 1, dimension: 3 };
		if ('scale' in twistyParameters) {
			opts.scale = twistyParameters.scale;
		}

		var mats = {};

		function mat(hex) {
			if (!mats[hex]) {
				mats[hex] = new THREE.MeshBasicMaterial({ color: hex });
				mats[hex].jlShade = 0.42;
				mats[hex].jlHex = hex;
			}
			return mats[hex];
		}

		// one segment, centred on the front (+z), outer surface up; colours: body, seam colour of the low-angle side
		// (-x) and of the high-angle side
		function segmentGeometry(body, low, high) {
			var g = new THREE.Geometry();

			function quad(a, b, c, d, m) {
				var n = g.vertices.length;
				g.vertices.push(new THREE.Vertex(a), new THREE.Vertex(b), new THREE.Vertex(c), new THREE.Vertex(d));
				g.faces.push(new THREE.Face4(n, n + 1, n + 2, n + 3, null, null, m));
			}
			// the outer surface: profile bands x angular bands (seam colour at the two edges past FIN_FROM)
			var angles = [-HALF, -HALF + FIN, -HALF / 3, HALF / 3, HALF - FIN, HALF];
			for (var i = 0; i < PROFILE.length - 1; i++) {
				var p0 = PROFILE[i], p1 = PROFILE[i + 1];
				for (var j = 0; j < angles.length - 1; j++) {
					var m = mat(body);
					if (i >= FIN_FROM && j == 0) {
						m = mat(SEAM[low]);
					} else if (i >= FIN_FROM && j == angles.length - 2) {
						m = mat(SEAM[high]);
					}
					quad(vec(angles[j], p0[0], p0[1]), vec(angles[j], p1[0], p1[1]), vec(angles[j + 1], p1[0], p1[1]),
						vec(angles[j + 1], p0[0], p0[1]), m);
				}
			}
			// the two sides, in their seam colour, and the inner face on the cut between the disks
			for (var i = 0; i < PROFILE.length - 1; i++) {
				var p0 = PROFILE[i], p1 = PROFILE[i + 1];
				quad(vec(-HALF, p0[0], 0), vec(-HALF, p1[0], 0), vec(-HALF, p1[0], p1[1]), vec(-HALF, p0[0], p0[1]), mat(SEAM[low]));
				quad(vec(HALF, p0[0], p0[1]), vec(HALF, p1[0], p1[1]), vec(HALF, p1[0], 0), vec(HALF, p0[0], 0), mat(SEAM[high]));
			}
			for (var j = 0; j < angles.length - 1; j++) {
				quad(vec(angles[j], 0, 0), vec(angles[j + 1], 0, 0), vec(angles[j + 1], 1, 0), vec(angles[j], 1, 0), mat(INSIDE));
			}
			g.computeCentroids();
			g.computeFaceNormals();
			return g;
		}

		var mirror = new THREE.Matrix4().multiply(new THREE.Matrix4().setTranslation(0, 2 * MIRROR_Y, 0),
			new THREE.Matrix4().setScale(1, -1, 1));
		var state = puzzleUfo.solved(); // what is drawn (moves applied when their animation ends)
		var pieces = []; // by segment: [baseMatrix, object, reflection]
		for (var k = 0; k < 12; k++) {
			var top = k < 6;
			var p = k % 6;
			// a bottom segment is built like a top one and turned over about its own radial axis, which swaps its sides
			var geo = segmentGeometry(BODY[top ? 0 : 1], top ? p : (p + 1) % 6, top ? (p + 1) % 6 : p);
			var base = new THREE.Matrix4().setRotationAxis(new THREE.Vector3(0, 1, 0), puzzleUfo.angleOf(k) * DEG);
			if (!top) {
				base = new THREE.Matrix4().multiply(base, new THREE.Matrix4().setRotationAxis(new THREE.Vector3(0, 0, 1), TAU / 2));
			}
			var objs = [];
			for (var r = 0; r < 2; r++) {
				var mesh = new THREE.Mesh(geo, [new THREE.MeshFaceMaterial()]);
				mesh.overdraw = true;
				mesh.flipSided = r == 1; // mirrored: the faces' winding is reversed
				mesh.matrixAutoUpdate = false;
				obj3d.addChild(mesh);
				objs.push(mesh);
			}
			pieces.push([base, objs[0], objs[1]]);
		}

		function place(i, m) {
			pieces[i][1].matrix.copy(m);
			pieces[i][1].update();
			pieces[i][2].matrix.multiply(mirror, m);
			pieces[i][2].update();
		}
		for (var i = 0; i < 12; i++) {
			place(i, pieces[i][0]);
		}

		// the saucer (2 wide) and its reflection framed like a cube; lifted so the pair is centred
		var actualScale = opts.scale * 0.33;
		obj3d.scale = new THREE.Vector3(actualScale, actualScale, actualScale);
		obj3d.position = new THREE.Vector3(0, -MIRROR_Y * actualScale * 0.75, 0);

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			var ax = moveAxis(currentMove);
			var rot = new THREE.Matrix4().setRotationAxis(ax[0], ax[1] * moveProgress);
			var idx = puzzleUfo.moving(state, currentMove);
			for (var i = 0; i < idx.length; i++) {
				place(idx[i], new THREE.Matrix4().multiply(rot, pieces[idx[i]][0]));
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			cntMove(currentMove);
			var ax = moveAxis(currentMove);
			var rot = new THREE.Matrix4().setRotationAxis(ax[0], ax[1]);
			var idx = puzzleUfo.moving(state, currentMove);
			for (var i = 0; i < idx.length; i++) {
				pieces[idx[i]][0] = new THREE.Matrix4().multiply(rot, pieces[idx[i]][0]);
			}
			for (var i = 0; i < 12; i++) {
				place(i, pieces[i][0]);
			}
			puzzleUfo.apply(state, currentMove);
		}

		function keydownCallback(twisty, e) {
			if (e.altKey || e.ctrlKey) {
				return false;
			}
			var mv = KEYS[e.keyCode];
			if (mv) {
				twistyScene.addMoves([mv.slice()]);
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

		function isSolved(twisty) {
			if (!twistyScene.isAnimationFinished()) {
				return 99;
			}
			if (!twistyScene.isMoveFinished()) {
				return 1;
			}
			return puzzleUfo.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return puzzleUfo.isRotation(move);
		}

		// the two disks turn at the same time
		function isParallelMove(twisty, move1, move2) {
			return move1[0] == 'U' && move2[0] == 'D' || move1[0] == 'D' && move2[0] == 'U';
		}

		// pre-scramble rotations (cube notation) are not used
		function parseScramble(scramble) {
			return puzzleUfo.parse(scramble);
		}

		function toggleColorVisible(twisty, visible) {
			if (twisty.visible == visible) {
				return;
			}
			twisty.visible = visible;
			for (var key in mats) {
				mats[key].color.setHex(visible ? mats[key].jlHex : 0x7f7f7f);
			}
		}

		var counter = 0;
		var lastMove = '';

		// turns of a disk count once however far it turns (and U U is one turn); every twist counts
		function cntMove(move) {
			if (puzzleUfo.isRotation(move)) {
				return;
			}
			if (move[0] != lastMove || move[0] in puzzleUfo.TWIST) {
				counter++;
			}
			lastMove = move[0];
		}

		function moveCnt(clr) {
			if (clr) {
				counter = 0;
				lastMove = '';
			}
			return counter;
		}

		function move2str(move) {
			return puzzleUfo.toStr(move);
		}

		function moveInv(move) {
			return [move[0], -move[1]];
		}

		return {
			type: twistyParameters,
			options: opts,
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
			move2str: move2str,
			moveInv: moveInv,
			jlUfoState: function() {
				return state.slice();
			}
		};
	}
})();
