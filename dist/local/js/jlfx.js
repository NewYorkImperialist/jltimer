// @ts-check
"use strict";

// Arcade Combo: the move notation pops out of the turning face's side in chunky pixel text,
// floats outward and fades; a "x12 COMBO!" counter heats up with the streak; square pixel particles.
// All text is placed outside the cube silhouette; on the cube itself only thin corner brackets flash.
(function() {
	// 5x7 pixel font ('#' = on). Glyphs are trimmed to their used columns for proportional spacing.
	var RAW = {
		'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#',
		'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
		'C': '.###.|#...#|#....|#....|#....|#...#|.###.',
		'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
		'E': '#####|#....|#....|####.|#....|#....|#####',
		'F': '#####|#....|#....|####.|#....|#....|#....',
		'G': '.###.|#...#|#....|#.###|#...#|#...#|.####',
		'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
		'I': '###|.#.|.#.|.#.|.#.|.#.|###',
		'J': '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
		'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
		'L': '#....|#....|#....|#....|#....|#....|#####',
		'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
		'N': '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
		'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
		'P': '####.|#...#|#...#|####.|#....|#....|#....',
		'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
		'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
		'S': '.####|#....|#....|.###.|....#|....#|####.',
		'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
		'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
		'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
		'W': '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
		'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
		'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
		'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
		'0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
		'1': '.#.|##.|.#.|.#.|.#.|.#.|###',
		'2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
		'3': '####.|....#|....#|.###.|....#|....#|####.',
		'4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
		'5': '#####|#....|####.|....#|....#|#...#|.###.',
		'6': '.###.|#....|#....|####.|#...#|#...#|.###.',
		'7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
		'8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
		'9': '.###.|#...#|#...#|.####|....#|....#|.###.',
		'r': '.....|.....|#.##.|##..#|#....|#....|#....',
		'u': '.....|.....|#...#|#...#|#...#|#..##|.##.#',
		'f': '..##.|.#..#|.#...|###..|.#...|.#...|.#...',
		'd': '....#|....#|.##.#|#..##|#...#|#...#|.####',
		'l': '##.|.#.|.#.|.#.|.#.|.#.|###',
		'b': '#....|#....|#.##.|##..#|#...#|#...#|####.',
		'w': '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
		'x': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
		'y': '.....|.....|#...#|#...#|.####|....#|.###.',
		'z': '.....|.....|#####|...#.|..#..|.#...|#####',
		'm': '.....|.....|##.#.|#.#.#|#.#.#|#...#|#...#',
		'e': '.....|.....|.###.|#...#|#####|#....|.###.',
		's': '.....|.....|.####|#....|.###.|....#|####.',
		'\'': '#|#|#|.|.|.|.',
		'!': '##|##|##|##|##|..|##',
		'.': '..|..|..|..|..|##|##',
		':': '..|##|##|..|##|##|..',
		'?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
		'-': '....|....|....|####|....|....|....'
	};
	var FONT = {};
	for (var ch in RAW) {
		var rows = RAW[ch].split('|');
		FONT[ch] = { w: rows[0].length, rows: rows };
	}
	var GLYPH_H = 7;

	// ---------- shared state (all bounded) ----------
	var texts = []; // floating labels, max MAX_TEXTS
	var parts = []; // pixel particles, max MAX_PARTS
	var brackets = []; // corner-bracket flashes on the turning face, max 8
	var MAX_TEXTS = 24, MAX_PARTS = 200;
	var pathCache = {}, pathCacheSize = 0;
	var running = false;
	var comboState = { val: 0, at: -1e9, pop: -1e9, best: 0 };
	var lastShake = -1e9;
	var NAMES = 'URFDLB';

	function now() {
		return jlFx.now();
	}

	// Path2D of a string in font units (1 unit = 1 pixel cell), cached and bounded
	function textPath(str) {
		var hit = pathCache[str];
		if (hit) {
			return hit;
		}
		if (pathCacheSize > 96) {
			pathCache = {};
			pathCacheSize = 0;
		}
		var p = new Path2D();
		var x = 0;
		for (var i = 0; i < str.length; i++) {
			var c = str.charAt(i);
			var g = FONT[c] || FONT[c.toUpperCase()];
			if (c == ' ') {
				x += 3;
				continue;
			}
			if (!g) {
				continue;
			}
			for (var r = 0; r < GLYPH_H; r++) {
				var row = g.rows[r];
				var run = -1;
				for (var k = 0; k <= g.w; k++) {
					var on = k < g.w && row.charAt(k) == '#';
					if (on && run < 0) {
						run = k;
					} else if (!on && run >= 0) {
						p.rect(x + run, r, k - run, 1);
						run = -1;
					}
				}
			}
			x += g.w + 1;
		}
		hit = { path: p, w: Math.max(1, x - 1), h: GLYPH_H };
		pathCache[str] = hit;
		pathCacheSize++;
		return hit;
	}

	// draw pixel text centered at (cx, cy) with cell size px, a 1-cell dark outline and a drop shadow
	function drawText(ctx, str, cx, cy, px, color, alpha) {
		var tp = textPath(str);
		px = Math.max(1, Math.round(px));
		var x0 = Math.round(cx - tp.w * px / 2), y0 = Math.round(cy - tp.h * px / 2);
		ctx.globalAlpha = alpha;
		var o = Math.max(1.5, Math.round(px * 0.3 * 2) / 2), sh = Math.max(2, Math.round(px * 0.6));
		ctx.save();
		ctx.translate(x0 + sh, y0 + sh);
		ctx.scale(px, px);
		ctx.fillStyle = 'rgba(0,0,0,0.28)';
		ctx.fill(tp.path);
		ctx.restore();
		ctx.fillStyle = '#141018';
		var offs = [-o, 0, o, 0, 0, -o, 0, o];
		for (var i = 0; i < 8; i += 2) {
			ctx.save();
			ctx.translate(x0 + offs[i], y0 + offs[i + 1]);
			ctx.scale(px, px);
			ctx.fill(tp.path);
			ctx.restore();
		}
		ctx.save();
		ctx.translate(x0, y0);
		ctx.scale(px, px);
		ctx.fillStyle = color;
		ctx.fill(tp.path);
		ctx.restore();
	}

	function textSize(str, px) {
		var tp = textPath(str);
		px = Math.max(1, Math.round(px));
		return { w: (tp.w + 1) * px, h: (tp.h + 1) * px };
	}

	function cellSize(api) {
		return Math.max(3, Math.round(api.cube().radius / 30));
	}

	// screen direction out of each face, with near-coincident directions spread apart so labels never stack
	function faceDirs(api) {
		var ang = {}, i, j;
		for (i = 0; i < 6; i++) {
			var n = api.face(NAMES.charAt(i)).normal;
			ang[NAMES.charAt(i)] = Math.atan2(n.y, n.x);
		}
		var MIN = 0.75;
		for (var pass = 0; pass < 3; pass++) {
			for (i = 0; i < 6; i++) {
				for (j = i + 1; j < 6; j++) {
					var a = NAMES.charAt(i), b = NAMES.charAt(j);
					var d = ang[b] - ang[a];
					while (d > Math.PI) {
						d -= 2 * Math.PI;
					}
					while (d < -Math.PI) {
						d += 2 * Math.PI;
					}
					if (Math.abs(d) < MIN) {
						var push = (MIN - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
						// the depth faces (F/B) move more: their normals are the least meaningful on screen
						var wa = 'FB'.indexOf(a) != -1 ? 1.5 : 0.5, wb = 'FB'.indexOf(b) != -1 ? 1.5 : 0.5;
						var s = wa + wb;
						ang[a] -= push * 2 * wa / s;
						ang[b] += push * 2 * wb / s;
					}
				}
			}
		}
		return ang;
	}

	// approximate cube-body silhouette: the 8 sticker-corner points (union of the face quads) pushed out to the body
	function hull(api) {
		var cc = api.cube(), pts = [];
		var fs = ['U', 'D'];
		for (var i = 0; i < 2; i++) {
			var cs = api.face(fs[i]).corners;
			for (var k = 0; k < 4; k++) {
				pts.push({ x: cc.center.x + (cs[k].x - cc.center.x) * 1.07, y: cc.center.y + (cs[k].y - cc.center.y) * 1.07 });
			}
		}
		var minX = 1e9, minY = 1e9;
		for (var j = 0; j < pts.length; j++) {
			minX = Math.min(minX, pts[j].x);
			minY = Math.min(minY, pts[j].y);
		}
		return { center: cc.center, radius: cc.radius, pts: pts, minX: minX, minY: minY };
	}

	// distance from the cube center to place a box of size (bw, bh) in direction (dx, dy) fully outside the silhouette
	function outsideDist(hl, dx, dy, bw, bh) {
		var m = 0;
		for (var i = 0; i < hl.pts.length; i++) {
			m = Math.max(m, (hl.pts[i].x - hl.center.x) * dx + (hl.pts[i].y - hl.center.y) * dy);
		}
		return m + hl.radius * 0.04 + Math.abs(dx) * bw / 2 + Math.abs(dy) * bh / 2;
	}

	// keep a box inside the overlay and inside the browser viewport (the overlay can extend past the window)
	var view = { x0: 0, y0: 0, x1: 1e9, y1: 1e9 };

	function updateView(api) {
		var r = api.ctx.canvas.getBoundingClientRect();
		view.x0 = Math.max(0, -r.left);
		view.y0 = Math.max(0, -r.top);
		view.x1 = Math.min(api.w, (window.innerWidth || 1e9) - r.left);
		view.y1 = Math.min(api.h, (window.innerHeight || 1e9) - r.top);
	}

	function clampBox(api, x, y, bw, bh) {
		var mx = bw / 2 + 2, my = bh / 2 + 2;
		return { x: Math.min(view.x1 - mx, Math.max(view.x0 + mx, x)), y: Math.min(view.y1 - my, Math.max(view.y0 + my, y)) };
	}

	function comboColor(c, t) {
		if (c >= 30) {
			return 'hsl(' + Math.round((t / 3) % 360) + ',100%,62%)';
		}
		if (c >= 20) {
			return '#ff4fd8';
		}
		if (c >= 15) {
			return '#ff3b3b';
		}
		if (c >= 10) {
			return '#ff9a1f';
		}
		if (c >= 6) {
			return '#ffe14d';
		}
		return '#ffffff';
	}

	function ensureRunning(api) {
		if (running) {
			return;
		}
		running = true;
		api.add(function(ctx, t, dt) {
			var alive = step(api, ctx, now(), dt / 1000);
			if (!alive) {
				running = false;
			}
			return alive;
		});
	}

	function step(api, ctx, tnow, dts) {
		var i, any = false;
		updateView(api);
		// corner brackets on the turning face (thin outline only, ~200 ms)
		var keepB = [];
		for (i = 0; i < brackets.length; i++) {
			var b = brackets[i];
			var bt = (tnow - b.t0) / b.life;
			if (bt >= 1) {
				continue;
			}
			keepB.push(b);
			var grow = 1 + 0.06 * bt;
			ctx.globalAlpha = bt < 0.6 ? 1 : (bt < 0.8 ? 0.6 : 0.3); // stepped fade
			ctx.lineCap = 'square';
			var c = b.corners, cx = b.center.x, cy = b.center.y;
			for (var pass = 0; pass < 2; pass++) {
				ctx.strokeStyle = pass ? b.color : '#111';
				ctx.lineWidth = pass ? b.px * 0.7 : b.px * 1.4;
				ctx.beginPath();
				for (var k = 0; k < 4; k++) {
					var p = c[k], pn = c[(k + 1) % 4], pp = c[(k + 3) % 4];
					var x = cx + (p.x - cx) * grow, y = cy + (p.y - cy) * grow;
					ctx.moveTo(x + (pn.x - p.x) * 0.2, y + (pn.y - p.y) * 0.2);
					ctx.lineTo(x, y);
					ctx.lineTo(x + (pp.x - p.x) * 0.2, y + (pp.y - p.y) * 0.2);
				}
				ctx.stroke();
			}
		}
		brackets = keepB;
		any = any || brackets.length > 0;

		// pixel particles
		var keepP = [];
		for (i = 0; i < parts.length; i++) {
			var q = parts[i];
			var age = tnow - q.t0;
			if (age >= q.life) {
				continue;
			}
			keepP.push(q);
			q.vy += 160 * dts;
			q.vx *= 1 - 2.5 * dts;
			q.vy *= 1 - 2.5 * dts;
			q.x += q.vx * dts;
			q.y += q.vy * dts;
			var k2 = age / q.life;
			ctx.globalAlpha = k2 < 0.55 ? 1 : (k2 < 0.8 ? 0.6 : 0.3);
			var sz = q.size * (k2 < 0.7 ? 1 : 0.6);
			var g = q.grid;
			ctx.fillStyle = '#111';
			var gx = Math.round(q.x / g) * g, gy = Math.round(q.y / g) * g;
			ctx.fillRect(gx - 1, gy - 1, sz + 2, sz + 2);
			ctx.fillStyle = q.color;
			ctx.fillRect(gx, gy, sz, sz);
		}
		parts = keepP;
		any = any || parts.length > 0;

		// floating labels
		var keepT = [];
		for (i = 0; i < texts.length; i++) {
			var tx = texts[i];
			var end = Math.min(tx.t0 + tx.life, tx.dieAt);
			if (tnow >= end) {
				continue;
			}
			keepT.push(tx);
			var a = (tnow - tx.t0) / tx.life;
			var pop = tx.still ? 1 : (a < 0.08 ? 0.6 + 0.65 * a / 0.08 : (a < 0.18 ? 1.25 - 0.25 * (a - 0.08) / 0.1 : 1));
			var drift = tx.still ? 0 : tx.drift * (1 - Math.pow(1 - a, 3));
			var remain = (end - tnow) / Math.min(tx.life, 160);
			var alpha = a < 0.6 && remain >= 1 ? 1 : (a < 0.8 && remain >= 0.5 ? 0.66 : 0.33);
			var px = tx.px * pop;
			var sz2 = textSize(tx.str, px);
			var pos = clampBox(api, tx.x + tx.dx * drift, tx.y + tx.dy * drift, sz2.w, sz2.h);
			drawText(ctx, tx.str, pos.x, pos.y, px, typeof tx.color == 'function' ? tx.color(tnow) : tx.color, alpha);
		}
		texts = keepT;
		any = any || texts.length > 0;

		// combo counter (one instance, updated in place)
		var cs = comboState;
		if (cs.val >= 3 && tnow - cs.at < 900) {
			var ca = tnow - cs.at;
			var pt = tnow - cs.pop;
			var big = cs.val % 10 == 0;
			var cpx = cellSize(api) * (cs.val >= 10 ? 0.85 : 0.7);
			if (!api.reduced && pt < 140) {
				cpx *= 1 + (big ? 0.45 : 0.22) * (1 - pt / 140);
			}
			var label = 'x' + cs.val + ' COMBO!';
			var csz = textSize(label, cpx);
			var cc = api.cube(), hl = hull(api);
			// left of the cube, top-aligned with it: outside the silhouette and clear of the U / L labels
			var cp = clampBox(api, hl.minX - cc.radius * 0.06 - csz.w / 2, hl.minY + csz.h / 2, csz.w, csz.h);
			var calpha = ca < 600 ? 1 : (ca < 750 ? 0.6 : 0.3);
			drawText(ctx, label, cp.x, cp.y, cpx, comboColor(cs.val, tnow), calpha);
			any = true;
		}
		ctx.globalAlpha = 1;
		return any;
	}

	function addText(t) {
		texts.push(t);
		while (texts.length > MAX_TEXTS) {
			texts.shift();
		}
	}

	function burst(x, y, dx, dy, n, color, px, spread, speed) {
		var t0 = now();
		for (var i = 0; i < n; i++) {
			var r1 = Math.random(), r2 = Math.random() - 0.5, r3 = Math.random();
			var sp = speed * (0.45 + 0.75 * r1);
			var ox = -dy, oy = dx; // perpendicular
			parts.push({
				x: x + ox * r2 * spread * 0.6, y: y + oy * r2 * spread * 0.6,
				vx: dx * sp + ox * r2 * speed * 0.9, vy: dy * sp + oy * r2 * speed * 0.9,
				t0: t0, life: 300 + 300 * r3,
				size: Math.max(2, Math.round(px * (r3 < 0.3 ? 1.2 : 0.8))),
				grid: Math.max(2, Math.round(px * 0.6)),
				color: r3 < 0.18 ? '#ffffff' : color
			});
		}
		while (parts.length > MAX_PARTS) {
			parts.shift();
		}
	}

	function onMove(api, ev) {
		var f = api.face(ev.face);
		if (!f) {
			return;
		}
		var cc = api.cube(), hl = hull(api);
		var px = cellSize(api);
		var tnow = now();
		var ang = faceDirs(api)[ev.face];
		var dx = Math.cos(ang), dy = Math.sin(ang);
		if (ev.rotation) {
			// rotations: small grey label below the cube, no particles
			if (ev.phase != 'start') {
				return;
			}
			var rs = textSize(ev.move, px * 0.8);
			addText({ str: ev.move, x: cc.center.x, y: cc.center.y + outsideDist(hl, 0, 1, rs.w, rs.h), dx: 0, dy: 1,
				drift: api.reduced ? 0 : cc.radius * 0.12, px: px * 0.8, color: '#b8c0ff', t0: tnow, life: 420, dieAt: 1e15,
				still: api.reduced, slot: 'rot' });
			for (var j = 0; j < texts.length - 1; j++) {
				if (texts[j].slot == 'rot') {
					texts[j].dieAt = Math.min(texts[j].dieAt, tnow + 60);
				}
			}
			ensureRunning(api);
			return;
		}
		if (ev.phase == 'start') {
			var str = ev.move || ev.face;
			var tpx = px * (ev.combo >= 10 ? 1.1 : 1);
			var sz = textSize(str, tpx * 1.25);
			var dist = outsideDist(hl, dx, dy, sz.w, sz.h);
			// older label of the same face clears out fast so rapid repeats don't pile up
			for (var i = 0; i < texts.length; i++) {
				if (texts[i].slot == ev.face) {
					texts[i].dieAt = Math.min(texts[i].dieAt, tnow + 70);
				}
			}
			addText({ str: str, x: cc.center.x + dx * dist, y: cc.center.y + dy * dist, dx: dx, dy: dy,
				drift: api.reduced ? 0 : cc.radius * 0.22, px: tpx, color: f.color, t0: tnow,
				life: api.reduced ? 320 : 540, dieAt: 1e15, still: api.reduced, slot: ev.face });
			if (!api.reduced && ev.combo != comboState.val) {
				comboState.val = ev.combo;
				comboState.pop = tnow;
				if (ev.combo >= 10 && ev.combo % 10 == 0 && tnow - lastShake > 1500) {
					lastShake = tnow;
					api.shake(2, 120);
				}
			}
			comboState.at = tnow;
			ensureRunning(api);
			return;
		}
		// phase 'end': impact
		if (f.visible) {
			brackets.push({ corners: f.corners, center: f.center, color: f.color, px: Math.max(2, px * 0.8),
				t0: tnow, life: api.reduced ? 180 : 210 });
			while (brackets.length > 8) {
				brackets.shift();
			}
		}
		if (!api.reduced) {
			var er = outsideDist(hl, dx, dy, 0, 0) - cc.radius * 0.02;
			var ex = cc.center.x + dx * er, ey = cc.center.y + dy * er;
			var n = Math.min(18, 8 + Math.floor(Math.min(ev.combo || 1, 20) / 2));
			if (ev.tps > 12) {
				n = Math.max(5, n - 6); // very fast turning: fewer particles each
			}
			burst(ex, ey, dx, dy, n, f.color, px, cc.radius * 0.5, 240 + Math.min(ev.combo || 1, 20) * 6);
		}
		ensureRunning(api);
	}

	function fmtTime(ms) {
		if (!(ms > 0)) {
			return '';
		}
		var cs = Math.floor(ms / 10);
		var s = Math.floor(cs / 100), c = cs % 100;
		var str = (c < 10 ? '0' : '') + c;
		if (s >= 60) {
			var m = Math.floor(s / 60);
			s = s % 60;
			return m + ':' + (s < 10 ? '0' : '') + s + '.' + str;
		}
		return s + '.' + str;
	}

	function onSolve(api, ev) {
		var cc = api.cube(), hl = hull(api);
		var px = cellSize(api);
		var tnow = now();
		comboState.at = -1e9;
		texts = [];
		var big = px * 1.6;
		var title = 'SOLVED!';
		var ts = textSize(title, big * 1.25);
		var ty = cc.center.y - outsideDist(hl, 0, -1, ts.w, ts.h);
		var hue = function(off) {
			return function(t) {
				return 'hsl(' + Math.round((t / 4 + off) % 360) + ',100%,60%)';
			};
		};
		addText({ str: title, x: cc.center.x, y: ty, dx: 0, dy: -1, drift: api.reduced ? 0 : cc.radius * 0.06, px: big,
			color: api.reduced ? '#ffe14d' : hue(0), t0: tnow, life: api.reduced ? 1200 : 2300, dieAt: 1e15, still: api.reduced, slot: 'solve' });
		var tstr = fmtTime(ev && ev.time);
		if (tstr) {
			var ss = textSize(tstr, px * 1.25);
			addText({ str: tstr, x: cc.center.x, y: cc.center.y + outsideDist(hl, 0, 1, ss.w, ss.h), dx: 0, dy: 1,
				drift: api.reduced ? 0 : cc.radius * 0.05, px: px, color: '#ffffff', t0: tnow, life: api.reduced ? 1200 : 2300,
				dieAt: 1e15, still: api.reduced, slot: 'solve' });
		}
		if (!api.reduced) {
			var cols = [];
			for (var i = 0; i < 6; i++) {
				cols.push(api.face(NAMES.charAt(i)).color);
			}
			var waves = 0;
			// three bursts of confetti all around the silhouette
			api.add(function(ctx, t) {
				while (waves < 3 && t >= waves * 260) {
					for (var k = 0; k < 16; k++) {
						var a = (k / 16 + waves * 0.031) * Math.PI * 2;
						var dx = Math.cos(a), dy = Math.sin(a);
						var er = outsideDist(hl, dx, dy, 0, 0);
						burst(cc.center.x + dx * er, cc.center.y + dy * er, dx, dy, 3, cols[(k + waves) % 6], px,
							cc.radius * 0.2, 300 + waves * 60);
					}
					waves++;
				}
				return waves < 3;
			});
			api.shake(3, 220);
		}
		ensureRunning(api);
	}

	function onScramble(api) {
		var cc = api.cube(), hl = hull(api);
		var px = cellSize(api);
		var tnow = now();
		comboState.val = 0;
		comboState.at = -1e9;
		var str = 'READY?';
		var ts = textSize(str, px * 0.9);
		addText({ str: str, x: cc.center.x, y: cc.center.y - outsideDist(hl, 0, -1, ts.w, ts.h), dx: 0, dy: -1,
			drift: 0, px: px * 0.9, color: '#ffe14d', t0: tnow, life: 700, dieAt: 1e15, still: true, slot: 'ready' });
		ensureRunning(api);
	}

	jlFx.register({ id: 'arcade', name: 'Arcade Combo', onMove: onMove, onSolve: onSolve, onScramble: onScramble });
})();
// @ts-check
"use strict";

// Comet Orbit: a glowing comet swoops around the outside of the cube silhouette on the side of the turning face,
// travelling in the turn direction (90 or 180 degrees of arc) and shedding sparkling dust.
(function() {
	var MAX_COMETS = 10;
	var MAX_DUST = 180;
	var comets = [];
	var dust = [];
	var sprites = {};
	var running = false;
	var api0 = null;
	var NSUP = 72;

	function hexRgb(c) {
		c = (c || '#ffffff').replace('#', '');
		if (c.length == 3) {
			c = c.charAt(0) + c.charAt(0) + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2);
		}
		var n = parseInt(c, 16);
		if (isNaN(n)) {
			return [255, 255, 255];
		}
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}

	// a soft glow sprite per color (pre-rendered, no shadowBlur)
	function sprite(col) {
		if (sprites[col]) {
			return sprites[col];
		}
		var s = 64;
		var cv = document.createElement('canvas');
		cv.width = cv.height = s;
		var g = cv.getContext('2d');
		var rgb = hexRgb(col);
		var rs = rgb.join(',');
		var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
		gr.addColorStop(0, 'rgba(255,255,255,1)');
		gr.addColorStop(0.16, 'rgba(255,255,255,0.95)');
		gr.addColorStop(0.32, 'rgba(' + rs + ',0.75)');
		gr.addColorStop(0.6, 'rgba(' + rs + ',0.22)');
		gr.addColorStop(1, 'rgba(' + rs + ',0)');
		g.fillStyle = gr;
		g.fillRect(0, 0, s, s);
		sprites[col] = cv;
		return cv;
	}

	// support radius of the cube silhouette for NSUP screen angles, so the orbit hugs its hexagon-ish outline
	function silhouette(api) {
		var c = api.cube();
		var pts = [];
		var fs = 'URFDLB';
		for (var i = 0; i < 6; i++) {
			var f = api.face(fs.charAt(i));
			if (f) {
				pts = pts.concat(f.corners);
			}
		}
		var sup = [];
		for (var k = 0; k < NSUP; k++) {
			var a = k / NSUP * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a), m = 0;
			for (var j = 0; j < pts.length; j++) {
				var d = (pts[j].x - c.center.x) * dx + (pts[j].y - c.center.y) * dy;
				if (d > m) {
					m = d;
				}
			}
			sup.push(Math.max(m, c.radius * 0.6));
		}
		// radial distance of the hull boundary (the support values alone would dent inwards at the face normals)
		var bnd = [];
		for (k = 0; k < NSUP; k++) {
			var best = 1e9;
			for (j = 0; j < NSUP; j++) {
				var cs = Math.cos((k - j) / NSUP * Math.PI * 2);
				if (cs > 0.25 && sup[j] / cs < best) {
					best = sup[j] / cs;
				}
			}
			// the stickers sit at +-0.43 while the drawn cube reaches further (body, perspective): be generous
			bnd.push(Math.max(best * 1.14, c.radius * 1.06));
		}
		sup = bnd;
		// smooth it so the path is a rounded orbit, not a polygon
		for (var pass = 0; pass < 3; pass++) {
			var sm = [];
			for (k = 0; k < NSUP; k++) {
				sm.push((sup[(k + NSUP - 2) % NSUP] + 2 * sup[(k + NSUP - 1) % NSUP] + 3 * sup[k] + 2 * sup[(k + 1) % NSUP] +
					sup[(k + 2) % NSUP]) / 9);
			}
			sup = sm;
		}
		// never cut inside the hull, then soften the seams once more
		for (k = 0; k < NSUP; k++) {
			sup[k] = Math.max(sup[k], bnd[k]);
		}
		for (pass = 0; pass < 2; pass++) {
			sm = [];
			for (k = 0; k < NSUP; k++) {
				sm.push((sup[(k + NSUP - 1) % NSUP] + 2 * sup[k] + sup[(k + 1) % NSUP]) / 4);
			}
			sup = sm;
		}
		return { cx: c.center.x, cy: c.center.y, r: c.radius, sup: sup };
	}

	function radiusAt(sil, a) {
		var u = a / (Math.PI * 2) * NSUP;
		u = ((u % NSUP) + NSUP) % NSUP;
		var i = Math.floor(u), fr = u - i;
		return sil.sup[i] * (1 - fr) + sil.sup[(i + 1) % NSUP] * fr;
	}

	function pathPoint(cm, a) {
		var r = radiusAt(cm.sil, a) * cm.scale + cm.pad;
		return { x: cm.sil.cx + Math.cos(a) * r, y: cm.sil.cy + Math.sin(a) * r };
	}

	// screen rotation sense of a clockwise turn of face f (clockwise as seen from outside that face)
	function turnSense(f, fd) {
		var cs = fd.corners, fc = fd.center, s = 0;
		var fwd = 'ULB'.indexOf(f) != -1; // corner order 0->1->2->3 is clockwise from outside for U, L, B
		for (var i = 0; i < 4; i++) {
			var a = cs[i], b = cs[fwd ? (i + 1) % 4 : (i + 3) % 4];
			s += (a.x - fc.x) * (b.y - fc.y) - (a.y - fc.y) * (b.x - fc.x);
		}
		return s >= 0 ? 1 : -1;
	}

	function shade(col, k) {
		var c = hexRgb(col);
		return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')';
	}

	// is the page behind the cube light? (decides glow vs. ink rendering); cached briefly
	var lightCache = { t: -1e9, v: false };
	function isLight(api) {
		var now = jlFx.now();
		if (now - lightCache.t < 3000) {
			return lightCache.v;
		}
		var v = false;
		var el = api.ctx.canvas;
		while (el && el.nodeType == 1) {
			var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor || '');
			if (m && (m[4] === undefined || +m[4] > 0.5)) {
				v = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 > 0.6;
				break;
			}
			el = el.parentNode;
		}
		lightCache = { t: now, v: v };
		return v;
	}

	function addDust(x, y, vx, vy, col, size, life) {
		if (dust.length >= MAX_DUST) {
			dust.shift();
		}
		dust.push({ x: x, y: y, vx: vx, vy: vy, col: col, size: size, life: life, t: 0 });
	}

	function burst(cm, x, y, n, speed) {
		var rnd = api0.rand;
		for (var i = 0; i < n; i++) {
			var a = rnd() * Math.PI * 2, v = speed * (0.3 + rnd() * 0.7);
			addDust(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd() < 0.4 ? cm.spark : cm.col, cm.size * (0.18 + rnd() * 0.3), 260 + rnd() * 260);
		}
	}

	function ease(p) {
		// swoop: quick launch, gentle arrival
		return p < 0 ? 0 : p > 1 ? 1 : 1 - Math.pow(1 - p, 2.4);
	}

	function drawComet(ctx, cm, dt) {
		cm.t += dt;
		var p = ease(cm.t / cm.dur);
		var head = cm.a0 + cm.dir * cm.span * p;
		var fade = cm.t <= cm.dur ? 1 : Math.max(0, 1 - (cm.t - cm.dur) / cm.fadeT);
		var hp = pathPoint(cm, head);
		// tail: trails back along the path, shrinking into the head once it has arrived
		var tail = cm.tail * (cm.t <= cm.dur ? Math.min(1, 0.25 + 1.4 * p) : fade);
		var back = Math.min(tail, cm.span * p + 0.05);
		var segs = 16;
		var pts = [];
		for (var i = 0; i <= segs; i++) {
			pts.push(pathPoint(cm, head - cm.dir * back * i / segs));
		}
		var end = pts[segs];
		var rgb = cm.rgb;
		// tapered tail body: one filled polygon per layer, fading along a gradient from head to tail tip
		/** @type {Array<[number, string, number]>} */
		var layers = cm.light ? [[1.0 + 2.2 / cm.size, 'ink', 0.45], [1, 'col', 0.95], [0.38, 'core', 0.95]] :
			[[1.6, 'col', 0.25], [1, 'col', 0.85], [0.38, 'core', 1]];
		for (var l = 0; l < layers.length; l++) {
			var wk = layers[l][0] * cm.size * 0.55;
			var c = layers[l][1] == 'ink' ? cm.inkRgb : layers[l][1] == 'core' ? [255, 255, 255] : rgb;
			var cs = c.join(',');
			var gr = ctx.createLinearGradient(hp.x, hp.y, end.x, end.y);
			gr.addColorStop(0, 'rgba(' + cs + ',' + layers[l][2] + ')');
			gr.addColorStop(layers[l][1] == 'core' ? 0.45 : 0.6, 'rgba(' + cs + ',' + (layers[l][2] * 0.4) + ')');
			gr.addColorStop(1, 'rgba(' + cs + ',0)');
			ctx.fillStyle = gr;
			ctx.globalAlpha = cm.alpha * fade;
			ctx.beginPath();
			var side = [];
			for (i = 0; i <= segs; i++) {
				var a = pts[Math.max(0, i - 1)], b = pts[Math.min(segs, i + 1)];
				var tx = b.x - a.x, ty = b.y - a.y, tl = Math.sqrt(tx * tx + ty * ty) || 1;
				var w = wk * Math.pow(1 - i / segs, 0.8);
				side.push({ x: pts[i].x - ty / tl * w, y: pts[i].y + tx / tl * w });
				i ? ctx.lineTo(pts[i].x + ty / tl * w, pts[i].y - tx / tl * w) : ctx.moveTo(pts[i].x + ty / tl * w, pts[i].y - tx / tl * w);
			}
			for (i = segs; i >= 0; i--) {
				ctx.lineTo(side[i].x, side[i].y);
			}
			ctx.closePath();
			ctx.fill();
		}
		// head glow
		var hs = cm.size * 3.2 * (0.8 + 0.2 * fade);
		ctx.globalAlpha = cm.alpha * fade;
		if (cm.light) {
			ctx.globalAlpha = cm.alpha * fade * 0.8;
			ctx.drawImage(sprite(cm.col), hp.x - hs / 2, hp.y - hs / 2, hs, hs);
			var dots = [[0.72, cm.ink, 0.55], [0.58, cm.col, 1], [0.3, '#ffffff', 1]];
			for (var di = 0; di < 3; di++) {
				ctx.globalAlpha = cm.alpha * fade * dots[di][2];
				ctx.fillStyle = dots[di][1];
				ctx.beginPath();
				ctx.arc(hp.x, hp.y, cm.size * dots[di][0], 0, Math.PI * 2);
				ctx.fill();
			}
		} else {
			ctx.globalCompositeOperation = 'lighter';
			ctx.drawImage(sprite(cm.col), hp.x - hs / 2, hp.y - hs / 2, hs, hs);
			ctx.globalCompositeOperation = 'source-over';
		}
		// dust shed behind the head while it flies
		if (cm.t <= cm.dur && !cm.subtle) {
			cm.acc += dt * cm.rate;
			var rnd = api0.rand;
			while (cm.acc >= 1) {
				cm.acc -= 1;
				var ta = head - cm.dir * (0.03 + rnd() * 0.12);
				var tp = pathPoint(cm, ta);
				var nx = tp.x - cm.sil.cx, ny = tp.y - cm.sil.cy, nl = Math.sqrt(nx * nx + ny * ny) || 1;
				var out = (rnd() - 0.2) * 40; // drift mostly outwards, away from the stickers
				addDust(tp.x + (rnd() - 0.5) * 4, tp.y + (rnd() - 0.5) * 4, nx / nl * out + (rnd() - 0.5) * 24,
					ny / nl * out + (rnd() - 0.5) * 24, rnd() < 0.35 ? cm.spark : cm.col, cm.size * (0.15 + rnd() * 0.25), 220 + rnd() * 320);
			}
		}
		if (cm.t >= cm.dur && !cm.burst) {
			cm.burst = true;
			if (!cm.subtle) {
				burst(cm, hp.x, hp.y, cm.burstN, 70 + 50 * cm.heat);
			}
		}
		return fade > 0;
	}

	function drawDust(ctx, dt) {
		var keep = [];
		var s = dt / 1000;
		for (var i = 0; i < dust.length; i++) {
			var d = dust[i];
			d.t += dt;
			if (d.t >= d.life) {
				continue;
			}
			d.x += d.vx * s;
			d.y += d.vy * s;
			d.vx *= 0.94;
			d.vy *= 0.94;
			var k = 1 - d.t / d.life;
			// twinkle
			var tw = 0.6 + 0.4 * Math.sin(d.t * 0.045 + i * 1.7);
			ctx.globalAlpha = k * tw;
			ctx.fillStyle = d.col;
			var z = d.size * (0.5 + 0.5 * k);
			ctx.fillRect(d.x - z / 2, d.y - z / 2, z, z);
			if (d.size > 2.6 && k > 0.4) { // a few little cross glints
				ctx.fillRect(d.x - z * 1.5, d.y - 0.4, z * 3, 0.8);
				ctx.fillRect(d.x - 0.4, d.y - z * 1.5, 0.8, z * 3);
			}
			keep.push(d);
		}
		dust = keep;
	}

	function runner() {
		return function(ctx, t, dt) {
			if (t > 8000) { // the framework retires anims after 10 s; hand over to a fresh runner
				api0.add(runner());
				return false;
			}
			var alive = [];
			for (var i = 0; i < comets.length; i++) {
				ctx.save();
				var keep = drawComet(ctx, comets[i], dt);
				ctx.restore();
				if (keep) {
					alive.push(comets[i]);
				}
			}
			comets = alive;
			ctx.globalAlpha = 1;
			drawDust(ctx, dt);
			if (!comets.length && !dust.length) {
				running = false;
				return false;
			}
			return true;
		};
	}

	function ensure(api) {
		api0 = api;
		if (!running) {
			running = true;
			api.add(runner());
		}
	}

	function spawn(api, o) {
		if (comets.length >= MAX_COMETS) {
			comets.shift();
		}
		var cm = {
			sil: o.sil, a0: o.a0, dir: o.dir, span: o.span, dur: o.dur, fadeT: o.fadeT || 160,
			col: o.col, size: o.size, tail: o.tail, alpha: o.alpha, scale: o.scale || 1, pad: o.pad,
			rate: o.rate, burstN: o.burstN, heat: o.heat || 0, subtle: !!o.subtle, key: o.key,
			t: 0, acc: 0, burst: false
		};
		cm.light = isLight(api);
		cm.rgb = hexRgb(cm.col);
		cm.inkRgb = cm.rgb.map(function(v) { return Math.round(v * 0.4); });
		cm.ink = cm.light ? shade(cm.col, 0.45) : cm.col;
		cm.spark = cm.light ? shade(cm.col, 0.8) : '#ffffff';
		if (cm.light && cm.col == '#ffffff') {
			cm.alpha = Math.max(cm.alpha, 0.8);
		}
		comets.push(cm);
		ensure(api);
		return cm;
	}

	// reduced motion: a short static arc outline on that side
	function flashArc(api, sil, a0, a1, col) {
		var cm = { sil: sil, scale: 1, pad: sil.r * 0.1 };
		api.add(function(ctx, t) {
			var k = 1 - t / 220;
			if (k <= 0) {
				return false;
			}
			ctx.globalAlpha = 0.7 * k;
			ctx.strokeStyle = col;
			ctx.lineWidth = 2.5;
			ctx.lineCap = 'round';
			ctx.beginPath();
			for (var i = 0; i <= 20; i++) {
				var p = pathPoint(cm, a0 + (a1 - a0) * i / 20);
				i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
			}
			ctx.stroke();
			return true;
		});
	}

	function onMove(api, ev) {
		var fd = api.face(ev.face);
		if (!fd) {
			return;
		}
		var key = ev.move;
		if (ev.phase != 'start') {
			return;
		}
		var sil = silhouette(api);
		var amt = ev.amount || 1;
		var half = Math.abs(amt) % 4 == 2;
		var dir = turnSense(ev.face, fd) * (amt < 0 ? -1 : 1);
		// the arc is centred on the side the face points to (from the cube centre towards the face centre)
		var nx = fd.normal.x, ny = fd.normal.y;
		var ox = fd.center.x - sil.cx, oy = fd.center.y - sil.cy;
		if (ox * ox + oy * oy > 25) {
			nx = ox;
			ny = oy;
		}
		var ac = Math.atan2(ny, nx);
		var span = half ? Math.PI : Math.PI / 2;
		var a0 = ac - dir * span / 2;
		if (api.reduced) {
			flashArc(api, sil, a0, a0 + dir * span, fd.color);
			return;
		}
		var sz = Math.max(6, sil.r * 0.05);
		var heat = Math.max(0, Math.min(1, ((ev.combo || 1) - 2) / 14));
		if (ev.rotation) {
			spawn(api, {
				sil: sil, a0: a0, dir: dir, span: span * 1.5, dur: half ? 560 : 440, col: fd.color, size: sz * 0.6,
				tail: 1.3, alpha: 0.6, pad: sil.r * 0.24, rate: 0, burstN: 0, subtle: true, key: key
			});
			return;
		}
		var wide = ev.layers && ev.layers[1] > 1;
		spawn(api, {
			sil: sil, a0: a0, dir: dir, span: span, dur: half ? 430 : 320, col: fd.color,
			size: sz * (wide ? 1.15 : 1) * (fd.visible ? 1 : 0.85) * (1 + 0.25 * heat), tail: (half ? 1.25 : 0.95) * (1 + 0.5 * heat), alpha: 1,
			pad: sil.r * (0.11 + (wide ? 0.05 : 0) + (fd.visible ? 0 : 0.09)), rate: (0.10 + 0.12 * heat) * (fd.visible ? 1 : 0.8),
			burstN: Math.round(6 + 10 * heat), heat: heat, key: key
		});
	}

	function onSolve(api) {
		var sil = silhouette(api);
		if (api.reduced) {
			flashArc(api, sil, 0, Math.PI * 2, '#ffffff');
			return;
		}
		var fs = 'URFDLB';
		comets = [];
		for (var i = 0; i < 6; i++) {
			var fd = api.face(fs.charAt(i));
			spawn(api, {
				sil: sil, a0: i * Math.PI / 3, dir: 1, span: Math.PI * 3, dur: 1750, fadeT: 300,
				col: fd ? fd.color : '#ffffff', size: Math.max(6, sil.r * 0.04), tail: 2.0, alpha: 1, pad: sil.r * (0.08 + 0.05 * (i % 3)),
				rate: 0.18, burstN: 26, heat: 1, key: 'solve' + i
			});
		}
		// final ring flash around the silhouette as they land
		var light = isLight(api);
		var ring = { sil: sil, scale: 1, pad: sil.r * 0.16 };
		api.add(function(ctx, t) {
			var u = (t - 1750) / 600;
			if (u < 0) {
				return true;
			}
			if (u >= 1) {
				return false;
			}
			if (!ring.shook) {
				ring.shook = true;
				api.shake(2, 220);
			}
			ring.pad = sil.r * (0.1 + 0.35 * u);
			ctx.globalAlpha = 0.8 * (1 - u) * (1 - u);
			ctx.strokeStyle = light ? '#d29a00' : '#ffffff';
			ctx.lineWidth = 4 * (1 - u) + 0.5;
			ctx.beginPath();
			for (var j = 0; j <= 48; j++) {
				var p = pathPoint(ring, j / 48 * Math.PI * 2);
				j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
			}
			ctx.closePath();
			ctx.stroke();
			return true;
		});
	}

	function onScramble(api) {
		if (api.reduced) {
			return;
		}
		var sil = silhouette(api);
		comets = [];
		dust = [];
		spawn(api, {
			sil: sil, a0: -Math.PI / 2, dir: 1, span: Math.PI * 2, dur: 650, col: '#ffffff', size: Math.max(4, sil.r * 0.025), tail: 1.6,
			alpha: 0.7, pad: sil.r * 0.14, rate: 0.05, burstN: 0, subtle: false, key: 'scramble'
		});
	}

	jlFx.register({ id: 'comet', name: 'Comet Orbit', onMove: onMove, onSolve: onSolve, onScramble: onScramble });
})();
// @ts-check
"use strict";

