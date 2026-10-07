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
