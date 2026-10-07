"use strict";

// Lightning: jagged electric arcs crackle along the turning face's edges, with a few branching bolts
// leaping out of the cube silhouette into the margin. Every arc is re-randomized each frame.
(function() {
var LH = (function() {
		var FACES = 'URFDLB';
		var ends = []; // end times of live animations (capped)
		var MAX_LIVE = 10;

		// ---------- geometry helpers ----------
		function near(a, b) {
			return Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5;
		}

		function hasEdge(fc, a, b) {
			var ia = -1, ib = -1;
			for (var i = 0; i < 4; i++) {
				if (near(fc.corners[i], a)) {
					ia = i;
				}
				if (near(fc.corners[i], b)) {
					ib = i;
				}
			}
			return ia != -1 && ib != -1;
		}

		// edges of face f: [{a, b, sil: true if on the cube silhouette}]
		function faceEdges(api, f) {
			var fc = api.face(f);
			var all = [];
			for (var k = 0; k < 6; k++) {
				if (FACES[k] != f) {
					all.push(api.face(FACES[k]));
				}
			}
			var out = [];
			for (var i = 0; i < 4; i++) {
				var a = fc.corners[i], b = fc.corners[(i + 1) % 4];
				var other = null;
				for (var j = 0; j < all.length; j++) {
					if (hasEdge(all[j], a, b)) {
						other = all[j];
						break;
					}
				}
				var otherVis = other ? other.visible : false;
				if (fc.visible) {
					out.push({ a: a, b: b, sil: !otherVis });
				} else if (otherVis) {
					out.push({ a: a, b: b, sil: true }); // hidden face: only its silhouette edges
				}
			}
			return out;
		}

		// silhouette (convex hull) edges of the whole cube
		function hullEdges(api) {
			var pts = [];
			for (var k = 0; k < 6; k++) {
				var cs = api.face(FACES[k]).corners;
				for (var i = 0; i < 4; i++) {
					var dup = false;
					for (var j = 0; j < pts.length; j++) {
						if (near(pts[j], cs[i])) {
							dup = true;
							break;
						}
					}
					if (!dup) {
						pts.push(cs[i]);
					}
				}
			}
			pts.sort(function(p, q) {
				return p.x - q.x || p.y - q.y;
			});
			function cross(o, a, b) {
				return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
			}
			var lower = [], upper = [], i2;
			for (i2 = 0; i2 < pts.length; i2++) {
				while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i2]) <= 0) {
					lower.pop();
				}
				lower.push(pts[i2]);
			}
			for (i2 = pts.length - 1; i2 >= 0; i2--) {
				while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i2]) <= 0) {
					upper.pop();
				}
				upper.push(pts[i2]);
			}
			var hull = lower.slice(0, -1).concat(upper.slice(0, -1));
			var out = [];
			for (var m = 0; m < hull.length; m++) {
				out.push({ a: hull[m], b: hull[(m + 1) % hull.length], sil: true });
			}
			return out;
		}

		// ---------- drawing ----------
		// jagged polyline from a to b, appended to the current path
		function jag(ctx, a, b, amp, segs) {
			var dx = b.x - a.x, dy = b.y - a.y;
			var len = Math.sqrt(dx * dx + dy * dy) || 1;
			var nx = -dy / len, ny = dx / len;
			ctx.moveTo(a.x, a.y);
			for (var i = 1; i < segs; i++) {
				var u = i / segs;
				var off = (Math.random() - 0.5) * 2 * amp * Math.sin(u * Math.PI);
				ctx.lineTo(a.x + dx * u + nx * off, a.y + dy * u + ny * off);
			}
			ctx.lineTo(b.x, b.y);
		}

		// branching bolt from p in direction (dx,dy), appended to the current path
		function bolt(ctx, p, dx, dy, len, depth) {
			var x = p.x, y = p.y;
			var steps = 5 + ((len / 14) | 0);
			var sl = len / steps;
			var ang = Math.atan2(dy, dx);
			ctx.moveTo(x, y);
			for (var i = 0; i < steps; i++) {
				var a = ang + (Math.random() - 0.5) * 1.3;
				x += Math.cos(a) * sl;
				y += Math.sin(a) * sl;
				ctx.lineTo(x, y);
				if (depth > 0 && i > 0 && i < steps - 1 && Math.random() < 0.28) {
					var side = Math.random() < 0.5 ? -1 : 1;
					var ba = ang + side * (0.5 + Math.random() * 0.6);
					bolt(ctx, { x: x, y: y }, Math.cos(ba), Math.sin(ba), len * (0.35 + Math.random() * 0.25), depth - 1);
					ctx.moveTo(x, y);
				}
			}
		}

		// stroke the current path as electricity: glow, blue body, white core
		function zap(ctx, alpha, width) {
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			ctx.globalAlpha = alpha * 0.3;
			ctx.strokeStyle = '#2f7bff';
			ctx.lineWidth = width * 6;
			ctx.stroke();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = '#0a4ff0';
			ctx.lineWidth = width * 2.4;
			ctx.stroke();
			ctx.strokeStyle = '#f4f9ff';
			ctx.lineWidth = width * 0.55;
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		function outward(api, e) {
			var c = api.cube().center;
			var mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
			var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
			var nx = -dy / len, ny = dx / len;
			if (nx * (mx - c.x) + ny * (my - c.y) < 0) {
				nx = -nx;
				ny = -ny;
			}
			return { x: nx, y: ny, len: len };
		}

		function spark(api, edges, opt) {
			var now = jlFx.now();
			var kept = [];
			for (var q = 0; q < ends.length; q++) {
				if (ends[q] > now) {
					kept.push(ends[q]);
				}
			}
			ends = kept;
			if (ends.length >= MAX_LIVE || !edges.length) {
				return;
			}
			var dur = opt.dur;
			ends.push(now + dur + 50);
			var r = api.cube().radius;
			// bolts are anchored once (spot + direction), but their shape re-randomizes each frame
			var bolts = [];
			var sil = [];
			for (var i = 0; i < edges.length; i++) {
				if (edges[i].sil) {
					sil.push(edges[i]);
				}
			}
			for (var k = 0; k < opt.bolts && sil.length; k++) {
				var e = sil[(api.rand() * sil.length) | 0];
				var u = 0.15 + api.rand() * 0.7;
				var o = outward(api, e);
				var tilt = (api.rand() - 0.5) * 0.9;
				var ca = Math.cos(tilt), sa = Math.sin(tilt);
				bolts.push({
					p: { x: e.a.x + (e.b.x - e.a.x) * u, y: e.a.y + (e.b.y - e.a.y) * u },
					dx: o.x * ca - o.y * sa, dy: o.x * sa + o.y * ca,
					len: r * (0.4 + api.rand() * 0.3) * opt.reach,
					life: dur * (0.45 + api.rand() * 0.3)
				});
			}
			api.add(function(ctx, t) {
				if (t > dur) {
					return false;
				}
				var k = t / dur;
				// flicker: arcs blink on and off a little
				var flick = Math.random() < 0.15 ? 0.5 : 1;
				var alpha = Math.pow(1 - k, 1.3) * flick * opt.alpha;
				ctx.beginPath();
				for (var i = 0; i < edges.length; i++) {
					var e = edges[i];
					var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
					var len = Math.sqrt(dx * dx + dy * dy);
					jag(ctx, e.a, e.b, opt.amp * (1 - 0.5 * k), Math.max(4, (len / 11) | 0));
				}
				zap(ctx, alpha, opt.width);
				// bolts: shoot out fast, then crackle and fade
				ctx.beginPath();
				var any = false;
				for (var j = 0; j < bolts.length; j++) {
					var b = bolts[j];
					if (t < b.life) {
						var grow = Math.min(1, t / 45);
						bolt(ctx, b.p, b.dx, b.dy, b.len * grow, 1);
						any = true;
					}
				}
				if (any) {
					zap(ctx, Math.min(1, alpha * 1.15), opt.width * 0.85);
				}
				return true;
			});
		}

		function flashOutline(api, edges) {
			// reduced motion: one short static outline flash
			api.add(function(ctx, t) {
				if (t > 160) {
					return false;
				}
				ctx.beginPath();
				for (var i = 0; i < edges.length; i++) {
					ctx.moveTo(edges[i].a.x, edges[i].a.y);
					ctx.lineTo(edges[i].b.x, edges[i].b.y);
				}
				ctx.globalAlpha = 0.8 * (1 - t / 160);
				ctx.strokeStyle = '#1f6bff';
				ctx.lineWidth = 2.5;
				ctx.stroke();
				return true;
			});
		}

		var handler = function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			if (ev.rotation) {
				var hull = hullEdges(api);
				if (api.reduced) {
					flashOutline(api, hull);
					return;
				}
				spark(api, hull, { dur: 220, bolts: 0, reach: 0, amp: 3, width: 1.2, alpha: 0.55 });
				return;
			}
			var edges = faceEdges(api, ev.face);
			if (api.reduced) {
				flashOutline(api, edges);
				return;
			}
			var combo = Math.min(ev.combo || 1, 12);
			var wide = ev.layers && ev.layers[1] > 1;
			var heat = Math.min(1, (combo - 1) / 8); // 0 .. 1 with streak
			var visible = api.face(ev.face).visible;
			spark(api, edges, {
				dur: 260 + heat * 80 - (ev.tps > 12 ? 60 : 0),
				bolts: (visible ? 2 : 2) + Math.round(heat * 2) + (wide ? 1 : 0) - (ends.length > 6 ? 1 : 0),
				reach: 1 + heat * 0.5 + (wide ? 0.2 : 0),
				amp: (wide ? 7.5 : 6) + heat * 2.5,
				width: (wide ? 2.2 : 1.9) + heat * 0.4,
				alpha: 1
			});
			if (ev.amount && Math.abs(ev.amount) == 2 && combo < 4) {
				api.shake(1.5, 90);
			}
		};
		handler.spark = spark;
		handler.bolt = bolt;
		handler.zap = zap;
		handler.hull = hullEdges;
		handler.edges = faceEdges;
		handler.flash = flashOutline;
		return handler;
	})();