// Fever Mode: heat builds with speed. Slow turns get a tiny glint on the cube's outline; as tps/combo
// climbs, a flame aura grows around the cube silhouette (orange -> blue -> purple). Everything is clipped
// to the outside of the silhouette, so stickers stay clean. A solve detonates fireworks scaled by tps.
(function() {
	var MAX_P = 180;
	var PALETTES = [ // [core, mid, outer] per heat tier
		[[255, 236, 170], [255, 140, 30], [200, 40, 0]],
		[[220, 245, 255], [70, 160, 255], [20, 50, 220]],
		[[255, 220, 255], [190, 80, 255], [90, 20, 200]]
	];
	var heat = 0; // 0..1, displayed (smoothed)
	var target = 0; // heat the turns are pushing towards
	var lastTurn = 0;
	var parts = []; // flame particles {x, y, vx, vy, life, age, size, tone}
	var glints = []; // {ang, age, life, size, wide}
	var fireworks = null; // {sparks: [], shells: [], age}
	var running = false;
	var sprites = {};
	var hull = null; // cached silhouette {pts, c, r}

	function clamp(v, a, b) {
		return v < a ? a : v > b ? b : v;
	}

	function lerp(a, b, k) {
		return a + (b - a) * k;
	}

	// heat 0..1 -> rgb, blending orange -> blue -> purple
	function tone(h, layer) {
		// hold each colour, then cross over quickly (a long RGB blend through orange/blue looks muddy)
		h = clamp(h, 0, 1);
		var i = h < 0.62 ? 0 : 1, k = i ? clamp((h - 0.82) / 0.08, 0, 1) : clamp((h - 0.4) / 0.08, 0, 1);
		var a = PALETTES[i][layer], b = PALETTES[i + 1][layer];
		return [Math.round(lerp(a[0], b[0], k)), Math.round(lerp(a[1], b[1], k)), Math.round(lerp(a[2], b[2], k))];
	}

	function rgba(c, a) {
		return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
	}

	// pre-rendered soft blob per tone bucket (no shadowBlur)
	function sprite(h) {
		var key = Math.round(clamp(h, 0, 1) * 12);
		if (sprites[key]) {
			return sprites[key];
		}
		var hh = key / 12, S = 64;
		var cv = document.createElement('canvas');
		cv.width = cv.height = S;
		var g = cv.getContext('2d');
		var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
		gr.addColorStop(0, rgba(tone(hh, 0), 0.95));
		gr.addColorStop(0.18, rgba(tone(hh, 1), 0.9));
		gr.addColorStop(0.55, rgba(tone(hh, 1), 0.35));
		gr.addColorStop(1, rgba(tone(hh, 2), 0));
		g.fillStyle = gr;
		g.fillRect(0, 0, S, S);
		sprites[key] = cv;
		return cv;
	}

	// convex hull of all face corners, pushed slightly past the sticker edge
	function computeHull(api) {
		var cc = api.cube().center, pts = [], fs = 'URFDLB';
		for (var i = 0; i < 6; i++) {
			var cs = api.face(fs.charAt(i)).corners;
			for (var j = 0; j < 4; j++) {
				pts.push({ x: cc.x + (cs[j].x - cc.x) * 1.06, y: cc.y + (cs[j].y - cc.y) * 1.06 });
			}
		}
		pts.sort(function(a, b) { return a.x - b.x || a.y - b.y; });
		function cross(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lo = [], up = [], k;
		for (k = 0; k < pts.length; k++) {
			while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[k]) <= 0) {
				lo.pop();
			}
			lo.push(pts[k]);
		}
		for (k = pts.length - 1; k >= 0; k--) {
			while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[k]) <= 0) {
				up.pop();
			}
			up.push(pts[k]);
		}
		lo.pop();
		up.pop();
		var h = lo.concat(up), r = 0;
		for (k = 0; k < h.length; k++) {
			r = Math.max(r, Math.sqrt(Math.pow(h[k].x - cc.x, 2) + Math.pow(h[k].y - cc.y, 2)));
		}
		return { pts: h, c: cc, r: r };
	}

	// point on the hull boundary in direction ang from the center
	function hullPoint(ang) {
		var dx = Math.cos(ang), dy = Math.sin(ang), c = hull.c, p = hull.pts, best = hull.r;
		for (var i = 0; i < p.length; i++) {
			var a = p[i], b = p[(i + 1) % p.length];
			var ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
			if (Math.abs(den) < 1e-6) {
				continue;
			}
			var t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / den;
			var u = ((a.x - c.x) * dy - (a.y - c.y) * dx) / den;
			if (t > 0 && u >= -0.001 && u <= 1.001) {
				best = Math.min(best, t);
			}
		}
		return { x: c.x + dx * best, y: c.y + dy * best };
	}

	function hullPath(ctx, grow) {
		var p = hull.pts, c = hull.c;
		ctx.moveTo(c.x + (p[0].x - c.x) * grow, c.y + (p[0].y - c.y) * grow);
		for (var i = 1; i < p.length; i++) {
			ctx.lineTo(c.x + (p[i].x - c.x) * grow, c.y + (p[i].y - c.y) * grow);
		}
		ctx.closePath();
	}

	// clip to everything outside the silhouette
	function clipOutside(ctx, api) {
		ctx.beginPath();
		ctx.rect(0, 0, api.w, api.h);
		hullPath(ctx, 1);
		ctx.clip('evenodd');
	}

	function pushPart(p) {
		if (parts.length >= MAX_P) {
			parts.shift();
		}
		parts.push(p);
	}

	function emitFlame(api, ang, power) {
		var hp = hullPoint(ang), c = hull.c;
		var nx = hp.x - c.x, ny = hp.y - c.y, nl = Math.sqrt(nx * nx + ny * ny) || 1;
		nx /= nl;
		ny /= nl;
		var sp = (0.03 + api.rand() * 0.05) * (0.6 + power) * hull.r / 60;
		pushPart({
			x: hp.x, y: hp.y,
			vx: nx * sp * 0.7 + (api.rand() - 0.5) * 0.015,
			vy: ny * sp * 0.5 - (0.03 + api.rand() * 0.03) * (0.5 + power) * hull.r / 60, // flames lick upwards
			age: 0, life: 260 + api.rand() * 320 * (0.5 + power),
			size: hull.r * (0.06 + api.rand() * 0.08) * (0.6 + power),
			h: clamp(heat + (api.rand() - 0.5) * 0.12, 0, 1)
		});
	}

	function heatFor(ev) {
		// ~2.5 tps -> 0, ~6 orange, ~9 blue, ~13.5+ purple; long combos nudge it
		return clamp((ev.tps - 2.5) / 11 + Math.max(0, ev.combo - 6) * 0.006, 0, 1);
	}

	function ensureLoop(api) {
		if (running) {
			return;
		}
		running = true;
		var acc = 0;
		api.add(function(ctx, t, dt) {
			var now = jlFx.now();
			hull = computeHull(api);
			// heat dynamics: rise fast, cool after a pause
			if (now - lastTurn > 350) {
				target = Math.max(0, target - dt * 0.0011);
			}
			heat += (target - heat) * Math.min(1, dt * (target > heat ? 0.012 : 0.004));
			if (heat < 0.004 && target <= 0) {
				heat = 0;
			}

			ctx.save();
			clipOutside(ctx, api);

			if (heat > 0.02) {
				var aura = clamp((heat - 0.02) / 0.5, 0, 1);
				var mid = tone(heat, 1);
				if (api.reduced) {
					ctx.lineJoin = 'round';
					ctx.beginPath();
					hullPath(ctx, 1);
					ctx.lineWidth = hull.r * 0.06;
					ctx.strokeStyle = rgba(mid, 0.45 * aura);
					ctx.stroke();
				} else {
					// soft halo: a radial glow clipped to the outside, plus a hot rim line
					var flick = 0.85 + 0.15 * Math.sin(now / 47) * Math.sin(now / 83);
					var gr = ctx.createRadialGradient(hull.c.x, hull.c.y, hull.r * 0.8, hull.c.x, hull.c.y, hull.r * (1.1 + 0.45 * aura));
					gr.addColorStop(0, rgba(mid, 0.34 * aura * flick));
					gr.addColorStop(0.4, rgba(mid, 0.12 * aura * flick));
					gr.addColorStop(1, rgba(mid, 0));
					ctx.fillStyle = gr;
					ctx.fillRect(0, 0, api.w, api.h);
					ctx.lineJoin = 'round';
					ctx.beginPath();
					hullPath(ctx, 1);
					ctx.lineWidth = hull.r * (0.03 + 0.05 * aura);
					ctx.strokeStyle = rgba(mid, 0.75 * aura * flick);
					ctx.stroke();

					// flame tongues around the whole silhouette, rate grows with heat
					acc += dt * (0.02 + heat * heat * 0.32);
					while (acc >= 1) {
						acc -= 1;
						emitFlame(api, api.rand() * Math.PI * 2, heat);
					}
				}
			}

			// particles: teardrop flames stretched along their velocity
			var keep = [], i, p, dpr = window.devicePixelRatio || 1;
			for (i = 0; i < parts.length; i++) {
				p = parts[i];
				p.age += dt;
				if (p.age >= p.life) {
					continue;
				}
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.vy -= 0.00004 * dt;
				var k = p.age / p.life, s = p.size * (1 - 0.7 * k);
				ctx.globalAlpha = (1 - k) * (k < 0.15 ? k / 0.15 : 1) * 0.85;
				ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
				ctx.rotate(Math.atan2(p.vy, p.vx));
				ctx.drawImage(sprite(p.h), -s * 2.4, -s * 0.6, s * 3, s * 1.2);
				ctx.drawImage(sprite(p.h), -s * 0.7, -s * 0.8, s * 1.6, s * 1.6);
				keep.push(p);
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			parts = keep;
			ctx.globalAlpha = 1;

			// glints (per-move sparkles on the outline)
			var gk = [];
			for (i = 0; i < glints.length; i++) {
				var g = glints[i];
				g.age += dt;
				if (g.age >= g.life) {
					continue;
				}
				gk.push(g);
				var q = g.age / g.life, e = 1 - q;
				var gc = tone(g.h, 0), gm = tone(g.h, 1);
				// a bright arc sliding along the outline
				var span = g.wide * (0.25 + 0.5 * q);
				ctx.lineCap = 'round';
				ctx.lineWidth = hull.r * (0.035 + 0.03 * g.size);
				ctx.strokeStyle = rgba(gm, 0.9 * e);
				ctx.beginPath();
				for (var a = -1; a <= 1.001; a += 0.25) {
					var hp = hullPoint(g.ang + a * span);
					if (a == -1) {
						ctx.moveTo(hp.x, hp.y);
					} else {
						ctx.lineTo(hp.x, hp.y);
					}
				}
				ctx.stroke();
				if (!api.reduced) {
					// four-point star at the glint
					var sp = hullPoint(g.ang), gx = sp.x - hull.c.x, gy = sp.y - hull.c.y, gl = Math.sqrt(gx * gx + gy * gy) || 1, L = hull.r * (0.17 + 0.17 * g.size) * Math.sin(Math.PI * Math.min(1, q * 1.4));
					ctx.save();
					ctx.translate(sp.x + gx / gl * L * 0.35, sp.y + gy / gl * L * 0.35); // sit just outside the outline
					ctx.rotate(q * 1.2);
					ctx.globalAlpha = e;
					var sz = L * 0.9;
					ctx.drawImage(sprite(g.h), -sz, -sz, sz * 2, sz * 2);
					ctx.fillStyle = rgba(gc, 1);
					ctx.beginPath();
					ctx.moveTo(0, -L);
					ctx.lineTo(L * 0.12, 0);
					ctx.lineTo(0, L);
					ctx.lineTo(-L * 0.12, 0);
					ctx.closePath();
					ctx.moveTo(-L, 0);
					ctx.lineTo(0, L * 0.12);
					ctx.lineTo(L, 0);
					ctx.lineTo(0, -L * 0.12);
					ctx.closePath();
					ctx.fill();
					ctx.restore();
				}
			}
			glints = gk;
			ctx.restore();

			// fireworks (drawn unclipped, mostly placed outside the cube)
			if (fireworks) {
				drawFireworks(api, ctx, dt);
			}

			var alive = heat > 0 || target > 0 || parts.length || glints.length || fireworks;
			if (!alive) {
				running = false;
			}
			return !!alive;
		});
	}

	function drawFireworks(api, ctx, dt) {
		var fw = fireworks, i;
		fw.age += dt;
		// launch shells on schedule
		while (fw.queue.length && fw.queue[0].at <= fw.age) {
			var sh = fw.queue.shift();
			fw.shells.push(sh);
		}
		var ks = [];
		for (i = 0; i < fw.shells.length; i++) {
			var s = fw.shells[i];
			s.t += dt;
			var k = Math.min(1, s.t / s.rise);
			var ek = 1 - (1 - k) * (1 - k);
			var x = lerp(s.x0, s.x1, ek), y = lerp(s.y0, s.y1, ek);
			if (k < 1) {
				ctx.globalAlpha = 0.9;
				ctx.drawImage(sprite(s.h), x - 5, y - 5, 10, 10);
				ks.push(s);
			} else {
				// burst
				var n = s.n;
				for (var j = 0; j < n; j++) {
					var a = j / n * Math.PI * 2 + api.rand() * 0.3, v = s.v * (0.7 + api.rand() * 0.5);
					if (fw.sparks.length >= MAX_P) {
						fw.sparks.shift();
					}
					fw.sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0,
						life: 700 + api.rand() * 600, h: clamp(s.h + (api.rand() - 0.5) * 0.25, 0, 1), sz: s.sz });
				}
				fw.flashes.push({ x: x, y: y, age: 0, r: s.sz * 5, h: s.h });
			}
		}
		fw.shells = ks;
		var kf = [];
		for (i = 0; i < fw.flashes.length; i++) {
			var f = fw.flashes[i];
			f.age += dt;
			if (f.age < 180) {
				var fk = f.age / 180;
				ctx.globalAlpha = 0.5 * (1 - fk);
				var fr = f.r * (0.4 + fk);
				ctx.drawImage(sprite(f.h), f.x - fr, f.y - fr, fr * 2, fr * 2);
				kf.push(f);
			}
		}
		fw.flashes = kf;
		var kp = [];
		for (i = 0; i < fw.sparks.length; i++) {
			var p = fw.sparks[i];
			p.age += dt;
			if (p.age >= p.life) {
				continue;
			}
			var drag = Math.pow(0.9975, dt);
			p.vx *= drag;
			p.vy = p.vy * drag + 0.00012 * dt; // gravity
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			var q = p.age / p.life, tw = 0.7 + 0.3 * Math.sin(p.age / 28 + i);
			var sz = p.sz * (1 - 0.5 * q);
			// streak behind the spark + glow + hot core
			ctx.globalAlpha = (1 - q) * 0.8;
			ctx.strokeStyle = rgba(tone(p.h, 1), 1);
			ctx.lineWidth = Math.max(1, sz * 0.45);
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(p.x - p.vx * 70, p.y - p.vy * 70);
			ctx.lineTo(p.x, p.y);
			ctx.stroke();
			ctx.globalAlpha = (1 - q) * tw;
			ctx.drawImage(sprite(p.h), p.x - sz, p.y - sz, sz * 2, sz * 2);
			kp.push(p);
		}
		fw.sparks = kp;
		ctx.globalAlpha = 1;
		if (!fw.queue.length && !fw.shells.length && !fw.sparks.length && !fw.flashes.length || fw.age > 2500) {
			fireworks = null;
		}
	}

	jlFx.register({
		id: 'fever',
		name: 'Fever Mode',
		onMove: function(api, ev) {
			if (ev.phase == 'start') {
				lastTurn = jlFx.now();
				var h = heatFor(ev);
				target = Math.max(target * 0.97, h); // escalate quickly, ease off slowly
				ensureLoop(api);
				return;
			}
			// 'end': glint on the outline where the face points
			ensureLoop(api);
			hull = computeHull(api);
			var f = api.face(ev.face), cc = hull.c;
			var ang;
			if (f.visible && ev.face == 'F') {
				// the front face points at the viewer: use its screen offset from the center (bottom edge)
				ang = Math.atan2(f.center.y - cc.y, f.center.x - cc.x);
			} else {
				ang = Math.atan2(f.normal.y, f.normal.x);
			}
			var wide = ev.layers && ev.layers[1] - ev.layers[0] > 0;
			if (glints.length >= 24) {
				glints.shift();
			}
			if (ev.rotation) {
				// rotations: a faint sweep all the way round
				glints.push({ ang: ang, age: 0, life: 320, size: 0, wide: Math.PI * 0.5, h: heat });
				return;
			}
			var amt = Math.abs(ev.amount || 1);
			glints.push({ ang: ang, age: 0, life: api.reduced ? 220 : 260 + 80 * amt,
				size: clamp(heat * 1.2 + (amt > 1 ? 0.3 : 0), 0, 1), wide: (wide ? 0.55 : 0.32) + heat * 0.3, h: heat });
			if (!api.reduced && heat > 0.15) {
				// hot turns throw a few extra flames off that side
				var n = Math.round(2 + heat * 6);
				for (var i = 0; i < n; i++) {
					emitFlame(api, ang + (api.rand() - 0.5) * 0.9, heat + 0.2);
				}
			}
		},
		onSolve: function(api, ev) {
			ensureLoop(api);
			hull = computeHull(api);
			var moves = ev.moves || 30, time = ev.time || 20000;
			var tps = moves / Math.max(1, time / 1000);
			var power = clamp((tps - 1) / 7, 0.15, 1);
			var finalHeat = Math.max(heat, power);
			target = 0; // let the aura die down under the show
			if (api.reduced) {
				glints.push({ ang: -Math.PI / 2, age: 0, life: 600, size: 0, wide: Math.PI, h: finalHeat });
				return;
			}
			var shells = Math.round(4 + power * 8), c = hull.c, R = hull.r;
			var queue = [];
			for (var i = 0; i < shells; i++) {
				var a = (i / shells) * Math.PI * 2 + api.rand() * 0.5 - Math.PI / 2;
				var dist = R * (1.3 + api.rand() * 0.35);
				var x1 = clamp(c.x + Math.cos(a) * dist, api.w * 0.1, api.w * 0.9);
				var y1 = clamp(c.y + Math.sin(a) * dist, api.h * 0.1, api.h * 0.9);
				var start = hullPoint(a);
				queue.push({ at: i * (1200 / shells) + api.rand() * 80, t: 0, rise: 260 + api.rand() * 140,
					x0: start.x, y0: start.y, x1: x1, y1: y1,
					n: Math.round(16 + power * 10), v: R * (0.0018 + 0.0010 * power),
					sz: Math.max(3, R * 0.055), h: i % 3 == 0 ? finalHeat : [0.1, 0.65, 1][i % 3] });
			}
			fireworks = { age: 0, queue: queue, shells: [], sparks: [], flashes: [] };
			// burst of heat from the whole outline
			for (var j = 0; j < 40; j++) {
				emitFlame(api, j / 40 * Math.PI * 2, finalHeat + 0.3);
			}
			api.shake(2, 220);
		},
		onScramble: function() {
			heat = 0;
			target = 0;
			parts = [];
			glints = [];
			fireworks = null;
		}
	});
})();
// @ts-check
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
		return jlFx.now();
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
				lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
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
// @ts-check
"use strict";

