/*
 * jlTimer: the bandaged puzzles of Special > Bandaged Cube as virtual puzzles.
 *
 * Bicube (event "bic"): the 3x3x3 of twistynnn.js with Meffert's Bicube bandaging (lib/puzzlebandaged.js). Each glued
 * block's stickers on a face are drawn as one joined tile (no gap or border between them), so the blocks are
 * visible in every cube skin; the cube's keys, touch board, colours and skins are the NxN's.
 *
 * Bandaged Square-1 </,(1,0)> (event "bsq"): the Square-1 of twistysq1.js with one bottom corner glued to the half of
 * the middle layer the slice does not turn; its side stickers reach down to the middle layer to show the glue. The
 * bottom layer never turns, the slice and the top turn as usual (after whole-puzzle flips the rule follows the
 * glued piece). A touch board is added (top / bottom row: turns, right column: slice, left column / middle row: flips).
 *
 * A turn that would tear a glued block (or a slice blocked by a corner) is refused with a small shake and never
 * entered, so it is neither logged nor timed. The check runs on a model kept ahead of the animation (every move the
 * scene accepts updates it at once), so fast key presses are judged on the position they will turn.
 */
(function() {
	twistyjs.registerTwisty("bic", createBicube);
	twistyjs.registerTwisty("bsq", createBandagedSq1);

	// a short shake of the puzzle instead of the turn (a fade with reduced motion), as on the Super Floppy
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

	// keep a model one step ahead of the animation: moves entered with addMoves update it when they are added,
	// moves applied directly (scramble, replay) when they are applied
	function attachModel(twistyScene, twisty, model) {
		var pending = 0;
		var advance = twisty.advanceMoveCallback;
		twisty.advanceMoveCallback = function(tw, move) {
			advance(tw, move);
			if (pending > 0) {
				pending--;
			} else {
				model.apply(move);
			}
		};
		twisty.jlBandMoveAdded = function(move) {
			pending++;
			model.apply(move);
		};
		twisty.refuseMove = function(tw, move) {
			if (model.legal(move)) {
				return false;
			}
			shake(twistyScene);
			return true;
		};
		if (!twistyScene.jlBandHook) {
			twistyScene.jlBandHook = true;
			twistyScene.addMoveListener(function(move, step) {
				var tw = twistyScene.getTwisty();
				if (step == 0 && tw && tw.jlBandMoveAdded) {
					tw.jlBandMoveAdded(move);
				}
			});
		}
	}

	/*
	 * Bicube
	 */
	function createBicube(twistyScene, twistyParameters) {
		twistyParameters['dimension'] = 3;
		var twisty = twistyjs.createCubeTwisty(twistyScene, twistyParameters);
		var state = puzzleBandaged.solved();

		function clamp(move) {
			return [move[0], Math.min(move[1], 3), move[2], move[3]];
		}

		attachModel(twistyScene, twisty, {
			apply: function(move) {
				puzzleBandaged.apply(state, clamp(move));
			},
			legal: function(move) {
				return puzzleBandaged.isLegal(state, clamp(move));
			}
		});

		// the joined tiles: per glued block and face, the first sticker grows over its neighbour, which is hidden
		var pairs = [];
		var single = null;
		var seen = {};
		for (var f = 0; f < 6; f++) {
			for (var i = 0; i < twisty.cubePieces[f].length; i++) {
				var m = twisty.cubePieces[f][i][0];
				var t = [m.n14, m.n24, m.n34];
				var pos = t.map(function(v) {
					return Math.abs(v) > 2.5 ? (v > 0 ? 1 : -1) : Math.round(v / 2);
				});
				var block = puzzleBandaged.blockOf(pos);
				var key = block + ':' + f;
				var sticker = { obj: twisty.cubePieces[f][i][1], m: m, t: t };
				if (puzzleBandaged.BLOCKS[block].length == 1) {
					single = sticker;
				} else if (key in seen) {
					var a = seen[key];
					var d = [t[0] - a.t[0], t[1] - a.t[1], t[2] - a.t[2]];
					pairs.push({
						a: a.obj,
						b: sticker.obj,
						dx: d[0] * a.m.n11 + d[1] * a.m.n21 + d[2] * a.m.n31, // the neighbour in the sticker's own plane
						dy: d[0] * a.m.n12 + d[1] * a.m.n22 + d[2] * a.m.n32
					});
				} else {
					seen[key] = sticker;
				}
			}
		}

		function joinTiles() {
			var s = single.obj.children[0].scale.y; // the skin's sticker size (a Plane(2, 2) scaled)
			for (var i = 0; i < pairs.length; i++) {
				var p = pairs[i];
				var inner = p.a.children[0];
				inner.position.x = p.dx / 2;
				inner.position.y = p.dy / 2;
				inner.scale.x = Math.abs(p.dx) > 1 ? 1 + s : s;
				inner.scale.y = Math.abs(p.dy) > 1 ? 1 + s : s;
				p.b.children[0].visible = false;
				// the body behind it (skins with a body) covers both cells too, so it is drawn behind the tile
				// instead of the neighbour's body being sorted in front of it
				var body = p.a.children[1];
				body.position.x = p.dx / 2;
				body.position.y = p.dy / 2;
				body.scale.x = Math.abs(p.dx) > 1 ? 4.02 / 2.02 : 1;
				body.scale.y = Math.abs(p.dy) > 1 ? 4.02 / 2.02 : 1;
				p.b.children[1].visible = false;
			}
		}
		joinTiles();

		var applySkin = twisty.applySkin;
		twisty.applySkin = function() {
			var ret = applySkin.apply(this, arguments);
			joinTiles();
			return ret;
		};

		// one phase (no CFOP steps on a Bicube): 0 solved, 1 not, 99 while turning
		twisty.isSolved = function(tw) {
			if (!twistyScene.isAnimationFinished()) {
				return 99;
			}
			if (!twistyScene.isMoveFinished()) {
				return 1;
			}
			return cubeutil.getProgress(tw.getFacelet(tw), 'n') ? 1 : 0;
		};
		twisty.jlBandState = function() {
			return puzzleBandaged.clone(state);
		};
		return twisty;
	}

	/*
	 * Bandaged Square-1
	 */
	// twistysq1.js: move [axis, power in twelfths, min, max], axis 0 the slice, 1 top, 2 bottom, 3 the z2 flip axis
	var AXES = [
		new THREE.Vector3(Math.cos(Math.TAU / 24), 0, Math.sin(Math.TAU / 24)),
		new THREE.Vector3(0, 1, 0),
		new THREE.Vector3(0, -1, 0),
		new THREE.Vector3(Math.sin(Math.TAU / 24), 0, -Math.cos(Math.TAU / 24))
	];

	function layerOf(m, v) {
		return m.n14 * v.x + m.n24 * v.y + m.n34 * v.z;
	}

	function createBandagedSq1(twistyScene, twistyParameters) {
		var twisty = twistyjs.createSq1Twisty(twistyScene, twistyParameters);

		// the model: a copy of every sticker's matrix, turned like twistysq1.js turns the stickers
		var mats = [];
		var objs = [];
		for (var f = 0; f < 6; f++) {
			for (var i = 0; i < twisty.cubePieces[f].length; i++) {
				mats.push(twisty.cubePieces[f][i][0].clone());
				objs.push({ f: f, i: i, obj: twisty.cubePieces[f][i][1] });
			}
		}

		function twistable() {
			for (var i = 0; i < mats.length; i++) {
				if (Math.abs(layerOf(mats[i], AXES[0])) < 0.01) {
					return false;
				}
			}
			return true;
		}

		function moving(move) {
			var ret = [];
			for (var i = 0; i < mats.length; i++) {
				var layer = layerOf(mats[i], AXES[move[0]]);
				ret.push(layer > move[2] && layer < move[3]);
			}
			return ret;
		}

		function isSlice(move) {
			return move[0] == 0 && move[2] == 0;
		}

		// where a sticker's face is, and which way it points (for finding the glued piece once, when solved)
		function centroid(k) {
			var verts = objs[k].obj.children[0].geometry.vertices;
			var c = new THREE.Vector3(0, 0, 0);
			for (var i = 0; i < verts.length; i++) {
				c.addSelf(verts[i].position);
			}
			c.multiplyScalar(1 / verts.length);
			return mats[k].multiplyVector3(c);
		}

		// the glued block: the half of the middle layer the slice leaves, and the bottom corner furthest into it
		var block = [];
		var corner = -1;
		var best = 0;
		for (var k = 0; k < objs.length; k++) {
			var c = centroid(k);
			var side = c.dot(AXES[0]);
			if (objs[k].f >= 1 && objs[k].f <= 4 && objs[k].i >= 6 && side < 0) {
				block.push(k); // middle layer, left half
			} else if (objs[k].f == 5 && objs[k].i % 2 == 1 && side < best) {
				best = side; // a bottom corner (the long facelets)
				corner = k;
			}
		}
		var cc = centroid(corner);
		var cornerAngle = Math.atan2(cc.z, cc.x);
		var sides = [];
		block.push(corner);
		for (var k = 0; k < objs.length; k++) {
			if (objs[k].f >= 1 && objs[k].f <= 4 && objs[k].i < 6) {
				var c = centroid(k);
				var da = Math.abs(Math.atan2(c.z, c.x) - cornerAngle);
				da = Math.min(da, Math.TAU - da);
				if (c.y < 0 && da < 0.5) {
					block.push(k);
					sides.push(k);
				}
			}
		}

		// the glue: the corner's side stickers reach across the gap to the middle layer, in their own colour
		for (var s = 0; s < sides.length; s++) {
			var inner = objs[sides[s]].obj.children[0];
			var verts = inner.geometry.vertices;
			var x0 = 1e9, x1 = -1e9, y0 = 1e9;
			for (var i = 0; i < verts.length; i++) {
				x0 = Math.min(x0, verts[i].position.x);
				x1 = Math.max(x1, verts[i].position.x);
				y0 = Math.min(y0, verts[i].position.y);
			}
			var gap = 0.05 * 2 * 1.5 + 0.03; // twistysq1.js: 2 x wg, times amp, a little overlap
			var glue = new THREE.Mesh(new THREE.Ploy([[x0, y0 + 0.02], [x0, y0 - gap], [x1, y0 - gap], [x1, y0 + 0.02]]), [inner.materials[0]]);
			glue.doubleSided = true;
			glue.overdraw = true;
			objs[sides[s]].obj.addChild(glue);
		}

		attachModel(twistyScene, twisty, {
			apply: function(move) {
				if (isSlice(move) && !twistable()) {
					return; // twistysq1.js ignores it too
				}
				var mv = moving(move);
				var rot = new THREE.Matrix4().setRotationAxis(AXES[move[0]], -Math.TAU / 12 * move[1]);
				for (var i = 0; i < mats.length; i++) {
					if (mv[i]) {
						mats[i].multiply(rot, mats[i]);
					}
				}
			},
			legal: function(move) {
				if (isSlice(move) && !twistable()) {
					return false;
				}
				var mv = moving(move);
				var n = 0;
				for (var i = 0; i < block.length; i++) {
					n += mv[block[i]] ? 1 : 0;
				}
				return n == 0 || n == block.length;
			}
		});

		// the touch board (cells 1-9, key = from * 10 + to): top row turns the top, bottom row the bottom, the
		// right column is the slice, the left column flips the puzzle over (x2), the middle row turns it (y2)
		var TOUCH = {
			12: [1, -1, 1, 5], 23: [1, -1, 1, 5], 21: [1, 1, 1, 5], 32: [1, 1, 1, 5], 13: [1, -3, 1, 5], 31: [1, 3, 1, 5],
			78: [2, 1, 1, 5], 89: [2, 1, 1, 5], 87: [2, -1, 1, 5], 98: [2, -1, 1, 5], 79: [2, 3, 1, 5], 97: [2, -3, 1, 5],
			36: [0, 6, 0, 5], 63: [0, 6, 0, 5], 69: [0, 6, 0, 5], 96: [0, 6, 0, 5], 39: [0, 6, 0, 5], 93: [0, 6, 0, 5],
			14: [0, 6, -5, 5], 41: [0, -6, -5, 5], 47: [0, 6, -5, 5], 74: [0, -6, -5, 5], 17: [0, 6, -5, 5], 71: [0, -6, -5, 5],
			46: [1, -6, -5, 5], 64: [1, 6, -5, 5]
		};
		twisty.getTouchMoves = function() {
			var ret = {};
			for (var key in TOUCH) {
				ret[key] = [twisty.move2str(TOUCH[key]), TOUCH[key]];
			}
			return ret;
		};
		twisty.jlBandBlock = function() { // for tests: is the glued block in the bottom layer?
			return block.map(function(k) {
				return layerOf(mats[k], AXES[2]);
			});
		};
		return twisty;
	}
})();
