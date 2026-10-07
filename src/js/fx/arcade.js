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
