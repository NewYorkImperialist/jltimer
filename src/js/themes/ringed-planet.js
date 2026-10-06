"use strict";

// jlTimer enhanced theme: Ringed Planet - a huge banded gas giant with amber rings rising over the
// curved horizon of a cratered moon, deep teal space and a faint starfield. Generated procedurally
// from a fixed seed (same picture every load); the planet sits to the upper right so the timer is calm.
(function() {
	var W = 1600, H = 1000;
	var seed = 0x2b1a77;

	function rnd() { // mulberry32
		seed = (seed + 0x6D2B79F5) | 0;
		var t = seed;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function f(v) {
		return Math.round(v * 10) / 10;
	}

	// planet + ring geometry
	var PX = 1215, PY = 365, PR = 270, TILT = 16;
	// moon horizon: a very large circle whose top edge crosses the bottom of the frame
	var MX = 560, MY = 6870, MR = 6000;

	function horizonY(x) {
		var dx = x - MX;
		return MY - Math.sqrt(MR * MR - dx * dx);
	}

	// ---- stars ----
	var buckets = [
		[1.0, 0.35, '#cfe6ec'], [1.2, 0.6, '#ffffff'], [1.5, 0.45, '#d8f2f4'],
		[1.7, 0.75, '#ffffff'], [2.1, 0.6, '#ffe8c8'], [2.6, 0.85, '#ffffff'], [1.3, 0.5, '#bfeff0']
	];
	var paths = buckets.map(function() { return ''; });

	function calm(x, y) {
		var dx = (x - 800) / 440, dy = (y - 520) / 200;
		return dx * dx + dy * dy < 1;
	}

	for (var i = 0; i < 520; i++) {
		var x = rnd() * W, y = rnd() * H;
		var dpx = x - PX, dpy = y - PY;
		if (dpx * dpx + dpy * dpy < (PR + 8) * (PR + 8) || y > horizonY(x) - 4) {
			continue;
		}
		var r = rnd(), b;
		if (calm(x, y)) {
			if (rnd() < 0.6) {
				continue;
			}
			b = r < 0.75 ? 0 : 6;
		} else {
			b = r < 0.4 ? 0 : r < 0.6 ? 1 : r < 0.75 ? 2 : r < 0.86 ? 6 : r < 0.93 ? 3 : r < 0.975 ? 4 : 5;
		}
		paths[b] += 'M' + f(x) + ' ' + f(y) + 'h0';
	}
	var stars = buckets.map(function(bk, k) {
		return '<path d="' + paths[k] + '" stroke="' + bk[2] + '" stroke-opacity="' + bk[1] + '" stroke-width="' + bk[0] + '" stroke-linecap="round"/>';
	}).join('');
	// a few glinting bright stars with soft crosses
	var glints = '';
	[[148, 120, 1], [470, 70, 0.8], [96, 520, 0.7], [690, 196, 0.6], [1530, 760, 0.8], [372, 330, 0.55]].forEach(function(g) {
		var s = 9 * g[2];
		glints += '<g opacity="' + g[2] + '"><circle cx="' + g[0] + '" cy="' + g[1] + '" r="' + f(s * 0.9) + '" fill="url(#gl)"/>' +
			'<path d="M' + (g[0] - s * 1.6) + ' ' + g[1] + 'h' + (s * 3.2) + 'M' + g[0] + ' ' + (g[1] - s * 1.6) + 'v' + (s * 3.2) +
			'" stroke="#e8fbff" stroke-width="0.7" stroke-opacity="0.55"/><circle cx="' + g[0] + '" cy="' + g[1] + '" r="1.5" fill="#fff"/></g>';
	});

	// ---- planet bands (local frame: centred at 0,0, unrotated, ring plane is horizontal) ----
	var bandStops = [
		[0, '#1d5b63'], [0.07, '#2c7a7a'], [0.12, '#9a8a62'], [0.17, '#c49a5a'], [0.22, '#7c7a62'],
		[0.27, '#2f7f80'], [0.33, '#4d9c92'], [0.38, '#d7aa66'], [0.44, '#e7bd78'], [0.48, '#b5895a'],
		[0.53, '#d9b476'], [0.58, '#5f9a8c'], [0.63, '#2e7678'], [0.68, '#a98756'], [0.73, '#cf9f5c'],
		[0.78, '#3a7f7b'], [0.85, '#255f66'], [0.92, '#7a6a4e'], [1, '#173f48']
	];
	var bandGrad = bandStops.map(function(s) {
		return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>';
	}).join('');

	// thin wavy streaks for atmospheric texture
	var streaks = '';
	for (var k = 0; k < 26; k++) {
		var yy = -PR + 20 + rnd() * (PR * 2 - 40);
		var amp = 2 + rnd() * 5, ph = rnd() * 6.28, d = 'M' + (-PR - 10) + ' ' + f(yy);
		for (var xx = -PR + 30; xx <= PR + 30; xx += 40) {
			d += 'L' + xx + ' ' + f(yy + Math.sin(xx / 70 + ph) * amp);
		}
		var light = rnd() < 0.5;
		streaks += '<path d="' + d + '" stroke="' + (light ? '#f6dca4' : '#0f3a40') + '" stroke-opacity="' + f(0.12 + rnd() * 0.22) +
			'" stroke-width="' + f(1.5 + rnd() * 5) + '" fill="none"/>';
	}

	// ---- rings: concentric ellipses in the ring plane ----
	var RK = 0.21; // ry / rx (viewing angle); rings are drawn as circles in a y-scaled frame
	var ringDefs = [
		[352, 10, '#5d6a60', 0.3], [366, 16, '#8f8466', 0.45], [386, 22, '#c3a06a', 0.62], [404, 10, '#e2c088', 0.72],
		[424, 26, '#d4a664', 0.8], [446, 14, '#f0d29a', 0.85], [462, 12, '#b88a58', 0.7], [482, 9, '#0c1416', 0.0],
		[498, 18, '#c99c62', 0.72], [518, 16, '#e6c690', 0.66], [538, 16, '#a28a66', 0.5], [558, 6, '#7ccac4', 0.4],
		[576, 12, '#a88d68', 0.32], [598, 6, '#d7bd90', 0.22]
	];
	function rings(dark) {
		var out = ringDefs.map(function(rr) {
			return '<circle r="' + rr[0] + '" stroke="' + (dark ? '#01070a' : rr[2]) + '" stroke-width="' + rr[1] +
				'" stroke-opacity="' + (dark ? 0.72 : rr[3]) + '"/>';
		}).join('');
		return '<g fill="none">' + out + (dark ? '' : ringlets) + '</g>';
	}
	var ringlets = '';
	for (var q = 0; q < 26; q++) {
		var rx = 358 + rnd() * 236;
		ringlets += '<circle r="' + f(rx) + '" stroke="' + (rnd() < 0.55 ? '#1a1510' : '#fff1d0') +
			'" stroke-width="' + f(1 + rnd() * 2) + '" stroke-opacity="' + f(0.15 + rnd() * 0.25) + '"/>';
	}
	var ringG = rings(false), ringShadow = rings(true);

	// ---- moon craters (flattened ellipses on the horizon plain) ----
	var craters = '';
	[[170, 945, 70], [420, 905, 34], [640, 975, 90], [980, 925, 40], [1240, 975, 75], [1430, 958, 30], [820, 895, 18], [1110, 965, 22], [300, 985, 26]].forEach(function(c) {
		var cx = c[0], cy = c[1], cr = c[2], hy = horizonY(cx);
		if (cy < hy + cr * 0.2 + 6) {
			cy = hy + cr * 0.2 + 6;
		}
		var ry = cr * (0.18 + (cy - hy) / 600);
		craters += '<ellipse cx="' + cx + '" cy="' + f(cy) + '" rx="' + cr + '" ry="' + f(ry) + '" fill="#050c10" fill-opacity="0.55"/>' +
			'<path d="M' + (cx - cr) + ' ' + f(cy) + 'A' + cr + ' ' + f(ry) + ' 0 0 0 ' + (cx + cr) + ' ' + f(cy) + '" stroke="#e7b77a" stroke-opacity="0.28" stroke-width="1.6" fill="none"/>';
	});
	// rocks / dust speckles on the moon surface
	var dust = '';
	for (var m = 0; m < 160; m++) {
		var dx2 = rnd() * W, hy2 = horizonY(dx2), dy2 = hy2 + 4 + Math.pow(rnd(), 1.6) * (H - hy2);
		dust += 'M' + f(dx2) + ' ' + f(dy2) + 'h' + f(1 + rnd() * 3);
	}

	var hl = horizonY(0), hr = horizonY(W);
	// low distant ridges along the horizon (left and right, leaving the middle open)
	var ridge = '';
	[[0, 520, 16], [1080, 1600, 12]].forEach(function(rg) {
		var x0 = rg[0], d = 'M' + x0 + ' ' + f(horizonY(x0) + 2), h = 0;
		for (var x = x0; x <= rg[1]; x += 6 + rnd() * 14) {
			var e = Math.sin((x - x0) / (rg[1] - x0) * Math.PI);
			h = Math.max(0, Math.min(rg[2], h + (rnd() - 0.5) * 7)) ;
			d += 'L' + f(x) + ' ' + f(horizonY(x) - h * e);
		}
		ridge += d + 'L' + rg[1] + ' ' + f(horizonY(rg[1]) + 2) + 'Z';
	});
	var moonPath = 'M0 ' + f(hl) + 'A' + MR + ' ' + MR + ' 0 0 1 ' + W + ' ' + f(hr) + 'V' + H + 'H0Z';

	var rot = 'translate(' + PX + ' ' + PY + ') rotate(' + TILT + ')';

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<radialGradient id="sky" cx="0.74" cy="0.36" r="0.95"><stop offset="0" stop-color="#0d3a44"/><stop offset="0.35" stop-color="#082430"/><stop offset="0.7" stop-color="#04121b"/><stop offset="1" stop-color="#02070c"/></radialGradient>' +
		'<radialGradient id="neb" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#2f8d8f" stop-opacity="0.22"/><stop offset="1" stop-color="#2f8d8f" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="neb2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#c77a34" stop-opacity="0.14"/><stop offset="1" stop-color="#c77a34" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="gl" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#bff" stop-opacity="0"/></radialGradient>' +
		'<linearGradient id="bands" x1="0" y1="0" x2="0" y2="1">' + bandGrad + '</linearGradient>' +
		'<radialGradient id="shade" cx="0.32" cy="0.26" r="0.86"><stop offset="0" stop-color="#fff3d6" stop-opacity="0.2"/><stop offset="0.38" stop-color="#000" stop-opacity="0"/><stop offset="0.66" stop-color="#020a0e" stop-opacity="0.55"/><stop offset="0.84" stop-color="#01060a" stop-opacity="0.9"/><stop offset="1" stop-color="#01050a" stop-opacity="0.97"/></radialGradient>' +
		'<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0.5" stop-color="#4fd0cc" stop-opacity="0.32"/><stop offset="0.62" stop-color="#3aa9a8" stop-opacity="0.12"/><stop offset="1" stop-color="#1b5d63" stop-opacity="0"/></radialGradient>' +
		'<linearGradient id="moon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c4a4c"/><stop offset="0.12" stop-color="#1d292d"/><stop offset="1" stop-color="#070d11"/></linearGradient>' +
		'<linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5fd2cc" stop-opacity="0.15"/><stop offset="0.55" stop-color="#ffcf8a" stop-opacity="0.7"/><stop offset="1" stop-color="#ffb064" stop-opacity="0.35"/></linearGradient>' +
		'<clipPath id="pc"><circle r="' + PR + '"/></clipPath>' +
		'<clipPath id="front"><rect x="-700" y="0" width="1400" height="700"/></clipPath>' +
		'<clipPath id="rsh"><path d="M155 221L-155 -221L500 -680L810 -238Z"/></clipPath>' +
		'<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>' +
		'<filter id="gw" filterUnits="userSpaceOnUse" x="-100" y="600" width="1800" height="500"><feGaussianBlur stdDeviation="22"/></filter>' +
		'<filter id="bl8" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>' +
		'</defs>' +
		'<rect width="' + W + '" height="' + H + '" fill="url(#sky)"/>' +
		'<ellipse cx="300" cy="260" rx="520" ry="300" fill="url(#neb)"/>' +
		'<ellipse cx="560" cy="80" rx="420" ry="160" fill="url(#neb2)"/>' +
		'<ellipse cx="1500" cy="820" rx="360" ry="220" fill="url(#neb)"/>' +
		'<g>' + stars + '</g>' + glints +
		// halo + back rings + planet + front rings
		'<circle cx="' + PX + '" cy="' + PY + '" r="' + (PR * 1.5) + '" fill="url(#halo)"/>' +
		'<g transform="' + rot + ' scale(1 ' + RK + ')">' + ringG + '<g clip-path="url(#rsh)">' + ringShadow + '</g></g>' +
		'<g transform="' + rot + '">' +
		'<g clip-path="url(#pc)">' +
		'<rect x="' + (-PR) + '" y="' + (-PR) + '" width="' + (PR * 2) + '" height="' + (PR * 2) + '" fill="url(#bands)"/>' +
		'<g filter="url(#bl)">' + streaks + '</g>' +
		'<ellipse cx="-70" cy="78" rx="46" ry="16" fill="#e9c288" fill-opacity="0.5" filter="url(#bl)"/>' +
		'<ellipse cx="-70" cy="78" rx="26" ry="8" fill="#a8613a" fill-opacity="0.45" filter="url(#bl)"/>' +
		// ring shadow cast onto the planet (just above the ring plane on the far side)
		'<ellipse cy="-30" rx="' + 440 + '" ry="' + f(440 * RK) + '" fill="none" stroke="#020a0d" stroke-opacity="0.5" stroke-width="' + f(110 * RK) + '" filter="url(#bl)"/>' +
		'</g>' +
		'</g>' +
		'<circle cx="' + PX + '" cy="' + PY + '" r="' + PR + '" fill="url(#shade)"/>' +
		'<circle cx="' + PX + '" cy="' + PY + '" r="' + (PR - 1.5) + '" fill="none" stroke="#9ff3ea" stroke-opacity="0.35" stroke-width="3" filter="url(#bl)" stroke-dasharray="' + f(PR * 2.4) + ' ' + f(PR * 8) + '" transform="rotate(150 ' + PX + ' ' + PY + ')"/>' +
		'<g transform="' + rot + ' scale(1 ' + RK + ')" clip-path="url(#front)">' + ringG + '</g>' +
		// moon
		'<path d="M0 ' + f(hl) + 'A' + MR + ' ' + MR + ' 0 0 1 ' + W + ' ' + f(hr) + '" fill="none" stroke="#4bb9b4" stroke-opacity="0.3" stroke-width="70" filter="url(#gw)"/>' +
		'<path d="' + moonPath + '" fill="url(#moon)"/>' +
		'<path d="' + ridge + '" fill="#33413f"/>' +
		craters +
		'<path d="' + dust + '" stroke="#9fb2b0" stroke-opacity="0.18" stroke-width="1.2" stroke-linecap="round"/>' +
		'<path d="M0 ' + f(hl) + 'A' + MR + ' ' + MR + ' 0 0 1 ' + W + ' ' + f(hr) + '" fill="none" stroke="url(#rim)" stroke-width="2.4"/>' +
		'<path d="M0 ' + f(hl + 3) + 'A' + MR + ' ' + MR + ' 0 0 1 ' + W + ' ' + f(hr + 3) + '" fill="none" stroke="url(#rim)" stroke-width="8" stroke-opacity="0.35" filter="url(#bl8)"/>' +
		'</svg>';

	var S = 'html.jlt-ringed-planet ';
	var PANEL = 'rgba(6,22,28,0.6)';
	var css = [
		S + '.mywindow:not(.fixed){background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.45),inset 0 0 0 1px rgba(120,220,210,0.14) !important}',
		S + '.popup,' + S + '.dialog{background-color:rgba(5,20,26,0.88) !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.5),inset 0 0 0 1px rgba(120,220,210,0.16) !important}',
		S + '#leftbar{background-color:rgba(3,14,19,0.64) !important;box-shadow:inset -1px 0 0 rgba(120,220,210,0.14)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(1,6,9,0.55) !important}',
		S + '#leftbar #logo{background:linear-gradient(135deg,#c9802f,#8a5a2a 45%,#1f7f80) !important;color:#fff !important;text-shadow:0 0 0.4em rgba(0,0,0,0.35)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(110,220,210,0.15) !important}',
		S + '.mybutton.enable,' + S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(220,150,70,0.3) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(50,150,150,0.3) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.05) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(110,220,210,0.18) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.06) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(110,210,200,0.14) !important;color:#eff !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(120,220,210,0.18) !important}',
		S + '.click{color:#7fe3dc}',
		S + '.times.pb{color:#ffc266 !important}',
		S + '#lcd,' + S + '#multiphase{color:#f0fbfa;text-shadow:0 0 0.06em rgba(0,6,10,0.9),0 0 0.25em rgba(2,12,18,0.85),0 0 0.7em rgba(80,210,200,0.3)}',
		S + '#multiphase .activetimer{text-shadow:0 0 0.04em rgba(0,5,8,0.95),0 0 0.12em rgba(0,6,10,0.9),0 0 0.3em rgba(1,8,12,0.8),0 0 0.7em rgba(80,210,200,0.25)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(0,6,10,0.9),0 0 0.5em rgba(2,12,18,0.7)}',
		S + '.jltheme-tile.active{outline-color:#ffb54d}'
	].join('');

	jlThemes.register({
		id: 'ringed-planet',
		name: 'Ringed Planet',
		palette: '#eff#012#123#234#7ed#fff#a62#fc6',
		background: svg,
		css: css,
		timer: '#f96#4ec#fd5#2a8#f96'
	});
})();
