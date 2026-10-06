"use strict";

// jlTimer move effects: visual flourishes on the virtual cube when a layer turns.
// Each effect lives in js/fx/<id>.js and calls jlFx.register({...}):
//   id, name                 'sparks', 'Spark Burst'
//   onMove(api, ev)          a layer started turning (ev.phase 'start') or finished ('end')
//   onSolve(api, ev)         optional: the cube was solved at the end of a timed solve
//   onScramble(api)          optional: a new attempt was scrambled (space pressed)
// ev = { move: "R'", face: 'R', amount: -1 (quarter turns, sign = direction), layers: [from, to],
//        dim: 3, phase: 'start'|'end', rotation: true for x/y/z, tps: recent turns per second,
//        combo: turns in the current fast streak, solving: true while the timer runs, time: ms }
// api = {
//   ctx, w, h        2D context and size (CSS px) of the overlay; it covers the cube plus a margin
//   face(f)          { center:{x,y}, corners:[4 x {x,y}], normal:{x,y} (screen direction pointing out of the face),
//                      color:'#rrggbb' (sticker color), visible: true if the face points towards the viewer }
//   cube()           { center:{x,y}, radius } of the cube on the overlay
//   add(fn)          run fn(ctx, t, dt) every frame (t = ms since added) until it returns false
//   shake(px, ms)    shake the cube container briefly (keep it subtle)
//   rand()           seeded random 0..1 (deterministic per page load)
//   reduced          true if the user prefers reduced motion (keep effects minimal then)
// }
// Effects only draw; they never touch timing, moves or input. The overlay ignores the mouse.
var jlFx = execMain(function() {
	var effects = [];
	var isReady = false;
	var overlay = $('<canvas class="jlfx">');
	var ctx = overlay[0].getContext('2d');
	var host = null; // the virtual cube's container div
	var puzzle = null;
	var anims = [];
	var rafId = 0;
	var lastFrame = 0;
	var W = 0, H = 0, MARGIN = 0.35;
	var cubeOffset = { x: 0, y: 0 };
	var turnTimes = [];
	var combo = 0;
	var seed = 20261006;
	var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

	// face normals in the cube's world space (U up, R right, F towards the viewer); the cube spans about +-0.5
	var NORMALS = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
	var TANGENTS = { U: [[1, 0, 0], [0, 0, 1]], D: [[1, 0, 0], [0, 0, 1]], R: [[0, 1, 0], [0, 0, 1]], L: [[0, 1, 0], [0, 0, 1]],
		F: [[1, 0, 0], [0, 1, 0]], B: [[1, 0, 0], [0, 1, 0]] };
	var FACE_ORDER = 'URFDLB'; // colcube order is U R F D L B

	function rand() {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	}

	function current() {
		var id = kernel.getProp('jlFx', 'none');
		for (var i = 0; i < effects.length; i++) {
			if (effects[i].id == id) {
				return effects[i];
			}
		}
		return null;
	}

	function register(e) {
		if (!e || !/^[a-z0-9-]+$/.test(e.id) || typeof e.onMove != 'function') {
			return false;
		}
		for (var i = 0; i < effects.length; i++) {
			if (effects[i].id == e.id) {
				return false;
			}
		}
		effects.push(e);
		if (isReady) {
			regProp();
		}
		return true;
	}

	function regProp() {
		kernel.regProp('vrc', 'jlFx', 1, 'Move effect', ['none',
			['none'].concat(effects.map(function(e) { return e.id; })),
			['None'].concat(effects.map(function(e) { return e.name; }))]);
	}

	// ---------- geometry ----------
	function project(p) {
		var q = puzzle && puzzle.project(p[0], p[1], p[2]);
		return q ? { x: q.x + cubeOffset.x, y: q.y + cubeOffset.y } : { x: W / 2, y: H / 2 };
	}

	function stickerColor(f) {
		var cols = (kernel.getProp('colcube') || '#ff0#fa0#00f#fff#f00#0d0').match(/#[0-9a-fA-F]{3}/g) || [];
		var c = cols[FACE_ORDER.indexOf(f)] || '#fff';
		return $.nearColor(c, 0, true);
	}

	function face(f) {
		var n = NORMALS[f], t = TANGENTS[f];
		if (!n) {
			return null;
		}
		var h = 0.43; // outer edge of the stickers (the cube body is about +-0.5)
		var c3 = [n[0] * h, n[1] * h, n[2] * h];
		var center = project(c3);
		var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function(s) {
			return project([c3[0] + (t[0][0] * s[0] + t[1][0] * s[1]) * h, c3[1] + (t[0][1] * s[0] + t[1][1] * s[1]) * h,
				c3[2] + (t[0][2] * s[0] + t[1][2] * s[1]) * h]);
		});
		var out = project([n[0], n[1], n[2]]);
		var mid = project([0, 0, 0]);
		var dx = out.x - mid.x, dy = out.y - mid.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
		// visible if the projected quad winds towards the viewer (tangent pairs of U, L, B are mirrored)
		var a = corners[0], b = corners[1], c = corners[2];
		var cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
		var facing = 'ULB'.indexOf(f) != -1 ? cross > 1 : cross < -1;
		return { center: center, corners: corners, normal: { x: dx / len, y: dy / len }, color: stickerColor(f), visible: facing };
	}

	function cube() {
		var c = project([0, 0, 0]);
		var e = project([0.43, 0.43, 0.43]);
		return { center: c, radius: Math.max(20, Math.sqrt(Math.pow(e.x - c.x, 2) + Math.pow(e.y - c.y, 2))) };
	}

	// ---------- overlay ----------
	function layout() {
		if (!host || !puzzle) {
			return false;
		}
		var canvas = $(puzzle.getDomElement()).find('canvas')[0];
		if (!canvas) {
			return false;
		}
		var r = canvas.getBoundingClientRect(), hr = host[0].getBoundingClientRect();
		var mx = r.width * MARGIN, my = r.height * MARGIN;
		W = Math.round(r.width + 2 * mx);
		H = Math.round(r.height + 2 * my);
		cubeOffset = { x: mx, y: my };
		var dpr = window.devicePixelRatio || 1;
		if (overlay[0].width != Math.round(W * dpr) || overlay[0].height != Math.round(H * dpr)) {
			overlay[0].width = Math.round(W * dpr);
			overlay[0].height = Math.round(H * dpr);
		}
		overlay.css({ left: (r.left - hr.left - mx) + 'px', top: (r.top - hr.top - my) + 'px', width: W + 'px', height: H + 'px' });
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		return true;
	}

	var api = {
		ctx: ctx,
		face: face,
		cube: cube,
		add: function(fn) {
			anims.push({ fn: fn, start: performance.now() });
			if (!rafId) {
				lastFrame = performance.now();
				rafId = requestAnimationFrame(frame);
			}
		},
		shake: function(px, ms) {
			if (reduced || !host) {
				return;
			}
			var start = performance.now();
			api.add(function(c, t) {
				var k = Math.max(0, 1 - t / ms);
				host.css('transform', k > 0 ? 'translate(' + ((rand() - 0.5) * 2 * px * k).toFixed(1) + 'px,' + ((rand() - 0.5) * 2 * px * k).toFixed(1) + 'px)' : '');
				return k > 0;
			});
		},
		rand: rand,
		reduced: reduced
	};
	Object.defineProperty(api, 'w', { get: function() { return W; } });
	Object.defineProperty(api, 'h', { get: function() { return H; } });

	function frame(now) {
		var dt = Math.min(64, now - lastFrame);
		lastFrame = now;
		ctx.clearRect(0, 0, W, H);
		var alive = [];
		for (var i = 0; i < anims.length; i++) {
			var a = anims[i];
			var keep = false;
			try {
				ctx.save();
				keep = a.fn(ctx, now - a.start, dt) !== false;
				ctx.restore();
			} catch (e) {
				DEBUG && console.log('[fx]', e);
			}
			if (keep && now - a.start < 10000) { // no effect may run longer than 10 s
				alive.push(a);
			}
		}
		anims = alive;
		rafId = anims.length ? requestAnimationFrame(frame) : 0;
		if (!anims.length) {
			ctx.clearRect(0, 0, W, H);
			host && host.css('transform', '');
		}
	}

	// ---------- events from the virtual cube (timer/virtual.js) ----------
	function attach(puzzleObj, div) {
		puzzle = puzzleObj;
		host = div;
		if (overlay.parent()[0] !== div[0]) {
			div.css('position', 'relative');
			overlay.appendTo(div);
		}
	}

	function onMove(moveStr, raw, phase, solving) {
		var e = current();
		if (!e || !puzzle || !layout()) {
			return;
		}
		var now = performance.now();
		if (phase == 'start') {
			turnTimes.push(now);
			while (turnTimes.length && now - turnTimes[0] > 1000) {
				turnTimes.shift();
			}
			combo = turnTimes.length > 1 && now - turnTimes[turnTimes.length - 2] < 450 ? combo + 1 : 1;
		}
		var m = /^\s*([0-9]*)([A-Za-z]+)/.exec(moveStr || '') || [];
		var f = (raw && raw[2]) || (m[2] || '').charAt(0).toUpperCase();
		var ev = {
			move: $.trim(moveStr || ''),
			face: 'URFDLB'.indexOf(f) == -1 ? 'U' : f,
			amount: raw && raw[3] || 1,
			layers: raw ? [raw[0], raw[1]] : [1, 1],
			dim: puzzle.twisty && puzzle.twisty.options && puzzle.twisty.options.dimension || 3,
			phase: phase,
			rotation: puzzle.isRotation(raw),
			tps: turnTimes.length,
			combo: combo,
			solving: !!solving,
			time: now
		};
		try {
			e.onMove(api, ev);
		} catch (err) {
			DEBUG && console.log('[fx]', err);
		}
	}

	function onSolve(info) {
		var e = current();
		if (e && e.onSolve && puzzle && layout()) {
			try {
				e.onSolve(api, info || {});
			} catch (err) {
				DEBUG && console.log('[fx]', err);
			}
		}
	}

	function onScramble() {
		var e = current();
		combo = 0;
		turnTimes = [];
		if (e && e.onScramble && puzzle && layout()) {
			try {
				e.onScramble(api);
			} catch (err) {
				DEBUG && console.log('[fx]', err);
			}
		}
	}

	$(function() {
		regProp();
		isReady = true;
	});

	return {
		register: register,
		list: function() {
			return effects.slice();
		},
		attach: attach,
		onMove: onMove,
		onSolve: onSolve,
		onScramble: onScramble,
		api: api
	};
});
