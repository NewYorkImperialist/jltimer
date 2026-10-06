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
