"use strict";

// Blade Slash: a crisp anime crescent swoosh (white core, colored edge, tapered ends) that sweeps
// around the outside of the cube along the turning layer, in the turn direction. Drawn at full
// strength only outside the cube silhouette; where it passes in front of the cube it is a faint ghost.
jlFx.register(function() {
	var H = 0.43; // api.face() works at the sticker edge
	var AXES = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] };
	var TAN = { U: [[1, 0, 0], [0, 0, 1]], D: [[1, 0, 0], [0, 0, 1]], R: [[0, 1, 0], [0, 0, 1]], L: [[0, 1, 0], [0, 0, 1]],
		F: [[1, 0, 0], [0, 1, 0]], B: [[1, 0, 0], [0, 1, 0]] };
	var SAMPLES = 40;
	var MAX_SLASH = 10;
	var DUR = 185;
	var slashes = [];
	var running = false;

	function cross(a, b) {
		return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	}

	function dot(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	}

	function faceOf(v) {
		for (var k in AXES) {
			if (dot(AXES[k], v) > 0.5) {
				return k;
			}
		}
		return 'U';
	}

	function vis(api, v) {
		return api.face(faceOf(v)).visible ? 1 : 0;
	}

	function neg(v) {
		return [-v[0], -v[1], -v[2]];
	}

	function hexRgb(c) {
		var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || '');
		if (!m) {
			m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c || '');
			if (!m) {
				return [120, 200, 255];
			}
			return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
		}
		return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
	}

	function edgeColor(c) {
		var rgb = hexRgb(c);
		// a white face would vanish against the white core: use an icy blue edge instead
		if (rgb[0] + rgb[1] + rgb[2] > 640) {
			rgb = [130, 190, 255];
		}
		return rgb;
	}

	function darken(rgb) {
		return [Math.round(rgb[0] * 0.45), Math.round(rgb[1] * 0.45), Math.round(rgb[2] * 0.45)];
	}

	function rgba(rgb, a) {
		return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')';
	}

	// convex hull of the cube silhouette (all sticker corners pushed out to the cube body)
	function hull(api) {
		var cc = api.cube().center;
		var pts = [];
		var s = 0.5 / H;
		'URFDLB'.split('').forEach(function(f) {
			api.face(f).corners.forEach(function(p) {
				pts.push({ x: cc.x + (p.x - cc.x) * s, y: cc.y + (p.y - cc.y) * s });
			});
		});
		pts.sort(function(a, b) { return a.x - b.x || a.y - b.y; });
		function cr(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lower = [], upper = [], i;
		for (i = 0; i < pts.length; i++) {
			while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
				lower.pop();
			}
			lower.push(pts[i]);
		}
		for (i = pts.length - 1; i >= 0; i--) {
			while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
				upper.pop();
			}
			upper.push(pts[i]);
		}
		upper.pop();
		lower.pop();
		return lower.concat(upper);
	}

	function hullPath(ctx, hp) {
		for (var i = 0; i < hp.length; i++) {
			i ? ctx.lineTo(hp[i].x, hp[i].y) : ctx.moveTo(hp[i].x, hp[i].y);
		}
		ctx.closePath();
	}

	// geometry of the ring a layer of face f sweeps through: center, screen tangents, depth cue
	function ring(api, f, depth, radius) {
		var fc = api.face(f);
		var cc = api.cube().center;
		var c = fc.corners;
		var k = radius / (2 * H);
		var t = TAN[f];
		var n = AXES[f];
		var sigma = dot(cross(t[0], t[1]), n) > 0 ? 1 : -1;
		return {
			cx: cc.x + (fc.center.x - cc.x) * depth / H,
			cy: cc.y + (fc.center.y - cc.y) * depth / H,
			ax: (c[1].x - c[0].x) * k, ay: (c[1].y - c[0].y) * k,
			bx: (c[2].x - c[1].x) * k, by: (c[2].y - c[1].y) * k,
			s0: vis(api, t[0]) - vis(api, neg(t[0])),
			s1: vis(api, t[1]) - vis(api, neg(t[1])),
			sigma: sigma,
			color: edgeColor(fc.color),
			dark: darken(edgeColor(fc.color))
		};
	}

	function pt(r, th) {
		var cs = Math.cos(th), sn = Math.sin(th);
		return { x: r.cx + r.ax * cs + r.bx * sn, y: r.cy + r.ay * cs + r.by * sn };
	}

	function front(r, th) {
		return Math.cos(th) * r.s0 + Math.sin(th) * r.s1;
	}

	// build the crescent outline between angles a0 (tail) and a1 (head); width profile tapers both ends
	function crescent(r, a0, a1, wmax, core) {
		var outer = [], inner = [], fr = [];
		for (var i = 0; i <= SAMPLES; i++) {
			var u = i / SAMPLES;
			var th = a0 + (a1 - a0) * u;
			var p = pt(r, th);
			var q = pt(r, th + (a1 - a0) * 0.002 + 1e-4 * (a1 > a0 ? 1 : -1));
			var tx = q.x - p.x, ty = q.y - p.y, tl = Math.sqrt(tx * tx + ty * ty) || 1;
			var nx = -ty / tl, ny = tx / tl;
			// point the normal away from the ring center so the crescent bulges outward
			if (nx * (p.x - r.cx) + ny * (p.y - r.cy) < 0) {
				nx = -nx;
				ny = -ny;
			}
			// asymmetric profile: thick near the head, long sharp tail
			var w = wmax * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.8)), 0.9) * (core ? 0.42 : 1);
			outer.push({ x: p.x + nx * w * 0.7, y: p.y + ny * w * 0.7 });
			inner.push({ x: p.x - nx * w * 0.3, y: p.y - ny * w * 0.3 });
			fr.push(front(r, th));
		}
		return { outer: outer, inner: inner, front: fr };
	}

	function fillShape(ctx, sh, from, to) {
		if (to - from < 1) {
			return;
		}
		ctx.beginPath();
		ctx.moveTo(sh.outer[from].x, sh.outer[from].y);
		for (var i = from + 1; i <= to; i++) {
			ctx.lineTo(sh.outer[i].x, sh.outer[i].y);
		}
		for (i = to; i >= from; i--) {
			ctx.lineTo(sh.inner[i].x, sh.inner[i].y);
		}
		ctx.closePath();
		ctx.fill();
	}

	// contiguous sample range in front of the cube (frontness > 0)
	function frontRange(sh) {
		var a = -1, b = -1;
		for (var i = 0; i < sh.front.length; i++) {
			if (sh.front[i] > 0.05) {
				if (a < 0) {
					a = i;
				}
				b = i;
			}
		}
		return [a, b];
	}

	function easeOut(x) {
		x = Math.max(0, Math.min(1, x));
		return 1 - Math.pow(1 - x, 3);
	}

	function easeIn(x) {
		x = Math.max(0, Math.min(1, x));
		return x * x;
	}

	function drawSlash(ctx, s, t, hp, W, Hh) {
		var p = t / s.dur;
		var r = s.r;
		var head = s.start + s.dir * s.span * easeOut(p / 0.62);
		var tail = s.start + s.dir * s.span * easeIn((p - 0.08) / 0.92);
		var fade = p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.28);
		var wmax = s.width * (1 - 0.45 * easeIn(p));
		if (Math.abs(head - tail) < 0.02) {
			return;
		}
		var body = crescent(r, tail, head, wmax, false);
		var core = crescent(r, tail, head, wmax, true);
		// afterimage: a thin echo trailing behind the tail
		var tail2 = s.start + s.dir * s.span * easeIn((p - 0.3) / 0.92);
		var after = crescent(r, tail2, tail + (head - tail) * 0.35, wmax * 0.28, false);
		var pass, i;
		for (pass = 0; pass < 2; pass++) {
			ctx.save();
			ctx.beginPath();
			if (pass == 0) {
				ctx.rect(0, 0, W, Hh);
			}
			hullPath(ctx, hp);
			ctx.clip(pass == 0 ? 'evenodd' : 'nonzero');
			var a = fade * s.alpha * (pass == 0 ? 1 : 0.2);
			var lo = 0, hi = SAMPLES;
			if (pass == 1) {
				var fr = frontRange(body);
				lo = fr[0];
				hi = fr[1];
				if (lo < 0) {
					ctx.restore();
					continue;
				}
			}
			ctx.fillStyle = rgba(r.color, a * 0.45);
			fillShape(ctx, after, 0, SAMPLES);
			ctx.fillStyle = rgba(r.color, a);
			fillShape(ctx, body, lo, hi);
			if (pass == 0) {
				// dark ink rim so the blade reads on light backgrounds too
				ctx.strokeStyle = rgba(r.dark, a * 0.85);
				ctx.lineWidth = 1.2;
				ctx.stroke();
			}
			ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
			fillShape(ctx, core, lo, hi);
			if (pass == 0) {
				// razor-thin bright leading edge
				ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.8).toFixed(3) + ')';
				ctx.lineWidth = 1;
				ctx.beginPath();
				for (i = Math.floor(SAMPLES * 0.25); i <= SAMPLES; i++) {
					i == Math.floor(SAMPLES * 0.25) ? ctx.moveTo(body.outer[i].x, body.outer[i].y) : ctx.lineTo(body.outer[i].x, body.outer[i].y);
				}
				ctx.stroke();
			}
			ctx.restore();
		}
	}

	function drive(api) {
		if (running) {
			return;
		}
		running = true;
		api.add(function(ctx, t, dt) {
			var now = performance.now();
			var hp = hull(api);
			var alive = [];
			for (var i = 0; i < slashes.length; i++) {
				var s = slashes[i];
				var lt = now - s.born;
				if (lt < 0) {
					alive.push(s);
					continue;
				}
				if (lt > s.dur) {
					continue;
				}
				if (s.draw) {
					s.draw(ctx, lt, hp);
				} else {
					drawSlash(ctx, s, lt, hp, api.w, api.h);
				}
				alive.push(s);
			}
			slashes = alive;
			running = slashes.length > 0;
			return running;
		});
	}

	function push(api, s) {
		slashes.push(s);
		while (slashes.length > MAX_SLASH) {
			slashes.shift();
		}
		drive(api);
	}

	function makeSlash(api, f, amount, depth, opts) {
		var cr = api.cube().radius;
		var r = ring(api, f, depth, opts.radius || 0.72);
		var dir = -r.sigma * (amount < 0 ? -1 : 1);
		var thf = Math.atan2(r.s1, r.s0); // the angle closest to the viewer
		if (!r.s0 && !r.s1) {
			thf = Math.PI / 2;
		}
		var span = (opts.span || 4.6) * Math.min(1.35, 0.85 + 0.15 * Math.abs(amount));
		return {
			r: r,
			dir: dir,
			span: span,
			start: thf - dir * span * 0.5 + (api.rand() - 0.5) * 0.4,
			width: cr * (opts.width || 0.16),
			alpha: opts.alpha || 1,
			dur: opts.dur || DUR,
			born: performance.now() + (opts.delay || 0)
		};
	}

	function layerDepth(ev) {
		if (ev.rotation) {
			return 0;
		}
		var dim = ev.dim || 3;
		var a = ev.layers && ev.layers[0] || 1, b = ev.layers && ev.layers[1] || a;
		var d = 0.5 - ((a + b) / 2 - 0.5) / dim;
		return Math.max(-0.45, Math.min(0.45, d)) * 0.92;
	}

	function reducedFlash(api, f) {
		var fc = api.face(f);
		var col = edgeColor(fc.color);
		var hp = hull(api);
		api.add(function(ctx, t) {
			var a = Math.max(0, 1 - t / 160);
			ctx.strokeStyle = rgba(col, a * 0.9);
			ctx.lineWidth = 2;
			ctx.beginPath();
			if (fc.visible) {
				fc.corners.forEach(function(p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
				ctx.closePath();
			} else {
				hullPath(ctx, hp);
			}
			ctx.stroke();
			return t < 160;
		});
	}

	function onMove(api, ev) {
		if (ev.phase != 'start') {
			return;
		}
		if (api.reduced) {
			reducedFlash(api, ev.face);
			return;
		}
		var combo = Math.min(12, ev.combo || 1);
		var boost = 1 + Math.max(0, combo - 3) * 0.03;
		var wide = ev.layers && Math.abs(ev.layers[1] - ev.layers[0]) >= 1 && !ev.rotation;
		if (ev.rotation) {
			// a pair of thin, wide, ghostly arcs for whole-cube rotations
			push(api, makeSlash(api, ev.face, ev.amount, 0.25, { radius: 0.8, width: 0.07, alpha: 0.55, dur: 220, span: 3.6 }));
			push(api, makeSlash(api, ev.face, ev.amount, -0.25, { radius: 0.8, width: 0.07, alpha: 0.55, dur: 220, span: 3.6, delay: 30 }));
			return;
		}
		push(api, makeSlash(api, ev.face, ev.amount, layerDepth(ev), { width: (wide ? 0.21 : 0.16) * boost, radius: wide ? 0.76 : 0.72 }));
		if (combo >= 8) {
			// fast streak: a thin twin blade a beat behind
			push(api, makeSlash(api, ev.face, ev.amount, layerDepth(ev), { width: 0.05, radius: 0.8, alpha: 0.6, delay: 25, span: 4.0 }));
		}
	}

	function onSolve(api) {
		if (api.reduced) {
			reducedFlash(api, 'F');
			return;
		}
		// three ring slashes around each axis, then a giant diagonal cut across the cube with a flash
		var seq = [['U', 1, 0.22], ['R', -1, 0.0], ['F', 1, -0.22], ['U', -1, -0.3], ['R', 1, 0.3]];
		for (var i = 0; i < seq.length; i++) {
			push(api, makeSlash(api, seq[i][0], seq[i][1], seq[i][2], { width: 0.16, radius: 0.74 + i * 0.03, dur: 260, delay: i * 90, span: 5.4 }));
		}
		var cb = api.cube();
		var born = performance.now() + 560;
		var cuts = [[-1, -0.75, 1, 0.75], [1, -0.85, -1, 0.85]];
		cuts.forEach(function(cut, ci) {
			slashes.push({
				born: born + ci * 110,
				dur: 520,
				draw: function(ctx, t) {
					var R = cb.radius * 1.9;
					var x0 = cb.center.x + cut[0] * R, y0 = cb.center.y + cut[1] * R;
					var x1 = cb.center.x + cut[2] * R, y1 = cb.center.y + cut[3] * R;
					var grow = easeOut(t / 120);
					var fade = t < 200 ? 1 : Math.max(0, 1 - (t - 200) / 320);
					var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy);
					var nx = -dy / L, ny = dx / L;
					var w = cb.radius * 0.11 * (1 - 0.6 * easeIn(t / 520));
					var ex = x0 + dx * grow, ey = y0 + dy * grow;
					var k, j, steps = 24;
					for (k = 0; k < 2; k++) {
						var ww = k ? w * 0.4 : w;
						ctx.fillStyle = k ? 'rgba(255,255,255,' + fade.toFixed(3) + ')' : 'rgba(255,90,120,' + (fade * 0.95).toFixed(3) + ')';
						ctx.beginPath();
						for (j = 0; j <= steps; j++) {
							var u = j / steps;
							var bulge = Math.sin(Math.PI * u) * cb.radius * 0.18;
							var px = x0 + (ex - x0) * u + nx * bulge, py = y0 + (ey - y0) * u + ny * bulge;
							var wu = ww * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.6)), 0.9);
							j ? ctx.lineTo(px + nx * wu, py + ny * wu) : ctx.moveTo(px + nx * wu, py + ny * wu);
						}
						for (j = steps; j >= 0; j--) {
							var u2 = j / steps;
							var b2 = Math.sin(Math.PI * u2) * cb.radius * 0.18;
							var qx = x0 + (ex - x0) * u2 + nx * b2, qy = y0 + (ey - y0) * u2 + ny * b2;
							var w2 = ww * 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(u2, 1.6)), 0.9);
							ctx.lineTo(qx - nx * w2, qy - ny * w2);
						}
						ctx.closePath();
						ctx.fill();
					}
					// brief white flash over the cube when the second cut lands (alpha <= 0.22, ~180 ms)
					if (ci == 1 && t > 80 && t < 260) {
						var fa = 0.22 * (1 - (t - 80) / 180);
						var g = ctx.createRadialGradient(cb.center.x, cb.center.y, 0, cb.center.x, cb.center.y, cb.radius * 1.6);
						g.addColorStop(0, 'rgba(255,255,255,' + fa.toFixed(3) + ')');
						g.addColorStop(1, 'rgba(255,255,255,0)');
						ctx.fillStyle = g;
						ctx.fillRect(cb.center.x - cb.radius * 1.6, cb.center.y - cb.radius * 1.6, cb.radius * 3.2, cb.radius * 3.2);
					}
				}
			});
		});
		drive(api);
		setTimeout(function() {
			api.shake(3, 220);
		}, 700);
	}

	return { id: 'slash', name: 'Blade Slash', onMove: onMove, onSolve: onSolve };
}());
