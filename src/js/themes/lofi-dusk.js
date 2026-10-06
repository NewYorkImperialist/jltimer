"use strict";

// jlTimer enhanced theme: Lo-fi Dusk - a cozy lo-fi wallpaper.
// Purple-to-peach dusk sky, soft moon, wispy clouds, a low layered city skyline with a few
// warm lit windows, rooftop water tower and antennas, sagging power lines with resting birds,
// and a faint film grain. Everything is generated here from a fixed seed (same view every load).
(function() {
	var W = 1600;
	var seed = 0x10f1d5c;

	function rnd() { // mulberry32
		seed = (seed + 0x6D2B79F5) | 0;
		var t = seed;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function r1(v) {
		return Math.round(v * 10) / 10;
	}

	// ---- stars (upper sky only, sparse, fading towards the horizon) ----
	var stars = '', starsB = '';
	for (var i = 0; i < 70; i++) {
		var sx = rnd() * W, sy = Math.pow(rnd(), 1.6) * 380;
		var sr = 0.6 + rnd() * 1.1;
		var c = '<circle cx="' + r1(sx) + '" cy="' + r1(sy) + '" r="' + r1(sr) + '" opacity="' + r1(0.25 + rnd() * 0.55 * (1 - sy / 420)) + '"/>';
		if (rnd() < 0.12) {
			starsB += c;
		} else {
			stars += c;
		}
	}

	// ---- skyline layers ----
	// each layer: path of blocky buildings; heights lower in the middle to keep the timer area calm
	function layer(base, minH, maxH, minW, maxW, midDip, deco) {
		var d = '', x = -30, tops = [];
		while (x < W + 30) {
			var bw = minW + rnd() * (maxW - minW);
			var mid = 1 - Math.min(1, Math.abs(x + bw / 2 - 800) / 700);
			var h = minH + rnd() * (maxH - minH) - mid * midDip;
			var top = base - h;
			d += 'M' + r1(x) + ' ' + r1(top) + 'h' + r1(bw) + 'V1000H' + r1(x) + 'Z';
			if (deco && rnd() < 0.3) { // small rooftop box / step
				var px = x + bw * (0.15 + rnd() * 0.5), pw = bw * (0.2 + rnd() * 0.25), ph = 6 + rnd() * 12;
				d += 'M' + r1(px) + ' ' + r1(top - ph) + 'h' + r1(pw) + 'v' + r1(ph) + 'h' + r1(-pw) + 'Z';
			}
			tops.push([x, bw, top]);
			x += bw - 1;
		}
		return {d: d, tops: tops};
	}

	var far = layer(800, 110, 230, 40, 90, 70, false);
	var midL = layer(860, 90, 200, 55, 120, 60, true);
	var near = layer(940, 70, 170, 70, 150, 50, true);

	// windows: mostly dark, a few lit (warm), on mid and near layers
	var winWarm = '', winSoft = '', winDim = '', glow = '';
	function windows(tops, pW, pH, prob, dimProb) {
		for (var k = 0; k < tops.length; k++) {
			var bx = tops[k][0], bw = tops[k][1], bt = tops[k][2];
			var cols = Math.floor((bw - 12) / pW), rows = Math.floor((1000 - bt - 14) / pH);
			var ox = bx + (bw - cols * pW) / 2;
			for (var a = 0; a < cols; a++) {
				for (var b = 0; b < rows; b++) {
					var r = rnd();
					var wx = ox + a * pW + 2, wy = bt + 12 + b * pH;
					var rect = 'M' + r1(wx) + ' ' + r1(wy) + 'h' + r1(pW - 6) + 'v' + r1(pH - 8) + 'h' + r1(6 - pW) + 'Z';
					if (r < prob) {
						if (rnd() < 0.7) {
							winWarm += rect;
							if (rnd() < 0.5) {
								glow += '<circle cx="' + r1(wx + pW / 2 - 3) + '" cy="' + r1(wy + pH / 2 - 4) + '" r="' + r1(10 + rnd() * 8) + '"/>';
							}
						} else {
							winSoft += rect;
						}
					} else if (r < prob + dimProb) {
						winDim += rect;
					}
				}
			}
		}
	}
	windows(midL.tops, 14, 20, 0.035, 0.12);
	windows(near.tops, 18, 24, 0.06, 0.16);

	// ---- rooftop props on the near layer: antennas, water tower, AC units ----
	var props = '';
	for (var k = 1; k < near.tops.length - 1; k++) {
		var t = near.tops[k], cx = t[0] + t[1] * (0.25 + rnd() * 0.5);
		var q = rnd();
		if (q < 0.22) { // antenna
			var ah = 30 + rnd() * 40;
			props += '<path d="M' + r1(cx) + ' ' + r1(t[2]) + 'v' + r1(-ah) + 'M' + r1(cx - 9) + ' ' + r1(t[2] - ah * 0.7) + 'h18M' + r1(cx - 6) + ' ' + r1(t[2] - ah * 0.85) + 'h12" stroke="#1d1530" stroke-width="2" fill="none"/>';
		} else if (q < 0.4) { // AC unit
			props += '<rect x="' + r1(cx - 10) + '" y="' + r1(t[2] - 10) + '" width="20" height="10" fill="#1d1530"/>';
		}
	}
	// water tower on a near building left of centre
	var wt = near.tops[Math.max(1, Math.floor(near.tops.length * 0.2))];
	var wx0 = wt[0] + wt[1] * 0.5, wy0 = wt[2];
	props += '<g fill="#1d1530" stroke="#1d1530">' +
		'<path d="M' + r1(wx0 - 20) + ' ' + r1(wy0) + 'l6 -42M' + r1(wx0 + 20) + ' ' + r1(wy0) + 'l-6 -42M' + r1(wx0 - 17) + ' ' + r1(wy0 - 18) + 'h34M' + r1(wx0 - 14) + ' ' + r1(wy0 - 34) + 'l28 0" stroke-width="3" fill="none"/>' +
		'<path d="M' + r1(wx0 - 24) + ' ' + r1(wy0 - 42) + 'v-44h48v44Z" stroke="none"/>' +
		'<path d="M' + r1(wx0 - 28) + ' ' + r1(wy0 - 86) + 'L' + r1(wx0) + ' ' + r1(wy0 - 106) + 'L' + r1(wx0 + 28) + ' ' + r1(wy0 - 86) + 'Z" stroke="none"/>' +
		'</g>';

	// ---- power lines: two poles, sagging wires below the timer area, birds ----
	function pole(x, top, h, s) {
		return '<g stroke="#140e22" fill="none" stroke-linecap="round">' +
			'<path d="M' + x + ' ' + top + 'V' + (top + h) + '" stroke-width="' + 9 * s + '"/>' +
			'<path d="M' + (x - 60 * s) + ' ' + (top + 18 * s) + 'h' + 120 * s + 'M' + (x - 44 * s) + ' ' + (top + 48 * s) + 'h' + 88 * s + '" stroke-width="' + 6 * s + '"/>' +
			'<path d="M' + (x - 30 * s) + ' ' + (top + 18 * s) + 'l30 ' + 26 * s + 'l30 ' + -26 * s + '" stroke-width="' + 3 * s + '"/>' +
			'</g>' +
			'<g fill="#140e22">' +
			'<rect x="' + (x - 56 * s) + '" y="' + (top + 10 * s) + '" width="' + 6 * s + '" height="' + 8 * s + '"/>' +
			'<rect x="' + (x + 50 * s) + '" y="' + (top + 10 * s) + '" width="' + 6 * s + '" height="' + 8 * s + '"/>' +
			'<rect x="' + (x - 3 * s) + '" y="' + (top + 10 * s) + '" width="' + 6 * s + '" height="' + 8 * s + '"/>' +
			'<rect x="' + (x + 18 * s) + '" y="' + (top + 66 * s) + '" width="' + 22 * s + '" height="' + 30 * s + '" rx="' + 5 * s + '"/>' +
			'</g>';
	}
	var pL = 150, pR = 1355, tL = 300, tR = 340;
	var wires = '';
	var offs = [[-56, 10, 600], [0, 10, 625], [53, 10, 610], [-41, 40, 640], [41, 40, 655]];
	for (var w = 0; w < offs.length; w++) {
		var xa = pL + offs[w][0], ya = tL + offs[w][1], xb = pR + offs[w][0] * 0.9, yb = tR + offs[w][1] * 0.9;
		var low = offs[w][2];
		var cyq = 2 * low - (ya + yb) / 2;
		wires += 'M' + xa + ' ' + ya + 'Q' + ((xa + xb) / 2) + ' ' + r1(cyq) + ' ' + xb + ' ' + yb;
	}
	// wires running off the left edge and right edge
	wires += 'M' + (pL - 56) + ' ' + (tL + 10) + 'Q40 ' + (tL + 90) + ' -20 ' + (tL + 70);
	wires += 'M' + (pL + 53) + ' ' + (tL + 10) + 'Q60 ' + (tL + 120) + ' -20 ' + (tL + 110);
	wires += 'M' + (pR + 48) + ' ' + (tR + 10) + 'Q1500 ' + (tR + 20) + ' 1620 ' + (tR - 30);
	wires += 'M' + (pR - 50) + ' ' + (tR + 10) + 'Q1480 ' + (tR + 40) + ' 1620 ' + (tR - 10);

	// birds on the top wire (quadratic point evaluation)
	function wireY(xa, ya, xb, yb, low, x) {
		var cyq = 2 * low - (ya + yb) / 2;
		var tt = (x - xa) / (xb - xa);
		return (1 - tt) * (1 - tt) * ya + 2 * (1 - tt) * tt * cyq + tt * tt * yb;
	}
	var birds = '';
	var bxs = [1040, 1068, 1106, 410];
	for (var bI = 0; bI < bxs.length; bI++) {
		var bx = bxs[bI], by = wireY(pL - 56, tL + 10, pR - 50.4, tR + 9, 600, bx);
		var f = bI % 2 ? -1 : 1;
		birds += '<g transform="translate(' + r1(bx) + ' ' + r1(by) + ') scale(' + f + ' 1)">' +
			'<ellipse cx="0" cy="-8" rx="7" ry="6.5"/><circle cx="5" cy="-15" r="4"/>' +
			'<path d="M8 -16l4 1.5l-4 1.2Z"/><path d="M-5 -6l-9 3l2 -5Z"/></g>';
	}

	// ---- clouds: soft long wisps ----
	function wisp(x, y, w, h, col, op) {
		return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + w + '" ry="' + h + '" fill="' + col + '" opacity="' + op + '"/>';
	}
	var clouds =
		wisp(260, 250, 260, 16, '#f5b8a8', 0.22) + wisp(380, 268, 200, 10, '#ffd0b0', 0.2) +
		wisp(1320, 430, 280, 14, '#f7b7a2', 0.22) + wisp(1180, 452, 220, 9, '#ffd2b4', 0.2) +
		wisp(520, 520, 300, 12, '#ffc3a6', 0.18) + wisp(1050, 560, 320, 13, '#ffcfae', 0.2) +
		wisp(160, 600, 260, 10, '#ffd7b8', 0.2) + wisp(1500, 610, 220, 10, '#ffd7b8', 0.18) +
		wisp(820, 160, 340, 10, '#c79bc7', 0.14);

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
		'<stop offset="0" stop-color="#1f1a3e"/><stop offset=".22" stop-color="#3a2b5c"/>' +
		'<stop offset=".44" stop-color="#6a4677"/><stop offset=".6" stop-color="#a6637f"/>' +
		'<stop offset=".72" stop-color="#d8858a"/><stop offset=".82" stop-color="#f2ad8f"/>' +
		'<stop offset="1" stop-color="#f6c49c"/></linearGradient>' +
		'<radialGradient id="sun" cx=".42" cy=".86" r=".55"><stop offset="0" stop-color="#ffd9a8" stop-opacity=".55"/><stop offset=".5" stop-color="#ffb08c" stop-opacity=".18"/><stop offset="1" stop-color="#ffb08c" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="moonG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff1df" stop-opacity=".42"/><stop offset=".35" stop-color="#f7d2d6" stop-opacity=".12"/><stop offset="1" stop-color="#f7d2d6" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="calm" cx=".5" cy=".47" r=".4"><stop offset="0" stop-color="#2a1d45" stop-opacity=".42"/><stop offset=".65" stop-color="#2a1d45" stop-opacity=".18"/><stop offset="1" stop-color="#2a1d45" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="calmR" cx=".93" cy=".47" r=".16"><stop offset="0" stop-color="#2a1d45" stop-opacity=".35"/><stop offset="1" stop-color="#2a1d45" stop-opacity="0"/></radialGradient><radialGradient id="moonB" cx=".4" cy=".38" r=".7"><stop offset="0" stop-color="#fff3e6"/><stop offset=".7" stop-color="#f8ddd2"/><stop offset="1" stop-color="#ecc6c4"/></radialGradient><linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a890" stop-opacity="0"/><stop offset="1" stop-color="#f0a890" stop-opacity=".5"/></linearGradient>' +
		'<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1f3f"/><stop offset="1" stop-color="#1a1229"/></linearGradient>' +
		'<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>' +
		'<filter id="bc" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="9 5"/></filter>' +
		'<filter id="bf"><feGaussianBlur stdDeviation="1.4"/></filter>' +
		'<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="7" stitchTiles="stitch"/>' +
		'<feColorMatrix values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .5  0 0 0 .09 0"/></filter>' +
		'</defs>' +
		'<rect width="1600" height="1000" fill="url(#sky)"/>' +
		'<rect width="1600" height="1000" fill="url(#sun)"/>' +
		'<g fill="#fff4ea">' + stars + '</g>' +
		'<g fill="#fff4ea" filter="url(#bf)">' + starsB + '</g>' +
		// moon
		'<circle cx="1170" cy="335" r="210" fill="url(#moonG)"/>' +
		'<circle cx="1170" cy="335" r="54" fill="url(#moonB)"/>' +
		'<g fill="#e7c9c4" opacity=".55"><circle cx="1153" cy="320" r="9"/><circle cx="1183" cy="356" r="6"/><circle cx="1145" cy="355" r="4.5"/><circle cx="1195" cy="312" r="5"/></g>' +
		// clouds
		'<g filter="url(#bc)">' + clouds + '</g>' +
		'<rect width="1600" height="1000" fill="url(#calm)"/><rect width="1600" height="1000" fill="url(#calmR)"/>' +
		// skyline
		'<path d="' + far.d + '" fill="#8a5a7e" opacity=".75"/>' +
		'<rect y="560" width="1600" height="440" fill="url(#haze)" opacity=".55"/>' +
		'<path d="' + midL.d + '" fill="#4f3460"/>' +
		'<g fill="#ffb877" opacity=".35" filter="url(#bl)">' + glow + '</g>' +
		'<path d="' + near.d + '" fill="#2a1d3d"/>' +
		props +
		'<path d="' + winDim + '" fill="#3b2b52" opacity=".9"/>' +
		'<path d="' + winSoft + '" fill="#f4c6c0" opacity=".75"/>' +
		'<path d="' + winWarm + '" fill="#ffc985"/>' +
		'<rect y="940" width="1600" height="60" fill="url(#ground)"/>' +
		// power lines
		'<path d="' + wires + '" stroke="#1a1228" stroke-width="2.2" fill="none" opacity=".92"/>' +
		pole(pL, tL, 760, 1) + pole(pR, tR, 720, 0.92) +
		'<g fill="#1a1228">' + birds + '</g>' +
		// film grain
		'<rect width="1600" height="1000" filter="url(#grain)"/>' +
		'</svg>';

	var S = 'html.jlt-lofi-dusk ';
	var PANEL = 'rgba(40,26,60,0.6)';

	var css = [
		S + '.mywindow:not(.fixed),' + S + '.popup,' + S + '.dialog{background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(20,10,35,0.4),inset 0 0 0 1px rgba(255,210,200,0.14) !important}',
		S + '#leftbar{background-color:rgba(34,22,52,0.62) !important;box-shadow:inset -1px 0 0 rgba(255,210,200,0.14)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(24,14,38,0.5) !important}',
		S + '#leftbar #logo{background:linear-gradient(160deg,#4a3470,#a6637f 55%,#f2ad8f) !important;color:#fff !important;text-shadow:0 1px 0.3em rgba(60,30,70,0.6)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(255,190,160,0.16) !important}',
		S + '.mybutton.enable,' + S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(242,160,140,0.3) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(170,110,190,0.3) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.05) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(255,190,160,0.18) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.07) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(255,200,190,0.14) !important;color:#f7eaf0 !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(255,210,200,0.18) !important}',
		S + '.click{color:#ffc8a8}',
		S + '.times.pb{color:#ffbf86 !important}',
		S + '#lcd,' + S + '#multiphase,' + S + '#multiphase .activetimer{color:#fff6f0;text-shadow:0 0 0.05em rgba(30,16,46,0.95),0 0.03em 0.2em rgba(36,20,56,0.85),0 0 0.6em rgba(40,22,62,0.55)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(30,16,46,0.9),0 0 0.5em rgba(36,20,56,0.7)}',
		S + '.jltheme-tile.active{outline-color:#f2ad8f}'
	].join('');

	jlThemes.register({
		id: 'lofi-dusk',
		name: 'Lo-fi Dusk',
		palette: '#fef#435#324#546#fca#fff#a67#fb8',
		background: svg,
		css: css,
		timer: '#f9a#9e9#fe9#8b9#f9a'
	});
})();
