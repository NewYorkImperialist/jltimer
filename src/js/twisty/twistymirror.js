/*
 * jlTimer: Mirror Blocks (event "mrbl"), the 3x3 whose layers all have different thicknesses and whose faces are one
 * colour, so a scramble shows as a change of shape. Drawn by the NxN cube (twistynnn.js, which does the moves, keys,
 * touch board, move log and facelets) with the stickers re-laid on cubies of the Mirror Blocks' sizes.
 *
 * Geometry (units of a 3x3 cubie, which is 2 wide in the NxN's coordinates): the mechanism is an ordinary 3x3 (cut
 * planes at +-1, middle layers 1 thick); the outer layers are 1 +- d thick, d = 0.45 on U/D, 0.15 on R/L, 0.3 on
 * F/B (U, R, F thin; D, L, B thick: csTimer's Mirror Blocks scramble image uses the same offsets). Every corner and
 * edge has a different shape, so a state looks solved exactly when every corner and edge is home (centres turn
 * unseen): the 3x3 solved check in any orientation.
 *
 * Every cubie is a box. Its outer faces (outward when solved) are the existing NxN stickers, moved and stretched to
 * the cubie's face, with the body behind them; its inner faces (against the cut planes) are body only and show just
 * the part no neighbour covers, recomputed after every move. While a layer turns, the faces on the cut plane it turns
 * against are shown whole. The whole drawing is offset so the solved cube sits in the middle of the view, and that
 * offset turns with x / y / z rotations, so the puzzle turns about its own centre.
 */