// Ink Splash: paint droplets in the turning face's color fling off the cube's silhouette edge on that
// face's side, splat into glossy organic blobs in the margin, then drip and fade.
(function() {
	var MAX_DROPS = 140;
	var drops = [];
	var flashes = [];
	var running = false;
	var mgrApi = null;

	function shade(hex, k) {
		// k < 0 darkens, k > 0 lightens; returns 'rgb(...)'
		var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
		var r = 255, g = 255, b = 255;
		if (m) {
			r = parseInt(m[1], 16);
			g = parseInt(m[2], 16);
			b = parseInt(m[3], 16);
		}
		function ch(v) {
			v = k < 0 ? v * (1 + k) : v + (255 - v) * k;
			return Math.max(0, Math.min(255, Math.round(v)));
		}
		return 'rgb(' + ch(r) + ',' + ch(g) + ',' + ch(b) + ')';
	}

	// silhouette geometry: cube center, outward direction for face f, distance of the support line
	function edgeInfo(api, f) {
		var fc = api.face(f);
		var cb = api.cube();
		var dx = fc.center.x - cb.center.x, dy = fc.center.y - cb.center.y;
		// a face pointing almost straight at / away from the viewer has no side: splash all around instead
		var ring = Math.sqrt(dx * dx + dy * dy) < cb.radius * 0.12;
		var e = edgeDir(api, fc.normal, fc.color);
		e.ring = ring;
		return e;
	}

	function edgeDir(api, n, color) {
		var cb = api.cube();
		var c = cb.center;
		var pts = api.face('U').corners.concat(api.face('D').corners);
		var sup = -1e9, tmin = 1e9, tmax = -1e9;
		var tx = -n.y, ty = n.x;
		var k = 0.47 / 0.43; // stickers sit at 0.43, the cube body edge is a bit further out
		for (var i = 0; i < pts.length; i++) {
			var px = (pts[i].x - c.x) * k, py = (pts[i].y - c.y) * k;
			var d = px * n.x + py * n.y;
			if (d > sup) {
				sup = d;
			}
			var tt = px * tx + py * ty;
			tmin = Math.min(tmin, tt);
			tmax = Math.max(tmax, tt);
		}
		return { c: c, n: n, t: { x: tx, y: ty }, d: sup + 2, tmin: tmin, tmax: tmax, r: cb.radius, color: color };
	}

	function blobShape(rnd, count) {
		var s = [];
		for (var i = 0; i < count; i++) {
			s.push(0.7 + rnd() * 0.55);
		}
		return s;
	}

	function blobPath(ctx, x, y, r, shape, sx, sy, ang) {
		var n = shape.length, pts = [];
		var ca = Math.cos(ang), sa = Math.sin(ang);
		for (var i = 0; i < n; i++) {
			var a = i / n * Math.PI * 2;
			var lx = Math.cos(a) * r * shape[i] * sx, ly = Math.sin(a) * r * shape[i] * sy;
			pts.push({ x: x + lx * ca - ly * sa, y: y + lx * sa + ly * ca });
		}
		ctx.beginPath();
		var m0x = (pts[n - 1].x + pts[0].x) / 2, m0y = (pts[n - 1].y + pts[0].y) / 2;
		ctx.moveTo(m0x, m0y);
		for (var j = 0; j < n; j++) {
			var p = pts[j], q = pts[(j + 1) % n];
			ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
		}
		ctx.closePath();
	}

	function spawnDrop(api, e, o) {
		var rnd = api.rand;
		var lat = o.lat;
		var sx = e.c.x + e.n.x * e.d + e.t.x * lat, sy = e.c.y + e.n.y * e.d + e.t.y * lat;
		var dist = o.dist;
		var drift = (rnd() - 0.5) * 0.5 * dist;
		var tx = sx + e.n.x * dist + e.t.x * drift, ty = sy + e.n.y * dist + e.t.y * drift;
		// keep the blob inside the overlay
		var pad = o.size * 1.6 + 4;
		tx = Math.max(pad, Math.min(api.w - pad, tx));
		ty = Math.max(pad, Math.min(api.h - pad, ty));
		// drip: gravity is screen-down; never let it run back over the cube
		var dripLen = o.size * (1.2 + rnd() * 2.2);
		var toward = -e.n.y; // how much "down" points into the cube
		if (toward > 0.05) {
			var room = (tx - e.c.x) * e.n.x + (ty - e.c.y) * e.n.y - e.d - o.size * 1.4;
			dripLen = Math.max(0, Math.min(dripLen, room / toward));
		}
		dripLen = Math.min(dripLen, api.h - ty - 4);
		drops.push({
			sx: sx, sy: sy, tx: tx, ty: ty,
			flight: o.flight, delay: o.delay || 0,
			size: o.size, color: o.color, rim: shade(o.color, -0.35), hi: shade(o.color, 0.6),
			alpha: o.alpha || 1,
			shape: blobShape(rnd, 9), ang: Math.atan2(e.n.y, e.n.x),
			sats: o.sats || 0, satSeed: rnd(),
			drip: dripLen > 3 ? dripLen : 0, dripX: (rnd() - 0.5) * o.size * 0.8,
			life: o.life, t: 0
		});
		while (drops.length > MAX_DROPS) {
			drops.shift();
		}
	}

	function easeOut(x) {
		return 1 - (1 - x) * (1 - x);
	}

	function drawDrop(ctx, d) {
		var t = d.t - d.delay;
		if (t < 0) {
			return true;
		}
		if (t < d.flight) { // in the air: a stretched droplet with a short trail
			var k = easeOut(t / d.flight);
			var x = d.sx + (d.tx - d.sx) * k, y = d.sy + (d.ty - d.sy) * k;
			var px = d.sx + (d.tx - d.sx) * Math.max(0, k - 0.28), py = d.sy + (d.ty - d.sy) * Math.max(0, k - 0.28);
			ctx.globalAlpha = d.alpha * 0.75;
			ctx.strokeStyle = d.color;
			ctx.lineCap = 'round';
			ctx.lineWidth = d.size * 0.55;
			ctx.beginPath();
			ctx.moveTo(px, py);
			ctx.lineTo(x, y);
			ctx.stroke();
			ctx.globalAlpha = d.alpha;
			ctx.fillStyle = d.color;
			ctx.beginPath();
			ctx.arc(x, y, d.size * 0.5, 0, Math.PI * 2);
			ctx.fill();
			return true;
		}
		var s = t - d.flight;
		if (s > d.life) {
			return false;
		}
		// splat: overshoot pop, squashed across the travel direction, then settles
		var pop = s < 60 ? s / 60 : 1;
		var sc = pop < 1 ? 0.3 + 0.95 * pop : 1.25 - 0.25 * Math.min(1, (s - 60) / 90);
		var squash = s < 140 ? 0.6 + 0.4 * (s / 140) : 1;
		var fade = s < d.life * 0.55 ? 1 : 1 - (s - d.life * 0.55) / (d.life * 0.45);
		var a = d.alpha * Math.max(0, fade);
		var r = d.size * sc;
		// drip first (behind the blob)
		if (d.drip && s > 70) {
			var dk = Math.min(1, (s - 70) / (d.life * 0.6));
			dk = dk * dk * (3 - 2 * dk);
			var dl = d.drip * dk;
			var dx = d.tx + d.dripX;
			ctx.globalAlpha = a;
			ctx.strokeStyle = d.color;
			ctx.lineCap = 'round';
			ctx.lineWidth = d.size * 0.42 * (1 - 0.35 * dk);
			ctx.beginPath();
			ctx.moveTo(dx, d.ty);
			ctx.lineTo(dx, d.ty + dl);
			ctx.stroke();
			ctx.fillStyle = d.color;
			ctx.beginPath();
			ctx.arc(dx, d.ty + dl, d.size * 0.3, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = a;
		blobPath(ctx, d.tx, d.ty, r, d.shape, squash, 1 / Math.sqrt(squash), d.ang);
		ctx.fillStyle = d.color;
		ctx.fill();
		ctx.globalAlpha = a * 0.55;
		ctx.lineWidth = 1.2;
		ctx.strokeStyle = d.rim;
		ctx.stroke();
		// satellites thrown further along the travel direction
		if (d.sats) {
			ctx.globalAlpha = a;
			ctx.fillStyle = d.color;
			var ca = Math.cos(d.ang), sa = Math.sin(d.ang);
			for (var i = 0; i < d.sats; i++) {
				var q = (d.satSeed * 7.3 + i * 2.39) % 1;
				var off = (q - 0.5) * 1.8;
				var far = r * (1.5 + ((d.satSeed * 13.1 + i * 0.61) % 1) * 1.1) * Math.min(1, s / 70);
				var ox = Math.cos(off) * far, oy = Math.sin(off) * far;
				ctx.beginPath();
				ctx.arc(d.tx + ox * ca - oy * sa, d.ty + ox * sa + oy * ca, Math.max(1, d.size * (0.13 + q * 0.14)), 0, Math.PI * 2);
				ctx.fill();
			}
		}
		// glossy highlight (Splatoon ink)
		ctx.globalAlpha = a * 0.6;
		ctx.fillStyle = d.hi;
		ctx.beginPath();
		ctx.ellipse(d.tx - r * 0.28, d.ty - r * 0.3, r * 0.26, r * 0.14, -0.6, 0, Math.PI * 2);
		ctx.fill();
		return true;
	}

	function drawFlash(ctx, fl) {
		if (fl.t > fl.life) {
			return false;
		}
		var k = 1 - fl.t / fl.life;
		var e = fl.e;
		var bx = e.c.x + e.n.x * (e.d + 2), by = e.c.y + e.n.y * (e.d + 2);
		// tapered brush stroke along the silhouette edge, outside the cube
		var a0 = e.tmin * 0.92, a1 = e.tmax * 0.92;
		var grow = Math.min(1, fl.t / 70);
		var mid = (a0 + a1) / 2, half = (a1 - a0) / 2 * grow;
		var steps = 10;
		ctx.fillStyle = e.color;
		ctx.globalAlpha = fl.alpha * k;
		ctx.beginPath();
		for (var i = 0; i <= steps; i++) {
			var u = i / steps, tt = mid - half + 2 * half * u;
			var w = fl.width * Math.sin(Math.PI * Math.pow(u, 0.8));
			ctx.lineTo(bx + e.t.x * tt + e.n.x * w, by + e.t.y * tt + e.n.y * w);
		}
		for (var j = steps; j >= 0; j--) {
			var u2 = j / steps, t2 = mid - half + 2 * half * u2;
			ctx.lineTo(bx + e.t.x * t2, by + e.t.y * t2);
		}
		ctx.closePath();
		ctx.fill();
		if (fl.outline) {
			ctx.globalAlpha = fl.alpha * k * 0.5;
			ctx.strokeStyle = shade(e.color, -0.35);
			ctx.lineWidth = 1;
			ctx.stroke();
		}
		return true;
	}

	function manager(ctx, t, dt) {
		if (t > 8000) { // stay under the framework's 10 s limit: hand over to a fresh runner
			running = false;
			ensure(mgrApi);
			return false;
		}
		var i, keep = [];
		for (i = 0; i < flashes.length; i++) {
			flashes[i].t += dt;
			ctx.save();
			if (drawFlash(ctx, flashes[i])) {
				keep.push(flashes[i]);
			}
			ctx.restore();
		}
		flashes = keep;
		keep = [];
		for (i = 0; i < drops.length; i++) {
			drops[i].t += dt;
			if (drawDrop(ctx, drops[i])) {
				keep.push(drops[i]);
			}
		}
		ctx.globalAlpha = 1;
		drops = keep;
		if (!drops.length && !flashes.length) {
			running = false;
			return false;
		}
		return true;
	}

	function ensure(api) {
		mgrApi = api;
		if (!running) {
			running = true;
			api.add(manager);
		}
	}

	function addFlash(fl) {
		flashes.push(fl);
		while (flashes.length > 12) {
			flashes.shift();
		}
	}

	function onMove(api, ev) {
		var e = edgeInfo(api, ev.face);
		var rnd = api.rand;
		var R = e.r;
		if (api.reduced) {
			if (ev.phase == 'end') {
				if (e.ring) {
					for (var r4 = 0; r4 < 4; r4++) {
						addFlash({ e: edgeDir(api, { x: Math.cos(r4 * Math.PI / 2), y: Math.sin(r4 * Math.PI / 2) }, e.color), t: 0, life: 220,
							width: Math.max(3, R * 0.025), alpha: api.face(ev.face).visible ? 0.9 : 0.5, outline: true });
					}
					ensure(api);
					return;
				}
				addFlash({ e: e, t: 0, life: 220, width: Math.max(3, R * 0.03), alpha: ev.rotation ? 0.5 : 0.9, outline: true });
				ensure(api);
			}
			return;
		}
		var wide = ev.layers && ev.layers[1] - ev.layers[0] >= 1 && !ev.rotation;
		var combo = Math.min(12, ev.combo || 1);
		var fast = (ev.tps || 0) >= 8;
		if (ev.phase == 'start') {
			// fling: droplets leave the edge as the layer starts turning and land around when it does
			var count = ev.rotation ? 3 : Math.round((fast ? 4 : 6) + combo * 0.35 + (wide ? 2 : 0));
			var span = (e.tmax - e.tmin) * 0.42;
			var mid = (e.tmax + e.tmin) / 2;
			var big = Math.abs(ev.amount) == 2 ? 1.2 : 1;
			var behind = e.ring && !api.face(ev.face).visible;
			if (e.ring) {
				count = Math.round(count * 1.4);
			}
			var a0 = api.rand() * Math.PI * 2;
			for (var i = 0; i < count; i++) {
				var lead = i == 0 && !ev.rotation && !e.ring;
				var de = e;
				if (e.ring) {
					var ang = a0 + (i + api.rand() * 0.6) / count * Math.PI * 2;
					de = edgeDir(api, { x: Math.cos(ang), y: Math.sin(ang) }, e.color);
				}
				var size = R * (lead ? 0.075 : 0.025 + rnd() * 0.04) * big * (1 + combo * 0.02) * (ev.rotation ? 0.7 : 1);
				spawnDrop(api, de, {
					lat: e.ring ? 0 : mid + (lead ? (rnd() - 0.5) * span * 0.6 : (rnd() * 2 - 1) * span),
					dist: R * (lead ? 0.08 + rnd() * 0.07 : 0.04 + rnd() * 0.22) * (wide ? 1.15 : 1),
					size: size,
					flight: 70 + rnd() * 70,
					delay: rnd() * 30,
					color: e.color,
					alpha: ev.rotation ? 0.55 : behind ? 0.6 : 1,
					sats: lead ? 3 + Math.floor(rnd() * 3) : (rnd() < 0.4 ? 1 : 0),
					life: (fast ? 380 : 480) + rnd() * 120
				});
			}
			if (!e.ring) {
				addFlash({ e: e, t: 0, life: ev.rotation ? 200 : 260, width: R * (ev.rotation ? 0.02 : 0.035 + combo * 0.002), alpha: ev.rotation ? 0.45 : 0.85, outline: true });
			}
			ensure(api);
		} else if (ev.phase == 'end' && !ev.rotation && combo >= 8 && !fast && rnd() < 0.3) {
			api.shake(1.5, 90);
		}
	}

	function onSolve(api) {
		var faces = ['U', 'R', 'F', 'D', 'L', 'B'];
		var rnd = api.rand;
		var R = api.cube().radius;
		if (api.reduced) {
			for (var q = 0; q < faces.length; q++) {
				addFlash({ e: edgeInfo(api, faces[q]), t: 0, life: 500, width: R * 0.04, alpha: 0.8, outline: true });
			}
			ensure(api);
			return;
		}
		// a ring of big splats all around the silhouette, in waves, in every face's color
		var cols = faces.map(function(f) { return api.face(f).color; });
		var waves = 3;
		for (var w = 0; w < waves; w++) {
			for (var j = 0; j < 14; j++) {
				var ang = (j / 14 + w * 0.037 + rnd() * 0.03) * Math.PI * 2;
				var nx = Math.cos(ang), ny = Math.sin(ang);
				var e = edgeDir(api, { x: nx, y: ny }, null);
				spawnDrop(api, e, {
					lat: (rnd() - 0.5) * R * 0.3,
					dist: R * (0.1 + w * 0.12 + rnd() * 0.12),
					size: R * (w == 0 ? 0.08 + rnd() * 0.05 : 0.04 + rnd() * 0.05),
					flight: 110 + rnd() * 120,
					delay: w * 260 + rnd() * 80,
					color: cols[(j + w * 2) % 6],
					sats: 2 + Math.floor(rnd() * 3),
					life: 1500 - w * 250 + rnd() * 200
				});
			}
		}
		ensure(api);
		api.shake(3, 220);
	}

	jlFx.register({ id: 'ink', name: 'Ink Splash', onMove: onMove, onSolve: onSolve });
})();
// @ts-check
"use strict";

// Lightning: jagged electric arcs crackle along the turning face's edges, with a few branching bolts
// leaping out of the cube silhouette into the margin. Every arc is re-randomized each frame.
(function() {
var LH = (function() {
		var FACES = 'URFDLB';
		var ends = []; // end times of live animations (capped)
		var MAX_LIVE = 10;

		// ---------- geometry helpers ----------
		function near(a, b) {
			return Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5;
		}

		function hasEdge(fc, a, b) {
			var ia = -1, ib = -1;
			for (var i = 0; i < 4; i++) {
				if (near(fc.corners[i], a)) {
					ia = i;
				}
				if (near(fc.corners[i], b)) {
					ib = i;
				}
			}
			return ia != -1 && ib != -1;
		}

		// edges of face f: [{a, b, sil: true if on the cube silhouette}]
		function faceEdges(api, f) {
			var fc = api.face(f);
			var all = [];
			for (var k = 0; k < 6; k++) {
				if (FACES[k] != f) {
					all.push(api.face(FACES[k]));
				}
			}
			var out = [];
			for (var i = 0; i < 4; i++) {
				var a = fc.corners[i], b = fc.corners[(i + 1) % 4];
				var other = null;
				for (var j = 0; j < all.length; j++) {
					if (hasEdge(all[j], a, b)) {
						other = all[j];
						break;
					}
				}
				var otherVis = other ? other.visible : false;
				if (fc.visible) {
					out.push({ a: a, b: b, sil: !otherVis });
				} else if (otherVis) {
					out.push({ a: a, b: b, sil: true }); // hidden face: only its silhouette edges
				}
			}
			return out;
		}

		// silhouette (convex hull) edges of the whole cube
		function hullEdges(api) {
			var pts = [];
			for (var k = 0; k < 6; k++) {
				var cs = api.face(FACES[k]).corners;
				for (var i = 0; i < 4; i++) {
					var dup = false;
					for (var j = 0; j < pts.length; j++) {
						if (near(pts[j], cs[i])) {
							dup = true;
							break;
						}
					}
					if (!dup) {
						pts.push(cs[i]);
					}
				}
			}
			pts.sort(function(p, q) {
				return p.x - q.x || p.y - q.y;
			});
			function cross(o, a, b) {
				return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
			}
			var lower = [], upper = [], i2;
			for (i2 = 0; i2 < pts.length; i2++) {
				while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i2]) <= 0) {
					lower.pop();
				}
				lower.push(pts[i2]);
			}
			for (i2 = pts.length - 1; i2 >= 0; i2--) {
				while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i2]) <= 0) {
					upper.pop();
				}
				upper.push(pts[i2]);
			}
			var hull = lower.slice(0, -1).concat(upper.slice(0, -1));
			var out = [];
			for (var m = 0; m < hull.length; m++) {
				out.push({ a: hull[m], b: hull[(m + 1) % hull.length], sil: true });
			}
			return out;
		}

		// ---------- drawing ----------
		// jagged polyline from a to b, appended to the current path
		function jag(ctx, a, b, amp, segs) {
			var dx = b.x - a.x, dy = b.y - a.y;
			var len = Math.sqrt(dx * dx + dy * dy) || 1;
			var nx = -dy / len, ny = dx / len;
			ctx.moveTo(a.x, a.y);
			for (var i = 1; i < segs; i++) {
				var u = i / segs;
				var off = (Math.random() - 0.5) * 2 * amp * Math.sin(u * Math.PI);
				ctx.lineTo(a.x + dx * u + nx * off, a.y + dy * u + ny * off);
			}
			ctx.lineTo(b.x, b.y);
		}

		// branching bolt from p in direction (dx,dy), appended to the current path
		function bolt(ctx, p, dx, dy, len, depth) {
			var x = p.x, y = p.y;
			var steps = 5 + ((len / 14) | 0);
			var sl = len / steps;
			var ang = Math.atan2(dy, dx);
			ctx.moveTo(x, y);
			for (var i = 0; i < steps; i++) {
				var a = ang + (Math.random() - 0.5) * 1.3;
				x += Math.cos(a) * sl;
				y += Math.sin(a) * sl;
				ctx.lineTo(x, y);
				if (depth > 0 && i > 0 && i < steps - 1 && Math.random() < 0.28) {
					var side = Math.random() < 0.5 ? -1 : 1;
					var ba = ang + side * (0.5 + Math.random() * 0.6);
					bolt(ctx, { x: x, y: y }, Math.cos(ba), Math.sin(ba), len * (0.35 + Math.random() * 0.25), depth - 1);
					ctx.moveTo(x, y);
				}
			}
		}

		// stroke the current path as electricity: glow, blue body, white core
		function zap(ctx, alpha, width) {
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			ctx.globalAlpha = alpha * 0.3;
			ctx.strokeStyle = '#2f7bff';
			ctx.lineWidth = width * 6;
			ctx.stroke();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = '#0a4ff0';
			ctx.lineWidth = width * 2.4;
			ctx.stroke();
			ctx.strokeStyle = '#f4f9ff';
			ctx.lineWidth = width * 0.55;
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		function outward(api, e) {
			var c = api.cube().center;
			var mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
			var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
			var nx = -dy / len, ny = dx / len;
			if (nx * (mx - c.x) + ny * (my - c.y) < 0) {
				nx = -nx;
				ny = -ny;
			}
			return { x: nx, y: ny, len: len };
		}

		function spark(api, edges, opt) {
			var now = jlFx.now();
			var kept = [];
			for (var q = 0; q < ends.length; q++) {
				if (ends[q] > now) {
					kept.push(ends[q]);
				}
			}
			ends = kept;
			if (ends.length >= MAX_LIVE || !edges.length) {
				return;
			}
			var dur = opt.dur;
			ends.push(now + dur + 50);
			var r = api.cube().radius;
			// bolts are anchored once (spot + direction), but their shape re-randomizes each frame
			var bolts = [];
			var sil = [];
			for (var i = 0; i < edges.length; i++) {
				if (edges[i].sil) {
					sil.push(edges[i]);
				}
			}
			for (var k = 0; k < opt.bolts && sil.length; k++) {
				var e = sil[(api.rand() * sil.length) | 0];
				var u = 0.15 + api.rand() * 0.7;
				var o = outward(api, e);
				var tilt = (api.rand() - 0.5) * 0.9;
				var ca = Math.cos(tilt), sa = Math.sin(tilt);
				bolts.push({
					p: { x: e.a.x + (e.b.x - e.a.x) * u, y: e.a.y + (e.b.y - e.a.y) * u },
					dx: o.x * ca - o.y * sa, dy: o.x * sa + o.y * ca,
					len: r * (0.4 + api.rand() * 0.3) * opt.reach,
					life: dur * (0.45 + api.rand() * 0.3)
				});
			}
			api.add(function(ctx, t) {
				if (t > dur) {
					return false;
				}
				var k = t / dur;
				// flicker: arcs blink on and off a little
				var flick = Math.random() < 0.15 ? 0.5 : 1;
				var alpha = Math.pow(1 - k, 1.3) * flick * opt.alpha;
				ctx.beginPath();
				for (var i = 0; i < edges.length; i++) {
					var e = edges[i];
					var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
					var len = Math.sqrt(dx * dx + dy * dy);
					jag(ctx, e.a, e.b, opt.amp * (1 - 0.5 * k), Math.max(4, (len / 11) | 0));
				}
				zap(ctx, alpha, opt.width);
				// bolts: shoot out fast, then crackle and fade
				ctx.beginPath();
				var any = false;
				for (var j = 0; j < bolts.length; j++) {
					var b = bolts[j];
					if (t < b.life) {
						var grow = Math.min(1, t / 45);
						bolt(ctx, b.p, b.dx, b.dy, b.len * grow, 1);
						any = true;
					}
				}
				if (any) {
					zap(ctx, Math.min(1, alpha * 1.15), opt.width * 0.85);
				}
				return true;
			});
		}

		function flashOutline(api, edges) {
			// reduced motion: one short static outline flash
			api.add(function(ctx, t) {
				if (t > 160) {
					return false;
				}
				ctx.beginPath();
				for (var i = 0; i < edges.length; i++) {
					ctx.moveTo(edges[i].a.x, edges[i].a.y);
					ctx.lineTo(edges[i].b.x, edges[i].b.y);
				}
				ctx.globalAlpha = 0.8 * (1 - t / 160);
				ctx.strokeStyle = '#1f6bff';
				ctx.lineWidth = 2.5;
				ctx.stroke();
				return true;
			});
		}

		var handler = function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			if (ev.rotation) {
				var hull = hullEdges(api);
				if (api.reduced) {
					flashOutline(api, hull);
					return;
				}
				spark(api, hull, { dur: 220, bolts: 0, reach: 0, amp: 3, width: 1.2, alpha: 0.55 });
				return;
			}
			var edges = faceEdges(api, ev.face);
			if (api.reduced) {
				flashOutline(api, edges);
				return;
			}
			var combo = Math.min(ev.combo || 1, 12);
			var wide = ev.layers && ev.layers[1] > 1;
			var heat = Math.min(1, (combo - 1) / 8); // 0 .. 1 with streak
			var visible = api.face(ev.face).visible;
			spark(api, edges, {
				dur: 260 + heat * 80 - (ev.tps > 12 ? 60 : 0),
				bolts: (visible ? 2 : 2) + Math.round(heat * 2) + (wide ? 1 : 0) - (ends.length > 6 ? 1 : 0),
				reach: 1 + heat * 0.5 + (wide ? 0.2 : 0),
				amp: (wide ? 7.5 : 6) + heat * 2.5,
				width: (wide ? 2.2 : 1.9) + heat * 0.4,
				alpha: 1
			});
			if (ev.amount && Math.abs(ev.amount) == 2 && combo < 4) {
				api.shake(1.5, 90);
			}
		};
		handler.spark = spark;
		handler.bolt = bolt;
		handler.zap = zap;
		handler.hull = hullEdges;
		handler.edges = faceEdges;
		handler.flash = flashOutline;
		return handler;
	})();

