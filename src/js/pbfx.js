// @ts-check
"use strict";

// jlTimer PB celebration: when a new solve sets a new session best (single or one of the two time-list averages,
// the same bests csTimer highlights in the time list), a sakura katana swings through the timer, leaves a clean
// slash line across the screen and scatters cut sakura petals; a small "New best ao5" label shows under the time.
// Detection reads csTimer's own TimeStat for the time list (stats.getTimesStatsList()): its _bestAvg[k] lists hold
// every improvement of best k (k = 0, 1: the averages of "stat1"/"stat2", k = 2: single), each entry ending with the
// index of the first solve of that average. A new solve set a best when the last entry starts at that solve
// (single) or at solve - len + 1 (average). Only 'timestd' (stats.js push, i.e. a new solve from any timer: keyboard,
// touch, virtual cube, bluetooth, typed) triggers it; editing a penalty, deleting or importing never does.
// The overlay is a fixed full-window canvas (pointer-events: none) under dialogs. Any key, touch or pointer press,
// or the timer leaving idle, cuts it with a short CSS fade and stops all drawing at once.
var jlPbFx = execMain(function() {
	var MIN_SINGLE = 5; // a session's first solves are always "bests": no celebration until there are enough
	var DUR = 2500;
	var REDUCED_DUR = 2600;
	var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

	var canvas = null;
	var ctx = null;
	var label = null;
	var W = 0, H = 0, DPR = 1;
	var rafId = 0;
	var hideTimer = 0;
	var anim = null; // the running celebration
	var sprites = null; // pre-rendered katana and petals, for the current size

	function setting() {
		return kernel.getProp('jlPbFx', 'a');
	}

	// ---------- detection ----------
	// [{kind: 'single'|'avg', size, name, value}] of the bests the newest solve just set, most impressive first
	function newBests() {
		var mode = setting();
		if (mode == 'n' || !window.stats || !stats.getTimesStatsList) {
			return [];
		}
		var ts = stats.getTimesStatsList();
		if (!ts || !ts._bestAvg) {
			return [];
		}
		var n = ts.timesLen;
		var i = n - 1;
		var hits = [];
		var sizes = ts.avgSizes || [];
		var single = ts._bestAvg[sizes.length] || [];
		var last = single[single.length - 1];
		if (n >= MIN_SINGLE && single.length >= 2 && last && last[4] == i && last[0] > 0) {
			hits.push({ kind: 'single', size: 1, name: 'single', value: last[0] });
		}
		if (mode == 'a') {
			for (var j = 0; j < sizes.length; j++) {
				var size = Math.abs(sizes[j]);
				var arr = ts._bestAvg[j] || [];
				var top = arr[arr.length - 1];
				// a real improvement over an earlier average, and enough solves that it means something
				if (n >= 2 * size && arr.length >= 2 && arr[arr.length - 2][0] > 0 && top && top[4] == i - size + 1 && top[0] > 0) {
					hits.push({ kind: 'avg', size: size, name: (sizes[j] > 0 ? 'ao' : 'mo') + size, value: top[0] });
				}
			}
		}
		hits.sort(function(a, b) {
			return b.size - a.size;
		});
		return hits;
	}

	function onTimeStd(signal, solve) {
		var hits = !solve || !solve[0] || solve[0][0] == -1 || document.hidden ? [] : newBests();
		releaseHints(hits.length == 0);
		if (hits.length) { // after the timer has finished handling the stop (next scramble...)
			setTimeout(function() {
				play(hits[0]);
			}, 0);
		}
	}

	// csTimer scrolls "Session best single!" through the logo for the same solve: hold that hint back until the
	// solve is checked, and drop it when the celebration plays (with the celebration off it shows as usual)
	var hintPush = null;
	var heldHints = [];

	function hookHints() {
		if (!window.logohint || typeof logohint.push != 'function' || typeof LGHINT_SSBEST != 'string') {
			return;
		}
		var re = new RegExp('^' + LGHINT_SSBEST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('%s', '.*') + '$');
		hintPush = logohint.push;
		logohint.push = function(msg) {
			if (setting() != 'n' && re.test(msg)) {
				heldHints.push(msg);
				setTimeout(function() { // in case no new solve follows (the checks run right after, in this task)
					releaseHints(true);
				}, 0);
				return;
			}
			hintPush.apply(logohint, arguments);
		};
	}

	function releaseHints(show) {
		var list = heldHints;
		heldHints = [];
		for (var i = 0; show && i < list.length; i++) {
			hintPush.call(logohint, list[i]);
		}
	}

	// ---------- drawing helpers ----------
	function clamp(v, a, b) {
		return v < a ? a : v > b ? b : v;
	}

	function easeOut(x) {
		x = clamp(x, 0, 1);
		return 1 - (1 - x) * (1 - x) * (1 - x);
	}

	function newCanvas(w, h) {
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.ceil(w));
		c.height = Math.max(1, Math.ceil(h));
		return c;
	}

	// five-petal sakura petal from the app icon: base at (0, 0), notched tip at (0, -16.5)
	function petalPath(g) {
		g.beginPath();
		g.moveTo(0, 0);
		g.bezierCurveTo(-6.5, -3, -8, -11, -3.6, -16.5);
		g.lineTo(0, -14);
		g.lineTo(3.6, -16.5);
		g.bezierCurveTo(8, -11, 6.5, -3, 0, 0);
		g.closePath();
	}

	function petalFill(g, deep) {
		var gr = g.createRadialGradient(0, 0, 0, 0, 0, 17);
		gr.addColorStop(0.12, deep ? '#ee8fb0' : '#f3a6c0');
		gr.addColorStop(0.55, deep ? '#f9c9d8' : '#fcdbe5');
		gr.addColorStop(1, '#fff7fa');
		return gr;
	}

	// one petal sprite (s px tall); half: 0 whole, 1 / 2 the two halves of a petal cut lengthwise
	function petalSprite(s, deep, half) {
		var k = s / 17;
		var c = newCanvas(s * 0.62 + 4, s + 4);
		var g = c.getContext('2d');
		g.translate(c.width / 2, c.height - 2);
		g.scale(k, k);
		if (half) {
			g.beginPath();
			g.rect(half == 1 ? -10 : 0, -18, 10, 19);
			g.clip();
		}
		petalPath(g);
		g.fillStyle = petalFill(g, deep);
		g.fill();
		g.lineWidth = 0.6;
		g.strokeStyle = 'rgba(176, 62, 104, 0.32)';
		g.stroke();
		if (half) { // a crisp cut edge
			g.beginPath();
			g.moveTo(0, -0.5);
			g.lineTo(0, -14);
			g.lineWidth = 0.9;
			g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
			g.stroke();
		}
		return c;
	}

	// the katana along +x, grip at the origin, tip at x = R; drawn once per size into a sprite
	// (units of L: kashira -0.14, tsuka -0.13..0.1, tsuba 0.115, habaki 0.13..0.165, blade 0.16..0.87)
	function katanaSprite(L) {
		var pad = 0.08 * L;
		var c = newCanvas(1.03 * L + 2 * pad, 0.2 * L + 2 * pad);
		var g = c.getContext('2d');
		var ox = 0.15 * L + pad, oy = c.height / 2;
		g.translate(ox, oy);
		g.scale(L, L);
		var x0 = 0.165, x1 = 0.87, bw = 0.03, sori = 0.022;
		var spineY = function(x) { // the back (mune) line; the blade bows towards -y (edge on +y)
			var u = (x - x0) / (x1 - x0);
			return -bw / 2 - sori * u * u;
		};
		var edgeY = function(x) {
			var u = (x - x0) / (x1 - x0);
			return bw / 2 - sori * u * u - (u > 0.9 ? (u - 0.9) / 0.1 * bw * 0.95 : 0) * Math.min(1, (u - 0.9) / 0.1 + 0.2);
		};
		var N = 28;
		function bladePath() {
			g.beginPath();
			g.moveTo(x0, spineY(x0));
			for (var k = 1; k <= N; k++) {
				var x = x0 + (x1 - x0) * k / N;
				g.lineTo(x, spineY(x));
			}
			for (var k2 = N; k2 >= 0; k2--) {
				var xx = x0 + (x1 - x0) * k2 / N;
				g.lineTo(xx, Math.max(spineY(xx) + 0.0005, edgeY(xx)));
			}
			g.closePath();
		}
		// soft drop shadow so the white blade reads on the pale sakura background
		// (and a tight plum rim), so the silver separates from pink backgrounds and busy artwork
		g.save();
		g.shadowColor = 'rgba(70, 20, 45, 0.42)';
		g.shadowBlur = 0.016 * L;
		g.shadowOffsetY = 0.005 * L;
		bladePath();
		g.fillStyle = '#ffffff';
		g.fill();
		g.shadowColor = 'rgba(60, 18, 40, 0.55)';
		g.shadowBlur = 0.004 * L;
		g.shadowOffsetY = 0;
		g.fill();
		g.restore();
		// spine side (shinogi-ji) in cool silver, bounded by a soft wavy hamon
		g.save();
		bladePath();
		g.clip();
		var sg = g.createLinearGradient(0, -bw, 0, bw);
		sg.addColorStop(0, '#d9d9e6');
		sg.addColorStop(0.45, '#eeeef5');
		sg.addColorStop(1, '#ffffff');
		g.fillStyle = sg;
		g.fill();
		g.beginPath();
		for (var h = 0; h <= 60; h++) {
			var hx = x0 + (x1 - x0) * h / 60;
			var hy = spineY(hx) + bw * (0.52 + 0.09 * Math.sin(h * 0.9) + 0.05 * Math.sin(h * 2.3));
			h ? g.lineTo(hx, hy) : g.moveTo(hx, hy);
		}
		g.lineTo(x1 + 0.02, 0.1);
		g.lineTo(x0, 0.1);
		g.closePath();
		var eg = g.createLinearGradient(x0, 0, x1, 0);
		eg.addColorStop(0, '#f7f7fb');
		eg.addColorStop(0.5, '#ffffff');
		eg.addColorStop(1, '#fbfbff');
		g.fillStyle = eg;
		g.fill();
		g.lineWidth = 0.0016;
		g.strokeStyle = 'rgba(190, 190, 212, 0.9)';
		g.stroke();
		// shinogi ridge and yokote
		g.beginPath();
		for (var r = 0; r <= 30; r++) {
			var rx = x0 + (x1 - 0.06 - x0) * r / 30;
			var ry = spineY(rx) + bw * 0.3;
			r ? g.lineTo(rx, ry) : g.moveTo(rx, ry);
		}
		g.lineWidth = 0.0012;
		g.strokeStyle = 'rgba(160, 160, 186, 0.55)';
		g.stroke();
		g.beginPath();
		g.moveTo(x1 - 0.06, spineY(x1 - 0.06));
		g.lineTo(x1 - 0.052, edgeY(x1 - 0.052));
		g.stroke();
		g.restore();
		bladePath();
		g.lineWidth = 0.0024;
		g.strokeStyle = 'rgba(85, 34, 51, 0.72)';
		g.stroke();
		// habaki (gold collar)
		var gold = g.createLinearGradient(0.13, -0.03, 0.13, 0.03);
		gold.addColorStop(0, '#f6d6a4');
		gold.addColorStop(1, '#d39a62');
		g.fillStyle = gold;
		roundRect(g, 0.128, -0.026, 0.04, 0.052, 0.006);
		g.fill();
		// tsuka: plum wrap with pale-pink diamonds, dark kashira
		roundRect(g, -0.135, -0.027, 0.245, 0.054, 0.014);
		g.fillStyle = '#552233';
		g.fill();
		g.fillStyle = '#f3bfd0';
		for (var d = 0; d < 6; d++) {
			var dx = -0.105 + d * 0.037;
			g.beginPath();
			g.moveTo(dx, -0.018);
			g.lineTo(dx + 0.014, 0);
			g.lineTo(dx, 0.018);
			g.lineTo(dx - 0.014, 0);
			g.closePath();
			g.fill();
		}
		roundRect(g, -0.15, -0.03, 0.03, 0.06, 0.01);
		g.fillStyle = '#3f1828';
		g.fill();
		// tsuba: the five-petal sakura guard
		g.save();
		g.translate(0.118, 0);
		g.rotate(-0.17);
		var ts = 0.0058;
		g.scale(ts, ts);
		g.shadowColor = 'rgba(90, 30, 55, 0.3)';
		g.shadowBlur = 0.01 * L;
		for (var p = 0; p < 5; p++) {
			g.save();
			g.rotate(p * Math.PI * 2 / 5);
			petalPath(g);
			g.fillStyle = petalFill(g, true);
			g.fill();
			g.restore();
		}
		g.shadowColor = 'transparent';
		g.beginPath();
		g.arc(0, 0, 3.4, 0, Math.PI * 2);
		g.fillStyle = '#b8325f';
		g.fill();
		g.fillStyle = '#a52a55';
		for (var q = 0; q < 5; q++) {
			var qa = -Math.PI / 2 + q * Math.PI * 2 / 5;
			g.beginPath();
			g.arc(Math.cos(qa) * 6.2, Math.sin(qa) * 6.2, 1.1, 0, Math.PI * 2);
			g.fill();
		}
		g.restore();
		return { c: c, ox: ox, oy: oy };
	}

	function roundRect(g, x, y, w, h, r) {
		g.beginPath();
		g.moveTo(x + r, y);
		g.arcTo(x + w, y, x + w, y + h, r);
		g.arcTo(x + w, y + h, x, y + h, r);
		g.arcTo(x, y + h, x, y, r);
		g.arcTo(x, y, x + w, y, r);
		g.closePath();
	}

	// a big out-of-focus petal close to the camera: the petal stamped around a small circle (a cheap blur; a
	// canvas filter here made Chrome stall for a few hundred ms the first time the sprite was drawn)
	function bokehSprite(s) {
		var pet = petalSprite(s, false, 0);
		var b = Math.max(1, s * 0.06);
		var c = newCanvas(pet.width + 4 * b, pet.height + 4 * b);
		var g = c.getContext('2d');
		g.globalAlpha = 0.2;
		for (var i = 0; i < 10; i++) {
			var an = i * Math.PI * 2 / 10, rr = i % 2 ? b : b * 0.5;
			g.drawImage(pet, 2 * b + Math.cos(an) * rr, 2 * b + Math.sin(an) * rr);
		}
		return c;
	}

	function makeSprites(L, P) {
		if (sprites && sprites.L == L && sprites.P == P) {
			return sprites;
		}
		var ps = Math.round(P * DPR);
		sprites = {
			L: L,
			P: P,
			katana: reduced ? null : katanaSprite(L * DPR),
			petals: [petalSprite(ps, false, 0), petalSprite(ps, true, 0), petalSprite(Math.round(ps * 0.8), false, 0)],
			bokeh: bokehSprite(Math.round(ps * 2.6)),
			halves: [petalSprite(Math.round(ps * 2.2), true, 1), petalSprite(Math.round(ps * 2.2), true, 2)]
		};
		return sprites;
	}

	// ---------- overlay ----------
	function ensureDom() {
		if (canvas) {
			return;
		}
		canvas = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
		canvas.className = 'jlpb';
		ctx = canvas.getContext('2d');
		label = $('<div class="jlpb-label">');
		$('body').append(canvas, label);
	}

	function resize() {
		DPR = Math.min(2, window.devicePixelRatio || 1);
		W = window.innerWidth;
		H = window.innerHeight;
		canvas.width = Math.round(W * DPR);
		canvas.height = Math.round(H * DPR);
		canvas.style.width = W + 'px';
		canvas.style.height = H + 'px';
	}

	// union of the visible text boxes inside el, or null
	function textBox(el) {
		if (!el || !el.getClientRects().length) {
			return null;
		}
		var r = null;
		var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		var range = document.createRange();
		var node;
		while ((node = walk.nextNode())) {
			if (!/\S/.test(node.nodeValue)) {
				continue;
			}
			range.selectNodeContents(node);
			var q = range.getBoundingClientRect();
			if (q.width < 1 || q.height < 1) {
				continue;
			}
			r = r ? { left: Math.min(r.left, q.left), top: Math.min(r.top, q.top), right: Math.max(r.right, q.right),
				bottom: Math.max(r.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
		}
		return r;
	}

	// the timer digits on screen (center and box), or the middle of the window
	function timerBox() {
		// the digits: #lcd for the normal timer, the side timer (#multiphase) next to the virtual cube. Both boxes
		// can be much bigger than the digits, so measure their text.
		var r = textBox($('#multiphase .activetimer:visible')[0]) || textBox($('#lcd')[0]);
		if (r && r.bottom > 0 && r.top < H) {
			return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, top: r.top, bottom: r.bottom, h: r.bottom - r.top };
		}
		return { x: W / 2, y: H * 0.4, top: H * 0.4 - 30, bottom: H * 0.4 + 30, h: 60 };
	}

	function rnd(a, b) {
		return a + Math.random() * (b - a);
	}

	// timeline (ms): the katana sweeps in from off screen with a glint running up the blade, swings hard through
	// the timer (its blade leaves a faint tracer), and a beat later the cut ignites: a crisp full-width slash line,
	// a quick flash and a short dim of the page around it, petals burst out of the cut. Then the katana dissolves
	// into petals, the line thins away and the petals drift down while the title holds.
	var T = { appear: 140, swing0: 190, swing1: 335, ignite: 375, kOut0: 600, kOut1: 860 };

	// katana and petal sizes for this window: a hero katana (blade about 60 % of the window width)
	function sizes() {
		var L = clamp(Math.min(W * (W < 600 ? 0.98 : 0.86), H * 1.2, 1150), 300, 1150);
		return { L: L, P: clamp(L * 0.022, 12, 26) };
	}

	function build(hit, preview) {
		resize();
		var box = preview ? { x: W / 2, y: H * 0.42, top: H * 0.42 - 40, bottom: H * 0.42 + 40, h: 80 } : timerBox();
		var sz = sizes();
		var L = sz.L, P = sz.P;
		var R = 0.87 * L;
		var tilt = -11 * Math.PI / 180;
		// the slash line runs through the timer digits (cx, cy); the blade crosses it near the middle of the window
		var cx = box.x, cy = box.y;
		var qx = W / 2 + (cx - W / 2) * 0.35;
		var qy = cy + Math.tan(tilt) * (qx - cx);
		var CROSS = 0.42; // the blade crosses the line halfway up (the hands stay low, often just off screen)
		var dir = tilt - Math.PI / 2; // grip -> tip at the moment it crosses the line
		var px = qx - Math.cos(dir) * R * CROSS, py = qy - Math.sin(dir) * R * CROSS;
		var A0 = 95, A1 = 28; // degrees before / after the crossing: from held low and back to upright (zanshin)
		var a = {
			hit: hit,
			preview: preview,
			t0: performance.now(),
			dur: reduced ? REDUCED_DUR : DUR,
			L: L, R: R, cx: cx, cy: cy, qx: qx, qy: qy, px: px, py: py,
			a0: dir - A0 * Math.PI / 180,
			a1: dir + A1 * Math.PI / 180,
			tilt: tilt,
			// the hands travel with the swing (from low left to a little higher right)
			hand0: { x: -0.18 * R, y: 0.03 * R }, hand1: { x: 0.08 * R, y: Math.min(-0.1 * R, H - 0.14 * L - py) },
			Tpass: 0, Tig: T.ignite,
			k: clamp(L / 600, 0.7, 1.7),
			petals: [],
			box: box
		};
		var target = A0 / (A0 + A1), lo = 0, hi = 1;
		for (var it = 0; it < 24; it++) {
			var mid = (lo + hi) / 2;
			swingEase(mid) < target ? lo = mid : hi = mid;
		}
		a.Tpass = T.swing0 + (T.swing1 - T.swing0) * lo;
		makeSprites(L, P);
		var dx = Math.cos(tilt), dy = Math.sin(tilt), nx = -dy, ny = dx;
		a.sMin = -(cx + 40) / Math.max(0.3, dx);
		a.sMax = (W - cx + 40) / Math.max(0.3, dx);
		var k2 = clamp(L / 700, 0.55, 1.5);
		var phone = W < 600;
		var count = reduced ? 18 : phone ? 48 : 84;
		var sc = (qx - cx) / dx * 0.5; // the burst gathers between the digits and the middle
		for (var p = 0; p < count; p++) {
			var pt = {};
			var u0 = Math.random();
			if (reduced) { // a gentle fall around the timer
				pt.x = cx + rnd(-0.5, 0.5) * Math.min(W, 700);
				pt.y = cy - rnd(40, 170) * k2;
				pt.vx = rnd(-12, 12);
				pt.vy = rnd(18, 34);
				pt.born = rnd(0, 800);
			} else {
				// dense around the timer, the rest all along the cut
				var s = u0 < 0.55 ? sc + rnd(-0.5, 0.5) * Math.min(W * 0.8, L) : rnd(a.sMin * 0.95, a.sMax * 0.95);
				pt.x = cx + dx * s;
				pt.y = cy + dy * s;
				var side = Math.random() < 0.5 ? -1 : 1;
				// thrown out of the cut: across it on either side, and along it in the swing's direction
				var sp = rnd(90, 520) * k2;
				var along = rnd(-40, 420) * k2;
				pt.vx = nx * side * sp + dx * along;
				pt.vy = ny * side * sp + dy * along - rnd(0, 60) * k2;
				var f = (s - a.sMin) / (a.sMax - a.sMin);
				pt.born = T.ignite + f * 24 + rnd(0, 30);
			}
			pt.rot = rnd(0, Math.PI * 2);
			pt.spin = rnd(-4, 4);
			pt.flip = rnd(0, Math.PI * 2);
			pt.flipW = rnd(2.5, 7);
			pt.sway = rnd(0, Math.PI * 2);
			pt.swayW = rnd(1.4, 3);
			pt.swayA = rnd(10, 28) * k2;
			// one in seven is "close to the camera": bigger, softly blurred
			pt.near = !reduced && p % 7 == 6;
			pt.spr = pt.near ? sprites.bokeh : sprites.petals[p % 3];
			pt.life = reduced ? rnd(1700, 2200) : rnd(1500, 2050);
			a.petals.push(pt);
		}
		if (!reduced) {
			// large petals cut clean in two right on the line, the halves pushed apart and turning away
			var nh = phone ? 4 : 6;
			for (var hc = 0; hc < nh; hc++) {
				var hs = sc + (hc / (nh - 1) - 0.5) * Math.min(W * 0.75, 0.9 * L) + rnd(-0.04, 0.04) * L;
				var hx = cx + dx * hs, hy = cy + dy * hs;
				var hf = (hs - a.sMin) / (a.sMax - a.sMin);
				var hrot = tilt + Math.PI / 2 + rnd(-0.12, 0.12); // petal axis along the cut
				var hsp = rnd(70, 120) * k2;
				for (var side2 = 1; side2 <= 2; side2++) {
					var sg = side2 == 1 ? -1 : 1;
					a.petals.push({
						x: hx, y: hy,
						vx: nx * sg * hsp + dx * 50 * k2, vy: ny * sg * hsp + dy * 50 * k2,
						born: T.ignite + hf * 24,
						rot: hrot, spin: sg * rnd(1, 2),
						flip: 0, flipW: 0, sway: rnd(0, 6), swayW: 2, swayA: 6 * k2,
						spr: sprites.halves[side2 - 1], half: true,
						life: rnd(1700, 2100)
					});
				}
			}
			// the katana dissolves into a few petals as it fades
			for (var dp = 0; dp < (phone ? 8 : 12); dp++) {
				var dd = R * rnd(0.22, 0.98);
				var ka1 = a.a1 + 0.05;
				a.petals.push({
					x: px + a.hand1.x + Math.cos(ka1) * dd, y: py + a.hand1.y + Math.sin(ka1) * dd,
					vx: rnd(-20, 40) * k2, vy: rnd(-40, 5) * k2,
					born: T.kOut0 + rnd(0, T.kOut1 - T.kOut0 - 60),
					rot: rnd(0, 6.3), spin: rnd(-2, 2), flip: rnd(0, 6.3), flipW: rnd(2, 5),
					sway: rnd(0, 6.3), swayW: rnd(1.5, 2.5), swayA: rnd(8, 16) * k2,
					spr: sprites.petals[dp % 3], life: rnd(1100, 1400)
				});
			}
		}
		a.k2 = k2;
		return a;
	}

	// the swing: accelerates hard, passes the timer at full speed, brakes quickly
	function swingEase(x) {
		x = clamp(x, 0, 1);
		return x < 0.55 ? 0.55 * Math.pow(x / 0.55, 3) : 1 - 0.45 * Math.pow(1 - (x - 0.55) / 0.45, 2.2);
	}

	// progress of the swing 0..1 (with a little wind-up before and follow-through after)
	function swingU(t) {
		return t < T.swing0 ? 0 : t < T.swing1 ? swingEase((t - T.swing0) / (T.swing1 - T.swing0)) : 1;
	}

	function swingAngle(a, t) {
		if (t < T.swing0) { // wind-up: draws back while it slides in
			return a.a0 + 0.08 - 0.2 * easeOut(t / T.swing0);
		}
		if (t < T.swing1) {
			return a.a0 - 0.12 + (a.a1 - a.a0 + 0.12) * swingU(t);
		}
		return a.a1 + 0.05 * easeOut((t - T.swing1) / 500); // follow-through settles
	}

	// the hands: slide in from further down-left during the wind-up, then travel with the swing
	function grip(a, t) {
		var u = swingU(t);
		var inU = t < T.swing0 ? 1 - easeOut(t / T.swing0) : 0;
		return {
			x: a.px + a.hand0.x + (a.hand1.x - a.hand0.x) * u - inU * 0.1 * a.R,
			y: a.py + a.hand0.y + (a.hand1.y - a.hand0.y) * u + inU * 0.05 * a.R
		};
	}

	function drawKatana(g, a, t, alpha) {
		var sp = sprites.katana;
		var h = grip(a, t);
		g.save();
		g.globalAlpha = alpha;
		g.translate(h.x, h.y);
		g.rotate(swingAngle(a, t));
		g.drawImage(sp.c, -sp.ox / DPR, -sp.oy / DPR, sp.c.width / DPR, sp.c.height / DPR);
		g.restore();
	}

	// the crescent of air the blade sweeps, bright at the blade and fading behind it
	function drawSmear(g, a, t) {
		if (t < T.swing0 || t > T.swing1 + 110) {
			return;
		}
		var tl = Math.min(t, T.swing1);
		var lead = swingAngle(a, tl), trail = Math.max(lead - 1.1, swingAngle(a, Math.max(T.swing0, t - 65)));
		if (t > T.swing1) { // the trail catches up with the blade once it stops
			trail = trail + (lead - trail) * easeOut((t - T.swing1) / 110);
		}
		if (lead - trail < 0.01) {
			return;
		}
		var h = grip(a, tl), R = a.R;
		var gr = g.createRadialGradient(h.x, h.y, R * 0.25, h.x, h.y, R * 1.04);
		gr.addColorStop(0, 'rgba(255, 200, 220, 0)');
		gr.addColorStop(0.45, 'rgba(250, 186, 210, 0.2)');
		gr.addColorStop(0.85, 'rgba(255, 240, 246, 0.75)');
		gr.addColorStop(0.95, 'rgba(255, 255, 255, 1)');
		gr.addColorStop(0.985, 'rgba(255, 190, 214, 0.6)');
		gr.addColorStop(1, 'rgba(255, 180, 210, 0)');
		g.fillStyle = gr;
		var N = 12;
		for (var k = 0; k < N; k++) {
			var b0 = trail + (lead - trail) * k / N, b1 = trail + (lead - trail) * (k + 1) / N + 0.004;
			g.globalAlpha = Math.pow((k + 1) / N, 1.5);
			g.beginPath();
			g.arc(h.x, h.y, R * 1.04, b0, b1);
			g.arc(h.x, h.y, R * 0.25, b1, b0, true);
			g.closePath();
			g.fill();
		}
		g.globalAlpha = 1;
	}

	// a tapered lens along the slash line, from s0 to s1, half-width wMax, shifted off across the line
	function lens(g, a, s0, s1, wMax, off) {
		var dx = Math.cos(a.tilt), dy = Math.sin(a.tilt), nx = -dy, ny = dx;
		g.beginPath();
		var N = 32;
		for (var i = 0; i <= N; i++) {
			var u = i / N, s = s0 + (s1 - s0) * u;
			var w = wMax * Math.pow(Math.sin(Math.PI * u), 0.45);
			var x = a.cx + dx * s + nx * (w + off), y = a.cy + dy * s + ny * (w + off);
			i ? g.lineTo(x, y) : g.moveTo(x, y);
		}
		for (var j = N; j >= 0; j--) {
			var u2 = j / N, s2 = s0 + (s1 - s0) * u2;
			var w2 = wMax * Math.pow(Math.sin(Math.PI * u2), 0.45);
			g.lineTo(a.cx + dx * s2 - nx * (w2 - off), a.cy + dy * s2 - ny * (w2 - off));
		}
		g.closePath();
	}

	function drawSlash(g, a, t) {
		var k = a.k;
		// tracer: a hairline left by the blade as it passes, before the cut lights up
		var tt = t - (a.Tpass - 30);
		if (tt > 0 && t < a.Tig + 30) {
			var rv = easeOut(tt / 60);
			g.globalAlpha = t < a.Tig ? 0.6 : 0.6 * (1 - (t - a.Tig) / 30);
			g.fillStyle = '#ffffff';
			lens(g, a, a.sMin * 0.8, a.sMin * 0.8 + (a.sMax - a.sMin) * 0.8 * rv, 0.9 * k, 0);
			g.fill();
		}
		var ti = t - a.Tig;
		if (ti < 0) {
			return;
		}
		var hold = a.Tig + 420, end = hold + 520;
		var life = t < hold ? 1 : 1 - clamp((t - hold) / (end - hold), 0, 1);
		if (life <= 0) {
			return;
		}
		// full width at once (two frames)
		var s0 = a.sMin, s1 = a.sMin + (a.sMax - a.sMin) * easeOut(ti / 30);
		var punch = 1 + 1.1 * Math.max(0, 1 - ti / 140); // brighter and wider the instant it ignites
		var thin = (0.25 + 0.75 * life) * punch;
		g.globalAlpha = 0.3 * life;
		g.fillStyle = '#ff7eae';
		lens(g, a, s0, s1, 15 * k * thin, 0);
		g.fill();
		g.globalAlpha = 0.6 * life;
		g.fillStyle = '#ffd3e2';
		lens(g, a, s0, s1, 6 * k * thin, 0);
		g.fill();
		g.globalAlpha = Math.min(1, 1.6 * life);
		g.fillStyle = '#ffffff';
		lens(g, a, s0, s1, 2.3 * k * thin + 0.5, 0);
		g.fill();
		// the air parting: two hairlines easing away from the cut
		var part = clamp(ti / 800, 0, 1);
		var off = easeOut(part) * 22 * k;
		g.globalAlpha = 0.55 * (1 - part) * life;
		lens(g, a, s0, s1, 0.8 * k, off);
		g.fill();
		lens(g, a, s0, s1, 0.8 * k, -off);
		g.fill();
		g.globalAlpha = 1;
	}

	// the moment of the cut: the page dims around the timer for a moment (vignette), a quick screen-wide flash,
	// and a soft bloom on the digits
	function drawFlash(g, a, t) {
		var ti = t - a.Tig;
		if (ti < 0 || ti > 300) {
			return;
		}
		var big = Math.max(W, H);
		var dim = ti < 40 ? ti / 40 : 1 - easeOut((ti - 40) / 260);
		if (dim > 0.01) {
			var vg = g.createRadialGradient(a.cx, a.cy, big * 0.12, a.cx, a.cy, big * 0.8);
			vg.addColorStop(0, 'rgba(36, 10, 24, 0)');
			vg.addColorStop(0.5, 'rgba(36, 10, 24, ' + (0.22 * dim) + ')');
			vg.addColorStop(1, 'rgba(36, 10, 24, ' + (0.42 * dim) + ')');
			g.fillStyle = vg;
			g.fillRect(0, 0, W, H);
		}
		if (ti < 90) {
			var fl = 1 - ti / 90;
			g.fillStyle = 'rgba(255, 248, 251, ' + (0.38 * fl * fl) + ')';
			g.fillRect(0, 0, W, H);
		}
		var f = ti / 300;
		var r = a.L * (0.25 + 0.3 * easeOut(f));
		var e = 1 - easeOut(f);
		var gr = g.createRadialGradient(a.cx, a.cy, 0, a.cx, a.cy, r);
		gr.addColorStop(0, 'rgba(255, 255, 255, ' + (0.55 * e) + ')');
		gr.addColorStop(0.4, 'rgba(255, 226, 238, ' + (0.22 * e) + ')');
		gr.addColorStop(1, 'rgba(255, 220, 234, 0)');
		g.fillStyle = gr;
		g.fillRect(a.cx - r, a.cy - r, 2 * r, 2 * r);
	}

	// four-point star glint
	function star(g, x, y, s, rot) {
		if (s <= 0.2) {
			return;
		}
		g.save();
		g.translate(x, y);
		g.rotate(rot);
		g.fillStyle = '#ffffff';
		g.beginPath();
		g.moveTo(0, -s);
		g.quadraticCurveTo(0, 0, s * 0.8, 0);
		g.quadraticCurveTo(0, 0, 0, s);
		g.quadraticCurveTo(0, 0, -s * 0.8, 0);
		g.quadraticCurveTo(0, 0, 0, -s);
		g.fill();
		g.globalAlpha *= 0.5;
		g.beginPath();
		g.arc(0, 0, s * 0.22, 0, Math.PI * 2);
		g.fill();
		g.restore();
	}

	function drawGlints(g, a, t) {
		var f = (t - 30) / 170; // running up the blade as it slides in
		if (f > 0 && f < 1) {
			var h = grip(a, t), ang = swingAngle(a, t), d = a.R * (0.2 + 0.78 * easeOut(f));
			g.globalAlpha = Math.sin(Math.PI * f);
			star(g, h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d, a.L * 0.035 * Math.sin(Math.PI * f), f);
		}
		var f2 = (t - T.swing1 - 30) / 380; // at the tip once it stops
		if (f2 > 0 && f2 < 1) {
			var h2 = grip(a, t), ang2 = swingAngle(a, t);
			g.globalAlpha = 1;
			star(g, h2.x + Math.cos(ang2) * a.R * 0.98, h2.y + Math.sin(ang2) * a.R * 0.98, a.L * 0.045 * Math.sin(Math.PI * f2), 0.4 + f2 * 0.6);
		}
		g.globalAlpha = 1;
	}

	function drawPetals(g, a, t, dt) {
		var drag = Math.exp(-3.1 * dt);
		var grav = (reduced ? 6 : 95) * a.k2;
		for (var i = 0; i < a.petals.length; i++) {
			var p = a.petals[i];
			var age = t - p.born;
			if (age < 0 || age > p.life) {
				continue;
			}
			// a kick out of the cut (the speed builds over the first 60 ms), air drag, then floating down
			var kick = reduced ? 1 : Math.min(1, 0.35 + age / 60);
			if (!reduced) {
				p.vx *= drag;
				p.vy = p.vy * drag + grav * dt * (p.half ? 0.6 : 1);
			}
			var flutter = Math.min(1, age / 450); // sway grows as the petal slows
			p.x += (p.vx * kick + Math.cos(p.sway + age / 1000 * p.swayW) * p.swayA * flutter) * dt;
			p.y += p.vy * kick * dt;
			p.rot += p.spin * dt;
			var alpha = Math.min(1, age / 50) * (1 - clamp((age - p.life + 650) / 650, 0, 1));
			var fl = p.half ? 1 : Math.cos(p.flip + age / 1000 * p.flipW);
			var spr = p.spr;
			var w = spr.width / DPR, h = spr.height / DPR;
			g.save();
			g.globalAlpha = alpha * (p.near ? 0.8 : 1);
			g.translate(p.x, p.y);
			g.rotate(p.rot);
			g.scale(1, 0.2 + 0.8 * Math.abs(fl));
			g.drawImage(spr, -w / 2, -h * 0.55, w, h);
			g.restore();
		}
		g.globalAlpha = 1;
	}

	function frame(now) {
		var a = anim;
		if (!a) {
			return;
		}
		var t = now - a.t0;
		var dt = clamp((now - (a.last || now)) / 1000, 0, 0.05);
		a.last = now;
		if (t > a.dur) {
			stop(false);
			return;
		}
		var g = ctx;
		g.setTransform(DPR, 0, 0, DPR, 0, 0);
		g.clearRect(0, 0, W, H);
		if (!reduced) {
			drawFlash(g, a, t);
			drawSmear(g, a, t);
			drawSlash(g, a, t);
			if (t < T.kOut1) {
				var ka = t < T.appear ? easeOut(t / T.appear) : 1 - clamp((t - T.kOut0) / (T.kOut1 - T.kOut0), 0, 1);
				if (t > T.swing0 && t < T.swing1 + 40) { // motion blur: faint copies just behind the blade
					for (var gh = 4; gh >= 1; gh--) {
						drawKatana(g, a, t - gh * 3, ka * 0.22 * (1 - gh / 5));
					}
				}
				drawKatana(g, a, t, ka);
			}
			drawGlints(g, a, t);
		}
		drawPetals(g, a, t, dt);
		rafId = requestAnimationFrame(frame);
	}

	// the title: a small spaced "NEW BEST" over "ao5  12.47", revealed (letter-spacing closing in) just after the
	// cut; above the digits when there is room, else under the digits and their averages
	function showLabel(a) {
		var hit = a.hit;
		var val = hit.kind == 'single' ? kernel.pretty(hit.value) : kernel.pround(hit.value);
		label.empty().append(
			$('<div class="jlpb-k">').text('New best'),
			$('<div class="jlpb-t">').append($('<span class="jlpb-n">').text(hit.name), $('<span class="jlpb-v">').text(val))
		);
		var col = kernel.getProp('col-pbs') || '#dd1166';
		var rgb = (/^#([0-9a-f]{6})$/i.exec($.nearColor(col, 0, true)) || [0, 'dd1166'])[1];
		var luma = (0.3 * parseInt(rgb.slice(0, 2), 16) + 0.59 * parseInt(rgb.slice(2, 4), 16) + 0.11 * parseInt(rgb.slice(4), 16)) / 255;
		// a soft halo in the opposite tone keeps it readable on any theme
		var halo = luma > 0.55 ? '0 0 14px rgba(0, 0, 0, 0.75), 0 0 3px rgba(0, 0, 0, 0.6)' :
			'0 0 14px rgba(255, 255, 255, 0.95), 0 0 3px rgba(255, 255, 255, 0.95), 0 0 1px rgba(255, 255, 255, 1)';
		var fs = Math.round(clamp(Math.min(W * 0.028, H * 0.05), 24, 40));
		label.removeClass('jlpb-in jlpb-out').css({ color: col, textShadow: halo, transition: 'none', opacity: '', fontSize: fs + 'px',
			left: a.box.x + 'px', top: '0px', display: 'block', zIndex: a.preview ? 131 : '' });
		var lr = label[0].getBoundingClientRect(); // (also starts the transitions from the reset state)
		var gap = Math.max(6, a.box.h * 0.08);
		var top = a.box.top - lr.height - gap;
		var scr = $('#scrambleDiv:visible')[0];
		var sr = scr && scr.getBoundingClientRect();
		if (top < 4 || sr && sr.height > 0 && top < sr.bottom && top + lr.height > sr.top) {
			var below = a.box.bottom;
			var avg = $('#avgstr:visible')[0];
			var ar = avg && avg.getBoundingClientRect();
			if (ar && ar.height > 0 && ar.top < a.box.bottom + 80 && ar.right > a.box.x - 100 && ar.left < a.box.x + 100) {
				below = Math.max(below, ar.bottom);
			}
			top = Math.min(below + gap, H - lr.height - 8);
		}
		var w = lr.width + fs; // room for the wider letter-spacing at the start of the reveal
		label.css({ left: clamp(a.box.x, w / 2 + 8, Math.max(w / 2 + 8, W - w / 2 - 8)) + 'px', top: top + 'px' });
		var delay = reduced ? 0 : Math.round(a.Tig + 40);
		label[0].style.setProperty('--jlpb-d', delay + 'ms');
		label.css('transition', '').addClass('jlpb-in');
		clearTimeout(a.labelTimer);
		a.labelTimer = setTimeout(function() {
			label.removeClass('jlpb-in').addClass('jlpb-out');
		}, delay + 1500);
	}

	function play(hit, preview) {
		ensureDom();
		stop(true);
		clearTimeout(hideTimer);
		anim = build(hit, !!preview);
		canvas.style.transition = 'none';
		canvas.style.opacity = '1';
		canvas.style.display = 'block';
		canvas.style.zIndex = preview ? '130' : '';
		label.removeClass('jlpb-out');
		showLabel(anim);
		window.addEventListener('keydown', onPress, true);
		window.addEventListener('pointerdown', onPress, true);
		window.addEventListener('touchstart', onPress, { capture: true, passive: true });
		rafId = requestAnimationFrame(frame);
	}

	// end the celebration; cut = the user is starting the next solve: fade out fast and stop drawing now
	function stop(cut) {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
		window.removeEventListener('keydown', onPress, true);
		window.removeEventListener('pointerdown', onPress, true);
		window.removeEventListener('touchstart', onPress, true);
		if (!anim || !canvas) {
			return;
		}
		clearTimeout(anim.labelTimer);
		var ms = cut ? 120 : 0;
		anim = null;
		canvas.style.transition = 'opacity ' + ms + 'ms linear';
		canvas.style.opacity = '0';
		if (cut) {
			label.css({ transition: 'opacity 120ms linear', opacity: 0 });
		} else { // the natural end: let the title finish its own fade
			label.removeClass('jlpb-in').addClass('jlpb-out');
		}
		hideTimer = setTimeout(function() {
			if (!anim) {
				canvas.style.display = 'none';
				label.css({ display: 'none', opacity: '', transition: '' }).removeClass('jlpb-in jlpb-out');
			}
		}, cut ? 140 : 420);
	}

	function onPress(e) {
		if (!anim || e.repeat || performance.now() - anim.t0 < 120) {
			return;
		}
		if (e.type == 'keydown' && /^(Shift|Control|Alt|Meta|CapsLock)$/.test(e.key)) {
			return;
		}
		stop(true);
	}

	function preview() {
		var mode = setting();
		play(mode == 's' || mode == 'n' ? { kind: 'single', size: 1, name: 'single', value: 9870 } :
			{ kind: 'avg', size: 5, name: 'ao5', value: 11230 }, true);
	}

	$(function() {
		// no preview in the UI: the first one should be a surprise (?debug=1 adds a preview link for testing)
		kernel.regProp('ui', 'jlPbFx', 1, 'PB celebration' + ($.urlParam('debug') ? ' (<span class="click jlpb-prev">preview</span>)' : ''),
			['a', ['n', 's', 'a'], ['Off', 'Single only', 'Single + averages']]);
		kernel.regListener('jlpb', 'timestd', onTimeStd);
		hookHints();
		kernel.regListener('jlpb', 'timerStatus', function(signal, status) {
			if (anim && !anim.preview && status != -1 && status != 0) {
				stop(true);
			}
		});
		$(document).on('click', '.jlpb-prev', function(e) {
			e.preventDefault();
			e.stopPropagation();
			preview();
		});
	});

	return {
		play: play,
		preview: preview,
		newBests: newBests,
		stop: stop,
		active: function() {
			return !!anim;
		}
	};
});
