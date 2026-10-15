// @ts-check
"use strict";

/*
 * jlTimer: the virtual 15 puzzle and 8 puzzle (puzzle ids 15p / 15b / 8p / 8b, see tools.puzzleType), a flat grid
 * drawn on a 2D canvas in the site's colours. Chosen by puzzleFactory for these puzzles in both the 3D and the 2D view.
 *
 * It offers the same interface as the other twisty scenes (twisty.js, qcube.js), so timer/virtual.js and the replay
 * (twisty/twistyreplay.js) drive it like any puzzle. A move is [d, n]: n tiles slide in direction d (0 U, 1 L, 2 R,
 * 3 D), see lib/puzzleslide.js for the model and the notation (URLD / arrows name the tile direction, "Blank" the
 * blank's). Every move is applied to the model at once and reported as started and finished in the same call, so
 * the timer, the move log and solved detection never wait for a drawing; the slide is only drawn (about 70 ms) and a
 * tile that is moved again mid-slide carries on from where it is drawn, so the picture never lags behind fast input.
 *
 * Input: the 3x3 face keys (U j/f, D s/l, L d/e, R i/k: the scramble letters) and the arrow keys (Options > "Sliding puzzle keys move": the tiles, default, or the blank); a click
 * or tap on a tile in the blank's row or column slides it and every tile between (one move of n tiles); on a touch
 * screen a swipe slides the tiles that way (a long swipe keeps sliding, one move per tile length).
 */