jlFx.register({
	id: 'lightning',
	name: 'Lightning',
	onMove: LH,

	onScramble: function(api) {
		var h = LH;
		var hull = h.hull(api);
		if (api.reduced) {
			h.flash(api, hull);
			return;
		}
		h.spark(api, hull, { dur: 300, bolts: 2, reach: 0.8, amp: 4, width: 1.3, alpha: 0.7 });
	},

	onSolve: function(api) {
		var h = LH;
		var hull = h.hull(api);
		if (api.reduced) {
			h.flash(api, hull);
			return;
		}
		var c = api.cube();
		var r = c.radius;
		var D = 2200;
		var next = 0;
		var strikes = [];
		api.shake(2.5, 260);
		api.add(function(ctx, t) {
			if (t > D) {
				return false;
			}
			var k = t / D;
			var energy = t < 1500 ? 1 : 1 - (t - 1500) / 700;
			// spawn strikes: frequent at first, thinning out
			while (t >= next && t < 1600 && strikes.length < 14) {
				var e = hull[(Math.random() * hull.length) | 0];
				var u = 0.1 + Math.random() * 0.8;
				var px = e.a.x + (e.b.x - e.a.x) * u, py = e.a.y + (e.b.y - e.a.y) * u;
				var dx = px - c.center.x, dy = py - c.center.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
				strikes.push({ p: { x: px, y: py }, dx: dx / dl, dy: dy / dl, len: r * (0.6 + Math.random() * 0.5), born: t, life: 140 + Math.random() * 140 });
				next += 50 + k * 220 + Math.random() * 60;
			}
			// crackling silhouette
			ctx.beginPath();
			for (var i = 0; i < hull.length; i++) {
				var a = hull[i].a, b = hull[i].b;
				var hx = b.x - a.x, hy = b.y - a.y, len = Math.sqrt(hx * hx + hy * hy) || 1;
				var nx = -hy / len, ny = hx / len, segs = Math.max(5, (len / 10) | 0);
				ctx.moveTo(a.x, a.y);
				for (var s = 1; s < segs; s++) {
					var q = s / segs, off = (Math.random() - 0.5) * 10 * Math.sin(q * Math.PI);
					ctx.lineTo(a.x + hx * q + nx * off, a.y + hy * q + ny * off);
				}
				ctx.lineTo(b.x, b.y);
			}
			h.zap(ctx, Math.max(0, energy) * (Math.random() < 0.15 ? 0.4 : 0.9), 1.7);
			// strikes into the margin
			ctx.beginPath();
			var alive = [];
			for (var j = 0; j < strikes.length; j++) {
				var st = strikes[j], age = t - st.born;
				if (age < st.life) {
					h.bolt(ctx, st.p, st.dx, st.dy, st.len * Math.min(1, age / 40), 2);
					alive.push(st);
				}
			}
			strikes = alive;
			h.zap(ctx, Math.max(0, energy), 1.8);
			// one quick, faint white flash over the cube at the start
			if (t < 120) {
				ctx.globalAlpha = 0.18 * (1 - t / 120);
				ctx.fillStyle = '#dfeaff';
				ctx.beginPath();
				ctx.arc(c.center.x, c.center.y, r * 1.1, 0, Math.PI * 2);
				ctx.fill();
			}
			return true;
		});
	}
});
})();
// @ts-check
"use strict";

