"use strict";

// Layer highlight (v2): anime / arcade speed lines. Several thin light-blue streaks at different depths across the
// turning layer shoot along it in the turn direction with staggered starts and tapered tails, like motion blur of
// the layer sliding. The layer's rim flashes briefly; sticker fills stay almost untouched.
(function() {
	var MAX_LIVE = 8;
	var live = [];

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

	function path(ctx, poly) {
		ctx.beginPath();
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var k = 1; k < poly.length; k++) {
			ctx.lineTo(poly[k].x, poly[k].y);
		}
		ctx.closePath();
	}

	// the longest visible stretch of the belt: {start, len} in turns (len 0 if nothing is visible)
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
			best = N;
		}
		return { start: bestStart / N, len: best / N };
	}

	// tapered streak along the belt at a given depth between arc fractions u0 (tail) and u1 (head)
	function streakPoly(L, t0, arc, depth, u0, u1, width) {
		var steps = 10, pts = [];
		for (var j = 0; j <= steps; j++) {
			var u = u0 + (u1 - u0) * j / steps;
			pts.push(L.belt(t0 + L.dir * arc * u, depth));
		}
		var left = [], right = [];
		for (var m = 0; m <= steps; m++) {
			var a = pts[Math.max(0, m - 1)], b = pts[Math.min(steps, m + 1)];
			var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
			var f = m / steps; // 0 at the tail, 1 at the head
			var hw = width * 0.5 * Math.pow(f, 1.3) * (m == steps ? 0.75 : 1); // taper to a point at the tail
			left.push({ x: pts[m].x - dy / d * hw, y: pts[m].y + dx / d * hw });
			right.push({ x: pts[m].x + dy / d * hw, y: pts[m].y - dx / d * hw });
		}
		var head = pts[steps], prev = pts[steps - 1];
		var hx = head.x - prev.x, hy = head.y - prev.y, hd = Math.sqrt(hx * hx + hy * hy) || 1;
		// rounded-ish tip just past the head
		var tip = { x: head.x + hx / hd * width * 0.6, y: head.y + hy / hd * width * 0.6 };
		return left.concat([tip], right.reverse());
	}

	function fillPoly(ctx, poly) {
		ctx.beginPath();
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var k = 1; k < poly.length; k++) {
			ctx.lineTo(poly[k].x, poly[k].y);
		}
		ctx.closePath();
		ctx.fill();
	}

	// one burst of speed lines on layer L; opts: {life, rim, fill, strength, delay}
	function burst(api, L, opts) {
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
		var arc = Math.min(0.5, va.len * 0.9);
		var mid = va.start + va.len / 2;
		var t0 = mid - L.dir * arc / 2;
		var life = opts.life, strength = opts.strength, delay = opts.delay || 0;
		// staggered streaks: depth, start delay (fraction of life), travel time, tail length, width
		var lines = [];
		var depths = opts.whole ? [0.3, 0.7] : [0.15, 0.32, 0.5, 0.68, 0.85];
		var order = [2, 0, 4, 1, 3];
		for (var i = 0; i < depths.length; i++) {
			var r = api.rand();
			lines.push({
				depth: depths[i],
				start: (opts.whole ? i : order[i]) * 0.05 + r * 0.04,
				dur: 0.5 + r * 0.12,
				len: 0.45 + api.rand() * 0.3,
				width: depths[i] == 0.5 ? 9 : 5 + api.rand() * 2.5
			});
		}
		var scale = Math.max(0.6, Math.min(1.6, api.cube().radius / 220));
		var fx = { dead: false };
		track(fx);
		api.add(function(ctx, tt) {
			var t = tt - delay;
			if (t < 0) {
				return !fx.dead;
			}
			var k = t / life;
			if (k >= 1 || fx.dead) {
				untrack(fx);
				return false;
			}
			ctx.lineJoin = 'round';
			// rim flash: strong on the edges, the fill is faint and gone by ~200 ms
			if (opts.rim) {
				var ra = Math.max(0, k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.6) * strength;
				var fa = opts.fill * Math.max(0, 1 - t / 200);
				if (ra > 0.01) {
					polys.forEach(function(p) {
						path(ctx, p);
						if (fa > 0.005) {
							ctx.fillStyle = 'rgba(120, 210, 255, ' + fa.toFixed(3) + ')';
							ctx.fill();
						}
						ctx.strokeStyle = 'rgba(0, 125, 245, ' + (0.55 * ra).toFixed(3) + ')';
						ctx.lineWidth = 6;
						ctx.stroke();
						ctx.strokeStyle = 'rgba(200, 245, 255, ' + ra.toFixed(3) + ')';
						ctx.lineWidth = 2;
						ctx.stroke();
					});
				}
			}
			if (api.reduced || arc <= 0) {
				return true;
			}
			for (var n = 0; n < lines.length; n++) {
				var ln = lines[n];
				var p = (k - ln.start) / ln.dur;
				if (p <= 0 || p >= 1) {
					continue;
				}
				var e = 1 - Math.pow(1 - p, 1.8); // fast launch, eases out
				var head = e * (1 + ln.len);
				var tail = head - ln.len;
				var u1 = Math.min(1, head), u0 = Math.max(0, tail);
				// once the head leaves the visible arc the streak fades out instead of bunching up at the edge
				var out = head > 1 ? Math.max(0, 1 - (head - 1) / (ln.len * 0.6)) : 1;
				if (u1 - u0 < 0.02 || out <= 0) {
					continue;
				}
				var a = strength * out * (p < 0.12 ? p / 0.12 : 1);
				var w = ln.width * scale;
				// soft halo, saturated blue edge (reads on light themes), light-blue body, white-hot core
				ctx.fillStyle = 'rgba(60, 170, 255, ' + (0.16 * a).toFixed(3) + ')';
				fillPoly(ctx, streakPoly(L, t0, arc, ln.depth, u0, u1, w + 10));
				ctx.fillStyle = 'rgba(0, 105, 240, ' + (0.8 * a).toFixed(3) + ')';
				fillPoly(ctx, streakPoly(L, t0, arc, ln.depth, u0, u1, w + 3));
				ctx.fillStyle = 'rgba(140, 225, 255, ' + a.toFixed(3) + ')';
				fillPoly(ctx, streakPoly(L, t0, arc, ln.depth, u0, u1, w));
				ctx.fillStyle = 'rgba(255, 255, 255, ' + a.toFixed(3) + ')';
				fillPoly(ctx, streakPoly(L, t0, arc, ln.depth, u0 + (u1 - u0) * 0.3, u1, w * 0.45));
			}
			return true;
		});
	}

	jlFx.register({
		id: 'v2-streaks',
		name: 'Motion Streaks',
		v2: true,
		onMove: function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			var L = api.layer(ev);
			if (api.reduced) {
				burst(api, L, { life: 260, rim: true, fill: 0, strength: 0.8 });
				return;
			}
			var fast = ev.tps >= 8;
			burst(api, L, {
				life: fast ? 360 : 480,
				rim: true,
				fill: L.whole ? 0 : 0.14,
				strength: L.whole ? 0.45 : 1,
				whole: L.whole
			});
		},
		onSolve: function(api) {
			// every slice of the cube streaks in sequence: U, E, D, then R, M, L
			var seq = [['U', 1], ['U', 2], ['U', 3], ['R', 1], ['R', 2], ['R', 3]];
			seq.forEach(function(s, i) {
				var L = api.layer({ face: s[0], amount: i % 2 ? -1 : 1, layers: [s[1], s[1]], dim: 3, phase: 'start' });
				burst(api, L, { life: api.reduced ? 260 : 520, rim: true, fill: 0, strength: 1, delay: i * 160 });
			});
		}
	});
})();