(function() {
	var W = /** @type {any} */ (window);
	var SLIDE_MS = 70;
	/** key code -> direction a tile moves (0 up, 1 left, 2 right, 3 down) = the scramble letter U / L / R / D.
	 * The keys reaching the puzzle are already mapped to the 3x3 key map (help.getMappedCode in timer/virtual.js), so
	 * each 3x3 face key does the move with its letter: U keys (j / f) U, D keys (s / l) D, L keys (d / e) L,
	 * R keys (i / k) R. The arrow keys also work. */
	var KEYS = {
		38: 0, 37: 1, 39: 2, 40: 3, // arrows
		74: 0, 70: 0, // j f: U
		83: 3, 76: 3, // s l: D
		68: 1, 69: 1, // d e: L
		73: 2, 75: 2 // i k: R
	};

	/** @type {any[]} live scenes, redrawn when a colour changes */
	var scenes = [];

	function hexRgb(hex) {
		hex = $.nearColor(hex || '#888', 0, true);
		return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
	}

	function mix(a, b, k) {
		var x = hexRgb(a), y = hexRgb(b);
		return 'rgb(' + [0, 1, 2].map(function(i) {
			return Math.round(x[i] + (y[i] - x[i]) * k);
		}).join(',') + ')';
	}

	function isDark(hex) {
		var c = hexRgb(hex);
		return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 < 140;
	}

	function roundRect(ctx, x, y, w, h, r) {
		r = Math.min(r, w / 2, h / 2);
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	function reducedMotion() {
		return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	}

	function SlideScene() {
		var that = this;
		var container = $('<div style="width:100%;height:100%;position:relative;"/>');
		var canvas = $('<canvas class="jlslide" style="display:block;margin:0 auto;touch-action:none;"/>').appendTo(container);
		var twisty = null;
		var listeners = [];
		var keyTs = 0;

		var size = 4;
		var blankNotation = false;
		var arrows = false; // log in arrows (the scramble was written in arrows)
		var state = puzzleSlide.solved(4);
		/** per tile number: {fx, fy, t0} = drawn slide from (fx, fy) (cell units) that started at t0 */
		var anims = {};
		var raf = 0;
		var cssSize = 0;
		var counter = 0; // STM since the last moveCnt(true)
		var mtm = 0;
		var lastDir = -1;

		this.getDomElement = function() {
			return container;
		};
		this.getCanvas = function() {
			return canvas;
		};
		this.getTwisty = function() {
			return twisty;
		};

		// ---------- drawing ----------
		function cellXY(idx) {
			return [idx % size, Math.floor(idx / size)];
		}

		function ease(t) {
			return 1 - (1 - t) * (1 - t);
		}

		// where tile num is drawn now (cell units); false in done when its slide has finished
		function drawnXY(num, cell, now) {
			var to = cellXY(cell);
			var a = anims[num];
			if (!a) {
				return [to[0], to[1], true];
			}
			var t = (now - a.t0) / SLIDE_MS;
			if (t >= 1) {
				delete anims[num];
				return [to[0], to[1], true];
			}
			var k = ease(Math.max(0, t));
			return [a.fx + (to[0] - a.fx) * k, a.fy + (to[1] - a.fy) * k, false];
		}

		function tileColors(num) {
			var scheme = kernel.getProp('vrcSlideCol', 'theme');
			var home = num - 1;
			var row = Math.floor(home / size), col = home % size;
			if (scheme == 'rows' || scheme == 'fringe') {
				var cols = (kernel.getProp('col15p') || '#f99#9f9#99f#fff').match(/#[0-9a-fA-F]{3,6}/g) || ['#ccc'];
				var idx = scheme == 'rows' ? row : Math.min(row, col);
				if (scheme == 'fringe' && idx == size - 1) {
					idx = cols.length - 1; // as the scramble image
				}
				var fill = cols[Math.min(idx, cols.length - 1)];
				return [fill, isDark(fill) ? '#fff' : '#222'];
			}
			return [kernel.getProp('col-button') || '#ffccdd', kernel.getProp('col-font') || '#552233'];
		}

		function render() {
			raf = 0;
			var el = /** @type {HTMLCanvasElement} */ (canvas[0]);
			if (!cssSize) {
				return;
			}
			var dpr = window.devicePixelRatio || 1;
			var px = Math.round(cssSize * dpr);
			if (el.width != px) {
				el.width = px;
				el.height = px;
			}
			var ctx = el.getContext('2d');
			if (!ctx) {
				return;
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			var S = cssSize;
			ctx.clearRect(0, 0, S, S);
			var fontCol = kernel.getProp('col-font') || '#552233';
			var back = kernel.getProp('col-back') || '#ffeeee';
			var pad = S * 0.035;
			roundRect(ctx, 0, 0, S, S, S * 0.045);
			ctx.fillStyle = mix(back, fontCol, 0.1);
			ctx.globalAlpha = 0.85; // the page shows through the frame a little
			ctx.fill();
			ctx.globalAlpha = 1;
			var cell = (S - 2 * pad) / size;
			var gap = Math.max(1.5, cell * 0.06);
			var rad = cell * 0.14;
			var depth = Math.max(1, cell * 0.035);
			var family = $('body').css('font-family') || 'sans-serif';
			ctx.font = '600 ' + Math.round(cell * (size == 4 ? 0.4 : 0.42)) + 'px ' + family;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			var now = performance.now();
			var moving = false;
			for (var i = 0; i < state.tiles.length; i++) {
				var num = state.tiles[i];
				if (!num) {
					continue;
				}
				var xy = drawnXY(num, i, now);
				moving = moving || !xy[2];
				var x = pad + xy[0] * cell + gap / 2, y = pad + xy[1] * cell + gap / 2, w = cell - gap;
				var cs = tileColors(num);
				roundRect(ctx, x, y + depth, w, w - depth, rad);
				ctx.fillStyle = mix(cs[0], fontCol, 0.28);
				ctx.fill();
				roundRect(ctx, x, y, w, w - depth, rad);
				ctx.fillStyle = cs[0];
				ctx.fill();
				ctx.fillStyle = cs[1];
				ctx.fillText(String(num), x + w / 2, y + (w - depth) / 2 + cell * 0.02);
			}
			if (moving) {
				raf = requestAnimationFrame(render);
			}
		}

		function redraw() {
			if (!raf) {
				render();
			}
		}
		this.redraw = function() {
			raf && cancelAnimationFrame(raf);
			render();
		};

		this.resize = function() {
			var w = container.width() || 0, h = container.height() || 0;
			var side = Math.min(w || h, h || w);
			// a little smaller than its box, about the size the cube is drawn at
			cssSize = Math.max(50, Math.floor(side * 0.88));
			canvas.css({ width: cssSize + 'px', height: cssSize + 'px', 'margin-top': Math.max(0, Math.floor(((h || side) - cssSize) / 2)) + 'px' });
			that.redraw();
		};

		// ---------- moves ----------
		function fits(move) {
			return move && move[1] >= 1 && move[1] <= puzzleSlide.room(state, move[0]);
		}

		// apply to the model; animate the moved tiles unless instant
		function doMove(move, animate) {
			var moved = puzzleSlide.apply(state, { d: move[0], n: move[1] });
			if (!moved) {
				return false;
			}
			counter += move[1];
			if (move[0] != lastDir) {
				mtm++;
			}
			lastDir = move[0];
			var now = performance.now();
			var instant = !animate || ~~kernel.getProp('vrcSpeed', 25) == 0 || reducedMotion();
			for (var i = 0; i < moved.length; i++) {
				var num = state.tiles[moved[i][1]];
				if (instant) {
					delete anims[num];
					continue;
				}
				var cur = drawnXY(num, moved[i][0], now);
				anims[num] = { fx: cur[0], fy: cur[1], t0: now };
			}
			return true;
		}

		function fire(movets, step) {
			for (var i = 0; i < listeners.length; i++) {
				listeners[i] && listeners[i](movets[0], step, movets[1]);
			}
		}

		this.addMoveListener = function(listener) {
			listeners.push(listener);
		};
		this.removeMoveListener = function(listener) {
			var index = listeners.indexOf(listener);
			delete listeners[index];
		};

		// moves entered by the solver (keys, clicks, replay playback): each is started, applied and finished at once
		this.addMoves = function(moves, ts) {
			var timestamp = ts || keyTs || $.now();
			for (var i = 0; i < moves.length; i++) {
				if (!fits(moves[i])) {
					continue;
				}
				var movets = [moves[i].slice(), timestamp];
				fire(movets, 0);
				doMove(moves[i], true);
				fire(movets, 2);
			}
			redraw();
		};

		// moves applied without animation (scramble, replay seeking)
		this.applyMoves = function(moves, ts) {
			var timestamp = ts || $.now();
			for (var i = 0; i < moves.length; i++) {
				if (doMove(moves[i], false)) {
					fire([moves[i].slice(), timestamp], 2);
				}
			}
			that.redraw();
		};

		this.isMoveFinished = function() {
			return true;
		};
		this.isAnimationFinished = function() {
			return true;
		};

		// ---------- input ----------
		function enter(move, ts) {
			if (fits(move)) {
				that.addMoves([move], ts);
			}
		}

		this.keydown = function(e) {
			if (e.altKey || e.ctrlKey || e.metaKey || !(e.keyCode in KEYS)) {
				return;
			}
			var dir = KEYS[e.keyCode];
			var d = kernel.getProp('vrcSlideDir', 't') == 'b' ? 3 - dir : dir; // the blank going one way = a tile the other
			keyTs = e.ts || 0;
			try {
				enter([d, 1], keyTs);
			} finally {
				keyTs = 0;
			}
			kernel.clrKey(); // arrow keys must not scroll the page
		};

		function cellAt(clientX, clientY) {
			var rect = canvas[0].getBoundingClientRect();
			var pad = rect.width * 0.035;
			var cell = (rect.width - 2 * pad) / size;
			var cx = Math.floor((clientX - rect.left - pad) / cell), cy = Math.floor((clientY - rect.top - pad) / cell);
			if (cx < 0 || cy < 0 || cx >= size || cy >= size) {
				return -1;
			}
			return cy * size + cx;
		}

		function tapCell(idx, ts) {
			if (idx < 0) {
				return;
			}
			var mv = puzzleSlide.moveTo(state, idx);
			mv && enter([mv.d, mv.n], ts);
		}

		var touch = null; // {x, y, cell, swiped}

		function onMouseDown(e) {
			if (e.button != 0) {
				return;
			}
			tapCell(cellAt(e.clientX, e.clientY), $.eventTime(e));
			e.preventDefault();
		}

		function onTouchStart(e) {
			var t = e.originalEvent.changedTouches[0];
			touch = { x: t.clientX, y: t.clientY, cell: cellAt(t.clientX, t.clientY), swiped: false };
		}

		function onTouchMove(e) {
			if (!touch) {
				return;
			}
			var t = e.originalEvent.changedTouches[0];
			var dx = t.clientX - touch.x, dy = t.clientY - touch.y;
			var cell = (canvas[0].getBoundingClientRect().width * 0.93) / size;
			var dist = Math.max(Math.abs(dx), Math.abs(dy));
			if (dist < cell * (touch.swiped ? 0.6 : 0.3)) {
				return;
			}
			var d = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 0 : 3);
			var n = 1;
			var line = !touch.swiped && touch.cell >= 0 ? puzzleSlide.moveTo(state, touch.cell) : null;
			if (line && line.d == d) {
				n = line.n; // swiping a tile towards the blank pushes the tiles between too
			}
			enter([d, n], $.eventTime(e));
			touch.x = t.clientX;
			touch.y = t.clientY;
			touch.swiped = true;
			e.preventDefault();
		}

		function onTouchEnd(e) {
			if (!touch) {
				return;
			}
			var t = touch;
			touch = null;
			if (!t.swiped) {
				tapCell(t.cell, $.eventTime(e));
			}
		}

		// ---------- the puzzle object ----------
		this.initializeTwisty = function(options) {
			var info = puzzleSlide.info(options['type']) || [4, false];
			size = info[0];
			blankNotation = info[1];
			arrows = false;
			state = puzzleSlide.solved(size);
			anims = {};
			counter = mtm = 0;
			lastDir = -1;
			canvas.off('mousedown touchstart touchmove touchend touchcancel');
			if (options['allowDragging']) {
				canvas.on('mousedown', onMouseDown);
				canvas.on('touchstart', onTouchStart);
				canvas.on('touchmove', onTouchMove);
				canvas.on('touchend', onTouchEnd);
				canvas.on('touchcancel', function() {
					touch = null;
				});
			}
			twisty = {
				type: options,
				options: { dimension: size },
				isInspectionLegalMove: function() {
					return false; // nothing to do in inspection: the first slide starts the clock
				},
				move2str: function(move) {
					return puzzleSlide.toStr({ d: move[0], n: move[1] }, blankNotation, arrows);
				},
				moveInv: function(move) {
					return [3 - move[0], move[1]];
				},
				toggleColorVisible: $.noop,
				isSolved: function() {
					return puzzleSlide.isSolved(state) ? 0 : 1;
				},
				// single-tile moves (STM); slideCounts() has both metrics
				moveCnt: function(clr) {
					if (clr) {
						counter = mtm = 0;
						lastDir = -1;
					}
					return counter;
				},
				slideCounts: function() {
					return [counter, mtm];
				},
				// addPreScr is set when the virtual timer scrambles for a new attempt: start from solved (the puzzle may
				// have been played with while idle), and log in the scramble's own symbols
				parseScramble: function(scramble, addPreScr) {
					if (addPreScr) {
						state = puzzleSlide.solved(size);
						anims = {};
					}
					if (/[ULRD￩-￬]/.test(scramble || '')) {
						arrows = puzzleSlide.usesArrows(scramble);
					}
					return puzzleSlide.parse(scramble, blankNotation).map(function(m) {
						return [m.d, m.n];
					});
				},
				slideState: function() {
					return puzzleSlide.clone(state);
				}
			};
			if (scenes.indexOf(that) == -1) {
				scenes.push(that);
			}
			that.resize();
		};
	}

	W['twistyjs'].slide = { TwistyScene: SlideScene, scenes: scenes };

	kernel.regListener('slide', 'property', function() {
		for (var i = 0; i < scenes.length; i++) {
			if ($.contains(document.documentElement, scenes[i].getDomElement()[0])) {
				scenes[i].redraw();
			}
		}
	}, /^(col-(font|back|button)|col15p|vrcSlideCol)$/);
})();