// Neon Trail: a synthwave light-cycle streak races around the outline of the turning face in the turn
// direction, leaving a fading glowing wall behind it. Hidden faces get a streak along the cube silhouette.
(function() {
	var PINK = [255, 43, 214], CYAN = [0, 240, 255], WHITE = [255, 255, 255];
	var MAX_LIVE = 10; // concurrent streaks; older ones are retired early
	var live = [];
	var light = false; // light page background: neon needs deeper colours and a darker core to read

	function checkTheme() {
		light = true;
		try {
			var els = [document.body, document.documentElement];
			for (var i = 0; i < els.length; i++) {
				var m = /(\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?/.exec(getComputedStyle(els[i]).backgroundColor);
				if (m && m[4] !== '0') {
					light = 0.3 * +m[1] + 0.59 * +m[2] + 0.11 * +m[3] > 140;
					return;
				}
			}
		} catch (e) {}
	}

	function deep(c) {
		return light ? mix(c, [40, 0, 90], 0.28) : c;
	}

	function rgba(c, a) {
		return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
	}

	function mix(a, b, k) {
		return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
	}

	function hex2rgb(h) {
		h = (h || '#fff').replace('#', '');
		if (h.length == 3) {
			h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
		}
		var n = parseInt(h, 16) || 0;
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}

	function easeOut(x) {
		return 1 - Math.pow(1 - x, 2.2);
	}

	// ---------- paths: list of points + cumulative lengths; point(s) for s in [0, 1] ----------
	function makePath(pts, closed) {
		if (closed) {
			pts = pts.concat([pts[0]]);
		}
		var cum = [0], total = 0;
		for (var i = 1; i < pts.length; i++) {
			total += Math.sqrt(Math.pow(pts[i].x - pts[i - 1].x, 2) + Math.pow(pts[i].y - pts[i - 1].y, 2));
			cum.push(total);
		}
		total = total || 1;
		for (var j = 0; j < cum.length; j++) {
			cum[j] /= total;
		}
		return { pts: pts, cum: cum, closed: closed };
	}

	function pointAt(path, s) {
		var cum = path.cum, pts = path.pts;
		for (var i = 1; i < cum.length; i++) {
			if (s <= cum[i] || i == cum.length - 1) {
				var k = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
				k = Math.max(0, Math.min(1, k));
				return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
			}
		}
		return pts[0];
	}

	// trace the sub-path from s0 to s1 (s may exceed 1 on closed paths, it wraps), keeping the corners sharp
	function tracePart(ctx, path, s0, s1) {
		if (s1 <= s0) {
			return;
		}
		var lap = Math.floor(s0);
		var p = pointAt(path, path.closed ? s0 - lap : Math.max(0, s0));
		ctx.moveTo(p.x, p.y);
		var cum = path.cum;
		for (var L = lap; L <= Math.floor(s1); L++) {
			for (var i = 1; i < cum.length - 1; i++) {
				var s = L + cum[i];
				if (s > s0 && s < s1) {
					ctx.lineTo(path.pts[i].x, path.pts[i].y);
				}
			}
			if (!path.closed) {
				break;
			}
			if (L + 1 > s0 && L + 1 < s1) {
				ctx.lineTo(path.pts[0].x, path.pts[0].y);
			}
		}
		p = pointAt(path, path.closed ? s1 - Math.floor(s1) : Math.min(1, s1));
		ctx.lineTo(p.x, p.y);
	}

	function signedArea(pts) {
		var a = 0;
		for (var i = 0; i < pts.length; i++) {
			var p = pts[i], q = pts[(i + 1) % pts.length];
			a += p.x * q.y - q.x * p.y;
		}
		return a; // > 0: clockwise on screen (y down)
	}

	// outline of a visible face, pushed slightly outwards, ordered to run with the turn
	function facePath(fc, cw, scale, startIdx) {
		var pts = fc.corners.map(function(p) {
			return { x: fc.center.x + (p.x - fc.center.x) * scale, y: fc.center.y + (p.y - fc.center.y) * scale };
		});
		if ((signedArea(pts) > 0) != cw) {
			pts.reverse();
		}
		var k = startIdx % pts.length;
		return makePath(pts.slice(k).concat(pts.slice(0, k)), true);
	}

	// convex hull of the whole cube on screen (all sticker corners pushed out to the cube body), clockwise
	function hull(api, pad) {
		var cb = api.cube(), pts = [], fs = 'URFDLB';
		for (var i = 0; i < 6; i++) {
			var cs = api.face(fs.charAt(i)).corners;
			for (var j = 0; j < 4; j++) {
				var dx = cs[j].x - cb.center.x, dy = cs[j].y - cb.center.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
				var k = 1.12 + pad / l;
				pts.push({ x: cb.center.x + dx * k, y: cb.center.y + dy * k });
			}
		}
		pts.sort(function(a, b) {
			return a.x - b.x || a.y - b.y;
		});
		function cross(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lo = [], up = [];
		for (i = 0; i < pts.length; i++) {
			while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) {
				lo.pop();
			}
			lo.push(pts[i]);
		}
		for (i = pts.length - 1; i >= 0; i--) {
			while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) {
				up.pop();
			}
			up.push(pts[i]);
		}
		var h = lo.slice(0, -1).concat(up.slice(0, -1));
		if (signedArea(h) < 0) {
			h.reverse();
		}
		return makePath(h, true);
	}

	// stretch of the cube silhouette facing screen angle a0, spanning +-span radians worth of perimeter,
	// pad px outside the cube, running cw or ccw on screen
	function arcPath(api, a0, span, pad, cw) {
		var hp = hull(api, pad), c = api.cube().center;
		var dx = Math.cos(a0), dy = Math.sin(a0), best = 0, bestD = -1e9;
		for (var i = 0; i < 120; i++) { // the point of the silhouette closest to the ray from the centre
			var p = pointAt(hp, i / 120), vx = p.x - c.x, vy = p.y - c.y;
			var along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
			var score = along - 3 * side;
			if (score > bestD) {
				bestD = score;
				best = i / 120;
			}
		}
		var f = Math.min(0.5, span / (2 * Math.PI));
		var s0 = best - f + 1, s1 = best + f + 1, pts = [pointAt(hp, s0 - Math.floor(s0))];
		for (var L = Math.floor(s0); L <= Math.floor(s1); L++) {
			for (var j = 0; j < hp.cum.length - 1; j++) {
				var s = L + hp.cum[j];
				if (s > s0 && s < s1) {
					pts.push(hp.pts[j]);
				}
			}
		}
		pts.push(pointAt(hp, s1 - Math.floor(s1)));
		if (!cw) {
			pts.reverse();
		}
		return makePath(pts, false);
	}

	function retire() {
		while (live.length > MAX_LIVE) {
			live.shift().dead = true;
		}
	}

	// one light-cycle streak
	// o: path, dur (head travel ms), laps, trail (fraction of path), fade (ms after the head stops),
	//    head/tail colors, width, alpha, wall (afterimage alpha), delay
	function streak(api, o) {
		var st = { dead: false };
		live.push(st);
		retire();
		var travel = o.laps; // how much path the head covers
		var BANDS = 7;
		var headC = deep(o.head), tailC = deep(o.tail);
		var core = light ? mix(o.head, [60, 0, 90], 0.45) : WHITE;
		var glowA = light ? 0.42 : 0.28;
		api.add(function(ctx, t) {
			if (st.dead) {
				return false;
			}
			t -= o.delay || 0;
			if (t < 0) {
				return true;
			}
			var k = Math.min(1, t / o.dur);
			var head = easeOut(k) * travel;
			var after = Math.max(0, t - o.dur);
			var fadeK = Math.max(0, 1 - after / o.fade);
			if (fadeK <= 0) {
				var idx = live.indexOf(st);
				idx != -1 && live.splice(idx, 1);
				return false;
			}
			var trail = o.trail * (k < 1 ? 1 : fadeK); // the trail shrinks into the head once it stops
			var tail = Math.max(0, head - trail);
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			var A = o.alpha * (k < 1 ? 1 : fadeK);
			// afterimage wall: everything the head has passed, faint and fading
			if (o.wall > 0) {
				var wallA = o.wall * fadeK * Math.min(1, t / 60);
				ctx.beginPath();
				tracePart(ctx, o.path, Math.max(0, head - 1), tail + 0.0001);
				ctx.strokeStyle = rgba(tailC, wallA * 0.35);
				ctx.lineWidth = o.width * 3.2;
				ctx.stroke();
				ctx.strokeStyle = rgba(tailC, wallA);
				ctx.lineWidth = o.width * 0.9;
				ctx.stroke();
			}
			// the streak: bands from tail (dim, tail colour) to head (bright, head colour)
			if (head - tail > 0.0005) {
				for (var b = 0; b < BANDS; b++) {
					var u0 = b / BANDS, u1 = (b + 1) / BANDS;
					var col = mix(tailC, headC, u1);
					var a = A * (0.3 + 0.7 * u1 * u1);
					ctx.beginPath();
					tracePart(ctx, o.path, tail + (head - tail) * u0, tail + (head - tail) * u1 + 0.002);
					ctx.strokeStyle = rgba(col, a * glowA);
					ctx.lineWidth = o.width * (2.2 + 2.2 * u1);
					ctx.stroke();
					ctx.strokeStyle = rgba(col, a);
					ctx.lineWidth = o.width * (0.6 + 0.6 * u1);
					ctx.stroke();
				}
				// white-hot core near the head
				ctx.beginPath();
				tracePart(ctx, o.path, Math.max(tail, head - trail * 0.25), head);
				ctx.strokeStyle = rgba(core, A * 0.9);
				ctx.lineWidth = Math.max(1, o.width * 0.45);
				ctx.stroke();
			}
			// head glow
			if (k < 1 || fadeK > 0.6) {
				var hp = pointAt(o.path, o.path.closed ? head - Math.floor(head) : Math.min(1, head));
				var r = o.width * 3.2;
				var g = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, r);
				g.addColorStop(0, rgba(light ? headC : WHITE, A));
				g.addColorStop(0.35, rgba(headC, A * 0.75));
				g.addColorStop(1, rgba(headC, 0));
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.arc(hp.x, hp.y, r, 0, 6.2832);
				ctx.fill();
			}
			return true;
		});
	}

	// short outline flash (landing pulse, reduced motion)
	function flash(api, path, col, width, alpha, ms, grow) {
		api.add(function(ctx, t) {
			var k = t / ms;
			if (k >= 1) {
				return false;
			}
			ctx.save();
			if (grow) {
				var c = path.center;
				var s = 1 + grow * k;
				ctx.translate(c.x, c.y);
				ctx.scale(s, s);
				ctx.translate(-c.x, -c.y);
			}
			ctx.beginPath();
			tracePart(ctx, path, 0, path.closed ? 0.99999 : 1);
			if (path.closed) {
				ctx.closePath();
			}
			ctx.lineJoin = 'round';
			ctx.strokeStyle = rgba(col, alpha * (1 - k) * 0.3);
			ctx.lineWidth = width * 3;
			ctx.stroke();
			ctx.strokeStyle = rgba(col, alpha * (1 - k));
			ctx.lineWidth = width;
			ctx.stroke();
			ctx.restore();
			return true;
		});
	}

	var moveCount = 0;

	function onMove(api, ev) {
		var fc = api.face(ev.face);
		var cb = api.cube();
		if (!fc) {
			return;
		}
		if (ev.phase == 'start') {
			checkTheme();
		}
		var amt = ev.amount || 1;
		var cwFace = amt > 0; // clockwise as seen looking at the face
		var cwScreen = fc.visible ? cwFace : !cwFace;
		var na = Math.atan2(fc.normal.y, fc.normal.x);
		var half = Math.abs(amt) >= 2;
		var combo = Math.min(12, ev.combo || 1);
		var hot = Math.min(1, Math.max(0, (combo - 3) / 8)); // 0..1 as the streak heats up
		var stick = hex2rgb(fc.color);
		var path;

		if (api.reduced) {
			if (ev.phase != 'end') {
				return;
			}
			path = fc.visible && !ev.rotation ? facePath(fc, cwScreen, 1.05, 0) : arcPath(api, na, ev.rotation ? Math.PI : 0.9, 6, cwScreen);
			path.center = fc.visible ? fc.center : cb.center;
			flash(api, path, mix(stick, PINK, 0.3), 2, 0.8, 220, 0);
			return;
		}

		if (ev.phase == 'start') {
			moveCount++;
			var alt = moveCount % 2 == 0;
			var headCol = alt ? CYAN : PINK, tailCol = alt ? PINK : CYAN;
			// a hint of the sticker colour in the wall so you can tell which face turned
			var wallCol = mix(tailCol, stick, 0.35);
			var dur = (half ? 360 : 280) * (1 - 0.3 * hot);
			if (ev.rotation) {
				// whole-cube rotation: two thin streaks swing around the silhouette
								for (var r = 0; r < 2; r++) {
					streak(api, {
						path: arcPath(api, na + r * Math.PI, Math.PI * 0.45, 14, cwScreen),
						dur: 300, laps: 1, trail: 0.6, fade: 140, head: r ? PINK : CYAN, tail: r ? CYAN : PINK,
						width: 1.6, alpha: 0.6, wall: 0
					});
				}
				return;
			}
			var width = 2.8 + 0.8 * hot;
			if (fc.visible) {
				// random start corner so consecutive turns of one face do not look identical
				var start = Math.floor(api.rand() * 4);
				streak(api, {
					path: facePath(fc, cwScreen, 1.06, start),
					dur: dur, laps: half ? 1.5 : 1, trail: 0.42 + 0.15 * hot, fade: 260,
					head: headCol, tail: wallCol, width: width, alpha: 1, wall: 0.7
				});
				if (ev.layers && ev.layers[1] > 1 && ev.layers[0] == 1) { // wide move: a second, outer cycle
					streak(api, {
						path: facePath(fc, cwScreen, 1.16, (start + 2) % 4),
						dur: dur, laps: half ? 1.5 : 1, trail: 0.35, fade: 220, delay: 40,
						head: tailCol, tail: headCol, width: width * 0.7, alpha: 0.8, wall: 0.3
					});
				}
			} else {
				// hidden face: the cycle rides the silhouette on that side
				var span = 0.95 + (half ? 0.35 : 0);
				streak(api, {
					path: arcPath(api, na, span, 7, cwScreen),
					dur: dur, laps: 1, trail: 0.55 + 0.15 * hot, fade: 240,
					head: headCol, tail: wallCol, width: width, alpha: 1, wall: 0.65
				});
				if (ev.layers && ev.layers[1] > 1 && ev.layers[0] == 1) {
					streak(api, {
						path: arcPath(api, na, span * 0.85, 16, cwScreen),
						dur: dur, laps: 1, trail: 0.5, fade: 200, delay: 40,
						head: tailCol, tail: headCol, width: width * 0.7, alpha: 0.8, wall: 0.3
					});
				}
			}
		} else if (ev.phase == 'end' && !ev.rotation && combo < 8) {
			// landing: a quick crisp outline blink (skipped at high combo to keep things clean)
			if (fc.visible) {
				path = facePath(fc, cwScreen, 1.06, 0);
				path.center = fc.center;
				flash(api, path, mix(WHITE, stick, 0.5), 1.4, 0.55, 160, 0.06);
			}
		}
	}

	function onSolve(api) {
		var cb = api.cube();
		checkTheme();
		var faces = 'URFDLB'.split('');
		var i, n = 0;
		if (api.reduced) {
			var ring = arcPath(api, 0, Math.PI, 8, true);
			ring.center = cb.center;
			flash(api, ring, PINK, 2, 0.9, 600, 0);
			return;
		}
		live.forEach(function(s) {
			s.dead = true;
		});
		live = [];
		// every visible face gets two cycles chasing each other, two laps
		for (i = 0; i < faces.length; i++) {
			var fc = api.face(faces[i]);
			if (!fc.visible) {
				continue;
			}
			for (var j = 0; j < 2; j++) {
				streak(api, {
					path: facePath(fc, (n % 2) == 0, 1.06, j * 2), dur: 1300, laps: 2, trail: 0.35, fade: 500,
					delay: n * 120, head: j ? CYAN : PINK, tail: mix(j ? PINK : CYAN, hex2rgb(fc.color), 0.3),
					width: 2.6, alpha: 0.95, wall: 0.45
				});
			}
			n++;
		}
		// two big cycles race around the silhouette in opposite directions
		for (i = 0; i < 2; i++) {
			streak(api, {
				path: i ? hull(api, 10) : makePath(hull(api, 10).pts.slice(0, -1).reverse(), true), dur: 1500, laps: 2, trail: 0.3, fade: 500,
				delay: 150, head: i ? CYAN : PINK, tail: i ? PINK : CYAN, width: 3, alpha: 1, wall: 0.6
			});
		}
		// finale: a neon ring pulses outward from the silhouette
		var ringP = arcPath(api, 0, Math.PI, 10, true);
		ringP.center = cb.center;
		api.add(function(ctx, t) {
			if (t < 1500) {
				return true;
			}
			var k = (t - 1500) / 700;
			if (k >= 1) {
				return false;
			}
			for (var q = 0; q < 2; q++) {
				var kk = Math.max(0, k - q * 0.18);
				var s = 1 + 0.5 * easeOut(kk);
				var a = (1 - kk) * 0.9;
				ctx.save();
				ctx.translate(cb.center.x, cb.center.y);
				ctx.scale(s, s);
				ctx.translate(-cb.center.x, -cb.center.y);
				ctx.beginPath();
				tracePart(ctx, ringP, 0, 1);
				ctx.strokeStyle = rgba(q ? CYAN : PINK, a * 0.3);
				ctx.lineWidth = 9 / s;
				ctx.stroke();
				ctx.strokeStyle = rgba(q ? CYAN : PINK, a);
				ctx.lineWidth = 2.5 / s;
				ctx.stroke();
				ctx.restore();
			}
			return true;
		});
		api.shake(2, 220);
	}

	function onScramble(api) {
		checkTheme();
		if (api.reduced) {
			return;
		}
		streak(api, {
			path: arcPath(api, -Math.PI / 2, Math.PI, 8, true), dur: 520, laps: 1, trail: 0.4, fade: 220,
			head: CYAN, tail: PINK, width: 2, alpha: 0.85, wall: 0.3
		});
	}

	jlFx.register({ id: 'neon', name: 'Neon Trail', onMove: onMove, onSolve: onSolve, onScramble: onScramble });
})();
// @ts-check
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
			var now = jlFx.now();
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
			var now = jlFx.now();
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
			var now = jlFx.now();
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
			pushRipple({ start: jlFx.now(), dur: 900, full: true, d0: R * 1.0, n: { x: 0, y: -1 }, half: Math.PI,
				reach: R * 0.4, width: 1.8, power: 0.6, crest: [255, 255, 255], shade: [70, 80, 100] });
			ensureRunning(api);
		}
	});
})();
// @ts-check
"use strict";

