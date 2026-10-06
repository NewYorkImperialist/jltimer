"use strict";

// Layer highlight (v2): 80s synthwave / outrun. A glossy diagonal chrome shine sweeps across the turning layer's
// strips in the turn direction, leaving hot-pink and cyan neon rails along the slab's edges, while a split
// pink + cyan neon outline around the slab pulses once. Sticker fills stay faint and short; the colour lives on
// the rims and the rails.
(function() {
	var live = [];
	var MAX_LIVE = 8;

	function path(ctx, poly) {
		ctx.beginPath();
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var k = 1; k < poly.length; k++) {
			ctx.lineTo(poly[k].x, poly[k].y);
		}
		ctx.closePath();
	}

	function line(ctx, pts) {
		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (var m = 1; m < pts.length; m++) {
			ctx.lineTo(pts[m].x, pts[m].y);
		}
	}

	function track(fx) {
		live.push(fx);
		while (live.length > MAX_LIVE) {
			live.shift().dead = true;
		}
	}

	function untrack(fx) {
		var i = live.indexOf(fx);
		if (i != -1) {
			live.splice(i, 1);
		}
	}

	// the longest visible stretch of the belt: { start (turns), len (turns) } or null
	function visibleArc(L) {
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
			return { start: 0, len: 1 };
		}
		return best ? { start: bestStart / N, len: best / N } : null;
	}

	// neon outline around the slab: pink copy nudged one way, cyan the other (chromatic split), dark-saturated
	// under-stroke so it also reads on pale themes
	function outline(ctx, polys, a, swell) {
		ctx.lineJoin = 'round';
		for (var i = 0; i < polys.length; i++) {
			var p = polys[i];
			path(ctx, p);
			ctx.strokeStyle = 'rgba(255, 30, 160, ' + (0.28 * a).toFixed(3) + ')';
			ctx.lineWidth = 9 * swell;
			ctx.stroke();
			ctx.strokeStyle = 'rgba(190, 0, 120, ' + (0.85 * a).toFixed(3) + ')';
			ctx.lineWidth = 3.2 * swell;
			ctx.stroke();
		}
		ctx.save();
		ctx.translate(-1.6, -1.2);
		for (var j = 0; j < polys.length; j++) {
			path(ctx, polys[j]);
			ctx.strokeStyle = 'rgba(0, 120, 200, ' + (0.7 * a).toFixed(3) + ')';
			ctx.lineWidth = 2.6;
			ctx.stroke();
			ctx.strokeStyle = 'rgba(80, 245, 255, ' + a.toFixed(3) + ')';
			ctx.lineWidth = 1.3;
			ctx.stroke();
		}
		ctx.restore();
	}

	// one layer's sweep; returns a draw function fn(ctx, k) for k in 0..1 (k is relative to its own life)
	function sweep(L, opts) {
		var polys = [];
		L.strips.forEach(function(s) {
			if (s.visible) {
				polys.push(s.poly);
			}
		});
		if (L.cap && L.cap.visible) {
			polys.push(L.cap.poly);
		}
		var va = visibleArc(L);
		var arc = 0, t0 = 0;
		if (va) {
			arc = va.len >= 1 ? 0.5 : va.len * 0.96;
			t0 = va.start + va.len / 2 - L.dir * arc / 2;
		}
		var subtle = opts.subtle;
		var BW = 0.04; // half width of the shine band (turns)
		var SKEW = 0.035 * L.dir; // the band leans forward at the outer edge: a diagonal chrome glint
		var wu = arc ? BW / arc : 0, sku = arc ? SKEW * L.dir / arc : 0;

		function at(u, depth) {
			return L.belt(t0 + L.dir * arc * Math.max(0, Math.min(1, u)), depth);
		}

		function band(ctx, uc, hw, alpha) {
			var n = 5, pts = [], j;
			for (j = 0; j <= n; j++) {
				pts.push(at(uc + sku - hw + 2 * hw * j / n, 0));
			}
			for (j = n; j >= 0; j--) {
				pts.push(at(uc - sku - hw + 2 * hw * j / n, 1));
			}
			path(ctx, pts);
			ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha.toFixed(3) + ')';
			ctx.fill();
		}

		function rail(ctx, u0, u1, depth, a, core, glow) {
			var steps = 20, pts = [];
			for (var j = 0; j <= steps; j++) {
				pts.push(at(u0 + (u1 - u0) * j / steps, depth));
			}
			line(ctx, pts);
			ctx.strokeStyle = glow + (0.3 * a).toFixed(3) + ')';
			ctx.lineWidth = 9;
			ctx.stroke();
			ctx.strokeStyle = glow + (0.9 * a).toFixed(3) + ')';
			ctx.lineWidth = 3.5;
			ctx.stroke();
			ctx.strokeStyle = core + a.toFixed(3) + ')';
			ctx.lineWidth = 1.4;
			ctx.stroke();
		}

		return function(ctx, k) {
			// outline pulses once: quick swell, slow fade
			var pk = k < 0.18 ? k / 0.18 : Math.max(0, 1 - (k - 0.18) / 0.82);
			var pulse = pk * pk * (3 - 2 * pk);
			var oa = subtle ? 0.45 * pulse : pulse;
			// faint magenta-tinted wash that is gone long before the effect ends
			var fillA = (subtle ? 0.05 : 0.09) * Math.max(0, 1 - k / 0.4);
			if (fillA > 0.002) {
				for (var i = 0; i < polys.length; i++) {
					path(ctx, polys[i]);
					ctx.fillStyle = 'rgba(255, 60, 200, ' + fillA.toFixed(3) + ')';
					ctx.fill();
				}
			}
			outline(ctx, polys, oa, 1 + 0.35 * pulse);
			if (subtle || !arc) {
				return;
			}
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			// the shine crosses the visible stretch during the first 55% of the life
			var sk = Math.min(1, k / 0.55);
			var e = 1 - Math.pow(1 - sk, 2); // ease out: fast start like the turn itself
			var uc = -wu + e * (1 + 2 * wu);
			var tail = Math.max(0, (k - 0.3) / 0.6);
			var ra = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
			var head = Math.min(1, uc);
			if (head > tail) {
				// rails: pink along the outer edge, cyan along the inner edge, trailing the shine
				rail(ctx, tail, head, 0.02, ra, 'rgba(255, 225, 245, ', 'rgba(235, 0, 140, ');
				rail(ctx, tail, head, 0.98, ra, 'rgba(225, 255, 255, ', 'rgba(0, 150, 230, ');
			}
			if (sk < 1) {
				// glossy band: three nested layers, combined alpha about 0.21 at the core
				var ba = Math.min(1, sk / 0.1) * (sk > 0.85 ? (1 - sk) / 0.15 : 1);
				band(ctx, uc, wu, 0.07 * ba);
				band(ctx, uc, wu * 0.55, 0.08 * ba);
				band(ctx, uc, wu * 0.22, 0.08 * ba);
				// thin chrome glint line along the band's spine, and hot heads on both rails
				var g0 = at(uc + sku, -0.02), g1 = at(uc - sku, 1.02);
				ctx.beginPath();
				ctx.moveTo(g0.x, g0.y);
				ctx.lineTo(g1.x, g1.y);
				ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.85 * ba).toFixed(3) + ')';
				ctx.lineWidth = 1.6;
				ctx.stroke();
				[[at(uc + sku, 0.02), '255, 90, 200'], [at(uc - sku, 0.98), '60, 230, 255']].forEach(function(h) {
					var p = h[0];
					var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 13);
					g.addColorStop(0, 'rgba(255, 255, 255, ' + ba.toFixed(3) + ')');
					g.addColorStop(0.35, 'rgba(' + h[1] + ', ' + (0.75 * ba).toFixed(3) + ')');
					g.addColorStop(1, 'rgba(' + h[1] + ', 0)');
					ctx.fillStyle = g;
					ctx.beginPath();
					ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
					ctx.fill();
				});
			}
		};
	}

	jlFx.register({
		id: 'v2-synthwave',
		name: 'Synthwave Sweep',
		v2: true,
		onMove: function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			var L = api.layer(ev);
			var fx = { dead: false };
			track(fx);
			if (api.reduced) {
				var rpolys = [];
				L.strips.forEach(function(s) {
					if (s.visible) {
						rpolys.push(s.poly);
					}
				});
				if (L.cap && L.cap.visible) {
					rpolys.push(L.cap.poly);
				}
				api.add(function(ctx, t) {
					if (fx.dead || t >= 240) {
						untrack(fx);
						return false;
					}
					outline(ctx, rpolys, L.whole ? 0.4 : 0.85, 1);
					return true;
				});
				return;
			}
			var life = ev.tps >= 8 ? 400 : 600;
			var draw = sweep(L, { subtle: L.whole });
			api.add(function(ctx, t) {
				var k = t / life;
				if (fx.dead || k >= 1) {
					untrack(fx);
					return false;
				}
				draw(ctx, k);
				return true;
			});
		},
		onSolve: function(api) {
			// finale: U, E and D layers sweep one after another (same direction), then the whole cube pulses
			var layers = [[1, 1], [2, 2], [3, 3]].map(function(ly) {
				return api.layer({ face: 'U', amount: 1, layers: ly, dim: 3 });
			});
			var draws = layers.map(function(L) {
				return sweep(L, { subtle: false });
			});
			var whole = sweep(api.layer({ face: 'U', amount: 1, layers: [1, 3], dim: 3, rotation: true }), { subtle: false });
			var STEP = 220, LIFE = 650, TOTAL = 1700;
			api.add(function(ctx, t) {
				if (t >= TOTAL) {
					return false;
				}
				for (var i = 0; i < draws.length; i++) {
					var k = (t - i * STEP) / LIFE;
					if (k >= 0 && k < 1) {
						ctx.save();
						draws[i](ctx, k);
						ctx.restore();
					}
				}
				var kw = (t - 900) / 800;
				if (kw >= 0 && kw < 1) {
					whole(ctx, kw);
				}
				return true;
			});
		}
	});
})();
