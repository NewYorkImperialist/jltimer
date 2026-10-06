"use strict";

// jlTimer enhanced theme: Rainy Night - a rain-streaked window over a blurred night city.
// Out-of-focus skyline with lit windows, amber and blue bokeh, drops and drip trails on the glass.
// Everything is generated here from a fixed seed (same view every load).
(function() {
	var W = 1600, H = 1000;
	var seed = 0x7a1d5;

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

	function calm(x, y) { // 0 outside, up to 1 at the centre of the area behind the timer
		var dx = (x - 800) / 520, dy = (y - 470) / 230;
		var d = dx * dx + dy * dy;
		return d < 1 ? 1 - d : 0;
	}

	// ---- blurred skyline: buildings with lit windows ----
	var bld = '', win = {a: '', b: '', c: ''};
	var x = -20;
	while (x < W + 20) {
		var bw = 50 + rnd() * 110;
		var mid = Math.abs(x + bw / 2 - 800) / 800; // shorter buildings in the middle
		var top = 470 + rnd() * 200 + (1 - mid) * 120;
		if (rnd() < 0.18) {
			top -= 140 + rnd() * 120;
		}
		bld += 'M' + r1(x) + ' ' + r1(top) + 'h' + r1(bw) + 'V1000H' + r1(x) + 'Z';
		// windows
		var cols = Math.floor(bw / 16), rows = Math.floor((1000 - top) / 22);
		for (var i = 0; i < cols; i++) {
			for (var j = 0; j < rows; j++) {
				if (rnd() < 0.26) {
					var wx = x + 7 + i * 16, wy = top + 10 + j * 22;
					var k = rnd();
					var key = k < 0.62 ? 'a' : k < 0.88 ? 'b' : 'c';
					win[key] += 'M' + Math.round(wx) + ' ' + Math.round(wy) + 'h7v10h-7z';
				}
			}
		}
		x += bw + rnd() * 6;
	}

	// ---- bokeh discs ----
	var bokehCols = ['#ffb347', '#ffcf7a', '#ff8a3d', '#6fb6ff', '#8fd0ff', '#4a7dff', '#ff5a5a', '#ffe6b8'];
	var bokeh = [{}, {}, {}]; // layer -> colour -> circles
	function disc(cx, cy, r, col, op, layer) {
		var L = bokeh[layer];
		L[col] = (L[col] || '') + '<circle cx="' + Math.round(cx) + '" cy="' + Math.round(cy) + '" r="' + Math.round(r) + '" opacity="' + Math.min(0.99, op * 1.6).toFixed(2).slice(1) + '"/>';
	}
	function bokehLayer(layer, sw) { // the ring is drawn brighter than the disc, like a real out-of-focus highlight
		var out = '', L = bokeh[layer];
		for (var col in L) {
			out += '<g fill="' + col + '" stroke="' + col + '" fill-opacity=".62" stroke-width="' + sw + '">' + L[col] + '</g>';
		}
		return out;
	}
	for (var n = 0; n < 170; n++) {
		var bx = rnd() * W;
		var by = 640 + Math.pow(rnd(), 0.8) * 380;
		var up = rnd() < 0.3;
		if (up) { // a few faint far-off lights higher up
			by = 140 + rnd() * 500;
		}
		var c = calm(bx, by);
		if (rnd() < c * 1.3) {
			continue;
		}
		var big = rnd();
		var br = big < 0.6 ? 8 + rnd() * 18 : big < 0.9 ? 24 + rnd() * 30 : 55 + rnd() * 40;
		var ci = rnd();
		var col = ci < 0.42 ? bokehCols[Math.floor(rnd() * 3)] : ci < 0.82 ? bokehCols[3 + Math.floor(rnd() * 3)] : bokehCols[6 + Math.floor(rnd() * 2)];
		var op = (br > 50 ? 0.1 : br > 24 ? 0.18 : 0.3) + rnd() * 0.18;
		disc(bx, by, br, col, op * (1 - c * 0.6) * (up ? 0.45 : 1), br > 50 ? 2 : br > 24 ? 1 : 0);
	}
	// street level: traffic lights band (red tail lights + warm head lights)
	for (n = 0; n < 46; n++) {
		var tx = rnd() * W, ty = 850 + rnd() * 70;
		disc(tx, ty, 6 + rnd() * 14, rnd() < 0.5 ? '#ff4b3e' : '#ffd08a', 0.35 + rnd() * 0.25, 0);
	}

	// ---- falling rain (beyond the glass) ----
	var rain = '';
	for (n = 0; n < 150; n++) {
		var rx = rnd() * (W + 200) - 100, ry = rnd() * H, rl = 30 + rnd() * 70;
		if (rnd() < calm(rx, ry) * 1.4) {
			continue;
		}
		rain += 'M' + Math.round(rx) + ' ' + Math.round(ry) + 'l' + Math.round(-rl * 0.12) + ' ' + Math.round(rl);
	}

	// ---- drops on the glass ----
	// each drop: dark refracting body, a light lower crescent and a tiny specular highlight
	var DR = [1.8, 2.7, 3.8, 5.5, 7.5], dropBody = ['', '', '', '', ''], dropLit = '', dropSpec = '';
	function drop(dx, dy, dr) {
		var bi = 0;
		while (bi < 4 && dr > (DR[bi] + DR[bi + 1]) / 2) {
			bi++;
		}
		dr = DR[bi];
		dx = Math.round(dx);
		dy = Math.round(dy);
		dropBody[bi] += 'M' + dx + ' ' + dy + 'h0';
		dropLit += 'M' + r1(dx - dr * 0.72) + ' ' + r1(dy + dr * 0.3) + 'q' + r1(dr * 0.72) + ' ' + r1(dr * 0.95) + ' ' + r1(dr * 1.44) + ' 0';
		dropSpec += 'M' + Math.round(dx - dr * 0.35) + ' ' + Math.round(dy - dr * 0.45) + 'h0';
	}
	for (n = 0; n < 175; n++) {
		var px = rnd() * W, py = rnd() * H;
		var cc = calm(px, py);
		if (rnd() < cc * 0.85) {
			continue;
		}
		var pr = rnd() < 0.8 ? 1.6 + rnd() * 3 : 4.5 + rnd() * 5;
		drop(px, py, pr * (1 - cc * 0.5));
	}

	// ---- drip trails: wiggly vertical runs ending in a fat drop ----
	var trails = ['', '', ''], TW = [1.8, 2.6, 3.5];
	for (n = 0; n < 26; n++) {
		var sx = 30 + rnd() * (W - 60);
		if (Math.abs(sx - 800) < 330 && rnd() < 0.75) {
			sx = sx < 800 ? sx - 330 : sx + 330;
		}
		var sy = rnd() * 500 - 80, len = 160 + rnd() * 420;
		var d = 'M' + Math.round(sx) + ' ' + Math.round(sy), yy = sy, xx = sx;
		while (yy < sy + len) {
			var step = 18 + rnd() * 30;
			var nx = xx + (rnd() - 0.5) * 7;
			d += 'Q' + Math.round(xx + (rnd() - 0.5) * 6) + ' ' + Math.round(yy + step / 2) + ' ' + r1(nx) + ' ' + Math.round(yy + step);
			xx = nx;
			yy += step;
		}
		var ti = Math.floor(rnd() * 3);
		trails[ti] += d;
		drop(xx, yy + 3, TW[ti] * 1.7 + 1.5);
	}

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
		'<stop offset="0" stop-color="#070b1c"/><stop offset=".45" stop-color="#121a36"/>' +
		'<stop offset=".72" stop-color="#2a2440"/><stop offset="1" stop-color="#1a1428"/></linearGradient>' +
		'<radialGradient id="glowA" cx=".22" cy=".78" r=".45"><stop offset="0" stop-color="#ff9c45" stop-opacity=".38"/><stop offset="1" stop-color="#ff9c45" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="glowB" cx=".8" cy=".7" r=".45"><stop offset="0" stop-color="#3d7bff" stop-opacity=".34"/><stop offset="1" stop-color="#3d7bff" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="calm" cx=".5" cy=".47" r=".42"><stop offset="0" stop-color="#0b1022" stop-opacity=".72"/><stop offset=".6" stop-color="#0b1022" stop-opacity=".38"/><stop offset="1" stop-color="#0b1022" stop-opacity="0"/></radialGradient>' +
		'<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb4e0" stop-opacity=".07"/><stop offset=".6" stop-color="#9fb4e0" stop-opacity="0"/><stop offset="1" stop-color="#d9b48a" stop-opacity=".08"/></linearGradient>' +
		'<filter id="city" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="7"/></filter>' +
		'<filter id="b0" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>' +
		'<filter id="b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter>' +
		'<filter id="b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>' +
		'<path id="t0" d="' + trails[0] + '"/><path id="t1" d="' + trails[1] + '"/><path id="t2" d="' + trails[2] + '"/>' +
		dropBody.map(function(d, i) { return '<path id="d' + i + '" d="' + d + '"/>'; }).join('') +
		'<filter id="rn"><feGaussianBlur stdDeviation=".8"/></filter>' +
		'</defs>' +
		'<rect width="1600" height="1000" fill="url(#sky)"/>' +
		'<rect width="1600" height="1000" fill="url(#glowA)"/>' +
		'<rect width="1600" height="1000" fill="url(#glowB)"/>' +
		// skyline
		'<g filter="url(#city)">' +
		'<path d="' + bld + '" fill="#0a0e1e" opacity=".88"/>' +
		'<path d="' + win.a + '" fill="#ffb85c" opacity=".55"/>' +
		'<path d="' + win.b + '" fill="#8cc4ff" opacity=".5"/>' +
		'<path d="' + win.c + '" fill="#fff0d0" opacity=".6"/>' +
		'<rect y="800" width="1600" height="200" fill="#120e1c" opacity=".55"/>' +
		'</g>' +
		// wet street reflections
		'<g filter="url(#b2)" opacity=".5">' +
		'<rect x="140" y="880" width="260" height="120" fill="#ff9a4a" opacity=".35"/>' +
		'<rect x="1150" y="890" width="300" height="110" fill="#4f8dff" opacity=".35"/>' +
		'</g>' +
		'<g filter="url(#b2)">' + bokehLayer(2, 5) + '</g>' +
		'<g filter="url(#b1)">' + bokehLayer(1, 2.5) + '</g>' +
		'<g filter="url(#b0)">' + bokehLayer(0, 1.4) + '</g>' +
		'<path d="' + rain + '" stroke="#b8c8ee" stroke-opacity=".18" stroke-width="1.2" stroke-linecap="round" filter="url(#rn)"/>' +
		// condensation haze on the glass + calm zone behind the timer
		'<rect width="1600" height="1000" fill="url(#fog)"/>' +
		'<rect width="1600" height="1000" fill="url(#calm)"/>' +
		// drips and drops on the glass
		'<g fill="none" stroke-linecap="round">' +
		'<g stroke="#0a0f22" stroke-opacity=".45"><use href="#t0" stroke-width="1.8"/><use href="#t1" stroke-width="2.6"/><use href="#t2" stroke-width="3.5"/></g>' +
		'<g stroke="#d8e4ff" stroke-opacity=".3"><use href="#t0" stroke-width=".6"/><use href="#t1" stroke-width=".9"/><use href="#t2" stroke-width="1.2"/></g>' +
		'</g>' +
		'<g fill="none" stroke-linecap="round">' + DR.map(function(r, i) {
			return '<use href="#d' + i + '" stroke="#c9d6f5" stroke-opacity=".3" stroke-width="' + r1(r * 2 + 1.4) + '"/>' +
				'<use href="#d' + i + '" stroke="#1a2548" stroke-opacity=".5" stroke-width="' + r1(r * 2) + '"/>';
		}).join('') + '</g>' +
		'<path d="' + dropLit + '" fill="none" stroke="#ffd59a" stroke-opacity=".45" stroke-width="1" stroke-linecap="round"/>' +
		'<path d="' + dropSpec + '" stroke="#fff" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round"/>' +
		'</svg>';

	var S = 'html.jlt-rainy-night ';
	var PANEL = 'rgba(12,16,34,0.62)';

	var css = [
		S + '.mywindow:not(.fixed),' + S + '.popup,' + S + '.dialog{background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.45),inset 0 0 0 1px rgba(170,195,255,0.13) !important}',
		S + '#leftbar{background-color:rgba(8,11,26,0.64) !important;box-shadow:inset -1px 0 0 rgba(170,195,255,0.13)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(3,5,14,0.55) !important}',
		S + '#leftbar #logo{background:linear-gradient(135deg,#d7792a,#7a4a6a 50%,#2b5fbf) !important;color:#fff !important;text-shadow:0 0 0.4em rgba(255,220,170,0.4)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(255,190,120,0.15) !important}',
		S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(255,160,70,0.26) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(80,130,240,0.26) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.05) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(255,190,120,0.17) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.06) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(150,180,255,0.13) !important;color:#e8ecf8 !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(170,195,255,0.17) !important}',
		S + '.click{color:#ffc27a}',
		S + '.times.pb{color:#ffb35c !important}',
		S + '#lcd,' + S + '#multiphase{color:#f3f1ec;text-shadow:0 0 0.06em rgba(2,4,14,0.9),0 0 0.25em rgba(4,6,20,0.85),0 0 0.7em rgba(255,170,90,0.28)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(2,4,14,0.9),0 0 0.5em rgba(4,6,20,0.7)}',
		S + '.jltheme-tile.active{outline-color:#ffad5c}'
	].join('');

	jlThemes.register({
		id: 'rainy-night',
		name: 'Rainy Night',
		palette: '#eee#012#123#235#fc7#fff#c73#fb5',
		background: svg,
		css: css,
		timer: '#f86#7d9#fd6#4a8#f86'
	});
})();