jlFx.register({
	id: 'lightning',
	name: 'Lightning',
	onMove: LH,

	onScramble: function(api) {
		var h = LH;
		var hull = h.hull(api);
		if (api.reduced) {
			h.flash(api, hull);
			return;
		}
		h.spark(api, hull, { dur: 300, bolts: 2, reach: 0.8, amp: 4, width: 1.3, alpha: 0.7 });
	},

	onSolve: function(api) {
		var h = LH;
		var hull = h.hull(api);
		if (api.reduced) {
			h.flash(api, hull);
			return;
		}
		var c = api.cube();
		var r = c.radius;
		var D = 2200;
		var next = 0;
		var strikes = [];
		api.shake(2.5, 260);
		api.add(function(ctx, t) {
			if (t > D) {
				return false;
			}
			var k = t / D;
			var energy = t < 1500 ? 1 : 1 - (t - 1500) / 700;
			// spawn strikes: frequent at first, thinning out
			while (t >= next && t < 1600 && strikes.length < 14) {
				var e = hull[(Math.random() * hull.length) | 0];
				var u = 0.1 + Math.random() * 0.8;
				var px = e.a.x + (e.b.x - e.a.x) * u, py = e.a.y + (e.b.y - e.a.y) * u;
				var dx = px - c.center.x, dy = py - c.center.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
				strikes.push({ p: { x: px, y: py }, dx: dx / dl, dy: dy / dl, len: r * (0.6 + Math.random() * 0.5), born: t, life: 140 + Math.random() * 140 });
				next += 50 + k * 220 + Math.random() * 60;
			}
			// crackling silhouette
			ctx.beginPath();
			for (var i = 0; i < hull.length; i++) {
				var a = hull[i].a, b = hull[i].b;
				var hx = b.x - a.x, hy = b.y - a.y, len = Math.sqrt(hx * hx + hy * hy) || 1;
				var nx = -hy / len, ny = hx / len, segs = Math.max(5, (len / 10) | 0);
				ctx.moveTo(a.x, a.y);
				for (var s = 1; s < segs; s++) {
					var q = s / segs, off = (Math.random() - 0.5) * 10 * Math.sin(q * Math.PI);
					ctx.lineTo(a.x + hx * q + nx * off, a.y + hy * q + ny * off);
				}
				ctx.lineTo(b.x, b.y);
			}
			h.zap(ctx, Math.max(0, energy) * (Math.random() < 0.15 ? 0.4 : 0.9), 1.7);
			// strikes into the margin
			ctx.beginPath();
			var alive = [];
			for (var j = 0; j < strikes.length; j++) {
				var st = strikes[j], age = t - st.born;
				if (age < st.life) {
					h.bolt(ctx, st.p, st.dx, st.dy, st.len * Math.min(1, age / 40), 2);
					alive.push(st);
				}
			}
			strikes = alive;
			h.zap(ctx, Math.max(0, energy), 1.8);
			// one quick, faint white flash over the cube at the start
			if (t < 120) {
				ctx.globalAlpha = 0.18 * (1 - t / 120);
				ctx.fillStyle = '#dfeaff';
				ctx.beginPath();
				ctx.arc(c.center.x, c.center.y, r * 1.1, 0, Math.PI * 2);
				ctx.fill();
			}
			return true;
		});
	}
});
})();