// Crystal Shards: glassy triangular shards in the sticker color burst off the turning face's silhouette edge,
// tumble (2D spin + a fake 3D flip that flashes a white specular edge) and fade while falling.
// The solve shatters a ring of shards around the whole cube.
(function() {
	var MAX_SHARDS = 180, MAX_SOLVE = 200, MAX_GLINTS = 24;
	var shards = [];
	var glints = [];
	var rings = [];
	var pending = [];
	var hull = null; // silhouette polygon of the cube body, recomputed per event
	var loopId = 0, loopStart = 0, running = false;
	var FACES = 'URFDLB';

	function now() {
		return jlFx.now();
	}

	// ---------- geometry ----------
	function convexHull(pts) {
		pts = pts.slice().sort(function(a, b) {
			return a.x - b.x || a.y - b.y;
		});
		function cross(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lower = [], upper = [], i;
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
		return lower.concat(upper);
	}

	function distToSeg(p, a, b) {
		var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
		var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
		var x = a.x + dx * t - p.x, y = a.y + dy * t - p.y;
		return Math.sqrt(x * x + y * y);
	}

	function onHull(p, poly) {
		for (var i = 0; i < poly.length; i++) {
			if (distToSeg(p, poly[i], poly[(i + 1) % poly.length]) < 2.5) {
				return true;
			}
		}
		return false;
	}

	// hull of all sticker corners, plus a slightly inflated copy that matches the cube body
	function computeHull(api) {
		var pts = [];
		for (var i = 0; i < 6; i++) {
			pts = pts.concat(api.face(FACES.charAt(i)).corners);
		}
		var inner = convexHull(pts);
		var c = api.cube().center;
		var body = inner.map(function(p) {
			return { x: c.x + (p.x - c.x) * 1.14, y: c.y + (p.y - c.y) * 1.14 };
		});
		hull = { inner: inner, body: body, center: c };
		return hull;
	}

	function inside(x, y, poly) {
		// convex polygon, any winding
		var sign = 0;
		for (var i = 0; i < poly.length; i++) {
			var a = poly[i], b = poly[(i + 1) % poly.length];
			var cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
			if (cr != 0) {
				if (sign == 0) {
					sign = cr > 0 ? 1 : -1;
				} else if ((cr > 0 ? 1 : -1) != sign) {
					return false;
				}
			}
		}
		return true;
	}

	// silhouette edges of a face: quad edges that lie on the cube outline. Each edge is {a, b, nx, ny} with an
	// outward screen normal. Hidden faces get the outline edges they share with visible neighbours.
	function silhouetteEdges(api, f, hl) {
		var fc = api.face(f);
		var cs = fc.corners, out = [], i;
		var c = hl.center;
		for (i = 0; i < 4; i++) {
			var a = cs[i], b = cs[(i + 1) % 4];
			var m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			if (!onHull(m, hl.inner)) {
				continue;
			}
			var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
			if (len < 4) {
				continue;
			}
			var nx = -dy / len, ny = dx / len;
			if (nx * (m.x - c.x) + ny * (m.y - c.y) < 0) {
				nx = -nx;
				ny = -ny;
			}
			out.push({ a: a, b: b, nx: nx, ny: ny, len: len });
		}
		if (!out.length) {
			// fallback: outline edges facing the face's normal
			var hp = hl.inner;
			for (i = 0; i < hp.length; i++) {
				var p = hp[i], q = hp[(i + 1) % hp.length];
				var ex = q.x - p.x, ey = q.y - p.y, el = Math.sqrt(ex * ex + ey * ey) || 1;
				var ux = -ey / el, uy = ex / el;
				var mx = (p.x + q.x) / 2 - c.x, my = (p.y + q.y) / 2 - c.y;
				if (ux * mx + uy * my < 0) {
					ux = -ux;
					uy = -uy;
				}
				if (ux * fc.normal.x + uy * fc.normal.y > 0.35) {
					out.push({ a: p, b: q, nx: ux, ny: uy, len: el });
				}
			}
		}
		return { edges: out, face: fc };
	}

	// ---------- particles ----------
	function rgb(hex) {
		var h = (hex || '#ffffff').replace('#', '');
		if (h.length == 3) {
			h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
		}
		var n = parseInt(h, 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}

	function shade(c, k) {
		// k < 0 darken, k > 0 lighten
		var r = [];
		for (var i = 0; i < 3; i++) {
			r.push(Math.round(k < 0 ? c[i] * (1 + k) : c[i] + (255 - c[i]) * k));
		}
		return 'rgb(' + r.join(',') + ')';
	}

	function makeShard(api, x, y, vx, vy, size, color, life, cap) {
		var R = api.rand;
		// irregular sliver triangle around the origin: one long point, two near the base
		var ang = R() * Math.PI * 2;
		var len0 = size * (0.9 + R() * 0.6), wid = size * (0.45 + R() * 0.4);
		var col = rgb(color);
		var lum = (col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11) / 255;
		var s = {
			x: x, y: y, vx: vx, vy: vy,
			pts: [len0, 0, -len0 * 0.35, wid * (0.6 + R() * 0.6), -len0 * 0.45, -wid * (0.6 + R() * 0.6)],
			rot: ang, spin: (R() - 0.5) * 0.024, flip: R() * Math.PI * 2, flipV: (0.008 + R() * 0.016) * (R() < 0.5 ? -1 : 1),
			fill: shade(col, 0), back: shade(col, -0.2), dark: shade(col, lum > 0.75 ? -0.45 : -0.35), light: shade(col, 0.55),
			age: 0, life: life, cap: cap
		};
		shards.push(s);
		var max = cap || MAX_SHARDS;
		if (shards.length > max) {
			shards.splice(0, shards.length - max);
		}
	}

	function drawShard(ctx, s, alpha) {
		var c = Math.cos(s.rot), sn = Math.sin(s.rot);
		var fl = Math.cos(s.flip); // pseudo 3D: squash along the shard's width as it flips
		var p = s.pts, xs = [], ys = [];
		for (var i = 0; i < 3; i++) {
			var lx = p[i * 2], ly = p[i * 2 + 1] * fl;
			xs.push(s.x + lx * c - ly * sn);
			ys.push(s.y + lx * sn + ly * c);
		}
		var facing = Math.abs(fl);
		ctx.beginPath();
		ctx.moveTo(xs[0], ys[0]);
		ctx.lineTo(xs[1], ys[1]);
		ctx.lineTo(xs[2], ys[2]);
		ctx.closePath();
		ctx.globalAlpha = alpha * (0.72 + 0.25 * facing);
		ctx.fillStyle = fl > 0 ? s.fill : s.back;
		ctx.fill();
		ctx.globalAlpha = alpha * 0.8;
		ctx.lineWidth = 1;
		ctx.strokeStyle = s.dark;
		ctx.stroke();
		// glassy facet: tip, base midpoint and one base corner
		var mx = (xs[1] + xs[2]) / 2, my = (ys[1] + ys[2]) / 2;
		ctx.beginPath();
		ctx.moveTo(xs[0], ys[0]);
		ctx.lineTo(xs[1], ys[1]);
		ctx.lineTo(mx, my);
		ctx.closePath();
		ctx.globalAlpha = alpha * (0.2 + 0.45 * facing);
		ctx.fillStyle = s.light;
		ctx.fill();
		// white specular edge, flashes when the shard faces the viewer
		var spec = Math.pow(facing, 4);
		ctx.globalAlpha = alpha * (0.35 + 0.65 * spec);
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 1 + spec;
		ctx.beginPath();
		ctx.moveTo(xs[0], ys[0]);
		ctx.lineTo(xs[1], ys[1]);
		ctx.stroke();
	}

	// ---------- main loop (one shared animation; replaced before the framework's 10 s cap) ----------
	function ensureLoop(api) {
		var t = now();
		if (running && t - loopStart < 8000) {
			return;
		}
		var id = ++loopId;
		loopStart = t;
		running = true;
		api.add(function(ctx, tt, dt) {
			if (id != loopId) {
				return false;
			}
			return step(api, ctx, dt);
		});
	}

	function step(api, ctx, dt) {
		var t = now(), i;
		for (i = 0; i < pending.length; i++) {
			if (t >= pending[i].at) {
				pending[i].fn();
				pending.splice(i--, 1);
			}
		}
		var r = api.cube().radius;
		var g = r * 0.0000032, drag = Math.exp(-dt / 450);
		var body = hull && hull.body;

		// solve rings
		var keepR = [];
		for (i = 0; i < rings.length; i++) {
			var rg = rings[i];
			rg.age += dt;
			var k = rg.age / rg.life;
			if (k >= 1) {
				continue;
			}
			keepR.push(rg);
			var e = 1 - Math.pow(1 - k, 3);
			ctx.globalAlpha = (1 - k) * 0.85;
			ctx.strokeStyle = rg.color;
			ctx.beginPath();
			ctx.arc(rg.x, rg.y, rg.r0 + (rg.r1 - rg.r0) * e, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(90,110,150,0.35)';
			ctx.lineWidth = 3 + 5 * (1 - k);
			ctx.stroke();
			ctx.strokeStyle = rg.color;
			ctx.lineWidth = 1.5 + 2 * (1 - k);
			ctx.stroke();
		}
		rings = keepR;

		// edge glints
		var keepG = [];
		for (i = 0; i < glints.length; i++) {
			var gl = glints[i];
			gl.age += dt;
			var gk = gl.age / gl.life;
			if (gk >= 1) {
				continue;
			}
			keepG.push(gl);
			ctx.globalAlpha = (1 - gk) * gl.alpha;
			ctx.lineCap = 'round';
			for (var j = 0; j < gl.edges.length; j++) {
				var ed = gl.edges[j], o = gl.offset * gk;
				ctx.beginPath();
				ctx.moveTo(ed.a.x + ed.nx * o, ed.a.y + ed.ny * o);
				ctx.lineTo(ed.b.x + ed.nx * o, ed.b.y + ed.ny * o);
				ctx.strokeStyle = gl.color;
				ctx.lineWidth = gl.width;
				ctx.stroke();
				if (gl.core) {
					ctx.strokeStyle = '#fff';
					ctx.lineWidth = gl.width * 0.4;
					ctx.stroke();
				}
			}
		}
		glints = keepG;

		// shards
		var keepS = [];
		for (i = 0; i < shards.length; i++) {
			var s = shards[i];
			s.age += dt;
			if (s.age >= s.life) {
				continue;
			}
			keepS.push(s);
			s.vx *= drag;
			s.vy = s.vy * drag + g * dt;
			s.x += s.vx * dt;
			s.y += s.vy * dt;
			s.rot += s.spin * dt;
			s.flip += s.flipV * dt;
			var q = s.age / s.life;
			var a = Math.min(1, s.age / 40) * (1 - q * q);
			if (body && inside(s.x, s.y, body)) {
				a *= 0.22; // never hide stickers: a falling shard over the cube is barely there
			}
			if (a > 0.01) {
				drawShard(ctx, s, a);
			}
		}
		shards = keepS;
		ctx.globalAlpha = 1;

		if (!shards.length && !glints.length && !rings.length && !pending.length) {
			running = false;
			return false;
		}
		return true;
	}

	function addGlint(edges, color, life, alpha, width, offset, core) {
		glints.push({ edges: edges, color: color, life: life, alpha: alpha, width: width, offset: offset, core: core, age: 0 });
		if (glints.length > MAX_GLINTS) {
			glints.splice(0, glints.length - MAX_GLINTS);
		}
	}

	// ---------- events ----------
	function burst(api, ev, sil) {
		var R = api.rand, r = api.cube().radius;
		var edges = sil.edges, fc = sil.face;
		var combo = Math.min(ev.combo || 1, 12);
		var fast = (ev.tps || 0) >= 8;
		var count = ev.batch ? 3 : ev.rotation ? 5 : Math.round((fast ? 11 : 16) * (1 + combo * 0.05) * (ev.layers && ev.layers[1] > ev.layers[0] ? 1.3 : 1));
		var total = 0, i;
		for (i = 0; i < edges.length; i++) {
			total += edges[i].len;
		}
		if (!total) {
			return;
		}
		// shards fling slightly along the turn direction (clockwise as seen from outside the face)
		var dir = (ev.amount || 1) > 0 ? 1 : -1;
		if (!fc.visible) {
			dir = -dir;
		}
		var lifeK = fast ? 0.75 : 1;
		for (var n = 0; n < count; n++) {
			var pick = R() * total, ed = edges[0];
			for (i = 0; i < edges.length; i++) {
				ed = edges[i];
				if (pick < ed.len) {
					break;
				}
				pick -= ed.len;
			}
			var u = 0.06 + R() * 0.88;
			var x = ed.a.x + (ed.b.x - ed.a.x) * u + ed.nx * 2;
			var y = ed.a.y + (ed.b.y - ed.a.y) * u + ed.ny * 2;
			var tx = -(y - fc.center.y), ty = x - fc.center.x, tl = Math.sqrt(tx * tx + ty * ty) || 1;
			var sp = r * (ev.rotation ? 0.0012 : 0.0014 + R() * 0.0016) * (1 + combo * 0.02);
			var tang = r * 0.0009 * dir * (ev.rotation ? 0.4 : 1);
			var vx = ed.nx * sp + tx / tl * tang + (R() - 0.5) * r * 0.0006;
			var vy = ed.ny * sp + ty / tl * tang + (R() - 0.5) * r * 0.0006 - r * 0.0004;
			var white = !ev.rotation && R() < 0.08 + combo * 0.015;
			var size = r * (ev.rotation ? 0.065 : 0.08 + R() * 0.08);
			makeShard(api, x, y, vx, vy, size, white ? '#ffffff' : fc.color, (380 + R() * 260) * lifeK);
		}
	}

	var lastEv = 0;
	var OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

	function onMove(api, ev) {
		var hl = computeHull(api);
		var tNow = now();
		// scrambles apply many moves in the same instant: keep those tiny
		var batch = false;
		if (ev.phase == 'end') {
			batch = tNow - lastEv < 8;
			lastEv = tNow;
		}
		var sil = silhouetteEdges(api, ev.face, hl);
		if (!sil.edges.length) {
			return;
		}
		if (api.reduced) {
			if (ev.phase == 'end') {
				addGlint(sil.edges, sil.face.color, 220, 0.9, 3, 0, true);
				ensureLoop(api);
			}
			return;
		}
		if (ev.phase == 'start') {
			// a quick white crack along the edge that is about to shatter
			if (!ev.rotation) {
				addGlint(sil.edges, 'rgba(90,110,150,0.35)', 140, 0.85, 3, api.cube().radius * 0.04, true);
				ensureLoop(api);
			}
			return;
		}
		addGlint(sil.edges, sil.face.color, ev.rotation ? 160 : 220, ev.rotation ? 0.5 : 0.9, 3, api.cube().radius * 0.08, true);
		var bev = { face: ev.face, amount: ev.amount, layers: ev.layers, rotation: ev.rotation, combo: batch ? 1 : ev.combo, tps: ev.tps, batch: batch };
		burst(api, bev, sil);
		if (ev.rotation) {
			var sil2 = silhouetteEdges(api, OPP[ev.face], hl);
			if (sil2.edges.length) {
				bev.amount = -(ev.amount || 1);
				burst(api, bev, sil2);
			}
		}
		ensureLoop(api);
	}

	function onSolve(api) {
		var hl = computeHull(api);
		var cb = api.cube(), r = cb.radius, c = cb.center, R = api.rand;
		var colors = [];
		for (var i = 0; i < 6; i++) {
			colors.push(api.face(FACES.charAt(i)).color);
		}
		if (api.reduced) {
			addGlint(hl.body.map(function(p, k) {
				var q = hl.body[(k + 1) % hl.body.length];
				return { a: p, b: q, nx: 0, ny: 0 };
			}), 'rgba(90,110,150,0.45)', 500, 0.9, 3, 0, true);
			ensureLoop(api);
			return;
		}
		function wave(n, rad, speed, phase) {
			return function() {
				rings.push({ x: c.x, y: c.y, r0: rad * 0.95, r1: rad * 1.7, life: 650, age: 0, color: 'rgba(255,255,255,0.95)' });
				for (var k = 0; k < n; k++) {
					var a = (k + phase + R() * 0.6) / n * Math.PI * 2;
					var ca = Math.cos(a), sa = Math.sin(a);
					var sp = r * speed * (0.8 + R() * 0.5);
					var swirl = r * 0.0008;
					makeShard(api, c.x + ca * rad, c.y + sa * rad, ca * sp - sa * swirl, sa * sp + ca * swirl - r * 0.0006,
						r * (0.07 + R() * 0.08), R() < 0.15 ? '#ffffff' : colors[k % 6], 1100 + R() * 700, MAX_SOLVE);
				}
			};
		}
		shards = [];
		var t = now();
		pending.push({ at: t, fn: wave(48, r * 1.2, 0.0022, 0) });
		pending.push({ at: t + 160, fn: wave(40, r * 1.3, 0.0016, 0.5) });
		pending.push({ at: t + 340, fn: wave(32, r * 1.25, 0.0011, 0.25) });
		// whole outline flashes once as it shatters
		addGlint(hl.body.map(function(p, k) {
			var q = hl.body[(k + 1) % hl.body.length];
			var dx = q.x - p.x, dy = q.y - p.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
			var nx = -dy / l, ny = dx / l;
			if (nx * ((p.x + q.x) / 2 - c.x) + ny * ((p.y + q.y) / 2 - c.y) < 0) {
				nx = -nx;
				ny = -ny;
			}
			return { a: p, b: q, nx: nx, ny: ny };
		}), 'rgba(90,110,150,0.4)', 450, 1, 4, r * 0.15, true);
		api.shake(2, 280);
		ensureLoop(api);
	}

	jlFx.register({ id: 'shards', name: 'Crystal Shards', onMove: onMove, onSolve: onSolve });
})();
// @ts-check
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
// @ts-check
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
			var now = jlFx.now();
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
			born: jlFx.now() + (opts.delay || 0)
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
		var born = jlFx.now() + 560;
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
// @ts-check
"use strict";

// Spark Burst: when a layer lands, metal-grinder sparks spray tangentially off the turning face's
// silhouette corners in the turn direction, fall with gravity and fade from white-hot to red.
(function() {
	var MAX = 200;          // live particle cap (oldest dropped first)
	var parts = [];         // {x, y, vx, vy, age, life, w}
	var flashes = [];       // {x, y, age, life, s}
	var running = false;
	var solveUntil = 0;
	var flashImg = null;
	var darkBg = null;

	// colour ramps by heat (index 0 = hottest); light backgrounds need deeper colours and normal blending
	var RAMP_DARK = ['#fffbe6', '#ffe27a', '#ffad33', '#ff6a1a', '#d23a10'];
	var RAMP_LIGHT = ['#ffe14a', '#ffb000', '#ff7a00', '#e84800', '#b02a00'];
	var RAMP_HALO = ['#ff6a00', '#f05000', '#d83a00', '#b02800', '#801800'];

	function isDark() {
		if (darkBg !== null) {
			return darkBg;
		}
		darkBg = false;
		try {
			var el = document.body;
			var c = '';
			while (el && (!c || c == 'transparent' || /rgba\(.*,\s*0\)$/.test(c))) {
				c = window.getComputedStyle(el).backgroundColor;
				el = el.parentElement;
			}
			var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(c || '');
			if (m) {
				darkBg = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) < 110;
			}
		} catch (e) {
			darkBg = false;
		}
		return darkBg;
	}

	function getFlash() {
		if (flashImg) {
			return flashImg;
		}
		var c = document.createElement('canvas');
		c.width = c.height = 64;
		var g = c.getContext('2d');
		var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
		grd.addColorStop(0, 'rgba(255,255,235,1)');
		grd.addColorStop(0.2, 'rgba(255,220,110,0.9)');
		grd.addColorStop(0.5, 'rgba(255,140,30,0.35)');
		grd.addColorStop(1, 'rgba(255,90,0,0)');
		g.fillStyle = grd;
		g.fillRect(0, 0, 64, 64);
		flashImg = c;
		return c;
	}

	// ---------- geometry ----------
	function hull(pts) {
		var p = pts.slice().sort(function(a, b) {
			return a.x - b.x || a.y - b.y;
		});
		function cr(o, a, b) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		}
		var lo = [], up = [], i;
		for (i = 0; i < p.length; i++) {
			while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) {
				lo.pop();
			}
			lo.push(p[i]);
		}
		for (i = p.length - 1; i >= 0; i--) {
			while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) {
				up.pop();
			}
			up.push(p[i]);
		}
		lo.pop();
		up.pop();
		return lo.concat(up); // counter-clockwise in math coords
	}

	function segDist(p, a, b) {
		var dx = b.x - a.x, dy = b.y - a.y;
		var l2 = dx * dx + dy * dy || 1;
		var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
		var ex = a.x + dx * t - p.x, ey = a.y + dy * t - p.y;
		return Math.sqrt(ex * ex + ey * ey);
	}

	function onHull(p, h) {
		for (var i = 0; i < h.length; i++) {
			if (segDist(p, h[i], h[(i + 1) % h.length]) < 3) {
				return true;
			}
		}
		return false;
	}

	function inside(x, y, h) {
		if (!h || h.length < 3) {
			return false;
		}
		for (var i = 0; i < h.length; i++) {
			var a = h[i], b = h[(i + 1) % h.length];
			if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) {
				return false;
			}
		}
		return true;
	}

	var curHull = null;

	function cubeHull(api) {
		var pts = [];
		var fs = 'URFDLB';
		for (var i = 0; i < 6; i++) {
			var f = api.face(fs.charAt(i));
			if (f) {
				pts = pts.concat(f.corners);
			}
		}
		return hull(pts);
	}

	// ---------- simulation ----------
	function push(p) {
		if (parts.length >= MAX) {
			parts.shift();
		}
		parts.push(p);
	}

	function emit(api, x, y, tx, ty, ox, oy, n, speed, life, spread) {
		for (var i = 0; i < n; i++) {
			var a = (api.rand() - 0.5) * spread;
			var ca = Math.cos(a), sa = Math.sin(a);
			// mostly tangential, pushed outwards from the cube a bit
			var dx = tx * 0.9 + ox * 0.35, dy = ty * 0.9 + oy * 0.35;
			var rx = dx * ca - dy * sa, ry = dx * sa + dy * ca;
			var len = Math.sqrt(rx * rx + ry * ry) || 1;
			var s = speed * (0.35 + Math.pow(api.rand(), 0.7) * 1.1);
			push({
				x: x + (api.rand() - 0.5) * 3,
				y: y + (api.rand() - 0.5) * 3,
				vx: rx / len * s,
				vy: ry / len * s - speed * 0.12,
				age: 0,
				life: life * (0.55 + api.rand() * 0.7),
				w: 0
			});
		}
	}

	function step(api) {
		return function(ctx, t, dt) {
			var R = api.cube().radius;
			var g = R * 7.5;    // gravity, px/s^2
			var maxTail = R * 0.16;
			var s = dt / 1000;
			var now = jlFx.now();
			if (now < solveUntil) {
				solveTick(api, dt);
			}
			curHull = cubeHull(api);
			var dark = isDark();
			var ramp = dark ? RAMP_DARK : RAMP_LIGHT;
			ctx.lineCap = 'round';
			if (dark) {
				ctx.globalCompositeOperation = 'lighter';
			}
			// flashes at the emission corners (tiny, < 140 ms)
			var img = getFlash();
			var keepF = [];
			for (var i = 0; i < flashes.length; i++) {
				var f = flashes[i];
				f.age += dt;
				if (f.age < f.life) {
					var k = 1 - f.age / f.life;
					var sz = f.s * (0.6 + 0.6 * (1 - k));
					ctx.globalAlpha = k * (dark ? 0.9 : 0.75);
					ctx.drawImage(img, f.x - sz / 2, f.y - sz / 2, sz, sz);
					keepF.push(f);
				}
			}
			flashes = keepF;
			// integrate + bucket by heat
			var buckets = [[], [], [], [], []];
			var keep = [];
			for (i = 0; i < parts.length; i++) {
				var p = parts[i];
				p.age += dt;
				if (p.age >= p.life) {
					continue;
				}
				p.vx *= Math.pow(0.5, s);
				p.vy = p.vy * Math.pow(0.5, s) + g * s;
				p.x += p.vx * s;
				p.y += p.vy * s;
				keep.push(p);
				var h = p.age / p.life;
				buckets[Math.min(4, (h * 5) | 0)].push(p);
			}
			parts = keep;
			// two passes per heat bucket: sparks outside the silhouette at full strength, the few over the stickers faint
			for (var pass = 0; pass < 2; pass++) {
				for (var b = 0; b < 5; b++) {
					var list = buckets[b];
					if (!list.length) {
						continue;
					}
					ctx.beginPath();
					var any = false;
					for (var j = 0; j < list.length; j++) {
						p = list[j];
						var inn = inside(p.x, p.y, curHull);
						if ((pass == 1) != inn) {
							continue;
						}
						var tail = 0.04 + 0.05 * (1 - p.age / p.life);
						var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * tail;
						if (sp > maxTail) {
							tail *= maxTail / sp;
						}
						ctx.moveTo(p.x, p.y);
						ctx.lineTo(p.x - p.vx * tail, p.y - p.vy * tail);
						any = true;
					}
					if (!any) {
						continue;
					}
					var fade = (pass ? 0.2 : 1) * (b < 4 ? 1 : 0.55);
					var lw = Math.max(1, 2.4 - b * 0.35);
					if (!dark) {
						// a soft ember-coloured halo gives the hot core contrast on light themes
						ctx.strokeStyle = RAMP_HALO[b];
						ctx.lineWidth = lw + 2.2;
						ctx.globalAlpha = fade * 0.6;
						ctx.stroke();
					}
					ctx.strokeStyle = ramp[b];
					ctx.lineWidth = lw;
					ctx.globalAlpha = fade;
					ctx.stroke();
				}
			}
			if (parts.length || flashes.length || now < solveUntil) {
				return true;
			}
			running = false;
			return false;
		};
	}

	function ensure(api) {
		if (!running) {
			running = true;
			api.add(step(api));
		}
	}

	// emit from the turning face's corners that lie on the cube silhouette
	function burst(api, fname, cw, n, speed, life, flash) {
		var f = api.face(fname);
		if (!f) {
			return;
		}
		curHull = cubeHull(api);
		var cc = api.cube().center;
		var c = f.corners;
		// corner order is clockwise seen from outside for U/L/B (mirrored tangents), counter-clockwise for R/F/D
		var stepDir = ('ULB'.indexOf(fname) != -1 ? 1 : -1) * (cw ? 1 : -1);
		var outer = [];
		for (var i = 0; i < 4; i++) {
			if (onHull(c[i], curHull)) {
				outer.push(i);
			}
		}
		if (!outer.length) {
			return;
		}
		var per = Math.max(2, Math.round(n / outer.length));
		for (var k = 0; k < outer.length; k++) {
			i = outer[k];
			var nx = c[(i + stepDir + 4) % 4], pv = c[(i - stepDir + 4) % 4];
			var tx = nx.x - pv.x, ty = nx.y - pv.y;
			var tl = Math.sqrt(tx * tx + ty * ty) || 1;
			var ox = c[i].x - cc.x, oy = c[i].y - cc.y;
			var ol = Math.sqrt(ox * ox + oy * oy) || 1;
			tx /= tl; ty /= tl; ox /= ol; oy /= ol;
			// if the turn direction points back over the stickers, kick the spray outwards instead
			var px = c[i].x + (tx * 0.9 + ox * 0.35) * 18, py = c[i].y + (ty * 0.9 + oy * 0.35) * 18;
			if (inside(px, py, curHull)) {
				tx = tx * 0.35 + ox * 0.9;
				ty = ty * 0.35 + oy * 0.9;
			}
			emit(api, c[i].x, c[i].y, tx, ty, ox, oy, per, speed, life, 1.1);
			if (flash) {
				flashes.push({ x: c[i].x, y: c[i].y, age: 0, life: 150, s: flash });
			}
		}
	}

	// reduced motion: a short static outline on the face's silhouette edges
	function outline(api, fname) {
		var f = api.face(fname);
		if (!f) {
			return;
		}
		var h = cubeHull(api);
		var c = f.corners;
		api.add(function(ctx, t) {
			if (t > 220) {
				return false;
			}
			ctx.strokeStyle = isDark() ? '#ffb040' : '#e86a00';
			ctx.lineWidth = 3;
			ctx.globalAlpha = t < 120 ? 0.9 : 0.9 * (220 - t) / 100;
			ctx.beginPath();
			for (var i = 0; i < 4; i++) {
				var a = c[i], b = c[(i + 1) % 4];
				if (f.visible || (onHull(a, h) && onHull(b, h))) {
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
				}
			}
			ctx.stroke();
		});
	}

	var solveAcc = 0;
	function solveTick(api, dt) {
		solveAcc += dt;
		var R = api.cube().radius;
		var fs = 'URFDLB';
		while (solveAcc > 45) {
			solveAcc -= 45;
			var f = fs.charAt((api.rand() * 6) | 0);
			burst(api, f, api.rand() < 0.5, 4, R * 2.8, 700, 0);
		}
	}

	jlFx.register({
		id: 'sparks',
		name: 'Spark Burst',
		onMove: function(api, ev) {
			if (ev.phase != 'end') {
				return;
			}
			var cw = ev.amount > 0;
			if (api.reduced) {
				outline(api, ev.face);
				return;
			}
			var R = api.cube().radius;
			var combo = Math.min(10, ev.combo || 1);
			var tps = Math.max(1, ev.tps || 1);
			var boost = 1 + Math.min(0.6, (combo - 1) * 0.07);
			var n, speed, life, flash;
			if (ev.rotation) {
				n = 8; speed = R * 1.4; life = 300; flash = 0;
			} else {
				var depth = Math.max(1, (ev.layers[1] || 1) - (ev.layers[0] || 1) + 1);
				n = Math.round((34 + 6 * Math.min(2, depth - 1) + Math.abs(ev.amount) * 4) * boost);
				// keep the live total under the cap at high TPS
				n = Math.min(n, Math.round(MAX / (tps * 0.45)));
				speed = R * (2.1 + 0.6 * (boost - 1)) * (Math.abs(ev.amount) > 1 ? 1.15 : 1);
				life = 420;
				flash = R * 0.4 * boost;
			}
			burst(api, ev.face, cw, n, speed, life, flash);
			ensure(api);
		},
		onSolve: function(api) {
			if (api.reduced) {
				'URFDLB'.split('').forEach(function(f) {
					outline(api, f);
				});
				return;
			}
			var R = api.cube().radius;
			var fs = 'URFDLB';
			for (var i = 0; i < 6; i++) {
				burst(api, fs.charAt(i), i % 2 == 0, 14, R * 3.2, 900, R * 0.55);
			}
			solveUntil = jlFx.now() + 1500;
			solveAcc = 0;
			api.shake(2.5, 300);
			ensure(api);
		},
		onScramble: function() {
			parts = [];
			flashes = [];
		}
	});
})();
// @ts-check
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
// @ts-check
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
// @ts-check
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
		/** @type {Array<[number, string, number]>} */
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
// @ts-check
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
// @ts-check
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
// @ts-check
"use strict";

