"use strict";

// RGB Glitch: chromatic-aberration outlines (red/cyan) of the turning face jitter in stepped bursts,
// horizontal scanline slices and data-block fragments flick out to the side of the cube (clipped
// to the area outside the cube silhouette, so stickers stay readable). On 'end' the channels snap back.
(function() {
	var RED = '#ff2b4e', CYAN = '#1ff4ff', WHITE = '#f4fbff', COMP = 'lighter';
	var themeAt = -1e9;
	var MAX_OUT = 14, MAX_SLICE = 48, MAX_BLOCK = 140;
	var outs = [], slices = [], blocks = [];
	var hull = null, hullCenter = { x: 0, y: 0 }, hullR = 50;
	var running = false;
	var api = null;
	var solveFx = null;
	var lastEv = -1e9, lastPhase = '';

	function now() {
		return performance.now();
	}

	// light page backgrounds wash out additive colors: switch to deeper inks + multiply there
	function detectTheme() {
		var T = now();
		if (T - themeAt < 3000) {
			return;
		}
		themeAt = T;
		var el = api.ctx.canvas.parentNode, lum = 0;
		while (el && el.nodeType == 1) {
			var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor || '');
			if (m && (m[4] === undefined || +m[4] > 0.5)) {
				lum = (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255;
				break;
			}
			el = el.parentNode;
		}
		if (lum > 0.55) {
			RED = '#ff0a47';
			CYAN = '#00a9d9';
			WHITE = '#1a1426';
			COMP = 'multiply';
		} else {
			RED = '#ff2b4e';
			CYAN = '#1ff4ff';
			WHITE = '#f4fbff';
			COMP = 'lighter';
		}
	}

	function r() {
		return api.rand();
	}

	// convex hull (monotone chain) of all sticker corners = cube silhouette
	function computeHull() {
		detectTheme();
		var pts = [];
		var fs = 'URFDLB';
		for (var i = 0; i < 6; i++) {
			var fc = api.face(fs.charAt(i));
			var c = fc.center;
			for (var j = 0; j < 4; j++) {
				var p = fc.corners[j];
				// push from 0.43 (sticker edge) out to the cube body (0.5)
				pts.push({ x: p.x, y: p.y, cx: c.x, cy: c.y });
			}
		}
		var cb = api.cube();
		hullCenter = cb.center;
		hullR = cb.radius;
		var k = 0.5 / 0.43;
		pts = pts.map(function(p) {
			return { x: hullCenter.x + (p.x - hullCenter.x) * k, y: hullCenter.y + (p.y - hullCenter.y) * k };
		});
		pts.sort(function(a, b) {
			return a.x == b.x ? a.y - b.y : a.x - b.x;
		});
		function cross(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lower = [], upper = [];
		for (i = 0; i < pts.length; i++) {
			while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
				lower.pop();
			}
			lower.push(pts[i]);
		}
		for (i = pts.length - 1; i >= 0; i--) {
			while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
				upper.pop();
			}
			upper.push(pts[i]);
		}
		lower.pop();
		upper.pop();
		hull = lower.concat(upper);
	}

	function hullSegs() {
		var segs = [];
		for (var i = 0; i < hull.length; i++) {
			segs.push([hull[i], hull[(i + 1) % hull.length]]);
		}
		return segs;
	}

	// segments outlining face f: its own (slightly enlarged) quad if visible, else the silhouette edges on that side
	function faceSegs(f) {
		var fc = api.face(f);
		var segs = [];
		var n = fc.normal;
		if (fc.visible) {
			var c = fc.center, k = 1.13, q = [];
			for (var i = 0; i < 4; i++) {
				q.push({ x: c.x + (fc.corners[i].x - c.x) * k, y: c.y + (fc.corners[i].y - c.y) * k });
			}
			for (i = 0; i < 4; i++) {
				segs.push([q[i], q[(i + 1) % 4]]);
			}
		} else {
			for (i = 0; i < hull.length; i++) {
				var a = hull[i], b = hull[(i + 1) % hull.length];
				var mx = (a.x + b.x) / 2 - hullCenter.x, my = (a.y + b.y) / 2 - hullCenter.y;
				var l = Math.sqrt(mx * mx + my * my) || 1;
				if ((mx * n.x + my * n.y) / l > 0.3) {
					// nudge outward so the line hugs the silhouette from outside
					segs.push([{ x: a.x + n.x * 2, y: a.y + n.y * 2 }, { x: b.x + n.x * 2, y: b.y + n.y * 2 }]);
				}
			}
			if (!segs.length) {
				segs = hullSegs();
			}
		}
		return { segs: segs, normal: n, visible: fc.visible, color: fc.color };
	}

	function bounds(segs) {
		var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
		for (var i = 0; i < segs.length; i++) {
			for (var j = 0; j < 2; j++) {
				var p = segs[i][j];
				b.x0 = Math.min(b.x0, p.x);
				b.x1 = Math.max(b.x1, p.x);
				b.y0 = Math.min(b.y0, p.y);
				b.y1 = Math.max(b.y1, p.y);
			}
		}
		return b;
	}

	function push(arr, item, max) {
		arr.push(item);
		if (arr.length > max) {
			arr.splice(0, arr.length - max);
		}
	}

	function pathSegs(ctx, segs, ox, oy) {
		ctx.beginPath();
		for (var i = 0; i < segs.length; i++) {
			ctx.moveTo(segs[i][0].x + ox, segs[i][0].y + oy);
			ctx.lineTo(segs[i][1].x + ox, segs[i][1].y + oy);
		}
	}

	// ---------- spawners ----------
	function spawnOutline(g, t0, life, amp, kind) {
		push(outs, { segs: g.segs, born: t0, life: life, amp: amp, kind: kind, step: -1, ox: 0, oy: 0, tear: -1, tx: 0 }, MAX_OUT);
	}

	function sideOf(g) {
		if (Math.abs(g.normal.x) > 0.3) {
			return g.normal.x > 0 ? 1 : -1;
		}
		return r() < 0.5 ? -1 : 1;
	}

	function spawnSlices(g, t0, n, lifeK) {
		var b = bounds(g.segs);
		for (var i = 0; i < n; i++) {
			var dir = sideOf(g);
			var y = b.y0 + (b.y1 - b.y0) * r();
			push(slices, {
				y: y, h: r() < 0.3 ? 4 + Math.floor(r() * 5) : 1 + Math.floor(r() * 3), dir: dir,
				len: hullR * (0.6 + r() * 1.0),
				x0: hullCenter.x + dir * hullR * (0.15 + r() * 0.3),
				born: t0 + r() * 60, life: (90 + r() * 170) * lifeK,
				col: r() < 0.45 ? RED : (r() < 0.8 ? CYAN : WHITE), step: -1, dx: 0, on: true
			}, MAX_SLICE);
		}
	}

	function spawnBlocks(g, t0, n, lifeK) {
		var segs = g.segs;
		for (var i = 0; i < n; i++) {
			var s = segs[Math.floor(r() * segs.length)];
			var u = r();
			var px = s[0].x + (s[1].x - s[0].x) * u, py = s[0].y + (s[1].y - s[0].y) * u;
			var dir = sideOf(g);
			var c = r();
			push(blocks, {
				x: px + g.normal.x * 6, y: py + g.normal.y * 6,
				vx: dir * (0.15 + r() * 0.45), vy: g.normal.y * 0.08 * r(),
				w: 5 + Math.floor(r() * 20), h: 3 + Math.floor(r() * 6),
				born: t0 + r() * 80, life: (140 + r() * 220) * lifeK,
				col: c < 0.4 ? RED : (c < 0.8 ? CYAN : (c < 0.9 ? WHITE : g.color)), step: -1, sx: 0, sy: 0, on: true
			}, MAX_BLOCK);
		}
	}

	// ---------- runner ----------
	function ensure() {
		if (running) {
			return;
		}
		running = true;
		api.add(run);
	}

	function clipOutside(ctx) {
		ctx.beginPath();
		ctx.rect(0, 0, api.w, api.h);
		if (hull && hull.length) {
			ctx.moveTo(hull[0].x, hull[0].y);
			for (var i = 1; i < hull.length; i++) {
				ctx.lineTo(hull[i].x, hull[i].y);
			}
			ctx.closePath();
		}
		ctx.clip('evenodd');
	}

	function run(ctx, t) {
		var T = now();
		var i, k, a;
		if (t > 9000) {
			running = false;
			return false;
		}
		// --- outlines (on the face edge) ---
		var alive = 0;
		ctx.lineCap = 'round';
		for (i = 0; i < outs.length; i++) {
			var o = outs[i];
			a = (T - o.born) / o.life;
			if (a >= 1) {
				continue;
			}
			alive++;
			if (a < 0) {
				continue;
			}
			var fade = 1 - a;
			if (o.kind == 'snap') {
				// channels converge onto a white line
				var d = o.amp * (1 - a) * (1 - a);
				ctx.globalCompositeOperation = COMP;
				ctx.lineWidth = 1.6;
				ctx.globalAlpha = 0.75 * fade;
				ctx.strokeStyle = RED;
				pathSegs(ctx, o.segs, d, 0);
				ctx.stroke();
				ctx.strokeStyle = CYAN;
				pathSegs(ctx, o.segs, -d, 0);
				ctx.stroke();
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = 0.9 * fade * fade;
				ctx.strokeStyle = WHITE;
				ctx.lineWidth = 1.2;
				pathSegs(ctx, o.segs, 0, 0);
				ctx.stroke();
				continue;
			}
			// stepped jitter (glitches don't interpolate)
			var step = Math.floor((T - o.born) / 38);
			if (step != o.step) {
				o.step = step;
				o.ox = o.amp * (0.4 + r() * 0.6) * (r() < 0.5 ? -1 : 1);
				o.oy = o.amp * (r() - 0.5) * 0.5;
				o.tear = r() < 0.55 ? Math.floor(r() * o.segs.length) : -1;
				o.tx = (r() - 0.5) * o.amp * 3.5;
				o.blank = r() < 0.12 && a > 0.2;
			}
			if (o.blank) {
				continue;
			}
			var amp = fade * (o.kind == 'rot' ? 0.6 : 1);
			ctx.globalCompositeOperation = COMP;
			ctx.lineWidth = o.kind == 'rot' ? 1.4 : 2.2;
			ctx.globalAlpha = 0.85 * amp;
			ctx.strokeStyle = RED;
			pathSegs(ctx, o.segs, o.ox, o.oy);
			ctx.stroke();
			ctx.strokeStyle = CYAN;
			pathSegs(ctx, o.segs, -o.ox, -o.oy);
			ctx.stroke();
			if (o.tear >= 0) {
				// one segment torn sideways, like a corrupted scanline
				var s = o.segs[o.tear];
				ctx.globalAlpha = 0.9 * amp;
				ctx.strokeStyle = r() < 0.5 ? RED : CYAN;
				ctx.beginPath();
				ctx.moveTo(s[0].x + o.tx, s[0].y);
				ctx.lineTo(s[1].x + o.tx, s[1].y);
				ctx.stroke();
			}
			ctx.globalCompositeOperation = 'source-over';
			if (a < 0.35) {
				ctx.globalAlpha = 0.55 * (1 - a / 0.35);
				ctx.strokeStyle = WHITE;
				ctx.lineWidth = 1;
				pathSegs(ctx, o.segs, 0, 0);
				ctx.stroke();
			}
		}
		if (alive < outs.length) {
			outs = outs.filter(function(o) {
				return T - o.born < o.life;
			});
		}
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';

		// --- slices + blocks, only outside the cube silhouette ---
		if (slices.length || blocks.length) {
			ctx.save();
			clipOutside(ctx);
			var keep = [];
			for (i = 0; i < slices.length; i++) {
				var sl = slices[i];
				a = (T - sl.born) / sl.life;
				if (a >= 1) {
					continue;
				}
				keep.push(sl);
				if (a < 0) {
					continue;
				}
				var st = Math.floor((T - sl.born) / 30);
				if (st != sl.step) {
					sl.step = st;
					sl.dx = sl.dir * hullR * 0.12 * r() * (1 + st * 0.4);
					sl.on = r() > 0.2;
				}
				if (!sl.on) {
					continue;
				}
				k = 1 - a;
				var x0 = sl.x0 + sl.dx, len = sl.len * (0.6 + 0.4 * k);
				var xa = sl.dir > 0 ? x0 : x0 - len;
				ctx.globalAlpha = 0.85 * k;
				ctx.fillStyle = sl.col;
				ctx.fillRect(xa, sl.y, len, sl.h);
				// chromatic ghost of the slice
				ctx.globalAlpha = 0.35 * k;
				ctx.fillStyle = sl.col == RED ? CYAN : RED;
				ctx.fillRect(xa + sl.dir * 4, sl.y + sl.h + 1, len * 0.7, 1);
			}
			slices = keep;
			keep = [];
			for (i = 0; i < blocks.length; i++) {
				var bl = blocks[i];
				var age = T - bl.born;
				a = age / bl.life;
				if (a >= 1) {
					continue;
				}
				keep.push(bl);
				if (a < 0) {
					continue;
				}
				var bs = Math.floor(age / 34);
				if (bs != bl.step) {
					// quantized motion: blocks teleport in steps
					bl.step = bs;
					bl.sx = Math.round(bl.vx * age / 5) * 5;
					bl.sy = Math.round(bl.vy * age / 3) * 3;
					bl.on = r() > 0.15;
				}
				if (!bl.on) {
					continue;
				}
				ctx.globalAlpha = 0.9 * (1 - a * a);
				ctx.fillStyle = bl.col;
				ctx.fillRect(Math.round(bl.x + bl.sx), Math.round(bl.y + bl.sy), bl.w, bl.h);
			}
			blocks = keep;
			ctx.restore();
		}

		if (solveFx && !solveFx(ctx, T)) {
			solveFx = null;
		}

		if (!outs.length && !slices.length && !blocks.length && !solveFx) {
			running = false;
			return false;
		}
		return true;
	}

	// ---------- events ----------
	function onMove(a, ev) {
		api = a;
		var T = now();
		// a scramble applies many moves in the same instant: only react to the first one
		if (T - lastEv < 4 && ev.phase == lastPhase) {
			return;
		}
		lastEv = T;
		lastPhase = ev.phase;
		computeHull();
		var fast = ev.tps >= 8 ? 0.65 : (ev.tps >= 5 ? 0.8 : 1);
		var g = ev.rotation ? { segs: hullSegs(), normal: api.face(ev.face).normal, visible: true, color: WHITE } : faceSegs(ev.face);
		if (api.reduced) {
			if (ev.phase == 'end') {
				spawnOutline(g, T, 160, 0, 'snap');
				ensure();
			}
			return;
		}
		var wide = ev.layers && ev.layers[1] > 1 && !ev.rotation;
		var heat = Math.min(1, (ev.combo || 1) / 15);
		if (ev.phase == 'start') {
			if (ev.rotation) {
				spawnOutline(g, T, 260 * fast, 3, 'rot');
				spawnSlices(g, T, 2, fast);
			} else {
				spawnOutline(g, T, (340 + heat * 80) * fast, (wide ? 7 : 5) + heat * 2.5, 'glitch');
				spawnSlices(g, T, Math.round((4 + heat * 5) * (wide ? 1.4 : 1) * fast), fast);
				spawnBlocks(g, T, Math.round((8 + heat * 12) * (wide ? 1.4 : 1) * fast), fast);
			}
		} else {
			spawnOutline(g, T, 130 * fast, ev.rotation ? 3 : 5, 'snap');
			if (!ev.rotation) {
				spawnSlices(g, T, 1 + Math.round(heat * 2), fast);
			}
		}
		ensure();
	}

	function onScramble(a) {
		api = a;
		computeHull();
		var T = now();
		var g = { segs: hullSegs(), normal: { x: 1, y: 0 }, visible: true, color: WHITE };
		if (api.reduced) {
			spawnOutline(g, T, 180, 0, 'snap');
		} else {
			spawnOutline(g, T, 320, 4, 'rot');
			spawnSlices(g, T, 4, 1);
			spawnSlices({ segs: g.segs, normal: { x: -1, y: 0 }, visible: true, color: WHITE }, T, 4, 1);
		}
		ensure();
	}

	function onSolve(a, info) {
		api = a;
		computeHull();
		var T0 = now();
		var DUR = 2300;
		var segs = hullSegs();
		var label = 'SOLVED';
		var sub = info && info.time ? (info.time / 1000).toFixed(2) + 's' : '';
		var lastBurst = -1;
		var jit = { step: -1, ox: 0, oy: 0, tx: 0, ty: 0 };
		if (api.reduced) {
			spawnOutline({ segs: segs }, T0, 500, 0, 'snap');
			ensure();
			return;
		}
		api.shake(2, 220);
		solveFx = function(ctx, T) {
			var t = T - T0;
			if (t > DUR) {
				return false;
			}
			var p = t / DUR;
			// glitch intensity: big early burst, quick calm, short re-burst before the final snap
			var inten = p < 0.3 ? 1 - p / 0.3 * 0.6 : (p < 0.7 ? 0.4 : (p < 0.8 ? 0.9 : Math.max(0, 1 - (p - 0.8) / 0.2)));
			var fade = p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15;
			var step = Math.floor(t / 45);
			if (step != jit.step) {
				jit.step = step;
				jit.ox = (3 + 7 * inten) * (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5);
				jit.oy = (r() - 0.5) * 3 * inten;
				jit.tx = (r() - 0.5) * 14 * inten;
				jit.ty = (r() - 0.5) * 4 * inten;
			}
			// periodic bursts of slices/blocks around the silhouette
			var burst = Math.floor(t / 110);
			if (burst != lastBurst && p < 0.82) {
				lastBurst = burst;
				var ang = r() * Math.PI * 2;
				var g = { segs: segs, normal: { x: Math.cos(ang), y: Math.sin(ang) }, visible: true, color: WHITE };
				spawnSlices(g, T, Math.round(2 + 4 * inten), 1.3);
				spawnBlocks(g, T, Math.round(4 + 8 * inten), 1.3);
			}
			ctx.globalCompositeOperation = COMP;
			ctx.lineWidth = 2.2;
			ctx.globalAlpha = 0.85 * fade;
			ctx.strokeStyle = RED;
			pathSegs(ctx, segs, jit.ox, jit.oy);
			ctx.stroke();
			ctx.strokeStyle = CYAN;
			pathSegs(ctx, segs, -jit.ox, -jit.oy);
			ctx.stroke();
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = (0.3 + 0.5 * (1 - inten)) * fade;
			ctx.strokeStyle = WHITE;
			ctx.lineWidth = 1.2;
			pathSegs(ctx, segs, 0, 0);
			ctx.stroke();

			// glitched text below the cube
			var size = Math.max(14, Math.round(hullR * 0.32));
			var tx = hullCenter.x, ty = hullCenter.y + hullR * 1.32 + size * 0.5;
			var appear = Math.min(1, t / 160);
			ctx.font = '900 ' + size + 'px "Courier New", monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			var o = jit.tx * 0.6;
			ctx.globalCompositeOperation = COMP;
			ctx.globalAlpha = 0.85 * fade * appear;
			ctx.fillStyle = RED;
			ctx.fillText(label, tx + o + 2, ty + jit.ty);
			ctx.fillStyle = CYAN;
			ctx.fillText(label, tx - o - 2, ty - jit.ty);
			ctx.globalCompositeOperation = 'source-over';
			ctx.globalAlpha = 0.9 * fade * appear * (1 - inten * 0.5);
			ctx.fillStyle = WHITE;
			ctx.fillText(label, tx, ty);
			// a horizontal tear through the text
			if (inten > 0.35 && step % 3 != 0) {
				var bandY = ty - size * 0.5 + ((step * 37) % 100) / 100 * size;
				var bandH = Math.max(2, size * 0.18);
				ctx.save();
				ctx.beginPath();
				ctx.rect(tx - size * 3, bandY, size * 6, bandH);
				ctx.clip();
				ctx.clearRect(tx - size * 3, bandY, size * 6, bandH);
				ctx.fillStyle = r() < 0.5 ? RED : CYAN;
				ctx.fillText(label, tx + jit.tx * 2, ty);
				ctx.restore();
			}
			if (sub) {
				ctx.font = '700 ' + Math.round(size * 0.55) + 'px "Courier New", monospace';
				ctx.globalAlpha = 0.8 * fade * Math.min(1, Math.max(0, (t - 200) / 200));
				ctx.fillStyle = CYAN;
				ctx.fillText(sub, tx + 1, ty + size * 0.95);
				ctx.fillStyle = WHITE;
				ctx.fillText(sub, tx, ty + size * 0.95);
			}
			ctx.globalAlpha = 1;
			return true;
		};
		ensure();
	}

	jlFx.register({ id: 'glitch', name: 'RGB Glitch', onMove: onMove, onSolve: onSolve, onScramble: onScramble });
})();
