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
				v = (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255 > 0.6;
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
