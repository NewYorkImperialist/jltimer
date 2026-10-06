"use strict";

// Layer highlight (v2): Squiggle Trail. Closest to chess.com's move animation: the zone the stickers left and the
// zone they arrived at get a soft cyan glow rim (like chess.com's from/to squares), and a hand-drawn, slightly wavy
// neon trail (white core, cyan glow, deep-blue edge for light themes) draws itself along the layer between them.
(function() {
	var MAX_LIVE = 8;
	var live = [];

	function path(ctx, poly) {
		ctx.beginPath();
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var k = 1; k < poly.length; k++) {
			ctx.lineTo(poly[k].x, poly[k].y);
		}
		ctx.closePath();
	}

	function line(ctx, pts, from, to) {
		ctx.beginPath();
		ctx.moveTo(pts[from].x, pts[from].y);
		for (var m = from + 1; m <= to; m++) {
			ctx.lineTo(pts[m].x, pts[m].y);
		}
	}

	// longest visible stretch of the belt: { start, len } in turns (len 0 = nothing visible)
	function visibleStretch(L) {
		var N = 72, vis = [];
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
		return { start: bestStart / N, len: best / N };
	}

	// a patch of the layer between belt positions ta..tb across the full slab depth (a "square" of the move)
	function zone(L, ta, tb) {
		var top = [], bot = [], n = 6;
		for (var i = 0; i <= n; i++) {
			var t = ta + (tb - ta) * i / n;
			top.push(L.belt(t, 0.04));
			bot.unshift(L.belt(t, 0.96));
		}
		return top.concat(bot);
	}

	// the wavy trail from belt position t0 to t1, precomputed once (the view does not move while it plays)
	function squiggle(api, L, t0, t1, steps) {
		var p1 = api.rand(), p2 = api.rand(), f1 = 1.6 + api.rand() * 0.8, f2 = 3.5 + api.rand() * 1.5;
		var amp = 0.09 + api.rand() * 0.04;
		var pts = [];
		for (var j = 0; j <= steps; j++) {
			var u = j / steps;
			var taper = Math.sin(Math.PI * u); // starts and ends in the middle of the zones
			var d = 0.5 + taper * (amp * Math.sin(2 * Math.PI * (u * f1 + p1)) + 0.035 * Math.sin(2 * Math.PI * (u * f2 + p2)));
			pts.push(L.belt(t0 + (t1 - t0) * u, d));
		}
		return pts;
	}

	function rim(ctx, poly, a, fillA) {
		path(ctx, poly);
		if (fillA > 0.002) {
			ctx.fillStyle = 'rgba(40, 210, 255, ' + fillA.toFixed(3) + ')';
			ctx.fill();
		}
		ctx.strokeStyle = 'rgba(0, 110, 220, ' + (0.42 * a).toFixed(3) + ')';
		ctx.lineWidth = 9;
		ctx.stroke();
		ctx.strokeStyle = 'rgba(0, 210, 255, ' + (0.7 * a).toFixed(3) + ')';
		ctx.lineWidth = 4.5;
		ctx.stroke();
		ctx.strokeStyle = 'rgba(225, 255, 255, ' + (0.95 * a).toFixed(3) + ')';
		ctx.lineWidth = 1.6;
		ctx.stroke();
	}

	// layered neon stroke: deep-blue edge (light themes), cyan glow, white core
	function neon(ctx, pts, from, to, a, scale) {
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		var layers = [[15, 'rgba(0, 100, 230, ', 0.2], [9, 'rgba(0, 190, 255, ', 0.45], [5, 'rgba(90, 230, 255, ', 0.85],
			[2.2, 'rgba(255, 255, 255, ', 1]];
		for (var i = 0; i < layers.length; i++) {
			line(ctx, pts, from, to);
			ctx.strokeStyle = layers[i][1] + (layers[i][2] * a).toFixed(3) + ')';
			ctx.lineWidth = layers[i][0] * scale;
			ctx.stroke();
		}
	}

	function glowDot(ctx, p, r, a) {
		var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
		g.addColorStop(0, 'rgba(255, 255, 255, ' + a.toFixed(3) + ')');
		g.addColorStop(0.35, 'rgba(120, 235, 255, ' + (0.7 * a).toFixed(3) + ')');
		g.addColorStop(1, 'rgba(0, 170, 255, 0)');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	function track(item) {
		live.push(item);
		while (live.length > MAX_LIVE) {
			live.shift().dead = true;
		}
	}

	function untrack(item) {
		var i = live.indexOf(item);
		if (i != -1) {
			live.splice(i, 1);
		}
	}

	jlFx.register({
		id: 'v2-squiggle',
		name: 'Squiggle Trail',
		v2: true,
		onMove: function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			var L = api.layer(ev);
			var polys = [];
			L.strips.forEach(function(s) {
				if (s.visible) {
					polys.push(s.poly);
				}
			});
			if (L.cap && L.cap.visible) {
				polys.push(L.cap.poly);
			}
			var whole = L.whole;
			var fast = ev.tps >= 8;
			var life = api.reduced ? 240 : (fast ? 420 : 620);
			var item = { dead: false };
			track(item);

			// from/to: the trail spans the move (a quarter or half turn) centred on the visible part of the belt
			var vs = visibleStretch(L);
			var hasTrail = !api.reduced && !whole && vs.len > 0.06;
			var fromZ = null, toZ = null, pts = null, STEPS = 40;
			if (hasTrail) {
				var zw = Math.min(1 / 24, vs.len * 0.12); // half a sticker-column wide on each side of the zone centre
				var arc = Math.min(0.25 * L.quarter, Math.max(0, vs.len - 2 * zw - 0.01));
				var mid = vs.start + vs.len / 2;
				var tf = mid - L.dir * arc / 2, tt = mid + L.dir * arc / 2;
				fromZ = zone(L, tf - zw, tf + zw);
				toZ = zone(L, tt - zw, tt + zw);
				pts = squiggle(api, L, tf, tt, STEPS);
				hasTrail = arc > 0.03;
			}

			api.add(function(ctx, t) {
				var k = t / life;
				if (k >= 1 || item.dead) {
					untrack(item);
					return false;
				}
				var a = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
				a = Math.max(0, a);
				a = a * (2 - a); // ease the fade so the glow lingers a little
				// whole layer: thin rim only; the faint fill is gone within ~200 ms so stickers stay readable
				var layerA = (whole ? 0.35 : 0.5) * a;
				var fillT = Math.max(0, 1 - t / 200);
				polys.forEach(function(p) {
					rim(ctx, p, layerA, (whole ? 0.06 : 0.1) * fillT);
				});
				if (!hasTrail) {
					return true;
				}
				// from zone lights at once and dims as the trail leaves it; the to zone flares when the head arrives
				var draw = Math.min(1, k / 0.42);
				draw = 1 - Math.pow(1 - draw, 2.2); // ease-out like a quick pen stroke
				rim(ctx, fromZ, a * 0.75, 0.16 * fillT);
				var arrive = Math.max(0, Math.min(1, (k - 0.3) / 0.12));
				if (arrive > 0) {
					var toFill = 0.2 * Math.max(0, 1 - Math.max(0, t - 0.3 * life) / 220);
					rim(ctx, toZ, a * arrive, toFill * arrive);
				}
				// trail: the pen draws from -> to, then the tail retracts towards the destination
				var tail = Math.max(0, (k - 0.5) / 0.45);
				tail = tail * tail;
				var hi = Math.round(draw * STEPS), lo = Math.min(hi, Math.round(tail * STEPS));
				if (hi - lo >= 1) {
					neon(ctx, pts, lo, hi, a, 1);
					glowDot(ctx, pts[hi], 13, a);
				}
				if (arrive > 0 && arrive < 1 || (k > 0.42 && k < 0.6)) {
					var pulse = Math.max(0, 1 - Math.abs(k - 0.45) / 0.15);
					glowDot(ctx, pts[STEPS], 22, 0.8 * pulse * a);
				}
				return true;
			});
		},
		onSolve: function(api, ev) {
			if (api.reduced) {
				return;
			}
			var dim = Math.min(ev && ev.dim || 3, 5);
			var seq = [];
			// sweep the horizontal layers top to bottom, then the vertical ones right to left
			['U', 'R'].forEach(function(f) {
				for (var i = 1; i <= dim; i++) {
					seq.push({ face: f, amount: 1, layers: [i, i], dim: dim });
				}
			});
			var step = Math.min(140, 1300 / seq.length), life = 420;
			seq.forEach(function(e, idx) {
				var L = api.layer(e);
				var polys = [];
				L.strips.forEach(function(s) {
					if (s.visible) {
						polys.push(s.poly);
					}
				});
				if (L.cap && L.cap.visible) {
					polys.push(L.cap.poly);
				}
				var vs = visibleStretch(L);
				var pts = vs.len > 0.06 ? squiggle(api, L, vs.start + 0.02, vs.start + vs.len - 0.02, 40) : null;
				var delay = idx * step;
				api.add(function(ctx, t) {
					var k = (t - delay) / life;
					if (k < 0) {
						return true;
					}
					if (k >= 1) {
						return false;
					}
					var a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
					polys.forEach(function(p) {
						rim(ctx, p, 0.7 * a, 0.08 * Math.max(0, 1 - k / 0.45));
					});
					if (pts) {
						var hi = Math.round(Math.min(1, k / 0.5) * 40), lo = Math.round(Math.max(0, (k - 0.45) / 0.55) * 40);
						if (hi - lo >= 1) {
							neon(ctx, pts, lo, hi, a, 0.8);
							glowDot(ctx, pts[hi], 11, a);
						}
					}
					return true;
				});
			});
		}
	});
})();
