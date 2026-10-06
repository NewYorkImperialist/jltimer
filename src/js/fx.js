"use strict";

// jlTimer move effects: visual flourishes on the virtual cube when a layer turns.
// Each effect lives in js/fx/<id>.js and calls jlFx.register({...}):
//   id, name                 'sparks', 'Spark Burst'
//   v2                       optional: true lists it under "Layer highlight (v2)" (effects on the turning layer itself)
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
//   box(ev, inflate) v3: the turning slab as a box at its live rotation: faces [{poly, visible, side, outer}],
//                    .moving while the twisty animates it; call it every frame to follow the turn
//   layer(ev)        the turning slab: strips/cap polygons and belt(t, depth) path (see layer() below)
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

	// the active effects: one from "Move effect" (v1) and one from "Layer highlight (v2)"; both may run together
	function actives() {
		var ids = [kernel.getProp('jlFx', 'none'), kernel.getProp('jlFxV2', 'none'), kernel.getProp('jlFxV3', 'none')];
		var ret = [];
		for (var i = 0; i < effects.length; i++) {
			var want = ids[effects[i].v3 ? 2 : effects[i].v2 ? 1 : 0];
			if (effects[i].id == want) {
				ret.push(effects[i]);
			}
		}
		return ret;
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
		var v1 = effects.filter(function(e) { return !e.v2 && !e.v3; });
		var v2 = effects.filter(function(e) { return e.v2; });
		var v3 = effects.filter(function(e) { return e.v3; });
		kernel.regProp('vrc', 'jlFx', 1, 'Move effect', ['none',
			['none'].concat(v1.map(function(e) { return e.id; })),
			['None'].concat(v1.map(function(e) { return e.name; }))]);
		kernel.regProp('vrc', 'jlFxV2', 1, 'Layer highlight (v2)', ['none',
			['none'].concat(v2.map(function(e) { return e.id; })),
			['None'].concat(v2.map(function(e) { return e.name; }))]);
		kernel.regProp('vrc', 'jlFxV3', 1, 'Layer laser (v3)', ['none',
			['none'].concat(v3.map(function(e) { return e.id; })),
			['None'].concat(v3.map(function(e) { return e.name; }))]);
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

	// ---------- layer geometry (v2): the slab of the cube that turns ----------
	// cube coordinates span -0.5..0.5; S scales them to the sticker surface used by face()
	var S = 0.86;
	var AXES = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
	var FACE_OF_AXIS = { '0,1,0': 'U', '0,-1,0': 'D', '1,0,0': 'R', '-1,0,0': 'L', '0,0,1': 'F', '0,0,-1': 'B' };

	function cross(a, b) {
		return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	}

	function surf(p) { // cube coordinates -> overlay screen point
		return project([p[0] * S, p[1] * S, p[2] * S]);
	}

	var visCache = {};

	function faceVisible(f) {
		if (!(f in visCache)) {
			visCache[f] = face(f).visible;
		}
		return visCache[f];
	}

	// layer(ev) describes the turning slab:
	//   axis: face letter ('R'...), near/far: slab bounds along the axis (cube coords, near is the outer side)
	//   whole: true for x/y/z rotations (the slab is the whole cube)
	//   strips: [{face, poly:[4 {x,y}], visible}] - the slab's band on each of the 4 side faces
	//   cap: {face, poly, visible} - the turning face itself (null for middle slices)
	//   belt(t, depth): screen point on the loop around the slab, t in turns (0..1 = once around, increasing t
	//          follows the turn direction for amount > 0), depth 0..1 across the slab; returns {x, y, visible, face}
	//   dir: +1/-1 turn direction, quarter: number of quarter turns (1 or 2)
	function layer(ev) {
		visCache = {};
		var f = ev.face, n = AXES[f], dim = ev.dim || 3;
		var a = ev.layers ? ev.layers[0] : 1, b = ev.layers ? ev.layers[1] : 1;
		if (b < 0) {
			b = dim + 1 + b;
		}
		b = Math.min(b, dim);
		var near = 0.5 - (a - 1) / dim, far = 0.5 - b / dim;
		// tangents: e1 any perpendicular, e2 = (-n) x e1 so that increasing angle follows a positive turn
		var e1 = Math.abs(n[1]) ? [1, 0, 0] : [0, 1, 0];
		var e2 = cross([-n[0], -n[1], -n[2]], e1);
		var dir = ev.amount < 0 ? -1 : 1;

		function pt(s, u, v) { // s along axis, u,v along e1,e2 (cube coords)
			return [n[0] * s + e1[0] * u + e2[0] * v, n[1] * s + e1[1] * u + e2[1] * v, n[2] * s + e1[2] * u + e2[2] * v];
		}
		var strips = [];
		[[e1, 1], [e2, 1], [e1, -1], [e2, -1]].forEach(function(side) {
			var nv = [side[0][0] * side[1], side[0][1] * side[1], side[0][2] * side[1]];
			var other = side[0] === e1 ? e2 : e1;
			var fc = FACE_OF_AXIS[nv.join(',')];
			var poly = [[near, -1], [near, 1], [far, 1], [far, -1]].map(function(q) {
				var p = [n[0] * q[0] + nv[0] * 0.5 + other[0] * q[1] * 0.5, n[1] * q[0] + nv[1] * 0.5 + other[1] * q[1] * 0.5,
					n[2] * q[0] + nv[2] * 0.5 + other[2] * q[1] * 0.5];
				return surf(p);
			});
			strips.push({ face: fc, poly: poly, visible: faceVisible(fc) });
		});
		var cap = null;
		if (a == 1) {
			cap = { face: f, visible: faceVisible(f), poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function(q) {
				return surf(pt(0.5, q[0] * 0.5, q[1] * 0.5));
			}) };
		}
		if (b == dim && a > 1) { // slab reaches the opposite face (e.g. wide move from the far side)
			var of = FACE_OF_AXIS[[-n[0], -n[1], -n[2]].join(',')];
			cap = { face: of, visible: faceVisible(of), poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function(q) {
				return surf(pt(-0.5, q[0] * 0.5, q[1] * 0.5));
			}) };
		}
		return {
			axis: f,
			near: near,
			far: far,
			whole: !!ev.rotation || (a == 1 && b == dim),
			dir: dir,
			quarter: Math.abs(ev.amount) % 4 == 2 ? 2 : 1,
			strips: strips,
			cap: cap,
			belt: function(t, depth) {
				var th = t * Math.PI * 2;
				var c = Math.cos(th), s2 = Math.sin(th), m = Math.max(Math.abs(c), Math.abs(s2)) || 1;
				var u = c / m * 0.5, v = s2 / m * 0.5;
				var s = near + (far - near) * (depth == null ? 0.5 : depth);
				var p = pt(s, u, v);
				var fc = Math.abs(u) >= Math.abs(v) ? FACE_OF_AXIS[(u > 0 ? e1 : e1.map(function(x) { return -x; })).join(',')] :
					FACE_OF_AXIS[(v > 0 ? e2 : e2.map(function(x) { return -x; })).join(',')];
				var q = surf(p);
				return { x: q.x, y: q.y, visible: faceVisible(fc), face: fc };
			}
		};
	}

	// ---------- live layer box (v3): the turning slab as a 3D box, rotated as far as the animation has got ----------
	// angle(ev): current rotation in radians (0 before the turn starts, full turn once it has finished)
	function liveAngle(ev) {
		var st = puzzle.animState ? puzzle.animState() : [];
		for (var i = 0; i < st.length; i++) {
			if (st[i].move === ev.raw) {
				return { angle: Math.min(1, st[i].progress) * (ev.amount || 1) * Math.PI / 2, moving: true };
			}
		}
		return { angle: ev.phase == 'end' || ev.done ? (ev.amount || 1) * Math.PI / 2 : 0, moving: false };
	}

	function rotAxis(p, a, ang) { // rotate p about unit axis a by ang (right hand)
		var c = Math.cos(ang), s = Math.sin(ang), d = p[0] * a[0] + p[1] * a[1] + p[2] * a[2];
		var x = cross(a, p);
		return [p[0] * c + x[0] * s + a[0] * d * (1 - c), p[1] * c + x[1] * s + a[1] * d * (1 - c), p[2] * c + x[2] * s + a[2] * d * (1 - c)];
	}

	// box(ev, inflate): faces of the turning slab at its current angle
	//   [{poly:[4 {x,y}], visible, side: true for the 4 faces around the axis, outer: true if on the cube surface}]
	//   plus .moving (the twisty is still animating this move) and .angle
	function box(ev, inflate) {
		var f = ev.face, n = AXES[f], dim = ev.dim || 3;
		var a0 = ev.layers ? ev.layers[0] : 1, b0 = ev.layers ? ev.layers[1] : 1;
		if (b0 < 0) {
			b0 = dim + 1 + b0;
		}
		b0 = Math.min(b0, dim);
		var near = 0.5 - (a0 - 1) / dim, far = 0.5 - b0 / dim;
		var k = 1 + (inflate || 0.03);
		var e1 = Math.abs(n[1]) ? [1, 0, 0] : [0, 1, 0];
		var e2 = cross(n, e1);
		var la = liveAngle(ev);
		var axis = [-n[0], -n[1], -n[2]]; // twisty turns a face about minus its normal
		var cam = puzzle.cameraPos ? puzzle.cameraPos() : null;

		function world(s, u, v) {
			var p = [n[0] * s + e1[0] * u + e2[0] * v, n[1] * s + e1[1] * u + e2[1] * v, n[2] * s + e1[2] * u + e2[2] * v];
			p = rotAxis(p, axis, la.angle);
			return [p[0] * S * k, p[1] * S * k, p[2] * S * k];
		}

		function faceOf(centre, normal, pts, side, outer) {
			var nr = rotAxis(normal, axis, la.angle);
			var c = world(centre[0], centre[1], centre[2]);
			var vis = cam ? (nr[0] * (cam[0] - c[0]) + nr[1] * (cam[1] - c[1]) + nr[2] * (cam[2] - c[2])) > 0 : true;
			return { poly: pts.map(function(q) {
				return project(world(q[0], q[1], q[2]));
			}), visible: vis, side: side, outer: outer };
		}
		var faces = [];
		var h = 0.5;
		// four side faces
		[[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function(d) {
			var nn = [e1[0] * d[0] + e2[0] * d[1], e1[1] * d[0] + e2[1] * d[1], e1[2] * d[0] + e2[2] * d[1]];
			var pts = [];
			if (d[0]) {
				pts = [[near, d[0] * h, -h], [near, d[0] * h, h], [far, d[0] * h, h], [far, d[0] * h, -h]];
			} else {
				pts = [[near, -h, d[1] * h], [near, h, d[1] * h], [far, h, d[1] * h], [far, -h, d[1] * h]];
			}
			faces.push(faceOf([(near + far) / 2, d[0] * h, d[1] * h], nn, pts, true, true));
		});
		// end caps (only the ones on the cube surface are really visible)
		var sq = [[-h, -h], [h, -h], [h, h], [-h, h]];
		faces.push(faceOf([near, 0, 0], n, sq.map(function(q) {
			return [near, q[0], q[1]];
		}), false, Math.abs(near - 0.5) < 1e-6));
		faces.push(faceOf([far, 0, 0], [-n[0], -n[1], -n[2]], sq.map(function(q) {
			return [far, q[0], q[1]];
		}), false, Math.abs(far + 0.5) < 1e-6));
		faces.moving = la.moving;
		faces.angle = la.angle;
		return faces;
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
		layer: layer,
		box: box,
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
		var list = actives();
		if (!list.length || !puzzle || !layout()) {
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
			raw: raw,
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
		list.forEach(function(e) {
			try {
				e.onMove(api, ev);
			} catch (err) {
				DEBUG && console.log('[fx]', err);
			}
		});
	}

	function each(fnName, arg) {
		if (!puzzle || !layout()) {
			return;
		}
		actives().forEach(function(e) {
			if (e[fnName]) {
				try {
					e[fnName](api, arg);
				} catch (err) {
					DEBUG && console.log('[fx]', err);
				}
			}
		});
	}

	function onSolve(info) {
		each('onSolve', info || {});
	}

	function onScramble() {
		combo = 0;
		turnTimes = [];
		each('onScramble');
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
