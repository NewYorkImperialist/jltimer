"use strict";

// jlTimer enhanced theme: Fireflies - a summer forest clearing at night: layered tree lines in
// mist, tall framing trees, a meadow of tall grass and glowing yellow-green fireflies.
// Trees, grass and fireflies are generated here from a fixed seed (same scene every load).
(function() {
	var W = 1600, H = 1000;
	var seed = 0x0f11e5;

	function rnd() { // mulberry32
		seed = (seed + 0x6D2B79F5) | 0;
		var t = seed;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function rr(a, b) {
		return a + rnd() * (b - a);
	}

	function n(v) {
		return Math.round(v);
	}

	// one conifer as relative path segments: drooping branch tiers narrowing to the tip
	function conifer(x, base, h, w, detail) {
		var tiers = Math.max(4, Math.round(h / detail)), th = h / (tiers + 0.5), k, tw, y, px = n(x - w * 0.08), py = n(base),
			pts = [], back = [], d = '';
		for (k = 0; k < tiers; k++) {
			y = base - k * th;
			tw = w * Math.pow(1 - k / (tiers + 0.3), 0.9);
			pts.push([x - tw * rr(0.75, 1.15), y + th * rr(0.05, 0.3)], [x - tw * 0.22, y - th * 0.8]);
			back.unshift([x + tw * 0.22, y - th * 0.8], [x + tw * rr(0.75, 1.15), y + th * rr(0.05, 0.3)]);
		}
		pts.push([x + rr(-2, 2), base - h]);
		pts = pts.concat(back);
		pts.push([x + w * 0.08, base]);
		pts.forEach(function(p) {
			var ax = n(p[0]), ay = n(p[1]);
			d += 'l' + (ax - px) + ' ' + (ay - py);
			px = ax;
			py = ay;
		});
		return d;
	}

	// a horizontal band of conifers closed at the bottom of the picture
	function treeline(base, hMin, hMax, gap, wMul, detail) {
		var d = 'M-20 ' + H + 'V' + base, x = -10, h, b;
		while (x < W + 30) {
			h = rr(hMin, hMax);
			if (x > 560 && x < 1040) {
				h *= 0.72;
			}
			b = base + n(rr(-6, 6));
			d += 'L' + n(x - h * wMul * 0.08) + ' ' + b + conifer(x, b, h, h * wMul * rr(0.8, 1.1), detail);
			x += gap * rr(0.6, 1.3);
		}
		return d + 'L' + (W + 20) + ' ' + base + 'V' + H + 'Z';
	}

	// tall framing tree with a trunk
	function bigPine(x, h, w) {
		var b = n(H - h * 0.1);
		return 'M' + n(x - w * 0.05) + ' ' + H + 'V' + b + 'L' + n(x - w * 0.08) + ' ' + b + conifer(x, b, h * 0.9, w, 24) +
			'L' + n(x + w * 0.05) + ' ' + b + 'V' + H + 'Z';
	}

	// grass blades: thin curved wedges from the ground up
	function grass(count, yMin, yMax, hMin, hMax, calmDip) {
		var d = '', i, x, y, h, lean, bw;
		for (i = 0; i < count; i++) {
			x = rr(-10, W + 10);
			y = rr(yMin, yMax);
			h = rr(hMin, hMax);
			if (calmDip) {
				var c = Math.abs(x - 800) / 520;
				if (c < 1) {
					h *= 0.55 + 0.45 * c;
				}
			}
			lean = rr(-0.45, 0.45) * h;
			bw = rr(2, 4.5);
			d += 'M' + n(x - bw) + ' ' + n(y) + 'q' + n(lean * 0.3 + bw) + ' ' + n(-h * 0.6) + ' ' + n(lean + bw) + ' ' + n(-h) +
				'q' + n(-lean * 0.7 + bw * 0.6) + ' ' + n(h * 0.45) + ' ' + n(bw - lean) + ' ' + n(h) + 'z';
		}
		return d;
	}

	function inCalm(x, y) { // area behind the timer
		var dx = (x - 800) / 470, dy = (y - 520) / 230;
		return dx * dx + dy * dy < 1;
	}

	// fireflies: [x, y, size, brightness]; denser low over the grass and near the trees
	var flies = [], i, x, y, tries;
	for (i = 0; i < 130; i++) {
		tries = 0;
		do {
			x = rr(20, W - 20);
			y = rnd() < 0.62 ? rr(640, 960) : rr(260, 700);
			tries++;
		} while (inCalm(x, y) && rnd() < 0.9 && tries < 20);
		var depth = rnd(); // 0 far .. 1 near
		if (inCalm(x, y)) {
			depth *= 0.4;
		}
		flies.push([x, y, 0.5 + depth * 1.1, 0.45 + depth * 0.55]);
	}

	// fireflies split by depth into zero-length round-capped dots; bloom comes from blurred wide strokes
	var far = '', near = '';
	flies.forEach(function(f) {
		var p = 'M' + n(f[0]) + ' ' + n(f[1]) + 'h0';
		if (f[2] < 0.9) {
			far += p;
		} else {
			near += p;
		}
	});

	function dots(d, color, width, op, filter) {
		return '<path d="' + d + '" stroke="' + color + '" stroke-width="' + width + '" stroke-opacity="' + op + '"' +
			(filter ? ' filter="url(#' + filter + ')"' : '') + '/>';
	}

	// a few large out-of-focus fireflies close to the viewer
	var bokeh = '';
	[[130, 560, 54], [1490, 470, 46], [330, 900, 40], [1300, 880, 50], [1440, 760, 30], [220, 330, 28]].forEach(function(b) {
		bokeh += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="url(#bk)"/>';
	});

	// faint stars in the sky gap above the clearing
	var stars = '';
	for (i = 0; i < 80; i++) {
		x = rr(250, 1350);
		y = rr(0, 420 - Math.abs(x - 800) * 0.2);
		stars += 'M' + n(x) + ' ' + n(y) + 'h0';
	}

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03070f"/><stop offset=".45" stop-color="#0a1a24"/><stop offset=".68" stop-color="#14302c"/><stop offset="1" stop-color="#0a1a14"/></linearGradient>' +
		'<radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#cfe6d8" stop-opacity=".35"/><stop offset=".3" stop-color="#7fae9a" stop-opacity=".14"/><stop offset="1" stop-color="#3a6a5a" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="bk"><stop offset="0" stop-color="#e4f87a" stop-opacity=".2"/><stop offset=".6" stop-color="#c4e65a" stop-opacity=".12"/><stop offset="1" stop-color="#b8e04a" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="calm" cx=".5" cy=".52" r=".5"><stop offset="0" stop-color="#04100e" stop-opacity=".62"/><stop offset=".6" stop-color="#04100e" stop-opacity=".3"/><stop offset="1" stop-color="#04100e" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>' +
		'<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1f17"/><stop offset="1" stop-color="#030806"/></linearGradient>' +
		'<filter id="mist" x="-20%" y="-50%" width="140%" height="200%"><feTurbulence type="fractalNoise" baseFrequency=".004 .02" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="80" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="18"/></filter>' +
		'<filter id="g1" filterUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><feGaussianBlur stdDeviation="3"/></filter>' +
		'<filter id="g2" filterUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><feGaussianBlur stdDeviation="8"/></filter>' +
		'<filter id="g3" filterUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><feGaussianBlur stdDeviation="16"/></filter>' +
		'</defs>' +
		'<rect width="1600" height="1000" fill="url(#sky)"/>' +
		'<path d="' + stars + '" stroke="#d8ecf0" stroke-opacity=".45" stroke-width="1.3" stroke-linecap="round"/>' +
		'<circle cx="1180" cy="150" r="260" fill="url(#moon)"/>' +
		'<circle cx="1180" cy="150" r="20" fill="#e6f2e8" opacity=".55"/>' +
		// far tree line in moonlit haze
		'<path d="' + treeline(640, 120, 220, 40, 0.3, 36) + '" fill="#163430" opacity=".9"/>' +
		'<g filter="url(#mist)"><ellipse cx="800" cy="650" rx="900" ry="45" fill="#4f7d72" opacity=".32"/><ellipse cx="400" cy="690" rx="500" ry="35" fill="#4f7d72" opacity=".25"/><ellipse cx="1250" cy="680" rx="500" ry="35" fill="#4f7d72" opacity=".25"/></g>' +
		'<g stroke-linecap="round">' + dots(far, '#b4e040', 26, '.55', 'g2') + dots(far, '#e6fa80', 7, '.6', 'g1') + dots(far, '#f4ffc0', 2.4, '.85') + '</g>' +
		// mid tree line
		'<path d="' + treeline(730, 170, 330, 54, 0.3, 34) + '" fill="#0c211c"/>' +
		'<g filter="url(#mist)"><ellipse cx="800" cy="750" rx="1000" ry="40" fill="#3e6a5e" opacity=".28"/></g>' +
		// meadow
		'<path d="M-20 1000V770Q400 745 800 760T1620 770V1000Z" fill="url(#ground)"/>' +
		'<path d="' + grass(150, 770, 860, 30, 80, true) + '" fill="#0f2a1f"/>' +
		// framing trees, left and right
		'<path d="' + bigPine(70, 1100, 175) + bigPine(240, 880, 135) + bigPine(1385, 920, 140) + bigPine(1545, 1120, 180) + '" fill="#040c09"/>' +
		'<path d="' + bigPine(395, 560, 90) + bigPine(1240, 610, 95) + '" fill="#06120e"/>' +
		'<path d="' + grass(160, 860, 960, 50, 140, true) + '" fill="#081a12"/>' +
		'<g stroke-linecap="round">' + dots(near, '#b0e040', 54, '.45', 'g3') + dots(near, '#e0f868', 16, '.75', 'g1') + dots(near, '#fbffd8', 4, '1') + '</g>' +
		'<path d="' + grass(115, 975, 1010, 90, 230, false) + '" fill="#020604"/>' +
		bokeh +
		'<rect width="1600" height="1000" fill="url(#calm)"/>' +
		'<rect width="1600" height="1000" fill="url(#vig)"/>' +
		'</svg>';

	var S = 'html.jlt-fireflies ';
	var PANEL = 'rgba(8,22,18,0.62)';
	var EDGE = 'inset 0 0 0 1px rgba(200,240,120,0.13)';
	var css = [
		S + '.mywindow:not(.fixed){background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.45),' + EDGE + ' !important}',
		S + '.popup,' + S + '.dialog{background-color:rgba(7,20,16,0.88) !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.5),' + EDGE + ' !important}',
		S + '#leftbar{background-color:rgba(5,15,12,0.66) !important;box-shadow:inset -1px 0 0 rgba(200,240,120,0.13)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(1,6,4,0.58) !important}',
		S + '#leftbar #logo{background:radial-gradient(circle at 30% 35%,#4f6e1c,#1d3a22 55%,#0d2219) !important;color:#efffa8 !important;text-shadow:0 0 0.35em rgba(220,255,110,0.65)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(200,240,110,0.14) !important}',
		S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(170,215,70,0.26) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(90,150,90,0.26) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.045) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(200,240,110,0.16) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.06) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(180,225,120,0.13) !important;color:#eef6e4 !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(200,240,120,0.16) !important}',
		S + '.click{color:#d4f27a}',
		S + '.times.pb{color:#f3ff7a !important}',
		S + '#lcd,' + S + '#multiphase{color:#f1f7e6;text-shadow:0 0 0.06em rgba(0,6,3,0.9),0 0 0.25em rgba(2,10,6,0.85),0 0 0.7em rgba(190,240,80,0.28)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(0,6,3,0.9),0 0 0.5em rgba(2,10,6,0.7)}',
		S + '.jltheme-tile.active{outline-color:#d8f560}'
	].join('');

	jlThemes.register({
		id: 'fireflies',
		name: 'Fireflies',
		palette: '#efe#011#122#243#de7#ef9#232#ef7',
		background: svg,
		css: css,
		timer: '#f86#9f6#ee5#4a3#f86'
	});
})();
