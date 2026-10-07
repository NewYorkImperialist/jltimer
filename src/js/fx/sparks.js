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
				darkBg = (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 110;
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