// Layer highlight (v2): chess.com-style. The turning layer's stickers get a soft teal highlight with a glowing
// rim, and a light-blue neon streak slides along the layer in the direction it turns, then everything fades.
jlFx.register({
	id: 'v2-teal',
	name: 'Teal Glow (chess.com style)',
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
		var life = api.reduced ? 260 : (fast ? 380 : 560);

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
		if (best == 0 && vis[0]) { // the whole belt is visible
			best = N;
		}
		var arc = Math.min(0.25 * L.quarter, best / N * 0.92);
		var mid = (bestStart + best / 2) / N;
		var t0 = mid - L.dir * arc / 2;

		function path(ctx, poly) {
			ctx.beginPath();
			ctx.moveTo(poly[0].x, poly[0].y);
			for (var k = 1; k < poly.length; k++) {
				ctx.lineTo(poly[k].x, poly[k].y);
			}
			ctx.closePath();
		}

		api.add(function(ctx, t) {
			var k = t / life;
			if (k >= 1) {
				return false;
			}
			var a = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88; // quick rise, smooth fade
			a = Math.max(0, a);
			// the fill stays light and fades first so sticker colours stay readable; the rim carries the highlight
			var fillA = (whole ? 0.08 : 0.2) * Math.max(0, 1 - k / 0.6);
			// highlight
			ctx.lineJoin = 'round';
			polys.forEach(function(p) {
				path(ctx, p);
				ctx.fillStyle = 'rgba(0, 200, 210, ' + fillA.toFixed(3) + ')';
				ctx.fill();
				ctx.strokeStyle = 'rgba(0, 190, 255, ' + (0.45 * a).toFixed(3) + ')';
				ctx.lineWidth = 7;
				ctx.stroke();
				ctx.strokeStyle = 'rgba(170, 250, 255, ' + (0.95 * a).toFixed(3) + ')';
				ctx.lineWidth = 2;
				ctx.stroke();
			});
			if (api.reduced || whole || best == 0) {
				return true;
			}
			// neon trail: the head travels along the arc in the first 45% of the life, the tail follows
			var head = Math.min(1, k / 0.45);
			var tail = Math.max(0, (k - 0.25) / 0.6);
			if (tail >= head) {
				return true;
			}
			var steps = 24, pts = [];
			for (var j = 0; j <= steps; j++) {
				var u = tail + (head - tail) * j / steps;
				var p = L.belt(t0 + L.dir * arc * u);
				pts.push(p);
			}
			ctx.lineCap = 'round';
			[[16, 0.25], [8, 0.6], [3, 1]].forEach(function(w) {
				ctx.beginPath();
				ctx.moveTo(pts[0].x, pts[0].y);
				for (var m = 1; m < pts.length; m++) {
					ctx.lineTo(pts[m].x, pts[m].y);
				}
				ctx.strokeStyle = w[1] == 1 ? 'rgba(235, 255, 255, ' + a.toFixed(3) + ')' :
					'rgba(0, 170, 255, ' + (w[1] * a).toFixed(3) + ')';
				ctx.lineWidth = w[0];
				ctx.stroke();
			});
			// bright head
			var h = pts[pts.length - 1];
			var g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 14);
			g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
			g.addColorStop(0.4, 'rgba(130,235,255,' + (0.6 * a).toFixed(3) + ')');
			g.addColorStop(1, 'rgba(130,235,255,0)');
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(h.x, h.y, 14, 0, Math.PI * 2);
			ctx.fill();
			return true;
		});
	}
});
// @ts-check
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
// @ts-check
"use strict";

