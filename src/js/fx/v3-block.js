"use strict";

// Layer laser (v3): Column Glow. The whole visible part of the turning layer glows see-through blue while the
// layer turns, driven by the turn's live progress; "Column Glow hold" keeps it lit after the layer lands.
(function() {
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

	// Column Glow settings: how long it stays lit after the layer lands, and how strong it looks
	var STYLES = {
		normal: { fill: 'rgba(40, 140, 255, 0.25)', edge: 'rgba(150, 215, 255, 0.9)', width: 1.5 },
		strong: { fill: 'rgba(20, 120, 255, 0.4)', edge: 'rgba(170, 225, 255, 1)', width: 2.5 },
		bright: { fill: 'rgba(80, 200, 255, 0.55)', edge: 'rgba(230, 250, 255, 1)', width: 3, glow: 'rgba(0, 150, 255, 0.45)' }
	};
	var colCurrent = null; // with hold "next": the glow that stays until the next move

	$(function() {
		kernel.regProp('vrc', 'jlColHold', 1, 'Column Glow hold', ['0', ['0', '200', '400', 'next'],
			['turn only', '200 ms fade', '400 ms fade', 'until next move']]);
		kernel.regProp('vrc', 'jlColStrength', 1, 'Column Glow strength', ['normal', ['normal', 'strong', 'bright'],
			['normal', 'strong', 'bright']]);
	});

	function columnGlow(api, ev) {
		var L = api.layer(ev);
		var hold = kernel.getProp('jlColHold', '0');
		var style = STYLES[kernel.getProp('jlColStrength', 'normal')] || STYLES.normal;
		var fadeMs = hold == 'next' ? 0 : ~~hold;
		if (colCurrent && hold == 'next') {
			colCurrent.dead = true; // the next move replaces the glow kept from the previous one
		}
		while (live.length > 8) {
			live.shift().dead = true;
		}
		var st = { dead: false, seen: false, endAt: 0 };
		live.push(st);
		colCurrent = st;
		var t0 = performance.now(); // real time: the hold settings are exact and not stretched by "Effect duration"
		api.add(function(ctx) {
			var t = performance.now() - t0;
			if (st.dead) {
				return false;
			}
			var moving = api.progress(ev).moving;
			if (moving) {
				st.seen = true;
			} else if (!st.endAt && (st.seen || t > 400)) {
				st.endAt = t;
			}
			var a = 1;
			if (st.endAt && hold != 'next') {
				var k = fadeMs ? (t - st.endAt) / fadeMs : 1;
				if (k >= 1) {
					st.dead = true;
					return false;
				}
				a = 1 - k;
			}
			if (ev.rotation) {
				a *= 0.5;
			}
			if (api.reduced) {
				a *= 0.6;
			}
			ctx.globalAlpha = a;
			ctx.lineJoin = 'round';
			var polys = [];
			L.strips.forEach(function(s) {
				if (s.visible) {
					polys.push(s.poly);
				}
			});
			if (L.cap && L.cap.visible) {
				polys.push(L.cap.poly);
			}
			polys.forEach(function(pts) {
				ctx.fillStyle = style.fill;
				ctx.strokeStyle = style.edge;
				ctx.lineWidth = style.width;
				poly(ctx, pts);
				if (style.glow) {
					ctx.strokeStyle = style.glow;
					ctx.lineWidth = style.width * 3;
					ctx.stroke();
				}
			});
			return true;
		});
	}

	function clearColumn() {
		if (colCurrent) {
			colCurrent.dead = true;
			colCurrent = null;
		}
	}

	jlFx.register({
		id: 'v3-column',
		name: 'Column Glow',
		v3: true,
		onMove: function(api, ev) {
			if (ev.phase == 'start') {
				columnGlow(api, ev);
			}
		},
		onScramble: clearColumn,
		onSolve: clearColumn
	});
})();
