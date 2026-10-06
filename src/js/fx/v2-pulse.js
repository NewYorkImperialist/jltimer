"use strict";

// Layer highlight (v2): Neon Pulse. The visible outline of the turning slab (strip rims plus the cap outline) lights
// up as a crisp light-blue neon tube; one bright energy pulse runs along the slab's rims in the turn direction, then
// the tube fades. Minimal: the stickers only get a faint, very short wash, the light lives on the edges.
jlFx.register(function() {
	var MAX_LIVE = 10;
	var live = []; // live effect records, oldest first; the oldest are dropped past MAX_LIVE

	function track(rec) {
		live.push(rec);
		while (live.length > MAX_LIVE) {
			live.shift().dead = true;
		}
	}

	function untrack(rec) {
		var i = live.indexOf(rec);
		if (i != -1) {
			live.splice(i, 1);
		}
	}

	function polyPath(ctx, poly) {
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var k = 1; k < poly.length; k++) {
			ctx.lineTo(poly[k].x, poly[k].y);
		}
		ctx.closePath();
	}

	function linePath(ctx, pts) {
		ctx.moveTo(pts[0].x, pts[0].y);
		for (var k = 1; k < pts.length; k++) {
			ctx.lineTo(pts[k].x, pts[k].y);
		}
	}

	// geometry for one slab: visible polygons and the visible stretch of the belt the pulse runs along
	function geometry(L) {
		var polys = [];
		L.strips.forEach(function(s) {
			if (s.visible) {
				polys.push(s.poly);
			}
		});
		if (L.cap && L.cap.visible) {
			polys.push(L.cap.poly);
		}
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
		var full = false;
		if (best == 0 && vis[0]) { // the whole belt is visible
			best = N;
			full = true;
		}
		// arc in belt turns, start point so that travelling +arc*dir follows the turn
		var arc = full ? 1 : Math.max(0, (best - 1) / N);
		var a0 = bestStart / N, a1 = (bestStart + best - 1) / N;
		var t0 = L.dir > 0 ? a0 : a1;
		// pre-sample both rims (near and far side of the slab) along the stretch
		var S = Math.max(8, Math.round(arc * 96));
		var rims = [[], []];
		for (var j = 0; j <= S; j++) {
			var t = t0 + L.dir * arc * j / S;
			rims[0].push(L.belt(t, 0));
			rims[1].push(L.belt(t, 1));
		}
		return { polys: polys, rims: best ? rims : null, S: S };
	}

	// the neon tube: dark saturated halo (visible on light themes), cyan glow, near-white core
	function tube(ctx, G, a, scale) {
		if (!G.polys.length || a <= 0.003) {
			return;
		}
		ctx.beginPath();
		G.polys.forEach(function(p) {
			polyPath(ctx, p);
		});
		ctx.lineJoin = 'round';
		ctx.strokeStyle = 'rgba(0, 70, 190, ' + (0.4 * a).toFixed(3) + ')';
		ctx.lineWidth = 7 * scale;
		ctx.stroke();
		ctx.strokeStyle = 'rgba(0, 185, 255, ' + (0.7 * a).toFixed(3) + ')';
		ctx.lineWidth = 4 * scale;
		ctx.stroke();
		ctx.strokeStyle = 'rgba(225, 252, 255, ' + (0.95 * a).toFixed(3) + ')';
		ctx.lineWidth = 1.4 * scale;
		ctx.stroke();
	}

	// the energy pulse: a short bright segment on both rims, head at u (0..1 of the stretch)
	function pulse(ctx, G, u, a) {
		if (!G.rims || a <= 0.003) {
			return;
		}
		var S = G.S, len = 0.3; // pulse length as a fraction of the stretch
		var hi = Math.min(S, Math.round(u * S)), lo = Math.max(0, Math.round((u - len) * S));
		if (hi - lo < 1) {
			return;
		}
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		// tail fades by drawing in three overlapping segments of growing brightness
		for (var seg = 0; seg < 3; seg++) {
			var s0 = Math.round(lo + (hi - lo) * seg / 3);
			if (hi - s0 < 1) {
				continue;
			}
			var w = 0.45 + 0.275 * seg; // 0.45, 0.725, 1
			ctx.beginPath();
			G.rims.forEach(function(rim) {
				linePath(ctx, rim.slice(s0, hi + 1));
			});
			ctx.strokeStyle = 'rgba(0, 110, 255, ' + (0.4 * w * a).toFixed(3) + ')';
			ctx.lineWidth = 12;
			ctx.stroke();
			ctx.strokeStyle = 'rgba(120, 235, 255, ' + (0.75 * w * a).toFixed(3) + ')';
			ctx.lineWidth = 6;
			ctx.stroke();
			ctx.strokeStyle = 'rgba(255, 255, 255, ' + (w * a).toFixed(3) + ')';
			ctx.lineWidth = 2.6;
			ctx.stroke();
		}
		// bright heads
		G.rims.forEach(function(rim) {
			var h = rim[hi];
			if (!h.visible) {
				return;
			}
			var g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 15);
			g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
			g.addColorStop(0.35, 'rgba(140,240,255,' + (0.7 * a).toFixed(3) + ')');
			g.addColorStop(1, 'rgba(0,150,255,0)');
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(h.x, h.y, 15, 0, Math.PI * 2);
			ctx.fill();
		});
	}

	// one lit slab: rise, pulse run, fade. Returns false when done.
	function drawSlab(ctx, G, k, opt) {
		var a = k < 0.08 ? k / 0.08 : (k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
		a = Math.max(0, Math.min(1, a)) * opt.strength;
		// faint wash over the stickers: <= 0.12 and gone within ~35% of the life
		var fillA = opt.fill * Math.max(0, 1 - k / 0.35);
		if (fillA > 0.004 && G.polys.length) {
			ctx.beginPath();
			G.polys.forEach(function(p) {
				polyPath(ctx, p);
			});
			ctx.fillStyle = 'rgba(80, 210, 255, ' + fillA.toFixed(3) + ')';
			ctx.fill();
		}
		tube(ctx, G, a, opt.scale);
		if (opt.pulse) {
			var u = k / 0.62; // the pulse sweeps the stretch once, its tail leaving the end before the fade finishes
			if (u <= 1.3) {
				var pa = Math.min(1, (1.3 - u) / 0.3) * opt.strength;
				pulse(ctx, G, Math.min(u, 1.3), pa);
			}
		}
	}

	return {
		id: 'v2-pulse',
		name: 'Neon Pulse',
		v2: true,
		onMove: function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			var L = api.layer(ev);
			var G = geometry(L);
			var whole = L.whole;
			var fast = ev.tps >= 8;
			var life = api.reduced ? 220 : (fast ? 400 : 560);
			var opt = api.reduced ? { strength: 0.8, fill: 0, scale: 1, pulse: false } :
				whole ? { strength: 0.45, fill: 0.04, scale: 0.8, pulse: false } :
				{ strength: 1, fill: 0.1, scale: 1, pulse: true };
			var rec = { dead: false };
			track(rec);
			api.add(function(ctx, t) {
				var k = t / life;
				if (rec.dead || k >= 1) {
					untrack(rec);
					return false;
				}
				if (api.reduced) { // static rim, just fades
					tube(ctx, G, 0.8 * (1 - k), 1);
					return true;
				}
				drawSlab(ctx, G, k, opt);
				return true;
			});
		},
		// finale: the three horizontal layers light up top to bottom with a pulse each, then all flash together
		onSolve: function(api) {
			var slabs = [[1, 1], [2, 2], [3, 3]].map(function(ly) {
				return geometry(api.layer({ face: 'U', amount: 1, layers: ly, dim: 3 }));
			});
			var step = api.reduced ? 0 : 160, life = api.reduced ? 300 : 620, total = api.reduced ? 300 : 1500;
			api.add(function(ctx, t) {
				if (t >= total) {
					return false;
				}
				if (api.reduced) {
					slabs.forEach(function(G) {
						tube(ctx, G, 0.8 * (1 - t / total), 1);
					});
					return true;
				}
				slabs.forEach(function(G, i) {
					var k = (t - i * step) / life;
					if (k > 0 && k < 1) {
						drawSlab(ctx, G, k, { strength: 1, fill: 0.08, scale: 1, pulse: true });
					}
				});
				// final flash of the whole outline
				var k2 = (t - 900) / 600;
				if (k2 > 0 && k2 < 1) {
					var a = k2 < 0.15 ? k2 / 0.15 : 1 - (k2 - 0.15) / 0.85;
					slabs.forEach(function(G) {
						tube(ctx, G, a, 1.15);
					});
				}
				return true;
			});
		}
	};
}());
