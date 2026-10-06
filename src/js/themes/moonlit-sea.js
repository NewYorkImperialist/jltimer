"use strict";

// jlTimer enhanced theme: Moonlit Sea - a full moon over a calm night sea.
// Silver moonlight path on the water, faint clouds, distant cliffs, deep navy palette.
// Everything is generated here from a fixed seed (same view every load).
(function() {
	var W = 1600, H = 1000;
	var HZ = 612; // horizon
	var MX = 1180, MY = 262, MR = 58; // moon
	var seed = 0x51ea;

	function rnd() { // mulberry32
		seed = (seed + 0x6D2B79F5) | 0;
		var t = seed;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function gauss() {
		return (rnd() + rnd() + rnd() + rnd() - 2) / 2;
	}

	function r1(v) {
		return Math.round(v * 10) / 10;
	}

	function calm(x, y) { // 0 outside, up to 1 at the centre of the area behind the timer
		var dx = (x - 800) / 520, dy = (y - 460) / 220;
		var d = dx * dx + dy * dy;
		return d < 1 ? 1 - d : 0;
	}

	// ---- stars ----
	var stars = ['', '', ''];
	for (var i = 0; i < 230; i++) {
		var sx = rnd() * W, sy = Math.pow(rnd(), 1.3) * (HZ - 40);
		var md = Math.sqrt((sx - MX) * (sx - MX) + (sy - MY) * (sy - MY));
		if (md < 190 && rnd() < 0.85 || rnd() < calm(sx, sy) * 0.8) {
			continue;
		}
		var k = rnd(), sr = k < 0.75 ? 0.7 + rnd() * 0.5 : k < 0.95 ? 1.2 + rnd() * 0.5 : 1.7 + rnd() * 0.5;
		var lvl = sy > HZ - 160 ? 2 : k < 0.75 ? 0 : 1;
		stars[lvl] += 'M' + r1(sx - sr) + ' ' + r1(sy) + 'a' + r1(sr) + ' ' + r1(sr) + ' 0 1 0 ' + r1(sr * 2) + ' 0a' + r1(sr) + ' ' + r1(sr) + ' 0 1 0 ' + r1(-sr * 2) + ' 0';
	}

	// ---- faint cloud wisps (stacked flat ellipses) ----
	var clouds = '';
	var cl = [ // cx, cy, length, thickness, opacity
		[620, 150, 520, 16, 0.16], [1240, 280, 460, 13, 0.2], [880, 300, 380, 9, 0.14],
		[220, 330, 420, 14, 0.12], [1460, 130, 360, 12, 0.12], [1060, 170, 280, 8, 0.16],
		[420, 470, 520, 10, 0.08], [1380, 440, 420, 11, 0.1], [140, 90, 300, 10, 0.09]
	];
	for (i = 0; i < cl.length; i++) {
		var c = cl[i];
		for (var j = 0; j < 6; j++) {
			var ex = c[0] + gauss() * c[2] * 0.35, ey = c[1] + gauss() * c[3] * 1.4;
			var rx = c[2] * (0.25 + rnd() * 0.3), ry = c[3] * (0.5 + rnd() * 0.7);
			clouds += '<ellipse cx="' + r1(ex) + '" cy="' + r1(ey) + '" rx="' + r1(rx) + '" ry="' + r1(ry) + '" opacity="' + r1(c[4] * (0.6 + rnd() * 0.6) * 100) / 100 + '"/>';
		}
	}

	// ---- cliffs: far left headland and a lower, hazier one on the right ----
	function ridge(x0, x1, yFn, rough, step) {
		var d = 'M' + x0 + ' ' + (HZ + 2);
		for (var x = x0; x <= x1; x += step) {
			d += 'L' + r1(x) + ' ' + r1(yFn(x) + (rnd() - 0.5) * rough);
		}
		return d + 'L' + x1 + ' ' + (HZ + 2) + 'Z';
	}
	var cliffL = ridge(-10, 560, function(x) {
		var t = x / 560;
		var y = 455 + 30 * Math.sin(x / 70) * (1 - t) + t * t * 40;
		if (t > 0.72) {
			y += Math.pow((t - 0.72) / 0.28, 1.6) * (HZ - y); // steep drop to the sea
		}
		return y;
	}, 7, 8);
	var cliffL2 = ridge(-10, 380, function(x) {
		var t = x / 380;
		var y = 505 + 18 * Math.sin(x / 45 + 1);
		if (t > 0.7) {
			y += Math.pow((t - 0.7) / 0.3, 1.5) * (HZ - y);
		}
		return y;
	}, 5, 6);
	var cliffR = ridge(1390, 1610, function(x) {
		var t = (x - 1390) / 220;
		var y = 560 - Math.min(1, t * 2.4) * 14 + 6 * Math.sin(x / 30);
		if (t < 0.12) {
			y = HZ - (HZ - y) * Math.pow(t / 0.12, 0.7);
		}
		return y;
	}, 3, 6);

	// ---- sea: ripples everywhere, bright glints in the moon path ----
	var rip = '', ripD = '', gl = ['', '', ''];
	var y = HZ + 2, row = 0;
	while (y < H + 10) {
		var depth = (y - HZ) / (H - HZ); // 0 at horizon, 1 at bottom
		var gap = 1.4 + depth * depth * 16;
		var th = r1(0.6 + depth * 2.6);
		// ambient ripples
		var nr = 2 + Math.floor(rnd() * 3);
		for (j = 0; j < nr; j++) {
			var rx0 = rnd() * W, rl = 30 + rnd() * (60 + depth * 260);
			if (rnd() < 0.5) {
				rip += 'M' + r1(rx0) + ' ' + r1(y) + 'h' + r1(rl);
			} else {
				ripD += 'M' + r1(rx0) + ' ' + r1(y) + 'h' + r1(rl);
			}
		}
		// moonlight glints, spread wider the closer they are
		var spread = 18 + depth * 230;
		var ng = Math.floor(4 + depth * 6 + rnd() * 3);
		for (j = 0; j < ng; j++) {
			var g = gauss() * 1.6;
			var gx = MX + g * spread;
			var gw = (3 + rnd() * 10) * (0.4 + depth * 2.4) * (1.2 - Math.min(1, Math.abs(g) * 0.5));
			var lv = Math.abs(g) < 0.4 ? 0 : Math.abs(g) < 0.9 ? 1 : 2;
			gl[lv] += 'M' + r1(gx - gw / 2) + ' ' + r1(y + (rnd() - 0.5) * gap * 0.4) + 'h' + r1(gw);
		}
		y += gap * (0.8 + rnd() * 0.4);
		row++;
	}

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030714"/><stop offset=".35" stop-color="#081430"/><stop offset=".58" stop-color="#132a52"/><stop offset=".612" stop-color="#1f3a68"/><stop offset=".616" stop-color="#0d1d3c"/><stop offset=".75" stop-color="#091631"/><stop offset="1" stop-color="#040a1a"/></linearGradient>' +
		'<radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="' + MX + '" cy="' + MY + '" r="430"><stop offset="0" stop-color="#cfdcff" stop-opacity=".34"/><stop offset=".18" stop-color="#9fb6ea" stop-opacity=".16"/><stop offset=".5" stop-color="#5a78b8" stop-opacity=".06"/><stop offset="1" stop-color="#5a78b8" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="hglow" gradientUnits="userSpaceOnUse" cx="' + MX + '" cy="' + HZ + '" r="620" gradientTransform="translate(0 ' + HZ + ') scale(1 .22) translate(0 -' + HZ + ')"><stop offset="0" stop-color="#8fa8de" stop-opacity=".22"/><stop offset="1" stop-color="#8fa8de" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="moon" cx=".42" cy=".4" r=".62"><stop offset="0" stop-color="#fffdf4"/><stop offset=".7" stop-color="#eef0f2"/><stop offset="1" stop-color="#cdd6e6"/></radialGradient>' +
		'<linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8d6ff" stop-opacity=".35"/><stop offset="1" stop-color="#9fb4ec" stop-opacity=".1"/></linearGradient>' +
		'<radialGradient id="calm" cx=".5" cy=".46" r=".4"><stop offset="0" stop-color="#06102a" stop-opacity=".6"/><stop offset=".6" stop-color="#06102a" stop-opacity=".3"/><stop offset="1" stop-color="#06102a" stop-opacity="0"/></radialGradient>' +
		'<linearGradient id="vig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#01030b" stop-opacity=".45"/><stop offset=".3" stop-color="#01030b" stop-opacity="0"/><stop offset=".85" stop-color="#01030b" stop-opacity="0"/><stop offset="1" stop-color="#01030b" stop-opacity=".4"/></linearGradient>' +
		'<linearGradient id="rim" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#7f9ad0" stop-opacity=".5"/><stop offset="1" stop-color="#7f9ad0" stop-opacity="0"/></linearGradient>' +
		'<filter id="bc" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="14 6"/></filter>' +
		'<filter id="bm" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>' +
		'<filter id="bp" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="26 8"/></filter>' +
		'<filter id="bg" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation=".6 .3"/></filter>' +
		'<filter id="bh" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>' +
		'<filter id="bmm" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>' +
		'<clipPath id="mc"><circle cx="' + MX + '" cy="' + MY + '" r="' + MR + '"/></clipPath>' +
		'</defs>' +
		'<rect width="1600" height="1000" fill="url(#sky)"/>' +
		'<rect width="1600" height="' + HZ + '" fill="url(#halo)"/>' +
		// stars
		'<path d="' + stars[0] + '" fill="#cfdaf5" opacity=".5"/>' +
		'<path d="' + stars[1] + '" fill="#eef3ff" opacity=".8"/>' +
		'<path d="' + stars[2] + '" fill="#b8c6e8" opacity=".3"/>' +
		// moon
		'<circle cx="' + MX + '" cy="' + MY + '" r="' + (MR + 14) + '" fill="#dfe8ff" opacity=".18" filter="url(#bm)"/>' +
		'<circle cx="' + MX + '" cy="' + MY + '" r="' + MR + '" fill="url(#moon)"/>' +
		'<g clip-path="url(#mc)" filter="url(#bmm)" fill="#9aa6c0" opacity=".2">' +
		'<ellipse cx="' + (MX - 18) + '" cy="' + (MY - 16) + '" rx="20" ry="15"/>' +
		'<ellipse cx="' + (MX + 14) + '" cy="' + (MY - 22) + '" rx="13" ry="10"/>' +
		'<ellipse cx="' + (MX + 6) + '" cy="' + (MY + 6) + '" rx="17" ry="12"/>' +
		'<ellipse cx="' + (MX - 26) + '" cy="' + (MY + 20) + '" rx="10" ry="8"/>' +
		'<ellipse cx="' + (MX + 26) + '" cy="' + (MY + 28) + '" rx="9" ry="7"/>' +
		'</g>' +
		// clouds
		'<g fill="#9fb2dc" filter="url(#bc)">' + clouds + '</g>' +
		// horizon haze
		'<rect y="' + (HZ - 110) + '" width="1600" height="220" fill="url(#hglow)"/>' +
		// cliffs
		'<path d="' + cliffR + '" fill="#13264a" filter="url(#bh)"/>' +
		'<path d="' + cliffL + '" fill="#0b1934"/>' +
		'<path d="' + cliffL + '" fill="url(#rim)" opacity=".18"/>' +
		'<path d="' + cliffL2 + '" fill="#061026"/>' +
		// sea
		'<path d="' + ripD + '" stroke="#020814" stroke-opacity=".5" stroke-width="1.6" fill="none"/>' +
		'<path d="' + rip + '" stroke="#5a78b4" stroke-opacity=".17" stroke-width="1.1" fill="none"/>' +
		'<path d="M' + (MX - 14) + ' ' + HZ + 'L' + (MX + 14) + ' ' + HZ + 'L' + (MX + 300) + ' 1000L' + (MX - 300) + ' 1000Z" fill="url(#path)" filter="url(#bp)"/>' +
		'<g fill="none" stroke-linecap="round" filter="url(#bg)">' +
		'<path d="' + gl[2] + '" stroke="#9fb3e6" stroke-opacity=".35" stroke-width="1.4"/>' +
		'<path d="' + gl[1] + '" stroke="#d7e2ff" stroke-opacity=".55" stroke-width="1.7"/>' +
		'<path d="' + gl[0] + '" stroke="#fbfcff" stroke-opacity=".8" stroke-width="2"/>' +
		'</g>' +
		'<rect y="' + (HZ - 1) + '" width="1600" height="1.5" fill="#a9bce6" opacity=".25"/>' +
		// calm zone behind the timer + vignette
		'<rect width="1600" height="1000" fill="url(#calm)"/>' +
		'<rect width="1600" height="1000" fill="url(#vig)"/>' +
		'</svg>';

	var S = 'html.jlt-moonlit-sea ';
	var PANEL = 'rgba(9,17,38,0.62)';

	var css = [
		S + '.mywindow:not(.fixed),' + S + '.popup,' + S + '.dialog{background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.45),inset 0 0 0 1px rgba(180,200,255,0.14) !important}',
		S + '#leftbar{background-color:rgba(6,12,30,0.64) !important;box-shadow:inset -1px 0 0 rgba(180,200,255,0.14)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(2,5,16,0.55) !important}',
		S + '#leftbar #logo{background:linear-gradient(160deg,#3a5c9a,#1b2f5c 60%,#0e1a38) !important;color:#fff !important;text-shadow:0 0 0.45em rgba(220,230,255,0.55)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(190,210,255,0.14) !important}',
		S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(140,170,240,0.28) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(90,125,200,0.3) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.05) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(190,210,255,0.16) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.06) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(160,185,255,0.13) !important;color:#e8eefa !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(180,200,255,0.17) !important}',
		S + '.click{color:#b4cdff}',
		S + '.times.pb{color:#ffe69a !important}',
		S + '#lcd,' + S + '#multiphase{color:#f2f5fc;text-shadow:0 0 0.06em rgba(2,5,16,0.9),0 0 0.25em rgba(3,8,24,0.85),0 0 0.7em rgba(170,195,255,0.3)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(2,5,16,0.9),0 0 0.5em rgba(3,8,24,0.7)}',
		S + '.jltheme-tile.active{outline-color:#cfe0ff}',
		'@media (max-aspect-ratio:1/1){html.jlt-moonlit-sea.jlt-on{background-position:74% center !important}}'
	].join('');

	jlThemes.register({
		id: 'moonlit-sea',
		name: 'Moonlit Sea',
		palette: '#eef#012#123#235#acf#fff#246#fe9',
		background: svg,
		css: css,
		timer: '#f99#9eb#fe9#6b9#f99'
	});
})();
