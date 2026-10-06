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
