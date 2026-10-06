"use strict";

// Crystal Shards: glassy triangular shards in the sticker color burst off the turning face's silhouette edge,
// tumble (2D spin + a fake 3D flip that flashes a white specular edge) and fade while falling.
// The solve shatters a ring of shards around the whole cube.
(function() {
	var MAX_SHARDS = 180, MAX_SOLVE = 200, MAX_GLINTS = 24;
	var shards = [];
	var glints = [];
	var rings = [];
	var pending = [];
	var hull = null; // silhouette polygon of the cube body, recomputed per event
	var loopId = 0, loopStart = 0, running = false;
	var FACES = 'URFDLB';

	function now() {
		return performance.now();
	}

	// ---------- geometry ----------
	function convexHull(pts) {
		pts = pts.slice().sort(function(a, b) {
			return a.x - b.x || a.y - b.y;
		});
		function cross(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lower = [], upper = [], i;
		for (i = 0; i < pts.length; i++) {
			while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
				lower.pop();
			}
			lower.push(pts[i]);
		}
		for (i = pts.length - 1; i >= 0; i--) {
			while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
				upper.pop();
			}
			upper.push(pts[i]);
		}
		lower.pop();
		upper.pop();
		return lower.concat(upper);
	}

	function distToSeg(p, a, b) {
		var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
		var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
		var x = a.x + dx * t - p.x, y = a.y + dy * t - p.y;
		return Math.sqrt(x * x + y * y);
	}

	function onHull(p, poly) {
		for (var i = 0; i < poly.length; i++) {
			if (distToSeg(p, poly[i], poly[(i + 1) % poly.length]) < 2.5) {
				return true;
			}
		}
		return false;
	}

	// hull of all sticker corners, plus a slightly inflated copy that matches the cube body
	function computeHull(api) {
		var pts = [];
		for (var i = 0; i < 6; i++) {
			pts = pts.concat(api.face(FACES.charAt(i)).corners);
		}
		var inner = convexHull(pts);
		var c = api.cube().center;
		var body = inner.map(function(p) {
			return { x: c.x + (p.x - c.x) * 1.14, y: c.y + (p.y - c.y) * 1.14 };
		});
		hull = { inner: inner, body: body, center: c };
		return hull;
	}

	function inside(x, y, poly) {
		// convex polygon, any winding
		var sign = 0;
		for (var i = 0; i < poly.length; i++) {
			var a = poly[i], b = poly[(i + 1) % poly.length];
			var cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
			if (cr != 0) {
				if (sign == 0) {
					sign = cr > 0 ? 1 : -1;
				} else if ((cr > 0 ? 1 : -1) != sign) {
					return false;
				}
			}
		}
		return true;
	}

	// silhouette edges of a face: quad edges that lie on the cube outline. Each edge is {a, b, nx, ny} with an
	// outward screen normal. Hidden faces get the outline edges they share with visible neighbours.
	function silhouetteEdges(api, f, hl) {
		var fc = api.face(f);
		var cs = fc.corners, out = [], i;
		var c = hl.center;
		for (i = 0; i < 4; i++) {
			var a = cs[i], b = cs[(i + 1) % 4];
			var m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			if (!onHull(m, hl.inner)) {
				continue;
			}
			var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
			if (len < 4) {
				continue;
			}
			var nx = -dy / len, ny = dx / len;
			if (nx * (m.x - c.x) + ny * (m.y - c.y) < 0) {
				nx = -nx;
				ny = -ny;
			}
			out.push({ a: a, b: b, nx: nx, ny: ny, len: len });
		}
		if (!out.length) {
			// fallback: outline edges facing the face's normal
			var hp = hl.inner;
			for (i = 0; i < hp.length; i++) {
				var p = hp[i], q = hp[(i + 1) % hp.length];
				var ex = q.x - p.x, ey = q.y - p.y, el = Math.sqrt(ex * ex + ey * ey) || 1;
				var ux = -ey / el, uy = ex / el;
				var mx = (p.x + q.x) / 2 - c.x, my = (p.y + q.y) / 2 - c.y;
				if (ux * mx + uy * my < 0) {
					ux = -ux;
					uy = -uy;
				}
				if (ux * fc.normal.x + uy * fc.normal.y > 0.35) {
					out.push({ a: p, b: q, nx: ux, ny: uy, len: el });
				}
			}
		}
		return { edges: out, face: fc };
	}

	// ---------- particles ----------
	function rgb(hex) {
		var h = (hex || '#ffffff').replace('#', '');
		if (h.length == 3) {
			h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
		}
		var n = parseInt(h, 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}

	function shade(c, k) {
		// k < 0 darken, k > 0 lighten
		var r = [];
		for (var i = 0; i < 3; i++) {
			r.push(Math.round(k < 0 ? c[i] * (1 + k) : c[i] + (255 - c[i]) * k));
		}
		return 'rgb(' + r.join(',') + ')';
	}

	function makeShard(api, x, y, vx, vy, size, color, life, cap) {
		var R = api.rand;
		// irregular sliver triangle around the origin: one long point, two near the base
		var ang = R() * Math.PI * 2;
		var len0 = size * (0.9 + R() * 0.6), wid = size * (0.45 + R() * 0.4);
		var col = rgb(color);
		var lum = (col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11) / 255;
		var s = {
			x: x, y: y, vx: vx, vy: vy,
			pts: [len0, 0, -len0 * 0.35, wid * (0.6 + R() * 0.6), -len0 * 0.45, -wid * (0.6 + R() * 0.6)],
			rot: ang, spin: (R() - 0.5) * 0.024, flip: R() * Math.PI * 2, flipV: (0.008 + R() * 0.016) * (R() < 0.5 ? -1 : 1),
			fill: shade(col, 0), back: shade(col, -0.2), dark: shade(col, lum > 0.75 ? -0.45 : -0.35), light: shade(col, 0.55),
			age: 0, life: life, cap: cap
		};
		shards.push(s);
		var max = cap || MAX_SHARDS;
		if (shards.length > max) {
			shards.splice(0, shards.length - max);
		}
	}

	function drawShard(ctx, s, alpha) {
		var c = Math.cos(s.rot), sn = Math.sin(s.rot);
		var fl = Math.cos(s.flip); // pseudo 3D: squash along the shard's width as it flips
		var p = s.pts, xs = [], ys = [];
		for (var i = 0; i < 3; i++) {
			var lx = p[i * 2], ly = p[i * 2 + 1] * fl;
			xs.push(s.x + lx * c - ly * sn);
			ys.push(s.y + lx * sn + ly * c);
		}
		var facing = Math.abs(fl);
		ctx.beginPath();
		ctx.moveTo(xs[0], ys[0]);
		ctx.lineTo(xs[1], ys[1]);
		ctx.lineTo(xs[2], ys[2]);
		ctx.closePath();
		ctx.globalAlpha = alpha * (0.72 + 0.25 * facing);
		ctx.fillStyle = fl > 0 ? s.fill : s.back;
		ctx.fill();
		ctx.globalAlpha = alpha * 0.8;
		ctx.lineWidth = 1;
		ctx.strokeStyle = s.dark;
		ctx.stroke();
		// glassy facet: tip, base midpoint and one base corner
		var mx = (xs[1] + xs[2]) / 2, my = (ys[1] + ys[2]) / 2;
		ctx.beginPath();
		ctx.moveTo(xs[0], ys[0]);
		ctx.lineTo(xs[1], ys[1]);
		ctx.lineTo(mx, my);
		ctx.closePath();
		ctx.globalAlpha = alpha * (0.2 + 0.45 * facing);
		ctx.fillStyle = s.light;
		ctx.fill();
		// white specular edge, flashes when the shard faces the viewer
		var spec = Math.pow(facing, 4);
		ctx.globalAlpha = alpha * (0.35 + 0.65 * spec);
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 1 + spec;
		ctx.beginPath();
		ctx.moveTo(xs[0], ys[0]);
		ctx.lineTo(xs[1], ys[1]);
		ctx.stroke();
	}

	// ---------- main loop (one shared animation; replaced before the framework's 10 s cap) ----------
	function ensureLoop(api) {
		var t = now();
		if (running && t - loopStart < 8000) {
			return;
		}
		var id = ++loopId;
		loopStart = t;
		running = true;
		api.add(function(ctx, tt, dt) {
			if (id != loopId) {
				return false;
			}
			return step(api, ctx, dt);
		});
	}

	function step(api, ctx, dt) {
		var t = now(), i;
		for (i = 0; i < pending.length; i++) {
			if (t >= pending[i].at) {
				pending[i].fn();
				pending.splice(i--, 1);
			}
		}
		var r = api.cube().radius;
		var g = r * 0.0000032, drag = Math.exp(-dt / 450);
		var body = hull && hull.body;

		// solve rings
		var keepR = [];
		for (i = 0; i < rings.length; i++) {
			var rg = rings[i];
			rg.age += dt;
			var k = rg.age / rg.life;
			if (k >= 1) {
				continue;
			}
			keepR.push(rg);
			var e = 1 - Math.pow(1 - k, 3);
			ctx.globalAlpha = (1 - k) * 0.85;
			ctx.strokeStyle = rg.color;
			ctx.beginPath();
			ctx.arc(rg.x, rg.y, rg.r0 + (rg.r1 - rg.r0) * e, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(90,110,150,0.35)';
			ctx.lineWidth = 3 + 5 * (1 - k);
			ctx.stroke();
			ctx.strokeStyle = rg.color;
			ctx.lineWidth = 1.5 + 2 * (1 - k);
			ctx.stroke();
		}
		rings = keepR;

		// edge glints
		var keepG = [];
		for (i = 0; i < glints.length; i++) {
			var gl = glints[i];
			gl.age += dt;
			var gk = gl.age / gl.life;
			if (gk >= 1) {
				continue;
			}
			keepG.push(gl);
			ctx.globalAlpha = (1 - gk) * gl.alpha;
			ctx.lineCap = 'round';
			for (var j = 0; j < gl.edges.length; j++) {
				var ed = gl.edges[j], o = gl.offset * gk;
				ctx.beginPath();
				ctx.moveTo(ed.a.x + ed.nx * o, ed.a.y + ed.ny * o);
				ctx.lineTo(ed.b.x + ed.nx * o, ed.b.y + ed.ny * o);
				ctx.strokeStyle = gl.color;
				ctx.lineWidth = gl.width;
				ctx.stroke();
				if (gl.core) {
					ctx.strokeStyle = '#fff';
					ctx.lineWidth = gl.width * 0.4;
					ctx.stroke();
				}
			}
		}
		glints = keepG;

		// shards
		var keepS = [];
		for (i = 0; i < shards.length; i++) {
			var s = shards[i];
			s.age += dt;
			if (s.age >= s.life) {
				continue;
			}
			keepS.push(s);
			s.vx *= drag;
			s.vy = s.vy * drag + g * dt;
			s.x += s.vx * dt;
			s.y += s.vy * dt;
			s.rot += s.spin * dt;
			s.flip += s.flipV * dt;
			var q = s.age / s.life;
			var a = Math.min(1, s.age / 40) * (1 - q * q);
			if (body && inside(s.x, s.y, body)) {
				a *= 0.22; // never hide stickers: a falling shard over the cube is barely there
			}
			if (a > 0.01) {
				drawShard(ctx, s, a);
			}
		}
		shards = keepS;
		ctx.globalAlpha = 1;

		if (!shards.length && !glints.length && !rings.length && !pending.length) {
			running = false;
			return false;
		}
		return true;
	}

	function addGlint(edges, color, life, alpha, width, offset, core) {
		glints.push({ edges: edges, color: color, life: life, alpha: alpha, width: width, offset: offset, core: core, age: 0 });
		if (glints.length > MAX_GLINTS) {
			glints.splice(0, glints.length - MAX_GLINTS);
		}
	}

	// ---------- events ----------
	function burst(api, ev, sil) {
		var R = api.rand, r = api.cube().radius;
		var edges = sil.edges, fc = sil.face;
		var combo = Math.min(ev.combo || 1, 12);
		var fast = (ev.tps || 0) >= 8;
		var count = ev.batch ? 3 : ev.rotation ? 5 : Math.round((fast ? 11 : 16) * (1 + combo * 0.05) * (ev.layers && ev.layers[1] > ev.layers[0] ? 1.3 : 1));
		var total = 0, i;
		for (i = 0; i < edges.length; i++) {
			total += edges[i].len;
		}
		if (!total) {
			return;
		}
		// shards fling slightly along the turn direction (clockwise as seen from outside the face)
		var dir = (ev.amount || 1) > 0 ? 1 : -1;
		if (!fc.visible) {
			dir = -dir;
		}
		var lifeK = fast ? 0.75 : 1;
		for (var n = 0; n < count; n++) {
			var pick = R() * total, ed = edges[0];
			for (i = 0; i < edges.length; i++) {
				ed = edges[i];
				if (pick < ed.len) {
					break;
				}
				pick -= ed.len;
			}
			var u = 0.06 + R() * 0.88;
			var x = ed.a.x + (ed.b.x - ed.a.x) * u + ed.nx * 2;
			var y = ed.a.y + (ed.b.y - ed.a.y) * u + ed.ny * 2;
			var tx = -(y - fc.center.y), ty = x - fc.center.x, tl = Math.sqrt(tx * tx + ty * ty) || 1;
			var sp = r * (ev.rotation ? 0.0012 : 0.0014 + R() * 0.0016) * (1 + combo * 0.02);
			var tang = r * 0.0009 * dir * (ev.rotation ? 0.4 : 1);
			var vx = ed.nx * sp + tx / tl * tang + (R() - 0.5) * r * 0.0006;
			var vy = ed.ny * sp + ty / tl * tang + (R() - 0.5) * r * 0.0006 - r * 0.0004;
			var white = !ev.rotation && R() < 0.08 + combo * 0.015;
			var size = r * (ev.rotation ? 0.065 : 0.08 + R() * 0.08);
			makeShard(api, x, y, vx, vy, size, white ? '#ffffff' : fc.color, (380 + R() * 260) * lifeK);
		}
	}

	var lastEv = 0;
	var OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

	function onMove(api, ev) {
		var hl = computeHull(api);
		var tNow = now();
		// scrambles apply many moves in the same instant: keep those tiny
		var batch = false;
		if (ev.phase == 'end') {
			batch = tNow - lastEv < 8;
			lastEv = tNow;
		}
		var sil = silhouetteEdges(api, ev.face, hl);
		if (!sil.edges.length) {
			return;
		}
		if (api.reduced) {
			if (ev.phase == 'end') {
				addGlint(sil.edges, sil.face.color, 220, 0.9, 3, 0, true);
				ensureLoop(api);
			}
			return;
		}
		if (ev.phase == 'start') {
			// a quick white crack along the edge that is about to shatter
			if (!ev.rotation) {
				addGlint(sil.edges, 'rgba(90,110,150,0.35)', 140, 0.85, 3, api.cube().radius * 0.04, true);
				ensureLoop(api);
			}
			return;
		}
		addGlint(sil.edges, sil.face.color, ev.rotation ? 160 : 220, ev.rotation ? 0.5 : 0.9, 3, api.cube().radius * 0.08, true);
		var bev = { face: ev.face, amount: ev.amount, layers: ev.layers, rotation: ev.rotation, combo: batch ? 1 : ev.combo, tps: ev.tps, batch: batch };
		burst(api, bev, sil);
		if (ev.rotation) {
			var sil2 = silhouetteEdges(api, OPP[ev.face], hl);
			if (sil2.edges.length) {
				bev.amount = -(ev.amount || 1);
				burst(api, bev, sil2);
			}
		}
		ensureLoop(api);
	}

	function onSolve(api) {
		var hl = computeHull(api);
		var cb = api.cube(), r = cb.radius, c = cb.center, R = api.rand;
		var colors = [];
		for (var i = 0; i < 6; i++) {
			colors.push(api.face(FACES.charAt(i)).color);
		}
		if (api.reduced) {
			addGlint(hl.body.map(function(p, k) {
				var q = hl.body[(k + 1) % hl.body.length];
				return { a: p, b: q, nx: 0, ny: 0 };
			}), 'rgba(90,110,150,0.45)', 500, 0.9, 3, 0, true);
			ensureLoop(api);
			return;
		}
		function wave(n, rad, speed, phase) {
			return function() {
				rings.push({ x: c.x, y: c.y, r0: rad * 0.95, r1: rad * 1.7, life: 650, age: 0, color: 'rgba(255,255,255,0.95)' });
				for (var k = 0; k < n; k++) {
					var a = (k + phase + R() * 0.6) / n * Math.PI * 2;
					var ca = Math.cos(a), sa = Math.sin(a);
					var sp = r * speed * (0.8 + R() * 0.5);
					var swirl = r * 0.0008;
					makeShard(api, c.x + ca * rad, c.y + sa * rad, ca * sp - sa * swirl, sa * sp + ca * swirl - r * 0.0006,
						r * (0.07 + R() * 0.08), R() < 0.15 ? '#ffffff' : colors[k % 6], 1100 + R() * 700, MAX_SOLVE);
				}
			};
		}
		shards = [];
		var t = now();
		pending.push({ at: t, fn: wave(48, r * 1.2, 0.0022, 0) });
		pending.push({ at: t + 160, fn: wave(40, r * 1.3, 0.0016, 0.5) });
		pending.push({ at: t + 340, fn: wave(32, r * 1.25, 0.0011, 0.25) });
		// whole outline flashes once as it shatters
		addGlint(hl.body.map(function(p, k) {
			var q = hl.body[(k + 1) % hl.body.length];
			var dx = q.x - p.x, dy = q.y - p.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
			var nx = -dy / l, ny = dx / l;
			if (nx * ((p.x + q.x) / 2 - c.x) + ny * ((p.y + q.y) / 2 - c.y) < 0) {
				nx = -nx;
				ny = -ny;
			}
			return { a: p, b: q, nx: nx, ny: ny };
		}), 'rgba(90,110,150,0.4)', 450, 1, 4, r * 0.15, true);
		api.shake(2, 280);
		ensureLoop(api);
	}

	jlFx.register({ id: 'shards', name: 'Crystal Shards', onMove: onMove, onSolve: onSolve });
})();
