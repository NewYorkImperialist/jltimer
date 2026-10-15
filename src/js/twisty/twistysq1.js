(function() {
	twistyjs.registerTwisty("sq1", createCubeTwisty);
	twistyjs.registerTwisty("sq2", createCubeTwisty); // Square-2 (jlTimer)
	twistyjs.registerTwisty("ssq1", createCubeTwisty); // Super Square-1 (jlTimer)
	twistyjs.createSq1Twisty = createCubeTwisty; // the bandaged Square-1 (twisty/twistybandaged.js) builds on it

	function axify(v1, v2, v3) {
		var ax = new THREE.Matrix4();
		ax.set(
			v1.x, v2.x, v3.x, 0,
			v1.y, v2.y, v3.y, 0,
			v1.z, v2.z, v3.z, 0,
			0, 0, 0, 1
		);
		return ax;
	}

	var hsq3 = Math.sqrt(3) / 2;

	var amp = 1.5;

	var wg = 0.05;

	var ws = 0.6;

	var w = 1 + hsq3;
	var h = Math.sqrt(2) + Math.sqrt(6);
	var hh = h / 2;
	var lof = (3 + Math.sqrt(3)) / 4;
	var hm = hh - ws * 2;
	var ws4 = 0.41; // Super Square-1: half height of each of its four layers


	var sp = [
		[0, 1 - wg * 2],
		[-0.5 + wg, -hsq3 + wg * hsq3],
		[0.5 - wg, -hsq3 + wg * hsq3]
	];
	var lp = [
		[1 - wg * 2, 1 - wg * 2],
		[-hsq3 + wg * hsq3, 0.5 - wg],
		[-hsq3 + wg * hsq3, -hsq3 + wg * hsq3],
		[0.5 - wg, -hsq3 + wg * hsq3]
	];

	// side stickers of a layer (half height hw) and of the middle layer (half height hm)
	function rect(x0, x1, hw) {
		return [[x0 + wg, hw - wg], [x0 + wg, -hw + wg], [x1 - wg, -hw + wg], [x1 - wg, hw - wg]];
	}

	function ss(hw) { // edge
		return rect(-0.5, 0.5, hw);
	}

	function ls(hw) { // one side of a corner
		return rect(-(0.5 + hsq3) / 2, (0.5 + hsq3) / 2, hw);
	}

	function mf(hm) { // the whole middle of L / R
		return rect(-w, w, hm);
	}

	function lm(hm) { // the big part of the middle of F / B
		return rect(-(1.5 + hsq3) / 2, (1.5 + hsq3) / 2, hm);
	}

	function sm(hm) { // the small part
		return rect(-(0.5 + hsq3) / 2, (0.5 + hsq3) / 2, hm);
	}

	// Square-2 (jlTimer): every corner is cut in two along its diagonal, each half a 30 degree wedge with its own
	// sticker; a half's origin is on its own centre line, so the layer tests (and the slice check, which looks for a
	// corner centred on the cut) see two independent pieces
	function halfCorners() {
		var p0 = [lp[0][0] - 1, lp[0][1] - 1];
		var p1 = [lp[1][0] - 1, lp[1][1] - 1];
		var p2 = [lp[2][0] - 1, lp[2][1] - 1];
		var p3 = [lp[3][0] - 1, lp[3][1] - 1];
		var g = wg * 0.7 / Math.sqrt(2); // a gap along the diagonal cut
		var ret = [];
		var halves = [
			[[p0, p1, p2], [-g, g], 7],
			[[p0, p2, p3], [g, -g], 8]
		];
		for (var i = 0; i < 2; i++) {
			var pts = halves[i][0], d = halves[i][1];
			var ang = Math.TAU * halves[i][2] / 12; // centre line: 210 / 240 degrees
			var o = [Math.SQRT2 * Math.cos(ang), Math.SQRT2 * Math.sin(ang)];
			var poly = [];
			for (var j = 0; j < 3; j++) {
				var shift = j == 1 && i == 0 || j == 2 && i == 1 ? [0, 0] : d; // the diagonal's two ends move off the cut
				poly.push([pts[j][0] + shift[0] - o[0], pts[j][1] + shift[1] - o[1]]);
			}
			ret.push([poly, o[0], o[1]]);
		}
		return ret;
	}

	// [polygon, x, y, distance, quarter turns about the face's axis] per sticker, per face (U L F R B D).
	// kind: "sq1", "sq2" (Square-2) or "ssq1" (Super Square-1: four layers, each half as high, around the middle)
	function buildFacelets(kind) {
		var ret = [];
		var halves = kind == "sq2" ? halfCorners() : null;
		var rows = kind == "ssq1" ? [[hh - ws4, ws4], [hh - 3 * ws4, ws4]] : [[hh - ws, ws]];
		var hmid = kind == "ssq1" ? hh - 4 * ws4 : hm;
		for (var f = 0; f < 6; f++) {
			var list = [];
			if (f == 0 || f == 5) {
				for (var k = 0; k < 4; k++) {
					list.push([sp, 0, -1, hh, k]);
					if (halves) {
						list.push([halves[0][0], halves[0][1], halves[0][2], hh, k]);
						list.push([halves[1][0], halves[1][1], halves[1][2], hh, k]);
					} else {
						list.push([lp, -1, -1, hh, k]);
					}
				}
			} else {
				for (var rot = 0; rot <= 2; rot += 2) {
					for (var r = 0; r < rows.length; r++) {
						var y = rows[r][0], hw = rows[r][1];
						list.push([ss(hw), 0, y, w, rot], [ls(hw), lof, y, w, rot], [ls(hw), -lof, y, w, rot]);
					}
				}
				if (f == 1 || f == 3) {
					list.push([mf(hmid), 0, 0, w, 0]);
				} else {
					list.push([lm(hmid), lof - 0.5, 0, w, 0], [sm(hmid), -lof, 0, w, 0]);
				}
			}
			ret.push(list);
		}
		return ret;
	}

	// Cube Constants
	var numSides = 6;

	var xx = new THREE.Vector3(1, 0, 0);
	var yy = new THREE.Vector3(0, 1, 0);
	var zz = new THREE.Vector3(0, 0, 1);
	var xxi = new THREE.Vector3(-1, 0, 0);
	var yyi = new THREE.Vector3(0, -1, 0);
	var zzi = new THREE.Vector3(0, 0, -1);

	var side_index = {
		"U": 0,
		"L": 1,
		"F": 2,
		"R": 3,
		"B": 4,
		"D": 5
	};
	var index_side = ["U", "L", "F", "R", "B", "D"];

	var sidesRot = {
		"U": axify(zz, yy, xxi),
		"L": axify(xx, zz, yyi),
		"F": axify(yyi, xx, zz),
		"R": axify(xx, zzi, yy),
		"B": axify(yy, xxi, zz),
		"D": axify(zzi, yy, xx)
	};
	var sidesNorm = {
		"U": yy,
		"L": xxi,
		"F": zz,
		"R": xx,
		"B": zzi,
		"D": yyi
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
		axify(xx, zzi, yy),
		axify(zz, yy, xxi),
		axify(xx, yy, zz),
		axify(zzi, yy, xx),
		axify(xxi, yy, zzi),
		axify(xx, zz, yyi)
	];

	function matrixVector3Dot(m, v) {
		return m.n14 * v.x + m.n24 * v.y + m.n34 * v.z;
	}

	/*
	 * Rubik's Cube NxNxN
	 */
	function createCubeTwisty(twistyScene, twistyParameters) {

		// console.log("Creating cube twisty.");

		var kind = twistyParameters.type; // "sq1", "sq2" or "ssq1"
		var facelets = buildFacelets(kind);
		var four = kind == "ssq1";
		// layer ranges (distance along the turning axis) of a top / bottom layer turn, and of an inner layer
		// (Super Square-1's second and third layers)
		var outer = four ? [1.6, 5] : [1, 5];
		var inner = [0.3, 1.6];

		// Cube Variables
		var cubeObject = new THREE.Object3D();
		var cubePieces = [];

		//Defaults
		var cubeOptions = {
			stickerBorder: true,
			stickerWidth: 1.8,
			doubleSided: true,
			opacity: 1,
			dimension: 3,
			faceColors: [0xffff00, 0x0000ff, 0xff0000, 0x00ff00, 0xff8800, 0xffffff],
			scale: 1
		};

		// Passed Parameters
		for (var option in cubeOptions) {
			if (option in twistyParameters) {
				//              console.log("Setting option \"" + option + "\" to " + twistyParameters[option]);
				cubeOptions[option] = twistyParameters[option];
			}
		}

		// Cube Materials
		var materials = [];
		var borderMaterial = new THREE.MeshBasicMaterial({
			color: 0x000000,
			wireframe: true,
			wireframeLinewidth: 1,
			opacity: cubeOptions.opacity
		});
		for (var i = 0; i < numSides; i++) {
			materials.push(new THREE.MeshBasicMaterial({
				color: cubeOptions.faceColors[i],
				opacity: cubeOptions.opacity
			}));
		}

		// Cube Helper Linear Algebra

		//Cube Object Generation
		for (var i = 0; i < numSides; i++) {
			var facePieces = [];
			cubePieces.push(facePieces);

			for (var j = 0; j < facelets[i].length; j++) {
				var curf = facelets[i][j];
				var sticker = new THREE.Object3D();

				var meshes = [materials[i]];
				if (cubeOptions.stickerBorder) {
					meshes.push(borderMaterial);
				}
				var curf0 = [];
				for (var k = 0; k < curf[0].length; k++) {
					curf0[k] = [curf[0][k][0] * amp, curf[0][k][1] * amp];
				};
				var stickerInterior = new THREE.Mesh(new THREE.Ploy(curf0), meshes);
				stickerInterior.doubleSided = cubeOptions.doubleSided;
				stickerInterior.overdraw = true;
				sticker.addChild(stickerInterior);

				var transformationMatrix = new THREE.Matrix4().setRotationAxis(sidesRotAxis[index_side[i]], Math.TAU / 4 * curf[4])
					.multiplySelf(sidesUV[i])
					.multiplySelf(new THREE.Matrix4().setTranslation(curf[1] * amp, curf[2] * amp,
						curf[3] * amp
					));

				sticker.matrix.copy(transformationMatrix);

				sticker.matrixAutoUpdate = false;
				sticker.update();

				facePieces.push([transformationMatrix, sticker]);
				cubeObject.addChild(sticker);
			};
		}

		// Super Square-1: the wide pieces of the inner layers carry no sticker on their centre line; an invisible
		// marker there lets the slice check see them (as a corner's top sticker does on the outer layers)
		if (four) {
			var markers = [];
			cubePieces.push(markers);
			for (var f = 0; f <= 5; f += 5) {
				for (var k = 0; k < 4; k++) {
					var marker = new THREE.Object3D();
					var mm = new THREE.Matrix4().setRotationAxis(sidesRotAxis[index_side[f]], Math.TAU / 4 * k)
						.multiplySelf(sidesUV[f])
						.multiplySelf(new THREE.Matrix4().setTranslation(-amp, -amp, (hh - 3 * ws4) * amp));
					marker.matrix.copy(mm);
					marker.matrixAutoUpdate = false;
					markers.push([mm, marker]);
					cubeObject.addChild(marker);
				}
			}
		}

		var actualScale = cubeOptions.scale * 0.5 / cubeOptions.dimension;
		cubeObject.scale = new THREE.Vector3(actualScale, actualScale, actualScale);

		var axisList = [
			new THREE.Vector3(Math.cos(Math.TAU / 24), 0, Math.sin(Math.TAU / 24)),
			sidesNorm[index_side[0]],
			sidesNorm[index_side[5]],
			new THREE.Vector3(Math.sin(Math.TAU / 24), 0, -Math.cos(Math.TAU / 24))
		];

		function animateMoveCallback(twisty, currentMove, moveProgress, moveStep) {
			if (!isTwistable(twisty) && currentMove[0] == 0 && currentMove[2] == 0) {
				return;
			}
			var rots = new THREE.Matrix4();
			var fullstep = Math.TAU / 12 * currentMove[1];
			var normVector = axisList[currentMove[0]];

			rots.setRotationAxis(normVector, -moveStep * fullstep);

			var state = twisty.cubePieces;

			for (var faceIndex = 0; faceIndex < state.length; faceIndex++) {
				var faceStickers = state[faceIndex];
				for (var stickerIndex = 0, faceStickerslength = faceStickers.length; stickerIndex < faceStickerslength; stickerIndex++) {
					// TODO - sticker isn't really a good name for this --jfly
					var sticker = faceStickers[stickerIndex];

					var layer = matrixVector3Dot(sticker[1].matrix, normVector);
					if (layer > currentMove[2] && layer < currentMove[3]) {
						sticker[1].matrix.multiply(rots, sticker[1].matrix);
						sticker[1].update();
					}
				}
			}
		}

		function advanceMoveCallback(twisty, currentMove) {
			if (!isTwistable(twisty) && currentMove[0] == 0 && currentMove[2] == 0) {
				return;
			}

			cntMove(twisty, currentMove);

			var rots = new THREE.Matrix4();
			var fullstep = Math.TAU / 12 * currentMove[1];
			var normVector = axisList[currentMove[0]];

			rots.setRotationAxis(normVector, -fullstep);

			var state = twisty.cubePieces;

			for (var faceIndex = 0; faceIndex < state.length; faceIndex++) {
				var faceStickers = state[faceIndex];
				for (var stickerIndex = 0, faceStickerslength = faceStickers.length; stickerIndex < faceStickerslength; stickerIndex++) {
					// TODO - sticker isn't really a good name for this --jfly
					var sticker = faceStickers[stickerIndex];

					var layer = matrixVector3Dot(sticker[1].matrix, normVector);
					if (layer > currentMove[2] && layer < currentMove[3]) {
						sticker[0].multiply(rots, sticker[0]);
						sticker[1].matrix.copy(sticker[0]);
						sticker[1].update();
					}
				}
			}
		}

		function isTwistable(twisty) {
			var normVector = axisList[0];
			var state = twisty.cubePieces;

			for (var faceIndex = 0; faceIndex < state.length; faceIndex++) {
				var faceStickers = state[faceIndex];
				for (var stickerIndex = 0, faceStickerslength = faceStickers.length; stickerIndex < faceStickerslength; stickerIndex++) {
					var sticker = faceStickers[stickerIndex];
					var layer = matrixVector3Dot(sticker[1].matrix, normVector);
					if (Math.abs(layer) < 0.01) {
						return false;
					}
				}
			}
			return true;
		}

		function matrix4Power(inMatrix, power) {
			var matrix = null;
			if (power < 0) {
				var matrixIdentity = new THREE.Matrix4();
				matrix = THREE.Matrix4.makeInvert(inMatrix, matrixIdentity);
			} else {
				matrix = inMatrix.clone();
			}

			var out = new THREE.Matrix4();
			for (var i = 0; i < Math.abs(power); i++) {
				out.multiplySelf(matrix);
			}

			return out;

		}

		function generateScramble(twisty) {
			var dim = twisty.options.dimension;
			var n = 32;
			var newMoves = [];

			for (var i = 0; i < n; i++) {

				var random1 = 1 + ~~(Math.random() * dim / 2);
				var random2 = random1 + ~~(Math.random() * dim / 2);
				var random3 = ~~(Math.random() * 6);
				var random4 = [-2, -1, 1, 2][~~(Math.random() * 4)];

				var newMove = [random1, random2, ["U", "L", "F", "R", "B", "D"][random3], random4];

				newMoves.push(newMove);

			}

			return newMoves;
		}


		//[axis, power, min, max]
		//axis: 1: top, 2: bot, 0: /, 3: z2
		function generateCubeKeyMapping() {
			var o0 = outer[0], o1 = outer[1];
			var ret = {
				73: [0, 6, 0, 5], //I R
				75: [0, -6, 0, 5], //K R'
				83: [2, 1, o0, o1], //S D
				76: [2, -1, o0, o1], //L D'
				74: [1, 1, o0, o1], //J U
				70: [1, -1, o0, o1], //F U'
				186: [1, 6, -5, 5], //; y
				65: [1, -6, -5, 5], //A y'
				84: [0, 6, -5, 5], //T x
				89: [0, 6, -5, 5], //Y x
				78: [0, -6, -5, 5], //N x'
				66: [0, -6, -5, 5], //B x'
				80: [3, -6, -5, 5], //P z
				81: [3, 6, -5, 5], //Q z'
				72: [1, 3, o0, o1], //H F
				71: [1, -3, o0, o1], //G F'
				87: [2, 3, o0, o1], //W B
				79: [2, -3, o0, o1] //O B'
			};
			if (four) { // Super Square-1's inner layers: the NxN's u / d keys
				ret[188] = [1, 1, inner[0], inner[1]]; //, u
				ret[67] = [1, -1, inner[0], inner[1]]; //C u'
				ret[90] = [2, 1, inner[0], inner[1]]; //Z d
				ret[191] = [2, -1, inner[0], inner[1]]; /// d'
			}
			return ret;
		}

		// touch board (Square-2, Super Square-1): rows turn the top / bottom layer (and on the Super Square-1 the
		// middle row its second layer), the right column is the slice, the left column flips the puzzle (z2)
		function getTouchMoves() {
			var ret = {};
			var add = function(keys, label, move) {
				for (var i = 0; i < keys.length; i++) {
					ret[keys[i]] = [label, move];
				}
			};
			add([12, 23, 13], "U'", [1, -1, outer[0], outer[1]]);
			add([21, 32, 31], "U", [1, 1, outer[0], outer[1]]);
			add([78, 89, 79], "D", [2, 1, outer[0], outer[1]]);
			add([87, 98, 97], "D'", [2, -1, outer[0], outer[1]]);
			if (four) {
				add([45, 56, 46], "u'", [1, -1, inner[0], inner[1]]);
				add([54, 65, 64], "u", [1, 1, inner[0], inner[1]]);
			} else {
				add([45, 56, 46, 54, 65, 64], "y2", [1, 6, -5, 5]);
			}
			add([36, 69, 39, 63, 96, 93], "/", [0, 6, 0, 5]);
			add([14, 47, 17, 41, 74, 71], "z2", [3, 6, -5, 5]);
			return ret;
		}

		var cubeKeyMapping = generateCubeKeyMapping();

		function keydownCallback(twisty, e) {
			if (e.altKey || e.ctrlKey) {
				return;
			}
			var keyCode = e.keyCode;
			if (keyCode in cubeKeyMapping && !(twisty.refuseMove && twisty.refuseMove(twisty, cubeKeyMapping[keyCode]))) {
				twistyScene.addMoves([cubeKeyMapping[keyCode]]);
			}
		}

		function isSolved(twisty) {
			if (!twistyScene.isMoveFinished()) {
				return 1;
			}
			var state = twisty.cubePieces;

			for (var faceIndex = 0; faceIndex < numSides - 1; faceIndex++) {
				var faceStickers = state[faceIndex];
				var normVector = new THREE.Vector3(faceStickers[0][0].n13, faceStickers[0][0].n23, faceStickers[0][0].n33);
				var stdVal = matrixVector3Dot(faceStickers[0][0], normVector);
				for (var stickerIndex = 1, faceStickerslength = faceStickers.length; stickerIndex < faceStickerslength; stickerIndex++) {
					var sticker = faceStickers[stickerIndex];
					if (0.1 < Math.abs(matrixVector3Dot(sticker[0], normVector) - stdVal)) {
						return 1;
					}
				}
			}
			return 0;
		}

		function isInspectionLegalMove(twisty, move) {
			return move[2] == -5 && move[3] == 5;
		}

		function isParallelMove(twisty, move1, move2) {
			if (move1[0] == move2[0] || move1[0] * move2[0] == 2) {
				return true;
			}
			return false;
		}

		function parseScramble(scramble) {
			if (!scramble || /^\s*$/.exec(scramble)) {
				return generateScramble(this);
			}
			// (u,d) / (top,second,third,bottom) for the Super Square-1; x2 / z2 are the T / P key rotations
			var sqre = /(\/)|\((-?\d+), *(-?\d+)(?:, *(-?\d+), *(-?\d+))?\)|([xyz])('?)2/g;
			var ret = [];
			scramble.replace(sqre, function(m, p1, p2, p3, p4, p5, p6, p7) {
				if (p1) {
					ret.push([0, 6, 0, 5]);
				} else if (p6) {
					ret.push([{ 'x': 0, 'y': 1, 'z': 3 }[p6], (p7 ? -6 : 6) * (p6 == 'z' ? -1 : 1), -5, 5]);
				} else {
					var turns = p4 === undefined || p4 === '' ? [[1, ~~p2, outer], [2, ~~p3, outer]] :
						[[1, ~~p2, outer], [1, ~~p3, inner], [2, ~~p4, inner], [2, ~~p5, outer]];
					for (var i = 0; i < turns.length; i++) {
						if (turns[i][1] != 0) {
							ret.push([turns[i][0], turns[i][1], turns[i][2][0], turns[i][2][1]]);
						}
					}
				}
			});
			return ret;
		}

		var counter = 0;
		var lastMove = -1;

		function cntMove(twisty, move) {
			var key = move[0] + ',' + move[2]; // the layer (inner layers turn about the same axis as the outer ones)
			if (!isInspectionLegalMove(twisty, move) && key != lastMove) {
				counter++;
			}
			lastMove = key;
		}

		function moveCnt(clr) {
			if (clr) {
				counter = 0;
				lastMove = -1;
			}
			return counter;
		}

		function move2str(move) {
			var axis = move[0];
			var pow = move[1];
			if (move[2] == -5) { // whole puzzle: y2 (U axis), x2 (slice axis), z2 (P / Q)
				var p = axis == 3 ? -pow : pow;
				return "xy-z".charAt(axis) + (p == 6 ? "" : "'") + "2";
			} else if (axis == 0) {
				return pow == 6 ? "/" : "/'";
			} else if (four) {
				var t = [0, 0, 0, 0];
				t[axis == 1 ? (move[2] == inner[0] ? 1 : 0) : (move[2] == inner[0] ? 2 : 3)] = pow;
				return "(" + t.join(",") + ")";
			}
			return axis == 1 ? "(" + pow + ",0)" : "(0," + pow + ")";
		}

		function moveInv(move) {
			move = move.slice();
			move[1] = -move[1];
			return move;
		}

		return {
			type: twistyParameters,
			options: cubeOptions,
			_3d: cubeObject,
			cubePieces: cubePieces,
			animateMoveCallback: animateMoveCallback,
			advanceMoveCallback: advanceMoveCallback,
			keydownCallback: keydownCallback,
			isSolved: isSolved,
			isInspectionLegalMove: isInspectionLegalMove,
			isParallelMove: isParallelMove,
			generateScramble: generateScramble,
			parseScramble: parseScramble,
			moveCnt: moveCnt,
			move2str: move2str,
			moveInv: moveInv,
			getTouchMoves: kind == "sq1" ? undefined : getTouchMoves
		};
	}
})();
