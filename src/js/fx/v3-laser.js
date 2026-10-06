"use strict";

// Layer laser (v3): a blue laser frame sits on the turning layer itself and turns with it. Every frame it
// redraws the slab's box at the cube's live rotation angle, so the rectangle moves with the pieces, then it
// flashes once when the layer lands and fades out.
(function() {
	var live = [];

	function path(ctx, poly) {
		ctx.beginPath();
		ctx.moveTo(poly[0].x, poly[0].y);
		for (var i = 1; i < poly.length; i++) {
			ctx.lineTo(poly[i].x, poly[i].y);
		}
		ctx.closePath();
	}

	function laser(id, name, opts) {
		jlFx.register({
			id: id,
			name: name,
			v3: true,
			onMove: function(api, ev) {
				if (ev.phase != 'start') {
					return;
				}
				while (live.length > 8) {
					live.shift().dead = true;
				}
				var st = { dead: false, seen: false, endAt: 0 };
				live.push(st);
				var fade = api.reduced ? 160 : (ev.tps >= 8 ? 200 : 300);
				var rot = ev.rotation;
				api.add(function(ctx, t) {
					if (st.dead) {
						return false;
					}
					var faces = api.box(ev, opts.inflate);
					if (faces.moving) {
						st.seen = true;
					} else if (!st.endAt && (st.seen || t > 400)) {
						st.endAt = t;
					}
					var a = 1, flash = 0;
					if (st.endAt) {
						var k = (t - st.endAt) / fade;
						if (k >= 1) {
							st.dead = true;
							return false;
						}
						a = 1 - k;
						flash = Math.max(0, 1 - k * 3); // short bright landing flash
					}
					if (rot) {
						a *= 0.45;
					}
					ctx.lineJoin = 'round';
					faces.forEach(function(fc) {
						if (!fc.visible || !fc.outer) {
							return;
						}
						path(ctx, fc.poly);
						if (opts.fill) {
							ctx.fillStyle = 'rgba(' + opts.rgb + ',' + (opts.fill * a * (st.endAt ? 1 - flash * 0 : 1)).toFixed(3) + ')';
							ctx.fill();
						}
						opts.strokes.forEach(function(s) {
							ctx.strokeStyle = s[0].replace('A', (s[2] * a + (s[3] || 0) * flash).toFixed(3));
							ctx.lineWidth = s[1];
							ctx.stroke();
						});
					});
					if (opts.scan && !api.reduced && !rot) {
						// a bright scan line sweeps across each visible face of the layer while it turns
						var u = ((t % 260) / 260);
						faces.forEach(function(fc) {
							if (!fc.visible || !fc.outer || !fc.side) {
								return;
							}
							var p = fc.poly;
							var x1 = p[0].x + (p[1].x - p[0].x) * u, y1 = p[0].y + (p[1].y - p[0].y) * u;
							var x2 = p[3].x + (p[2].x - p[3].x) * u, y2 = p[3].y + (p[2].y - p[3].y) * u;
							ctx.lineCap = 'round';
							[[7, 'rgba(0,120,255,' + (0.35 * a).toFixed(3) + ')'], [2.5, 'rgba(210,245,255,' + (0.95 * a).toFixed(3) + ')']].forEach(function(w) {
								ctx.beginPath();
								ctx.moveTo(x1, y1);
								ctx.lineTo(x2, y2);
								ctx.strokeStyle = w[1];
								ctx.lineWidth = w[0];
								ctx.stroke();
							});
						});
					}
					return true;
				});
			},
			onScramble: function() {
				live.forEach(function(s) {
					s.dead = true;
				});
				live = [];
			}
		});
	}

	// strokes: [colour with 'A' for alpha, width, alpha, extra alpha during the landing flash]
	laser('v3-laser', 'Blue Laser', {
		rgb: '0,140,255',
		fill: 0.12,
		inflate: 0.03,
		strokes: [
			['rgba(0,60,220,A)', 16, 0.3, 0.25],
			['rgba(0,130,255,A)', 7, 0.9, 0.1],
			['rgba(225,250,255,A)', 2.4, 1, 0]
		]
	});
	laser('v3-scan', 'Laser Scan', {
		rgb: '0,140,255',
		fill: 0.06,
		inflate: 0.03,
		scan: true,
		strokes: [
			['rgba(0,60,200,A)', 8, 0.25, 0.2],
			['rgba(0,150,255,A)', 3.5, 0.9, 0.1],
			['rgba(225,250,255,A)', 1.2, 1, 0]
		]
	});
	laser('v3-neon', 'Neon Box', {
		rgb: '0,230,255',
		fill: 0,
		inflate: 0.06,
		strokes: [
			['rgba(0,90,170,A)', 14, 0.22, 0.25],
			['rgba(0,230,255,A)', 6, 0.7, 0.2],
			['rgba(240,255,255,A)', 2, 1, 0]
		]
	});
})();