(function() {
	var createCubeTwisty = twistyjs.createCubeTwisty;
	if (!createCubeTwisty) {
		return;
	}
	twistyjs.registerTwisty("mrbl", createMirrorTwisty);

	// outer layer thickness (cubies) per face, URFDLB
	var THICK = [0.55, 0.85, 0.7, 1.45, 1.15, 1.3];
	var FACES = "URFDLB";
	// world axis (0 x, 1 y, 2 z) and sign of each face, as in twistynnn.js: U +y, R +x, F +z
	var FAXIS = [1, 0, 2, 1, 0, 2];
	var FSIGN = [1, 1, 1, -1, -1, -1];
	var ROTAXIS = { // twistynnn.js sidesRotAxis
		"U": [0, -1, 0], "L": [1, 0, 0], "F": [0, 0, -1], "R": [-1, 0, 0], "B": [0, 0, 1], "D": [0, 1, 0]
	};
	var COLORS = { 'g': 0xd9b545, 's': 0xc9ccd2 }; // gold, silver

	function faceOf(axis, sign) {
		for (var f = 0; f < 6; f++) {
			if (FAXIS[f] == axis && FSIGN[f] == sign) {
				return f;
			}
		}
	}

	// [min, max] of a cubie with grid coordinate g (-1, 0, 1) along an axis, in NxN units
	function extent(axis, g) {
		if (g == 0) {
			return [-1, 1];
		}
		var t = 2 * THICK[faceOf(axis, g)];
		return g > 0 ? [1, 1 + t] : [-1 - t, -1];
	}

	// rigid motions as {r: 3x3 rows, t: [x, y, z]}, read from a THREE.Matrix4 (rounded: everything is axis aligned)
	function fromMatrix(m) {
		var r = [
			[m.n11, m.n12, m.n13],
			[m.n21, m.n22, m.n23],
			[m.n31, m.n32, m.n33]
		];
		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 3; j++) {
				r[i][j] = Math.round(r[i][j]);
			}
		}
		return { r: r, t: [Math.round(m.n14), Math.round(m.n24), Math.round(m.n34)] };
	}

	function apply(mo, v) {
		var r = mo.r;
		return [
			r[0][0] * v[0] + r[0][1] * v[1] + r[0][2] * v[2] + mo.t[0],
			r[1][0] * v[0] + r[1][1] * v[1] + r[1][2] * v[2] + mo.t[1],
			r[2][0] * v[0] + r[2][1] * v[1] + r[2][2] * v[2] + mo.t[2]
		];
	}

	function invert(mo) {
		var r = [[], [], []];
		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 3; j++) {
				r[i][j] = mo.r[j][i];
			}
		}
		var t = apply({ r: r, t: [0, 0, 0] }, mo.t);
		return { r: r, t: [-t[0], -t[1], -t[2]] };
	}

	function compose(a, b) { // a after b
		var r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
		for (var i = 0; i < 3; i++) {
			for (var j = 0; j < 3; j++) {
				for (var k = 0; k < 3; k++) {
					r[i][j] += a.r[i][k] * b.r[k][j];
				}
			}
		}
		return { r: r, t: apply(a, b.t) };
	}

	// a box {min, max} moved by mo, as a box again
	function moveBox(mo, box) {
		var p = apply(mo, box.min);
		var q = apply(mo, box.max);
		return {
			min: [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])],
			max: [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])]
		};
	}

	// rectangle a minus rectangle b ([u0, u1, v0, v1]); at most four pieces
	function rectDiff(a, b) {
		var u0 = Math.max(a[0], b[0]), u1 = Math.min(a[1], b[1]);
		var v0 = Math.max(a[2], b[2]), v1 = Math.min(a[3], b[3]);
		var eps = 1e-6;
		if (u1 - u0 < eps || v1 - v0 < eps) {
			return [a];
		}
		var ret = [];
		a[0] < u0 - eps && ret.push([a[0], u0, a[2], a[3]]);
		a[1] > u1 + eps && ret.push([u1, a[1], a[2], a[3]]);
		a[2] < v0 - eps && ret.push([u0, u1, a[2], v0]);
		a[3] > v1 + eps && ret.push([u0, u1, v1, a[3]]);
		return ret;
	}

	function vec(a) {
		return new THREE.Vector3(a[0], a[1], a[2]);
	}

	var EYE = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

	// frame of a face of a box: in-plane axes u, v (u x v = outward normal), as world axis indices
	function faceAxes(axis, sign) {
		var u = (axis + 1) % 3, v = (axis + 2) % 3;
		return sign > 0 ? [u, v] : [v, u];
	}

	// THREE.Matrix4 placing a unit plane (2 x 2, normal +z) on the face: world (home) coordinates
	function faceMatrix(axis, sign, plane, rect, lift) {
		var uv = faceAxes(axis, sign);
		var u = EYE[uv[0]], v = EYE[uv[1]], n = [0, 0, 0];
		n[axis] = sign;
		var w = (rect[1] - rect[0]) / 2, h = (rect[3] - rect[2]) / 2;
		var c = [0, 0, 0];
		c[axis] = plane + sign * lift;
		c[uv[0]] = (rect[0] + rect[1]) / 2;
		c[uv[1]] = (rect[2] + rect[3]) / 2;
		var m = new THREE.Matrix4();
		m.set(
			u[0] * w, v[0] * h, n[0], c[0],
			u[1] * w, v[1] * h, n[1], c[1],
			u[2] * w, v[2] * h, n[2], c[2],
			0, 0, 0, 1
		);
		return m;
	}

	function createMirrorTwisty(twistyScene, twistyParameters) {
		twistyParameters.dimension = 3;
		var twisty = createCubeTwisty(twistyScene, twistyParameters);
		var cubeObject = twisty._3d;
		var cubePieces = twisty.cubePieces;

		var stickerMat = new THREE.MeshBasicMaterial({ color: COLORS.g, opacity: 1 });
		var bodyMat = new THREE.MeshBasicMaterial({ color: 0x111111, opacity: 1 });
		var borderMat = twisty.borderMaterial;
		var unitPlane = new THREE.Plane(2, 2);

		// the 26 visible cubies, by home grid position; each is carried by its first sticker
		var cubies = [];
		var byHome = {};
		var stickers = []; // [sticker, cubie, face]
		for (var f = 0; f < 6; f++) {
			for (var i = 0; i < cubePieces[f].length; i++) {
				var st = cubePieces[f][i];
				var mo = fromMatrix(st[0]);
				var g = [0, 1, 2].map(function(a) {
					return Math.abs(mo.t[a]) >= 1 ? (mo.t[a] > 0 ? 1 : -1) : 0;
				});
				var key = g.join(',');
				if (!byHome[key]) {
					var box = { min: [], max: [] };
					for (var a = 0; a < 3; a++) {
						var e = extent(a, g[a]);
						box.min[a] = e[0];
						box.max[a] = e[1];
					}
					byHome[key] = { g: g, box: box, carrier: st, home: mo, inner: [] };
					cubies.push(byHome[key]);
				}
				stickers.push([st, byHome[key], f]);
			}
		}

		// outer faces: the sticker and the body plane behind it, moved onto the cubie's face
		for (var i = 0; i < stickers.length; i++) {
			var st = stickers[i][0], cb = stickers[i][1], f = stickers[i][2];
			var axis = FAXIS[f], sign = FSIGN[f];
			var uv = faceAxes(axis, sign);
			var rect = [cb.box.min[uv[0]], cb.box.max[uv[0]], cb.box.min[uv[1]], cb.box.max[uv[1]]];
			var plane = sign > 0 ? cb.box.max[axis] : cb.box.min[axis];
			var inv = THREE.Matrix4.makeInvert(st[0], new THREE.Matrix4());
			stickers[i].push(inv, axis, sign, plane, rect);
			var body = st[1].children[1];
			body.matrixAutoUpdate = false;
			body.matrix.multiply(inv, faceMatrix(axis, sign, plane, rect, 0));
			body.doubleSided = false;
			st[1].children[0].matrixAutoUpdate = false;
			st[1].children[0].doubleSided = false;
		}

		// inner faces: a container on the face (body coloured pieces of it are shown) carried by the cubie's sticker
		for (var c = 0; c < cubies.length; c++) {
			var cb = cubies[c];
			var inv = THREE.Matrix4.makeInvert(cb.carrier[0], new THREE.Matrix4());
			for (var axis = 0; axis < 3; axis++) {
				for (var sign = -1; sign <= 1; sign += 2) {
					if (cb.g[axis] == sign) {
						continue; // outer face
					}
					var plane = sign > 0 ? cb.box.max[axis] : cb.box.min[axis];
					var uv = faceAxes(axis, sign);
					var holder = new THREE.Object3D();
					holder.matrixAutoUpdate = false;
					holder.matrix.multiply(inv, faceMatrix(axis, sign, plane, [-1, 1, -1, 1], 0));
					var meshes = [];
					for (var k = 0; k < 4; k++) {
						var mesh = new THREE.Mesh(unitPlane, [bodyMat]);
						mesh.visible = false;
						holder.addChild(mesh);
						meshes.push(mesh);
					}
					cb.carrier[1].addChild(holder);
					cb.inner.push({
						axis: axis, sign: sign, plane: plane, holder: holder, meshes: meshes,
						rect: [cb.box.min[uv[0]], cb.box.max[uv[0]], cb.box.min[uv[1]], cb.box.max[uv[1]]]
					});
				}
			}
		}

		// show the pieces (rects in the face's u, v world coordinates) of an inner face
		function showRects(face, rects) {
			for (var k = 0; k < 4; k++) {
				var mesh = face.meshes[k];
				var r = rects[k];
				mesh.visible = !!r;
				if (r) {
					mesh.position.x = (r[0] + r[1]) / 2;
					mesh.position.y = (r[2] + r[3]) / 2;
					mesh.scale.x = Math.max(1e-3, (r[1] - r[0]) / 2);
					mesh.scale.y = Math.max(1e-3, (r[3] - r[2]) / 2);
				}
			}
		}

		var CORE = { box: { min: [-1, -1, -1], max: [1, 1, 1] }, motion: { r: EYE, t: [0, 0, 0] } };

		// where every cubie is now: motion from its home, and a map from grid position to cubie
		function locate() {
			var at = { '0,0,0': CORE };
			for (var c = 0; c < cubies.length; c++) {
				var cb = cubies[c];
				cb.motion = compose(fromMatrix(cb.carrier[0]), invert(cb.home));
				var p = apply(cb.motion, [2 * cb.g[0], 2 * cb.g[1], 2 * cb.g[2]]);
				cb.pos = [p[0] / 2, p[1] / 2, p[2] / 2];
				at[cb.pos.join(',')] = cb;
			}
			return at;
		}

		// moving: false at rest; true while turning (cubie.mvMask: bit mask of the turning moves it is in)
		function updateInner(moving) {
			var at = locate();
			for (var c = 0; c < cubies.length; c++) {
				var cb = cubies[c];
				var back = invert(cb.motion);
				for (var i = 0; i < cb.inner.length; i++) {
					var face = cb.inner[i];
					var hn = cb.g.slice();
					hn[face.axis] += face.sign;
					var p = apply(cb.motion, [2 * hn[0], 2 * hn[1], 2 * hn[2]]);
					var nb = at[p[0] / 2 + ',' + p[1] / 2 + ',' + p[2] / 2];
					if (moving && nb !== CORE && nb.mvMask != cb.mvMask) {
						showRects(face, [face.rect]); // against the turning cut plane: shown whole
						continue;
					}
					if (!nb || nb === CORE) {
						showRects(face, nb ? [] : [face.rect]);
						continue;
					}
					var nbox = moveBox(compose(back, nb.motion), nb.box);
					var uv = faceAxes(face.axis, face.sign);
					showRects(face, rectDiff(face.rect, [nbox.min[uv[0]], nbox.max[uv[0]], nbox.min[uv[1]], nbox.max[uv[1]]]));
				}
			}
		}

		// cube skin: sticker size, rounding, border and sheen from the skin; always a body (Classic: dark plastic);
		// faces always shaded, so the shape reads at a glance
		var skin = null;

		function getSkin() {
			var sk = window['jlCubeSkin'] && window['jlCubeSkin']['style'] && window['jlCubeSkin']['style']();
			if (!sk || sk['id'] == 'classic') {
				return { stickerWidth: 1.7, round: 0, border: sk ? sk['body'] == null : true, sheen: false, shade: 0, body: sk && sk['body'] != null ? sk['body'] : null };
			}
			return { stickerWidth: sk['stickerWidth'], round: sk['round'], border: sk['border'], sheen: sk['sheen'], shade: sk['shade'], body: sk['body'] };
		}

		var baseApplySkin = twisty.applySkin;

		function applySkin(tw, newSkin) {
			baseApplySkin(tw, newSkin); // keeps the NxN's own state (tint, materials) consistent; then ours on top
			skin = newSkin || getSkin();
			var col = COLORS[kernel.getProp('vrcMirror', 'g')] || COLORS.g;
			stickerMat.color.setHex(col);
			stickerMat.jlShade = Math.max(0.42, skin.shade || 0);
			stickerMat.jlSheen = skin.sheen;
			stickerMat.jlRound = Math.min(skin.round, 0.18);
			// the skin's body if it is dark enough for the metal faces to stand out against (a white body is not)
			var body = skin.body;
			var luma = body == null ? 1 : (0.299 * (body >> 16 & 255) + 0.587 * (body >> 8 & 255) + 0.114 * (body & 255)) / 255;
			bodyMat.color.setHex(luma < 0.45 ? body : 0x262626);
			bodyMat.jlShade = 0.5;
			borderMat.jlRound = stickerMat.jlRound;
			var margin = 2 - skin.stickerWidth;
			for (var i = 0; i < stickers.length; i++) {
				var s = stickers[i];
				var interior = s[0][1].children[0];
				var body = s[0][1].children[1];
				var rect = s[7].slice();
				rect[0] += margin / 2;
				rect[1] -= margin / 2;
				rect[2] += margin / 2;
				rect[3] -= margin / 2;
				interior.matrix.multiply(s[3], faceMatrix(s[4], s[5], s[6], rect, 0.02));
				interior.jlMat = stickerMat;
				interior.materials = skin.border ? [stickerMat, borderMat] : [stickerMat];
				interior.doubleSided = false;
				interior.visible = true;
				body.visible = true;
				body.materials = [bodyMat];
			}
			return true;
		}
		twisty.applySkin = applySkin;
		applySkin(null, null);

		var actualScale = (twistyParameters.scale || 1) * 0.5 / 3.9; // room for the pieces standing out
		cubeObject.scale = new THREE.Vector3(actualScale, actualScale, actualScale);

		// the view offset: the solved cube's centre at the origin; turns with whole-puzzle rotations
		var offset = [];
		for (var a = 0; a < 3; a++) {
			var lo = extent(a, -1)[0], hi = extent(a, 1)[1];
			offset[a] = -(lo + hi) / 2;
		}
		var rotating = []; // [move, progress] of rotations being animated

		function isRotation(move) {
			return move[0] <= 1 && move[1] >= 3;
		}

		function rotate(v, face, angle) {
			var m = new THREE.Matrix4().setRotationAxis(vec(ROTAXIS[face]), angle);
			var p = vec(v);
			m.multiplyVector3(p);
			return [p.x, p.y, p.z];
		}

		function placeView() {
			var o = offset;
			for (var i = 0; i < rotating.length; i++) {
				var mv = rotating[i][0];
				o = rotate(o, mv[2], rotating[i][1] * mv[3] * Math.TAU / 4);
			}
			cubeObject.position.x = o[0] * actualScale;
			cubeObject.position.y = o[1] * actualScale;
			cubeObject.position.z = o[2] * actualScale;
		}
		placeView();

		// cubies a move turns (layers counted from its face, as in twistynnn.js)
		function layerOfMove(move) {
			var f = FACES.indexOf(move[2]);
			var n = [0, 0, 0];
			n[FAXIS[f]] = FSIGN[f];
			var l0 = move[0], l1 = move[1] < 0 ? 4 + move[1] : move[1];
			var ret = [];
			for (var c = 0; c < cubies.length; c++) {
				var p = cubies[c].pos;
				var layer = 2 - (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]);
				if (layer >= l0 && layer <= l1) {
					ret.push(cubies[c]);
				}
			}
			return ret;
		}

		var animating = [];
		var baseAnimate = twisty.animateMoveCallback;
		twisty.animateMoveCallback = function(tw, move, progress, step) {
			if (animating.indexOf(move) == -1) {
				animating.push(move);
				locate();
				for (var c = 0; c < cubies.length; c++) {
					cubies[c].mvMask = 0;
				}
				for (var a = 0; a < animating.length; a++) {
					var la = layerOfMove(animating[a]);
					for (var i = 0; i < la.length; i++) {
						la[i].mvMask |= 1 << a;
					}
				}
				updateInner(true);
			}
			baseAnimate(tw, move, progress, step);
			if (isRotation(move)) {
				var found = false;
				for (var i = 0; i < rotating.length; i++) {
					if (rotating[i][0] == move) {
						rotating[i][1] = progress;
						found = true;
					}
				}
				!found && rotating.push([move, progress]);
				placeView();
			}
		};

		var baseAdvance = twisty.advanceMoveCallback;
		twisty.advanceMoveCallback = function(tw, move) {
			baseAdvance(tw, move);
			if (isRotation(move)) {
				offset = rotate(offset, move[2], move[3] * Math.TAU / 4).map(function(x) {
					return Math.round(x * 1e6) / 1e6;
				});
				rotating = rotating.filter(function(r) {
					return r[0] != move;
				});
				placeView();
			}
			animating = [];
			updateInner(null);
		};

		// solved: the shape is the cube again, i.e. every corner and edge home, in any orientation
		twisty.isSolved = function(tw) {
			if (!twistyScene.isAnimationFinished()) {
				return 99;
			}
			var progress = cubeutil.getProgress(twisty.getFacelet(tw), 'n');
			return twistyScene.isMoveFinished() ? progress : Math.max(1, progress);
		};

		twisty.toggleColorVisible = $.noop; // one colour: nothing to hide
		updateInner(null);
		return twisty;
	}
})();
