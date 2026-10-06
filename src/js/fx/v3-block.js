"use strict";

// Layer laser (v3) blocks: a see-through blue block on the turning layer, shown only while the layer turns
// and driven by the turn's live progress (so it matches the turn speed exactly).
//  - Sliding Bar: one strip-sized bar slides from the strip the stickers leave to the strip they arrive at,
//    bending over the cube edge (R: front face right column -> top face right column).
//  - Column Glow: the whole visible layer glows in place for the duration of the turn.
(function() {
	var FILL = 'rgba(40, 140, 255, 0.25)';
	var EDGE = 'rgba(150, 215, 255, 0.9)';
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

	// keeps fn running while the move animates; a queued move waits up to 400 ms for its turn to start
	function whileTurning(api, ev, fn) {
		while (live.length > 8) {
			live.shift().dead = true;
		}
		var st = { dead: false, seen: false };
		live.push(st);
		api.add(function(ctx, t) {
			if (st.dead) {
				return false;
			}
			var pr = api.progress(ev);
			if (pr.moving) {
				st.seen = true;
			} else if (st.seen || t > 400) {
				st.dead = true;
				return false;
			}
			ctx.fillStyle = FILL;
			ctx.strokeStyle = EDGE;
			ctx.lineWidth = 1.5;
			ctx.lineJoin = 'round';
			if (ev.rotation) {
				ctx.globalAlpha = 0.5;
			}
			fn(ctx, pr.moving ? pr.progress : 0);
			return true;
		});
	}

	function columnGlow(api, ev) {
		var L = api.layer(ev);
		whileTurning(api, ev, function(ctx) {
			L.strips.forEach(function(s) {
				if (s.visible) {
					poly(ctx, s.poly);
				}
			});
			if (L.cap && L.cap.visible) {
				poly(ctx, L.cap.poly);
			}
		});
	}

	jlFx.register({
		id: 'v3-bar',
		name: 'Sliding Bar',
		v3: true,
		onMove: function(api, ev) {
			if (ev.phase != 'start') {
				return;
			}
			if (api.reduced) {
				return columnGlow(api, ev);
			}
			var L = api.layer(ev);
			var dir = L.dir, hop = 0.25 * L.quarter;
			// belt faces are centred at t = 0, 1/4, 2/4, 3/4; start on a visible strip whose destination is visible too
			var src = null;
			for (var k = 0; k < 4 && src === null; k++) {
				if (L.belt(k / 4).visible && L.belt(k / 4 + dir * hop).visible) {
					src = k / 4;
				}
			}
			for (k = 0; k < 4 && src === null; k++) {
				if (L.belt(k / 4).visible) {
					src = k / 4;
				}
			}
			if (src === null) {
				return;
			}
			var N = 24;
			whileTurning(api, ev, function(ctx, p) {
				var start = src - 0.125 + dir * hop * p;
				var runs = [], cur = null;
				for (var i = 0; i <= N; i++) {
					var t = start + 0.25 * i / N;
					var a = L.belt(t, 0), b = L.belt(t, 1);
					if (a.visible) {
						if (!cur) {
							cur = { a: [], b: [] };
							runs.push(cur);
						}
						cur.a.push(a);
						cur.b.push(b);
					} else {
						cur = null;
					}
				}
				runs.forEach(function(r) {
					if (r.a.length > 1) {
						poly(ctx, r.a.concat(r.b.slice().reverse()));
					}
				});
			});
		}
	});

	jlFx.register({
		id: 'v3-column',
		name: 'Column Glow',
		v3: true,
		onMove: function(api, ev) {
			if (ev.phase == 'start') {
				columnGlow(api, ev);
			}
		}
	});
})();
