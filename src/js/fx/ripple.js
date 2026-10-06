"use strict";

// Zen Ripple: calm concentric water rings that spread from the turning face's side of the cube out into the
// margin (never over the stickers: they are clipped to the outside of the cube silhouette), plus a soft sheen
// that glides along the turning face's edge while it turns.
(function() {
	var MAX_RIPPLES = 28; // rings alive at once (oldest dropped first)
	var MAX_SHEENS = 6;
	var RING_MS = 560;
	var SHEEN_MS = 260;
	var ripples = [];
	var sheens = [];
	var running = false;
	var conic = null; // createConicGradient supported?

	function clamp(v, a, b) {
		return v < a ? a : v > b ? b : v;
	}

	function rgb(hex) {
		var h = (hex || '#ffffff').replace('#', '');
		if (h.length == 3) {
			h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
		}
		var n = parseInt(h, 16) || 0;
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}

	function mix(c, d, k) {
		return [Math.round(c[0] + (d[0] - c[0]) * k), Math.round(c[1] + (d[1] - c[1]) * k), Math.round(c[2] + (d[2] - c[2]) * k)];
	}

	function rgba(c, a) {
		return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')';
	}

	// ---------- geometry ----------
	function cross(o, a, b) {
		return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	}

	// convex hull of all sticker corners, inflated a little so it covers the cube body
	function silhouette(api) {
		var pts = [];
		var fs = 'URFDLB';
		for (var i = 0; i < 6; i++) {
			var f = api.face(fs.charAt(i));
			if (f) {
				pts = pts.concat(f.corners);
			}
		}
		pts.sort(function(a, b) {
			return a.x - b.x || a.y - b.y;
		});
		var lower = [], upper = [], j;
		for (j = 0; j < pts.length; j++) {
			while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[j]) <= 0) {
				lower.pop();
			}
			lower.push(pts[j]);
		}
		for (j = pts.length - 1; j >= 0; j--) {
			while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[j]) <= 0) {
				upper.pop();
			}
			upper.push(pts[j]);
		}
		lower.pop();
		upper.pop();
		var hull = lower.concat(upper);
		var c = api.cube().center;
		var k = 1.1;
		for (j = 0; j < hull.length; j++) {
			hull[j] = { x: c.x + (hull[j].x - c.x) * k, y: c.y + (hull[j].y - c.y) * k };
		}
		return hull;
	}

	// distance from c along unit direction n to the hull boundary
	function rayHull(c, n, hull) {
		var best = 0;
		for (var i = 0; i < hull.length; i++) {
			var a = hull[i], b = hull[(i + 1) % hull.length];
			var ex = b.x - a.x, ey = b.y - a.y;
			var den = n.x * ey - n.y * ex;
			if (Math.abs(den) < 1e-6) {
				continue;
			}
			var ax = a.x - c.x, ay = a.y - c.y;
			var t = (ax * ey - ay * ex) / den;
			var s = (ax * n.y - ay * n.x) / den;
			if (t > 0 && s >= -0.001 && s <= 1.001 && t > best) {
				best = t;
			}
		}
		return best;
	}

	function hullPath(ctx, hull) {
		for (var i = 0; i < hull.length; i++) {
			if (i) {
				ctx.lineTo(hull[i].x, hull[i].y);
			} else {
				ctx.moveTo(hull[i].x, hull[i].y);
			}
		}
		ctx.closePath();
	}

	// ---------- drawing ----------
	function ringStyle(ctx, c, ang, half, col, alpha) {
		if (half >= Math.PI - 0.01) {
			return rgba(col, alpha);
		}
		if (conic) {
			var g = ctx['createConicGradient'](ang - Math.PI, c.x, c.y);
			var lo = clamp(0.5 - half / (2 * Math.PI), 0, 0.5), hi = 1 - lo;
			g.addColorStop(0, rgba(col, 0));
			g.addColorStop(lo, rgba(col, 0));
			g.addColorStop(lo + (0.5 - lo) * 0.45, rgba(col, alpha * 0.55));
			g.addColorStop(0.5, rgba(col, alpha));
			g.addColorStop(hi - (hi - 0.5) * 0.45, rgba(col, alpha * 0.55));
			g.addColorStop(hi, rgba(col, 0));
			g.addColorStop(1, rgba(col, 0));
			return g;
		}
		return null;
	}

	function strokeRing(ctx, c, r, ang, half, col, alpha, width) {
		var st = ringStyle(ctx, c, ang, half, col, alpha);
		ctx.lineWidth = width;
		if (st) {
			ctx.strokeStyle = st;
			ctx.beginPath();
			if (half >= Math.PI - 0.01) {
				ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
			} else {
				ctx.arc(c.x, c.y, r, ang - half, ang + half);
			}
			ctx.stroke();
			return;
		}
		// fallback: tapered arc out of a few segments
		var segs = 8;
		for (var i = 0; i < segs; i++) {
			var a0 = ang - half + 2 * half * i / segs, a1 = ang - half + 2 * half * (i + 1) / segs;
			var mid = (i + 0.5) / segs;
			ctx.strokeStyle = rgba(col, alpha * Math.sin(mid * Math.PI));
			ctx.beginPath();
			ctx.arc(c.x, c.y, r, a0, a1);
			ctx.stroke();
		}
	}

	function drawRipple(ctx, rp, now, c, hull) {
		var t = (now - rp.start) / rp.dur;
		if (t < 0) {
			return true;
		}
		if (t >= 1) {
			return false;
		}
		var e = 1 - Math.pow(1 - t, 3); // ease out
		var d0 = rp.full ? 0 : rayHull(c, rp.n, hull);
		if (rp.full) {
			d0 = rp.d0;
		}
		var r = d0 * 0.97 + rp.reach * e;
		var env = Math.sin(Math.min(1, t * 5) * Math.PI / 2) * Math.pow(1 - t, 1.3);
		var half = rp.half * (0.75 + 0.25 * e);
		var ang = Math.atan2(rp.n.y, rp.n.x);
		var w = rp.width * (1 - 0.55 * e);
		// soft tinted under-line (reads on light backgrounds), then a pastel/white crest slightly inside it
		strokeRing(ctx, c, r + w * 0.55, ang, half, rp.shade, env * 0.85 * rp.power, w);
		strokeRing(ctx, c, r - w * 0.45, ang, half, rp.crest, env * rp.power, w);
		return true;
	}

	function drawSheen(ctx, sh, now, c, hull) {
		var t = (now - sh.start) / sh.dur;
		if (t < 0) {
			return true;
		}
		if (t >= 1) {
			return false;
		}
		var env = Math.sin(t * Math.PI);
		var p = -0.25 + 1.5 * t; // band position along the edge
		var ax = sh.a.x, ay = sh.a.y, bx = sh.b.x, by = sh.b.y;
		var b0 = clamp(p - 0.22, 0, 1), b1 = clamp(p, 0, 1), b2 = clamp(p + 0.22, 0, 1);
		var band = function(col, a) {
			var g = ctx.createLinearGradient(ax, ay, bx, by);
			g.addColorStop(0, rgba(col, 0));
			g.addColorStop(b0, rgba(col, 0));
			g.addColorStop(b1, rgba(col, a));
			g.addColorStop(b2, rgba(col, 0));
			g.addColorStop(1, rgba(col, 0));
			return g;
		};
		var a0 = env * sh.power;
		ctx.save();
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		if (sh.poly) {
			// visible face: thin glint along its outline
			ctx.beginPath();
			hullPath(ctx, sh.poly);
			ctx.strokeStyle = band(sh.shade, 0.5 * a0);
			ctx.lineWidth = 4.5;
			ctx.stroke();
			ctx.strokeStyle = band([255, 255, 255], 0.95 * a0);
			ctx.lineWidth = 2;
			ctx.stroke();
		} else {
			// hidden face: glint along the silhouette edge on that side only
			var n = sh.n, d = rayHull(c, n, hull) * 0.55, big = 4000;
			var px = c.x + n.x * d, py = c.y + n.y * d;
			ctx.beginPath();
			ctx.moveTo(px - n.y * big, py + n.x * big);
			ctx.lineTo(px + n.x * big - n.y * big, py + n.y * big + n.x * big);
			ctx.lineTo(px + n.x * big + n.y * big, py + n.y * big - n.x * big);
			ctx.lineTo(px + n.y * big, py - n.x * big);
			ctx.closePath();
			ctx.clip();
			ctx.beginPath();
			hullPath(ctx, hull);
			ctx.strokeStyle = band(sh.shade, 0.5 * a0);
			ctx.lineWidth = 5;
			ctx.stroke();
			ctx.strokeStyle = band([255, 255, 255], 0.95 * a0);
			ctx.lineWidth = 2.2;
			ctx.stroke();
		}
		ctx.restore();
		return true;
	}

	function ensureRunning(api) {
		if (running) {
			return;
		}
		running = true;
		api.add(function(ctx) {
			var now = performance.now();
			var c = api.cube().center;
			var hull = silhouette(api);
			var i, keep;
			if (ripples.length) {
				// only ever draw outside the cube silhouette
				ctx.save();
				ctx.beginPath();
				ctx.rect(-10, -10, api.w + 20, api.h + 20);
				hullPath(ctx, hull);
				ctx.clip('evenodd');
				ctx.lineCap = 'round';
				keep = [];
				for (i = 0; i < ripples.length; i++) {
					if (drawRipple(ctx, ripples[i], now, c, hull)) {
						keep.push(ripples[i]);
					}
				}
				ripples = keep;
				ctx.restore();
			}
			keep = [];
			for (i = 0; i < sheens.length; i++) {
				if (drawSheen(ctx, sheens[i], now, c, hull)) {
					keep.push(sheens[i]);
				}
			}
			sheens = keep;
			if (!ripples.length && !sheens.length) {
				running = false;
				return false;
			}
			return true;
		});
	}

	function pushRipple(rp) {
		ripples.push(rp);
		while (ripples.length > MAX_RIPPLES) {
			ripples.shift();
		}
	}

	function pushSheen(sh) {
		sheens.push(sh);
		while (sheens.length > MAX_SHEENS) {
			sheens.shift();
		}
	}

	function palette(hex) {
		var c = rgb(hex);
		var lum = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255; // bright faces (white, yellow) need a deeper shade line
		return { crest: mix(c, [255, 255, 255], 0.8), shade: mix(c, [70, 90, 130], 0.35 + 0.35 * lum) };
	}

	// ---------- reduced motion: one short static outline ----------
	function reducedFlash(api, ev) {
		var f = api.face(ev.face);
		var col = palette(f.color).shade;
		api.add(function(ctx, t) {
			var k = 1 - t / 220;
			if (k <= 0) {
				return false;
			}
			ctx.lineJoin = 'round';
			ctx.lineWidth = 2;
			ctx.strokeStyle = rgba(col, 0.6 * k);
			ctx.beginPath();
			if (f.visible && !ev.rotation) {
				hullPath(ctx, f.corners);
			} else {
				hullPath(ctx, silhouette(api));
			}
			ctx.stroke();
			return true;
		});
	}

	jlFx.register({
		id: 'ripple',
		name: 'Zen Ripple',
		onMove: function(api, ev) {
			if (conic === null) {
				conic = typeof api.ctx['createConicGradient'] == 'function';
			}
			if (api.reduced) {
				if (ev.phase == 'end') {
					reducedFlash(api, ev);
				}
				return;
			}
			var now = performance.now();
			var cb = api.cube();
			var R = cb.radius;
			var f = api.face(ev.face);
			if (!f) {
				return;
			}
			var pal = palette(f.color);
			if (ev.phase == 'start') {
				if (ev.rotation) {
					return;
				}
				var sh = { start: now, dur: SHEEN_MS, power: 1, n: f.normal, shade: pal.shade };
				if (f.visible) {
					sh.poly = f.corners;
					sh.a = f.corners[0];
					sh.b = f.corners[2];
				} else {
					// sweep across the silhouette side, perpendicular to the normal
					sh.a = { x: cb.center.x + f.normal.y * R, y: cb.center.y - f.normal.x * R };
					sh.b = { x: cb.center.x - f.normal.y * R, y: cb.center.y + f.normal.x * R };
				}
				pushSheen(sh);
				ensureRunning(api);
				return;
			}
			// phase 'end': the ripples
			var hull = silhouette(api);
			if (ev.rotation) {
				// whole cube moved: one faint full ring all around
				pushRipple({ start: now, dur: RING_MS + 120, full: true, d0: R * 1.02, n: { x: 0, y: -1 }, half: Math.PI,
					reach: R * 0.32, width: 2, power: 0.75, crest: [255, 255, 255], shade: [70, 80, 100] });
				ensureRunning(api);
				return;
			}
			var dx = f.center.x - cb.center.x, dy = f.center.y - cb.center.y;
			var m = clamp(Math.sqrt(dx * dx + dy * dy) / R, 0, 1); // ~0 for a face pointing at the viewer
			var half = (40 + 110 * clamp(1 - m / 0.85, 0, 1)) * Math.PI / 180;
			var wide = ev.layers && ev.layers[1] > 1 && !(ev.layers[0] > 1);
			var combo = ev.combo || 1;
			var rings = 2 + (wide ? 1 : 0); // speed escalates reach/brightness, not ring count (stays calm)
			var power = 0.8 + 0.2 * clamp((combo - 1) / 8, 0, 1);
			var reach = R * (0.42 + 0.08 * clamp((combo - 1) / 10, 0, 1)) * (Math.abs(ev.amount) == 2 ? 1.15 : 1);
			var d0 = rayHull(cb.center, f.normal, hull);
			for (var i = 0; i < rings; i++) {
				pushRipple({ start: now + i * 85, dur: RING_MS - i * 30, n: f.normal, half: half * (1 - i * 0.08),
					reach: reach * (1 - i * 0.12), width: 3 - i * 0.4, power: power * (1 - i * 0.18),
					crest: pal.crest, shade: pal.shade, d0: d0 });
			}
			ensureRunning(api);
		},
		onSolve: function(api) {
			if (conic === null) {
				conic = typeof api.ctx['createConicGradient'] == 'function';
			}
			var cb = api.cube(), R = cb.radius;
			if (api.reduced) {
				reducedFlash(api, { face: 'U', rotation: true });
				return;
			}
			var now = performance.now();
			var order = 'URFDLB';
			ripples = [];
			for (var i = 0; i < 6; i++) {
				var pal = palette(api.face(order.charAt(i)).color);
				pushRipple({ start: now + i * 190, dur: 1500, full: true, d0: R * 1.0, n: { x: 0, y: -1 }, half: Math.PI,
					reach: R * 0.62, width: 2.6, power: 0.95, crest: pal.crest, shade: pal.shade });
			}
			// a slow sheen circling the silhouette
			for (var j = 0; j < 4; j++) {
				var a = j * Math.PI / 2 - Math.PI / 4;
				var n = { x: Math.cos(a), y: Math.sin(a) };
				pushSheen({ start: now + j * 260, dur: 700, power: 1, n: n, shade: [90, 110, 150],
					a: { x: cb.center.x + n.y * R, y: cb.center.y - n.x * R }, b: { x: cb.center.x - n.y * R, y: cb.center.y + n.x * R } });
			}
			ensureRunning(api);
		},
		onScramble: function(api) {
			if (api.reduced) {
				return;
			}
			var R = api.cube().radius;
			ripples = [];
			sheens = [];
			pushRipple({ start: performance.now(), dur: 900, full: true, d0: R * 1.0, n: { x: 0, y: -1 }, half: Math.PI,
				reach: R * 0.4, width: 1.8, power: 0.6, crest: [255, 255, 255], shade: [70, 80, 100] });
			ensureRunning(api);
		}
	});
})();
