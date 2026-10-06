"use strict";

// Layer highlight (v2): retro Tron. Two neon light-blue lightcycles race along both rims of the turning layer
// band in the turn direction, leaving solid glowing walls that fade behind them, while the gap lines between the
// layer's stickers briefly light up like a grid.
(function() {
	var live = [];
	var MAX_LIVE = 10;

	function lerp(a, b, f) {
		return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
	}

	function path(ctx, poly) {
		ctx.beginPath();
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var k = 1; k < poly.length; k++) {
			ctx.lineTo(poly[k].x, poly[k].y);
		}
		ctx.closePath();
	}

	// the longest visible stretch of the belt: { start, len } in samples of N
	function visibleStretch(L, N) {
		var vis = [];
		for (var i = 0; i < N; i++) {
			vis.push(L.belt(i / N).visible);
		}
		var best = 0, bestStart = 0;
		for (var st = 0; st < N; st++) {
			if (vis[st] && !vis[(st + N - 1) % N]) {
				var len = 0;
				while (len < N && vis[(st + len) % N]) {
					len++;
				}
				if (len > best) {
					best = len;
					bestStart = st;
				}
			}
		}
		if (best == 0 && vis[0]) {
			best = N;
		}
		return { start: bestStart, len: best };
	}

	// projective map of the unit square onto a screen quad (exact for a planar face under perspective);
	// u runs p0->p1, v runs p0->p3
	function quadMap(q) {
		var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
		var dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
		var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
		var det = dx1 * dy2 - dx2 * dy1;
		var g = 0, h = 0;
		if (Math.abs(dx3) + Math.abs(dy3) > 1e-6 && Math.abs(det) > 1e-9) {
			g = (dx3 * dy2 - dx2 * dy3) / det;
			h = (dx1 * dy3 - dx3 * dy1) / det;
		}
		var a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
		return function(u, v) {
			var w = g * u + h * v + 1;
			return { x: (a * u + b * v + x0) / w, y: (d * u + e * v + y0) / w };
		};
	}

	// gap lines between the stickers of the visible strips (across the band) and of the cap (both directions)
	function gridLines(L, dim) {
		var lines = [];
		var i, f;
		L.strips.forEach(function(s) {
			if (!s.visible) {
				return;
			}
			var m = quadMap(s.poly); // u along the band, v across it
			for (i = 1; i < dim; i++) {
				f = i / dim;
				lines.push([m(f, 0), m(f, 1)]);
			}
		});
		if (L.cap && L.cap.visible) {
			var mc = quadMap(L.cap.poly);
			for (i = 1; i < dim; i++) {
				f = i / dim;
				lines.push([mc(f, 0), mc(f, 1)]);
				lines.push([mc(0, f), mc(1, f)]);
			}
		}
		return lines;
	}

	function strokePts(ctx, pts, from, to) {
		// pts sampled evenly; from/to fractional indices
		var n = pts.length - 1;
		from = Math.max(0, Math.min(n, from));
		to = Math.max(0, Math.min(n, to));
		if (to - from < 0.01) {
			return null;
		}
		var i0 = Math.floor(from), i1 = Math.floor(to);
		var a = lerp(pts[i0], pts[Math.min(n, i0 + 1)], from - i0);
		var b = lerp(pts[i1], pts[Math.min(n, i1 + 1)], to - i1);
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		for (var i = i0 + 1; i <= i1; i++) {
			ctx.lineTo(pts[i].x, pts[i].y);
		}
		ctx.lineTo(b.x, b.y);
		return { a: a, b: b };
	}

	// start one Tron effect on layer geometry L; delay lets onSolve chain layers
	function launch(api, L, opts) {
		var dim = opts.dim || 3;
		var whole = L.whole;
		var life = opts.life;
		var polys = [];
		L.strips.forEach(function(s) {
			if (s.visible) {
				polys.push(s.poly);
			}
		});
		if (L.cap && L.cap.visible) {
			polys.push(L.cap.poly);
		}
		var reduced = api.reduced;
		var N = 72;
		var vs = visibleStretch(L, N);
		var arc = Math.min(0.25 * L.quarter + 0.12, vs.len / N * 0.95);
		var mid = (vs.start + vs.len / 2) / N;
		var t0 = mid - L.dir * arc / 2;
		var S = 40;
		var rims = [[], []];
		if (vs.len > 0 && !reduced) {
			for (var j = 0; j <= S; j++) {
				var tt = t0 + L.dir * arc * j / S;
				rims[0].push(L.belt(tt, 0.02));
				rims[1].push(L.belt(tt, 0.98));
			}
		}
		var lines = reduced || whole ? [] : gridLines(L, dim);
		var me = { dead: false };
		live.push(me);
		if (live.length > MAX_LIVE) {
			live.shift().dead = true;
		}

		api.add(function(ctx, t) {
			if (me.dead) {
				return false;
			}
			var k = t / life;
			if (k >= 1) {
				var ix = live.indexOf(me);
				if (ix != -1) {
					live.splice(ix, 1);
				}
				return false;
			}
			var fade = k < 0.08 ? k / 0.08 : Math.max(0, 1 - (k - 0.08) / 0.92);
			var sub = whole ? 0.45 : 1;
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';

			// layer: very light flash fill (gone after 40% of life) and a thin neon outline
			var fillA = (whole ? 0.05 : 0.12) * Math.max(0, 1 - k / 0.4);
			var rimA = (reduced ? 0.9 : 0.55) * fade * sub;
			polys.forEach(function(p) {
				path(ctx, p);
				if (fillA > 0.003 && !reduced) {
					ctx.fillStyle = 'rgba(60, 220, 255, ' + fillA.toFixed(3) + ')';
					ctx.fill();
				}
				ctx.strokeStyle = 'rgba(0, 70, 170, ' + (0.5 * rimA).toFixed(3) + ')';
				ctx.lineWidth = 3.5;
				ctx.stroke();
				ctx.strokeStyle = 'rgba(140, 240, 255, ' + rimA.toFixed(3) + ')';
				ctx.lineWidth = 1.5;
				ctx.stroke();
			});
			if (reduced) {
				return true;
			}

			// grid: the gap lines flash right after the cycles set off
			var gk = (k - 0.04) / 0.5;
			if (lines.length && gk > 0 && gk < 1) {
				var ga = gk < 0.2 ? gk / 0.2 : 1 - (gk - 0.2) / 0.8;
				ctx.beginPath();
				lines.forEach(function(l) {
					ctx.moveTo(l[0].x, l[0].y);
					ctx.lineTo(l[1].x, l[1].y);
				});
				ctx.strokeStyle = 'rgba(0, 80, 190, ' + (0.65 * ga).toFixed(3) + ')';
				ctx.lineWidth = 6;
				ctx.stroke();
				ctx.strokeStyle = 'rgba(80, 225, 255, ' + (0.95 * ga).toFixed(3) + ')';
				ctx.lineWidth = 3;
				ctx.stroke();
				ctx.strokeStyle = 'rgba(225, 255, 255, ' + (0.9 * ga).toFixed(3) + ')';
				ctx.lineWidth = 1;
				ctx.stroke();
			}
			if (!rims[0].length) {
				return true;
			}

			// lightcycles: the heads race the arc (ease-out) in the first 45% of life; the walls stay, then the
			// tail eats them from the start
			var hk = Math.min(1, k / 0.4);
			var head = S * (1 - (1 - hk) * (1 - hk));
			var tail = S * Math.max(0, (k - 0.5) / 0.5);
			var wallA = fade * sub;
			for (var r = 0; r < 2; r++) {
				var pts = rims[r];
				var seg = strokePts(ctx, pts, tail, head);
				if (!seg) {
					continue;
				}
				// wall brightens towards the head
				var g = ctx.createLinearGradient(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
				g.addColorStop(0, 'rgba(0, 150, 255, ' + (0.3 * wallA).toFixed(3) + ')');
				g.addColorStop(1, 'rgba(0, 190, 255, ' + (0.6 * wallA).toFixed(3) + ')');
				ctx.strokeStyle = g;
				ctx.lineWidth = 14;
				ctx.stroke();
				ctx.strokeStyle = 'rgba(0, 70, 200, ' + (0.9 * wallA).toFixed(3) + ')';
				ctx.lineWidth = 6.5;
				ctx.stroke();
				var g2 = ctx.createLinearGradient(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
				g2.addColorStop(0, 'rgba(120, 230, 255, ' + (0.75 * wallA).toFixed(3) + ')');
				g2.addColorStop(1, 'rgba(235, 255, 255, ' + wallA.toFixed(3) + ')');
				ctx.strokeStyle = g2;
				ctx.lineWidth = 3;
				ctx.stroke();
				// the cycle itself: bright head while it is still moving
				if (k < 0.5) {
					var ha = wallA * (hk < 1 ? 1 : Math.max(0, 1 - (k - 0.4) / 0.1));
					var h = seg.b;
					var rg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 16);
					rg.addColorStop(0, 'rgba(255, 255, 255, ' + ha.toFixed(3) + ')');
					rg.addColorStop(0.35, 'rgba(110, 230, 255, ' + (0.75 * ha).toFixed(3) + ')');
					rg.addColorStop(1, 'rgba(0, 150, 255, 0)');
					ctx.fillStyle = rg;
					ctx.beginPath();
					ctx.arc(h.x, h.y, 16, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			return true;
		});
	}

	jlFx.register({
		id: 'v2-tron',
		name: 'Tron Lightcycle',
		v2: true,
		onMove: function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			var L = api.layer(ev);
			var fast = ev.tps >= 8;
			launch(api, L, { dim: ev.dim || 3, life: api.reduced ? 260 : (fast ? 420 : 600) });
		},
		onSolve: function(api, ev) {
			if (api.reduced) {
				return;
			}
			// every layer gets its lightcycles in sequence: U slices top to bottom, then R slices
			var seq = [];
			var i;
			for (i = 1; i <= 3; i++) {
				seq.push({ face: 'U', layers: [i, i] });
			}
			for (i = 1; i <= 3; i++) {
				seq.push({ face: 'R', layers: [i, i] });
			}
			var started = 0;
			api.add(function(ctx, t) {
				while (started < seq.length && t >= started * 170) {
					var s = seq[started];
					var L = api.layer({ face: s.face, layers: s.layers, amount: 2, dim: 3, phase: 'start' });
					launch(api, L, { dim: 3, life: 650 });
					started++;
				}
				return started < seq.length;
			});
		}
	});
})();
