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
					light = 0.3 * m[1] + 0.59 * m[2] + 0.11 * m[3] > 140;
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