// Layer laser (v3): Column Glow. The whole visible part of the turning layer glows see-through blue while the
// layer turns, driven by the turn's live progress; "Column Glow hold" keeps it lit after the layer lands.
(function() {
	var live = [];

	function poly(ctx, pts) {
		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (var i = 1; i < pts.length; i++) {
			ctx.lineTo(pts[i].x, pts[i].y);
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}

	// Column Glow settings: how long it stays lit after the layer lands, and how strong it looks
	var STYLES = {
		normal: { fill: 'rgba(40, 140, 255, 0.25)', edge: 'rgba(150, 215, 255, 0.9)', width: 1.5 },
		strong: { fill: 'rgba(20, 120, 255, 0.4)', edge: 'rgba(170, 225, 255, 1)', width: 2.5 },
		bright: { fill: 'rgba(80, 200, 255, 0.55)', edge: 'rgba(230, 250, 255, 1)', width: 3, glow: 'rgba(0, 150, 255, 0.45)' }
	};
	var colCurrent = null; // with hold "next": the glow that stays until the next move

	$(function() {
		kernel.regProp('vrc', 'jlColHold', 1, 'Column Glow hold', ['0', ['0', '200', '400', 'next'],
			['turn only', '200 ms fade', '400 ms fade', 'until next move']]);
		kernel.regProp('vrc', 'jlColStrength', 1, 'Column Glow strength', ['normal', ['normal', 'strong', 'bright'],
			['normal', 'strong', 'bright']]);
	});

	function columnGlow(api, ev) {
		var L = api.layer(ev);
		var hold = kernel.getProp('jlColHold', '0');
		var style = STYLES[kernel.getProp('jlColStrength', 'normal')] || STYLES.normal;
		var fadeMs = hold == 'next' ? 0 : ~~hold;
		if (colCurrent && hold == 'next') {
			colCurrent.dead = true; // the next move replaces the glow kept from the previous one
		}
		while (live.length > 8) {
			live.shift().dead = true;
		}
		var st = { dead: false, seen: false, endAt: 0 };
		live.push(st);
		colCurrent = st;
		var t0 = performance.now(); // real time: the hold settings are exact and not stretched by "Effect duration"
		api.add(function(ctx) {
			var t = performance.now() - t0;
			if (st.dead) {
				return false;
			}
			var moving = api.progress(ev).moving;
			if (moving) {
				st.seen = true;
			} else if (!st.endAt && (st.seen || t > 400)) {
				st.endAt = t;
			}
			var a = 1;
			if (st.endAt && hold != 'next') {
				var k = fadeMs ? (t - st.endAt) / fadeMs : 1;
				if (k >= 1) {
					st.dead = true;
					return false;
				}
				a = 1 - k;
			}
			if (ev.rotation) {
				a *= 0.5;
			}
			if (api.reduced) {
				a *= 0.6;
			}
			ctx.globalAlpha = a;
			ctx.lineJoin = 'round';
			var polys = [];
			L.strips.forEach(function(s) {
				if (s.visible) {
					polys.push(s.poly);
				}
			});
			if (L.cap && L.cap.visible) {
				polys.push(L.cap.poly);
			}
			polys.forEach(function(pts) {
				ctx.fillStyle = style.fill;
				ctx.strokeStyle = style.edge;
				ctx.lineWidth = style.width;
				poly(ctx, pts);
				if (style.glow) {
					ctx.strokeStyle = style.glow;
					ctx.lineWidth = style.width * 3;
					ctx.stroke();
				}
			});
			return true;
		});
	}

	function clearColumn() {
		if (colCurrent) {
			colCurrent.dead = true;
			colCurrent = null;
		}
	}

	jlFx.register({
		id: 'v3-column',
		name: 'Column Glow',
		v3: true,
		onMove: function(api, ev) {
			if (ev.phase == 'start') {
				columnGlow(api, ev);
			}
		},
		onScramble: clearColumn,
		onSolve: clearColumn
	});
})();
