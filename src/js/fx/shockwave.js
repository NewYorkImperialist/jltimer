"use strict";

// Shockwave: when a layer lands, a crisp outline of the face's quad (in perspective) pulses outward
// from the face edges and fades, with a faint refraction-like halo that follows the cube silhouette
// (always clipped to outside the cube). Hidden faces pulse the silhouette edge on their side instead.
(function() {
	var MAX_LIVE = 14; // live shockwaves; the oldest are dropped first
	var live = [];
	var finale = false; // during the solve finale the cap is lifted (it is short and bounded)
	var BODY = 1.03; // the projected face corners sit just inside the cube body's outline
	var WHITE = [255, 255, 255];

	function track(api, fn) {
		var rec = { dead: false };
		live.push(rec);
		while (live.length > (finale ? 40 : MAX_LIVE)) {
			live.shift().dead = true;
		}
		api.add(function(ctx, t, dt) {
			var keep = !rec.dead && fn(ctx, t, dt) !== false;
			if (!keep) {
				rec.dead = true;
				var i = live.indexOf(rec);
				if (i != -1) {
					live.splice(i, 1);
				}
			}
			return keep;
		});
	}

	function hexToRgb(hex) {
		var h = (hex || '#ffffff').replace('#', '');
		if (h.length == 3) {
			h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
		}
		var n = parseInt(h, 16) || 0;
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}

	function rgba(c, a) {
		return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
	}

	// darker variant so pale stickers (white/yellow) still read on light themes
	function deepen(c, k) {
		return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
	}

	function easeOut(x) {
		return 1 - Math.pow(1 - x, 3);
	}

	// convex hull (monotone chain) of the projected cube, counter-clockwise in screen space
	function silhouette(api) {
		var pts = [], fs = 'URFDLB', cc = api.cube().center;
		for (var i = 0; i < 6; i++) {
			var cs = api.face(fs.charAt(i)).corners;
			for (var j = 0; j < 4; j++) {
				pts.push({ x: cc.x + (cs[j].x - cc.x) * BODY, y: cc.y + (cs[j].y - cc.y) * BODY });
			}
		}
		pts.sort(function(a, b) { return a.x - b.x || a.y - b.y; });
		function cross(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lo = [], hi = [], k;
		for (k = 0; k < pts.length; k++) {
			while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[k]) <= 0) {
				lo.pop();
			}
			lo.push(pts[k]);
		}
		for (k = pts.length - 1; k >= 0; k--) {
			while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], pts[k]) <= 0) {
				hi.pop();
			}
			hi.push(pts[k]);
		}
		lo.pop();
		hi.pop();
		return { pts: lo.concat(hi), center: cc };
	}

	function polyPath(ctx, pts, cx, cy, s, closed) {
		ctx.beginPath();
		for (var i = 0; i < pts.length; i++) {
			var x = cx + (pts[i].x - cx) * s, y = cy + (pts[i].y - cy) * s;
			if (i) {
				ctx.lineTo(x, y);
			} else {
				ctx.moveTo(x, y);
			}
		}
		if (closed) {
			ctx.closePath();
		}
	}

	// clip that excludes the cube silhouette, so halos never sit on the stickers
	function clipOutside(ctx, api, sil) {
		ctx.beginPath();
		ctx.rect(0, 0, api.w, api.h);
		var p = sil.pts;
		ctx.moveTo(p[0].x, p[0].y);
		for (var i = p.length - 1; i > 0; i--) {
			ctx.lineTo(p[i].x, p[i].y);
		}
		ctx.closePath();
		ctx.clip('evenodd');
	}

	// four-pass stroke: faint dark contrast line, soft colored body, crisp deep core, white highlight
	function crisp(ctx, col, deep, a, e, width) {
		ctx.strokeStyle = 'rgba(0,0,0,' + (0.22 * a).toFixed(3) + ')';
		ctx.lineWidth = (4.6 * (1 - e) + 2.4) * width;
		ctx.stroke();
		ctx.strokeStyle = rgba(col, 0.4 * a);
		ctx.lineWidth = (9 * (1 - e) + 2.5) * width;
		ctx.stroke();
		ctx.strokeStyle = rgba(deep, 0.95 * a);
		ctx.lineWidth = (3.2 * (1 - e) + 1.2) * width;
		ctx.stroke();
		ctx.strokeStyle = rgba(WHITE, 0.85 * a);
		ctx.lineWidth = (1.3 * (1 - e) + 0.5) * width;
		ctx.stroke();
	}

	// the crisp expanding quad outline of a visible face
	function quadWave(api, f, opt) {
		var col = hexToRgb(f.color), deep = deepen(col, 0.6);
		var cs = f.corners.map(function(p) { return { x: p.x, y: p.y }; });
		var cx = f.center.x, cy = f.center.y;
		var dur = opt.dur, k = opt.k, delay = opt.delay || 0;
		track(api, function(ctx, t) {
			t -= delay;
			if (t < 0) {
				return true;
			}
			var x = Math.min(1, t / dur);
			var e = easeOut(x), fade = 1 - x;
			ctx.lineJoin = 'round';
			// impact flash on the face edges themselves (brief, outline only)
			if (t < 120 && !opt.ghost) {
				var fl = 1 - t / 120;
				polyPath(ctx, cs, cx, cy, 1, true);
				ctx.strokeStyle = rgba(WHITE, 0.9 * fl * k);
				ctx.lineWidth = 4 * fl + 1;
				ctx.stroke();
			}
			polyPath(ctx, cs, cx, cy, 1 + opt.grow * e, true);
			crisp(ctx, col, deep, Math.pow(fade, 1.4) * k, e, opt.width);
			return x < 1;
		});
	}

	// hidden face: the silhouette edge on that side pulses outward (never drawn over the visible stickers)
	function edgeWave(api, f, opt, sil) {
		var col = hexToRgb(f.color), deep = deepen(col, 0.6);
		var p = sil.pts, n = p.length, nx = f.normal.x, ny = f.normal.y;
		// pick the hull edges whose outward normal faces the same way as the hidden face
		var sel = [], best = -2, bi = 0, i;
		for (i = 0; i < n; i++) {
			var a = p[i], b = p[(i + 1) % n];
			var ex = b.x - a.x, ey = b.y - a.y, len = Math.sqrt(ex * ex + ey * ey) || 1;
			var d = (ey * nx - ex * ny) / len; // outward normal of a ccw hull in screen coords is (ey, -ex)
			sel.push(d > 0.4);
			if (d > best) {
				best = d;
				bi = i;
			}
		}
		// walk the contiguous run of selected edges that contains the best one
		var s = bi, cnt = 0;
		while (sel[(s - 1 + n) % n] && cnt < n) {
			s = (s - 1 + n) % n;
			cnt++;
		}
		var chain = [p[s]];
		for (i = s, cnt = 0; cnt < n && (cnt == 0 || sel[i]); i = (i + 1) % n, cnt++) {
			chain.push(p[(i + 1) % n]);
		}
		var cc = sil.center, R = api.cube().radius;
		var dur = opt.dur, k = opt.k, delay = opt.delay || 0;
		track(api, function(ctx, t) {
			t -= delay;
			if (t < 0) {
				return true;
			}
			var x = Math.min(1, t / dur);
			var e = easeOut(x), fade = 1 - x;
			var off = R * opt.grow * 0.55 * e + 3;
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			clipOutside(ctx, api, sil);
			ctx.translate(nx * off, ny * off);
			polyPath(ctx, chain, cc.x, cc.y, 1 + 0.12 * e, false);
			crisp(ctx, col, deep, Math.pow(fade, 1.4) * k, e, opt.width * 1.25);
			return x < 1;
		});
	}

	// faint refraction-like halo following the silhouette, clipped to outside the cube
	function haloWave(api, f, opt, sil) {
		var col = hexToRgb(f ? f.color : '#ffffff');
		var cc = sil.center, R = api.cube().radius;
		var ox = 0, oy = 0;
		if (f) {
			var dx = f.center.x - cc.x, dy = f.center.y - cc.y;
			var dl = Math.sqrt(dx * dx + dy * dy);
			if (!f.visible || dl > R * 0.2) { // nudge towards the turning face's side
				ox = f.normal.x * R * 0.08;
				oy = f.normal.y * R * 0.08;
			}
		}
		var dur = opt.dur * 1.2, k = opt.k, delay = opt.delay || 0;
		track(api, function(ctx, t) {
			t -= delay;
			if (t < 0) {
				return true;
			}
			var x = Math.min(1, t / dur);
			var e = easeOut(x), fade = 1 - x;
			var a = 0.22 * fade * k;
			if (a < 0.005) {
				return x < 1;
			}
			clipOutside(ctx, api, sil);
			ctx.translate(ox * e, oy * e);
			ctx.lineJoin = 'round';
			var s = 1 + opt.grow * 0.32 * e;
			polyPath(ctx, sil.pts, cc.x, cc.y, s, true);
			ctx.strokeStyle = rgba(col, a * 0.35);
			ctx.lineWidth = 22 * (1 - 0.4 * e);
			ctx.stroke();
			ctx.strokeStyle = rgba(col, a * 0.6);
			ctx.lineWidth = 10 * (1 - 0.4 * e);
			ctx.stroke();
			// thin dark inner rim + bright outer rim: reads as a lens/refraction edge on light and dark themes
			polyPath(ctx, sil.pts, cc.x, cc.y, s - 0.012, true);
			ctx.strokeStyle = 'rgba(0,0,0,' + (a * 0.5).toFixed(3) + ')';
			ctx.lineWidth = 1.5;
			ctx.stroke();
			polyPath(ctx, sil.pts, cc.x, cc.y, s + 0.012, true);
			ctx.strokeStyle = rgba(WHITE, a * 2.2);
			ctx.lineWidth = 1.5;
			ctx.stroke();
			return x < 1;
		});
	}

	function onMove(api, ev) {
		if (ev.phase != 'end') {
			return;
		}
		var sil = silhouette(api);
		if (ev.rotation) {
			if (!api.reduced) {
				haloWave(api, null, { dur: 380, grow: 0.7, k: 0.9 }, sil);
			}
			return;
		}
		var f = api.face(ev.face);
		if (!f) {
			return;
		}
		if (api.reduced) {
			// short static outline flash, no motion
			var hid = { dur: 200, grow: 0, k: 1, width: 0.9, ghost: true };
			(f.visible ? quadWave : edgeWave)(api, f, hid, sil);
			return;
		}
		// combo escalation: a little stronger and wider with speed, but still restrained
		var c = Math.min(1, Math.max(0, (ev.combo || 1) - 1) / 12);
		var fast = ev.tps >= 8;
		var opt = {
			dur: fast ? 300 : 420,
			grow: 0.3 + 0.12 * c,
			k: 0.85 + 0.15 * c,
			width: 1 + 0.25 * c
		};
		var wide = ev.layers && ev.layers[1] > 1 && ev.layers[0] <= 1;
		var wave = f.visible ? quadWave : edgeWave;
		wave(api, f, opt, sil);
		if (wide) {
			wave(api, f, { dur: opt.dur, grow: opt.grow * 0.75, k: opt.k * 0.7, width: opt.width * 0.8, delay: 55, ghost: true }, sil);
		}
		// halo: skip every other one at high TPS to keep it calm
		if (!fast || (ev.combo % 2) == 0) {
			haloWave(api, f, { dur: opt.dur, grow: 0.6 + 0.25 * c, k: opt.k * (Math.abs(ev.amount) == 2 ? 1.3 : 1) }, sil);
		}
	}

	function onSolve(api) {
		var faces = ['U', 'R', 'F', 'D', 'L', 'B'];
		var sil = silhouette(api);
		finale = true;
		while (live.length) {
			live.shift().dead = true;
		}
		if (api.reduced) {
			for (var j = 0; j < faces.length; j++) {
				var g = api.face(faces[j]);
				if (g && g.visible) {
					quadWave(api, g, { dur: 300, grow: 0, k: 1, width: 0.8, ghost: true });
				}
			}
			finale = false;
			return;
		}
		for (var i = 0; i < faces.length; i++) {
			var f = api.face(faces[i]);
			if (!f) {
				continue;
			}
			for (var n = 0; n < 2; n++) {
				var opt = { dur: 750 + n * 150, grow: 0.45 + n * 0.3, k: 1 - n * 0.3, width: 1.3 - n * 0.3, delay: n * 300 + i * 40, ghost: n > 0 };
				(f.visible ? quadWave : edgeWave)(api, f, opt, sil);
			}
		}
		for (var m = 0; m < 3; m++) {
			haloWave(api, null, { dur: 1000, grow: 1.3 + m * 0.5, k: 1.7 - m * 0.4, delay: m * 280 }, sil);
		}
		finale = false;
		api.shake(2, 220);
	}

	jlFx.register({ id: 'shockwave', name: 'Shockwave', onMove: onMove, onSolve: onSolve });
})();
