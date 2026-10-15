/*
 * jlTimer: Cmetrick (cm3) and Cmetrick Mini (cm2) as virtual puzzles. The puzzle logic (balls' orientations, which
 * balls a roll turns, solved, notation) is in lib/puzzlecmetrick.js; this file draws the balls in their frame and
 * rolls them.
 *
 * Each ball is a sphere made from a subdivided cube, its six caps in the cube colours (Cube colour scheme), shaded by
 * direction so it reads as a ball; the balls sit on a dark frame. Rolling a row turns each of its balls about its
 * own vertical axis, a column about the left-right axis.
 *
 * Keys follow the 3x3 map: j / f roll the top row left / right (as U / U' move the front of a cube), s / l the bottom
 * row right / left (D / D'), 2 / 9 the middle row right / left (E / E'); i / k the right column up / down (R / R'),
 * d / e the left column down / up (L / L'), 5 6 x . , the middle column (M down, M' up); p / q turn the frame a
 * quarter clockwise / anticlockwise (z / z'). On the Mini the middle row and column keys do nothing.
 */
(function() {
	twistyjs.registerTwisty('cm3', createCmetrickTwisty);
	twistyjs.registerTwisty('cm2', createCmetrickTwisty);

	var SPACING = 2.5; // between ball centres; a ball is 2 wide
	var SUB = 4; // each cap of the ball split into SUB x SUB quads
	var FRAME = 0x2a2a2e;
	// tangents (u, v) of each URFDLB face with u x v = the outward normal
	var TANGENTS = [
		[[0, 0, 1], [1, 0, 0]], [[0, 1, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0]],
		[[1, 0, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0]]
	];

	function createCmetrickTwisty(twistyScene, twistyParameters) {
		var type = twistyParameters.type;
		var n = puzzleCmetrick.SIZE[type];
		var obj3d = new THREE.Object3D();
		var faceColors = twistyParameters.faceColors || [0xffffff, 0xff0000, 0x00ff00, 0xffff00, 0xff9000, 0x0000ff];
		var opts = { scale: 'scale' in twistyParameters ? twistyParameters.scale : 1, dimension: n + 1 };

		var materials = [];
		for (var f = 0; f < 6; f++) {
			materials[f] = new THREE.MeshBasicMaterial({ color: faceColors[f] });
			materials[f].jlShade = 0.5;
		}
		var frameMat = new THREE.MeshBasicMaterial({ color: FRAME });
		frameMat.jlShade = 0.3;

		// a ball of radius 1 at the origin
		var ballGeo = (function() {
			var g = new THREE.Geometry();
			function pt(f, a, b) {
				var nn = puzzleCmetrick.NORMALS[f], t = TANGENTS[f];
				var x = nn[0] + t[0][0] * a + t[1][0] * b, y = nn[1] + t[0][1] * a + t[1][1] * b, z = nn[2] + t[0][2] * a + t[1][2] * b;
				var l = Math.sqrt(x * x + y * y + z * z);
				return new THREE.Vertex(new THREE.Vector3(x / l, y / l, z / l));
			}
			for (var f = 0; f < 6; f++) {
				for (var i = 0; i < SUB; i++) {
					for (var j = 0; j < SUB; j++) {
						var a0 = -1 + 2 * i / SUB, a1 = -1 + 2 * (i + 1) / SUB;
						var b0 = -1 + 2 * j / SUB, b1 = -1 + 2 * (j + 1) / SUB;
						var k = g.vertices.length;
						g.vertices.push(pt(f, a0, b0), pt(f, a1, b0), pt(f, a1, b1), pt(f, a0, b1));
						g.faces.push(new THREE.Face4(k, k + 1, k + 2, k + 3, null, null, materials[f]));
					}
				}
			}
			g.computeCentroids();
			g.computeFaceNormals();
			return g;
		})();

		function centre(i) {
			var row = Math.floor(i / n), col = i % n;
			return [(col - (n - 1) / 2) * SPACING, ((n - 1) / 2 - row) * SPACING, 0];
		}

		function mat4(r) {
			var m = new THREE.Matrix4();
			m.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
			return m;
		}

		// the frame: one tile behind each ball (small tiles keep the painter's sort right), the outer ones wider
		var frame = new THREE.Object3D();
		var tileGeo = new THREE.Plane(SPACING, SPACING);
		var edge = 0.45;
		for (var i = 0; i < n * n; i++) {
			var row = Math.floor(i / n), col = i % n;
			var tile = new THREE.Mesh(tileGeo, [frameMat]);
			var c = centre(i);
			var sx = 1 + (col == 0 || col == n - 1 ? edge / SPACING : 0) * (n == 1 ? 2 : 1);
			var sy = 1 + (row == 0 || row == n - 1 ? edge / SPACING : 0);
			tile.position = new THREE.Vector3(c[0] + (col == 0 ? -edge / 2 : col == n - 1 ? edge / 2 : 0),
				c[1] + (row == 0 ? edge / 2 : row == n - 1 ? -edge / 2 : 0), -1.2);
			tile.scale = new THREE.Vector3(sx * 1.03, sy * 1.03, 1); // overlapping a little: no hairline seams
			tile.overdraw = true;
			frame.addChild(tile);
		}
		obj3d.addChild(frame);

		var state = puzzleCmetrick.solved(type); // what is drawn (moves applied when their animation ends)
		var balls = [];
		for (var i = 0; i < n * n; i++) {
			var mesh = new THREE.Mesh(ballGeo, [new THREE.MeshFaceMaterial()]);
			mesh.matrixAutoUpdate = false;
			obj3d.addChild(mesh);
			balls.push(mesh);
		}

		// ball i drawn at its place with its orientation, optionally turned by rot about its centre (or, for a frame
		// turn, about the centre of the frame)
		function place(i, rot, aboutFrame) {
			var c = centre(i);
			var m = new THREE.Matrix4().setTranslation(c[0], c[1], c[2]);
			if (rot && !aboutFrame) {
				m = new THREE.Matrix4().multiply(m, rot);
			}
			m = new THREE.Matrix4().multiply(m, mat4(state.balls[i]));
			if (rot && aboutFrame) {
				m = new THREE.Matrix4().multiply(rot, m);
			}
			balls[i].matrix.copy(m);
			balls[i].update();
		}

		function placeAll() {
			for (var i = 0; i < n * n; i++) {
				place(i, null, false);
			}
			frame.rotation = new THREE.Vector3(0, 0, 0);
		}
		placeAll();

		var actualScale = opts.scale * 0.9 / (n * SPACING);
		obj3d.scale = new THREE.Vector3(actualScale, actualScale, actualScale);
		// tilted back to face the default camera (45 degrees above), so the balls are seen head on: the front colour
		// in the middle of each ball and its four sides around it (display only)
		obj3d.rotation = new THREE.Vector3(-Math.TAU / 8, 0, 0);

		function axisOf(mv) {
			if (mv[0] == 'z') {
				return new THREE.Vector3(0, 0, -1); // clockwise seen from the front
			}
			return mv[0] < n ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(-1, 0, 0); // roll left / up
		}

		function animateMoveCallback(twisty, currentMove, moveProgress) {
			var angle = currentMove[1] * Math.TAU / 4 * moveProgress;
			var rot = new THREE.Matrix4().setRotationAxis(axisOf(currentMove), angle);
			if (currentMove[0] == 'z') {
				for (var i = 0; i < n * n; i++) {
					place(i, rot, true);
				}
				frame.rotation = new THREE.Vector3(0, 0, -angle);
				return;
			}
			var idx = puzzleCmetrick.lineBalls(state, currentMove);
			for (var i = 0; i < idx.length; i++) {
				place(idx[i], rot, false);
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			cntMove(currentMove);
			puzzleCmetrick.apply(state, currentMove);
			placeAll();
		}

		var KEYS = {
			74: [0, 1], 70: [0, -1], 83: [n - 1, -1], 76: [n - 1, 1],
			73: [2 * n - 1, 1], 75: [2 * n - 1, -1], 68: [n, -1], 69: [n, 1],
			80: ['z', 1], 81: ['z', -1]
		};
		if (n == 3) {
			KEYS[50] = [1, -1]; // 2: E
			KEYS[57] = [1, 1]; // 9: E'
			KEYS[53] = KEYS[188] = [4, -1]; // 5 , : M
			KEYS[54] = KEYS[190] = KEYS[88] = [4, 1]; // 6 . x: M'
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

		// the touch board: a horizontal swipe in a row rolls that row, a vertical one in a column that column (the
		// Mini uses the outer rows and columns of the board)
		function getTouchMoves() {
			var ret = {};
			var lineOf = n == 3 ? [0, 1, 2] : [0, -1, 1];
			for (var r = 0; r < 3; r++) {
				for (var a = 0; a < 3; a++) {
					for (var b = 0; b < 3; b++) {
						if (a == b) {
							continue;
						}
						if (lineOf[r] >= 0) { // in row r from column a to column b
							var mv = [lineOf[r], b > a ? -1 : 1];
							ret[(r * 3 + a + 1) * 10 + r * 3 + b + 1] = [move2str(mv), mv];
						}
						if (lineOf[r] >= 0) { // in column r from row a to row b
							var mv2 = [n + lineOf[r], b > a ? -1 : 1];
							ret[(a * 3 + r + 1) * 10 + b * 3 + r + 1] = [move2str(mv2), mv2];
						}
					}
				}
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
			return puzzleCmetrick.isSolved(state) ? 0 : 1;
		}

		function isInspectionLegalMove(twisty, move) {
			return puzzleCmetrick.isRotation(move);
		}

		// rows roll at the same time as other rows, columns with columns
		function isParallelMove(twisty, move1, move2) {
			return move1[0] != 'z' && move2[0] != 'z' && (move1[0] < n) == (move2[0] < n) && move1[0] != move2[0];
		}

		function parseScramble(scramble) {
			return puzzleCmetrick.parse(n, scramble);
		}

		function toggleColorVisible(twisty, visible) {
			if (twisty.visible == visible) {
				return;
			}
			twisty.visible = visible;
			for (var f = 0; f < 6; f++) {
				materials[f].color.setHex(visible ? faceColors[f] : 0x7f7f7f);
			}
		}

		var counter = 0;
		var lastMove = -1;

		// a roll counts once however far it goes (repeated rolls of the same line count once)
		function cntMove(move) {
			if (move[0] == 'z') {
				return;
			}
			if (move[0] != lastMove) {
				counter++;
			}
			lastMove = move[0];
		}

		function moveCnt(clr) {
			if (clr) {
				counter = 0;
				lastMove = -1;
			}
			return counter;
		}

		function move2str(move) {
			return puzzleCmetrick.toStr(n, move);
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
			jlCmetrickState: function() {
				return puzzleCmetrick.clone(state);
			}
		};
	}
})();
