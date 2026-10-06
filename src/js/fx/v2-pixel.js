"use strict";

// Layer highlight (v2): 8-Bit Trail. A chain of chunky square pixels (cyan, stepped alpha, snapped to a pixel grid)
// hops along the turning layer in the turn direction, eating small pellets like an arcade snake; the layer band's
// rim blinks in hard steps (on / off / dim) with a slight CRT scanline flicker. Sticker fills stay faint and brief.
(function() {
	var MAX_LIVE = 8; // overlapping effects beyond this drop the oldest
	var live = [];

	function path(ctx, poly) {
		ctx.beginPath();
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var k = 1; k < poly.length; k++) {
			ctx.lineTo(poly[k].x, poly[k].y);
		}
		ctx.closePath();
	}

	function polysOf(L) {
		var polys = [];
		L.strips.forEach(function(s) {
			if (s.visible) {
				polys.push(s.poly);
			}
		});
		if (L.cap && L.cap.visible) {
			polys.push(L.cap.poly);
		}
		return polys;
	}

	// hard-edged rim: dark saturated outline (reads on light themes) + bright cyan core
	function rim(ctx, polys, a, flick) {
		if (a <= 0) {
			return;
		}
		ctx.lineJoin = 'miter';
		for (var i = 0; i < polys.length; i++) {
			path(ctx, polys[i]);
			ctx.strokeStyle = 'rgba(0, 70, 160, ' + (0.85 * a).toFixed(2) + ')';
			ctx.lineWidth = 7;
			ctx.stroke();
			ctx.strokeStyle = 'rgba(70, 220, 255, ' + (a * flick).toFixed(2) + ')';
			ctx.lineWidth = 3;
			ctx.stroke();
		}
	}

	function quant(a) { // stepped alpha, no smooth fades
		return Math.round(a * 4) / 4;
	}

	function track(entry) {
		live.push(entry);
		while (live.length > MAX_LIVE) {
			live.shift().dead = true;
		}
	}

	function untrack(entry) {
		var i = live.indexOf(entry);
		if (i != -1) {
			live.splice(i, 1);
		}
	}

	jlFx.register({
		id: 'v2-pixel',
		name: '8-Bit Trail',
		v2: true,
		onMove: function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			var L = api.layer(ev);
			var polys = polysOf(L);
			var whole = L.whole;
			var fast = ev.tps >= 8;
			var life = api.reduced ? 240 : (fast ? 420 : 600);
			var entry = { dead: false };
			track(entry);

			if (api.reduced) {
				api.add(function(ctx, t) {
					if (entry.dead || t >= life) {
						untrack(entry);
						return false;
					}
					rim(ctx, polys, whole ? 0.4 : 0.8, 1);
					return true;
				});
				return;
			}

			// the trail runs along the longest visible stretch of the belt
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
			var arc = Math.min(0.25 * L.quarter, best / N * 0.92);
			var mid = (bestStart + best / 2) / N;
			var t0 = mid - L.dir * arc / 2;

			// pixel grid cells along the arc (snapped, consecutive duplicates removed)
			var PX = Math.max(6, Math.round(api.cube().radius / 9));
			var cells = [];
			if (!whole && best > 0) {
				var M = 60;
				for (var j = 0; j <= M; j++) {
					var p = L.belt(t0 + L.dir * arc * j / M);
					var cx = Math.round(p.x / PX) * PX, cy = Math.round(p.y / PX) * PX;
					var last = cells[cells.length - 1];
					if (!last || Math.abs(last.x - cx) >= PX || Math.abs(last.y - cy) >= PX) {
						cells.push({ x: cx, y: cy });
					}
				}
			}
			var CH = 5; // chain length
			var CHAIN_A = [1, 0.75, 0.5, 0.5, 0.25];
			var hops = cells.length - 1 + CH;
			var HOP_END = 0.7; // head (and its tail) finish hopping at 70% of the life

			api.add(function(ctx, t) {
				var k = t / life;
				if (entry.dead || k >= 1) {
					untrack(entry);
					return false;
				}
				// rim blinks in hard steps: on, off, dim, off, faint
				var a = k < 0.28 ? 1 : k < 0.38 ? 0 : k < 0.62 ? 0.6 : k < 0.7 ? 0 : 0.3;
				var flick = Math.floor(t / 34) % 2 ? 0.8 : 1; // CRT flicker
				if (whole) {
					a *= 0.45;
				}
				// faint fill only during the first step (<= ~120 ms), so sticker colours stay readable
				if (k < 0.2) {
					var fa = whole ? 0.06 : (fast ? 0.1 : 0.16);
					for (var q = 0; q < polys.length; q++) {
						path(ctx, polys[q]);
						ctx.fillStyle = 'rgba(80, 210, 255, ' + fa + ')';
						ctx.fill();
					}
				}
				rim(ctx, polys, a, flick);
				// scanlines over the rim: a few thin dark horizontal lines clipped to the band edges
				if (a > 0.5) {
					ctx.save();
					ctx.beginPath();
					for (var r = 0; r < polys.length; r++) {
						var pp = polys[r];
						ctx.moveTo(pp[0].x, pp[0].y);
						for (var s = 1; s < 4; s++) {
							ctx.lineTo(pp[s].x, pp[s].y);
						}
						ctx.closePath();
					}
					ctx.lineWidth = 7;
					ctx.strokeStyle = '#000';
					ctx.globalCompositeOperation = 'destination-out';
					ctx.setLineDash([1, 3]);
					ctx.lineDashOffset = Math.floor(t / 34) % 4;
					ctx.globalAlpha = 0.18;
					ctx.stroke();
					ctx.restore();
				}
				if (!cells.length) {
					return true;
				}
				var head = Math.floor(Math.min(1, k / HOP_END) * hops);
				var fade = k < HOP_END ? 1 : quant(1 - (k - HOP_END) / (1 - HOP_END));
				var h = PX, hh = PX / 2, pel = Math.max(2, Math.round(PX / 3));
				// pellets ahead of the head
				ctx.fillStyle = 'rgba(0, 90, 160, ' + (0.9 * fade).toFixed(2) + ')';
				for (var c = head + 2; c < cells.length; c += 2) {
					ctx.fillRect(cells[c].x - pel / 2 - 1, cells[c].y - pel / 2 - 1, pel + 2, pel + 2);
				}
				ctx.fillStyle = 'rgba(200, 250, 255, ' + (0.95 * fade).toFixed(2) + ')';
				for (c = head + 2; c < cells.length; c += 2) {
					ctx.fillRect(cells[c].x - pel / 2, cells[c].y - pel / 2, pel, pel);
				}
				// chain: oldest first so the head is on top
				for (var o = CH - 1; o >= 0; o--) {
					var idx = head - o;
					if (idx < 0 || idx >= cells.length) {
						continue;
					}
					var ca = CHAIN_A[o] * fade;
					if (ca <= 0) {
						continue;
					}
					var cl = cells[idx];
					var x = cl.x - hh, y = cl.y - hh;
					ctx.fillStyle = 'rgba(0, 70, 140, ' + (0.85 * ca).toFixed(2) + ')';
					ctx.fillRect(x - 2, y - 2, h + 4, h + 4);
					ctx.fillStyle = 'rgba(40, 200, 255, ' + ca.toFixed(2) + ')';
					ctx.fillRect(x, y, h, h);
					ctx.fillStyle = 'rgba(225, 255, 255, ' + ca.toFixed(2) + ')';
					if (o == 0) {
						ctx.fillRect(x + 2, y + 2, h - 4, h - 4);
					} else {
						ctx.fillRect(x + 1, y + 1, Math.round(h / 3), Math.round(h / 3)); // 8-bit highlight pixel
					}
				}
				return true;
			});
		},
		onSolve: function(api) {
			// finale: every slab blinks in sequence (U-D slices, then R-L, then F-B), hard steps, ~1.4 s
			var seq = [];
			['U', 'R', 'F'].forEach(function(f) {
				for (var l = 1; l <= 3; l++) {
					seq.push(polysOf(api.layer({ face: f, amount: 1, layers: [l, l], dim: 3 })));
				}
			});
			var STEP = 130, total = seq.length * STEP + 260;
			api.add(function(ctx, t) {
				if (t >= total) {
					return false;
				}
				var cur = Math.floor(t / STEP);
				for (var i = Math.max(0, cur - 2); i <= Math.min(cur, seq.length - 1); i++) {
					var age = cur - i;
					rim(ctx, seq[i], api.reduced ? 0.6 : [1, 0.5, 0.25][age], Math.floor(t / 34) % 2 ? 0.8 : 1);
				}
				return true;
			});
		}
	});
})();
