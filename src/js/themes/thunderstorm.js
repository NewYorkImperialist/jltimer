"use strict";

// jlTimer enhanced theme: Thunderstorm - dramatic storm clouds over dark plains.
// A branching cloud-to-ground bolt off to the left lights the cloud deck violet-blue,
// rain shafts hang in the distance and the right side (behind the timer) stays dark.
// Everything is generated here from a fixed seed (same view every load).
(function() {
	var seed = 0x51f0c3;

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

	var BX = 360, BY = 330; // bolt exits the cloud base here
	var GX = 318, GY = 806; // ...and strikes the plain here

	// ---- lightning: midpoint displacement with branches ----
	function jag(x1, y1, x2, y2, rough, depth) {
		if (depth == 0) {
			return [[x2, y2]];
		}
		var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
		var off = (rnd() - 0.5) * rough * len;
		var mx = (x1 + x2) / 2 - dy / len * off, my = (y1 + y2) / 2 + dx / len * off;
		return jag(x1, y1, mx, my, rough, depth - 1).concat(jag(mx, my, x2, y2, rough, depth - 1));
	}

	function pathOf(x, y, pts) {
		var d = 'M' + r1(x) + ' ' + r1(y);
		for (var i = 0; i < pts.length; i++) {
			d += 'L' + r1(pts[i][0]) + ' ' + r1(pts[i][1]);
		}
		return d;
	}

	var main = jag(BX, BY, GX, GY, 0.55, 6);
	var boltMain = pathOf(BX, BY, main);
	var boltBr = '', boltTw = '';

	function branch(pts, from, count, lenMin, lenMax, out) {
		var d = '';
		for (var k = 0; k < count; k++) {
			var p = pts[from + Math.floor(rnd() * (pts.length - from - 8))];
			var ang = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.7) + Math.PI / 2;
			var L = lenMin + rnd() * (lenMax - lenMin);
			var ex = p[0] + Math.cos(ang) * L, ey = p[1] + Math.sin(ang) * L * 0.8;
			var bp = jag(p[0], p[1], ex, ey, 0.6, 4);
			d += pathOf(p[0], p[1], bp);
			if (out) {
				for (var j = 0; j < 2; j++) {
					var q = bp[4 + Math.floor(rnd() * 8)];
					var a2 = ang + (rnd() - 0.5) * 1.2;
					var L2 = L * (0.25 + rnd() * 0.3);
					boltTw += pathOf(q[0], q[1], jag(q[0], q[1], q[0] + Math.cos(a2) * L2, q[1] + Math.sin(a2) * L2, 0.7, 3));
				}
			}
		}
		return d;
	}
	boltBr = branch(main, 2, 5, 70, 170, true);

	// in-cloud "spider" discharge running along the cloud base
	var spider = '';
	var sp = [[BX, BY, 760, 268], [BX, BY, 120, 300], [470, 300, 620, 340], [BX, BY, 520, 200]];
	for (var s = 0; s < sp.length; s++) {
		var spts = jag(sp[s][0], sp[s][1], sp[s][2], sp[s][3], 0.5, 5);
		spider += pathOf(sp[s][0], sp[s][1], spts);
		boltTw += branch(spts, 0, 2, 30, 70, false);
	}

	// ---- rain: distant streaks under the cloud deck ----
	function streaks(x0, x1, y0, y1, n, lmin, lmax, slant) {
		var d = '';
		for (var i = 0; i < n; i++) {
			var x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), l = lmin + rnd() * (lmax - lmin);
			d += 'M' + Math.round(x) + ' ' + Math.round(y) + 'l' + r1(slant * l) + ' ' + Math.round(l);
		}
		return d;
	}
	var rainFar = streaks(820, 1600, 470, 800, 300, 18, 46, -0.22) + streaks(0, 300, 380, 790, 90, 16, 40, -0.22);
	var rainNear = streaks(0, 1600, 0, 1000, 150, 40, 90, -0.24);

	// ---- plains ----
	function ridge(y, amp, step, rough) {
		var d = 'M-10 1010V' + y;
		var h = y;
		for (var x = -10; x <= 1620; x += step) {
			h += (rnd() - 0.5) * rough;
			h += (y - h) * 0.25;
			d += 'L' + x + ' ' + r1(h + Math.sin(x / 260) * amp);
		}
		return d + 'V1010Z';
	}
	var hillsFar = ridge(788, 6, 20, 7);
	var hillsMid = ridge(828, 14, 24, 10);
	var hillsNear = ridge(900, 26, 30, 14);

	// grass tufts along the foreground
	var grass = '';
	for (var g = 0; g < 320; g++) {
		var gx = rnd() * 1620 - 10, gy = 950 + rnd() * 60, gh = 12 + rnd() * 30, lean = (rnd() - 0.45) * 14;
		grass += 'M' + Math.round(gx) + ' ' + Math.round(gy) + 'q' + r1(lean * 0.2) + ' ' + r1(-gh * 0.6) + ' ' + r1(lean) + ' ' + r1(-gh);
	}

	// fence posts receding across the plain
	var fence = '';
	for (var f = 0; f < 14; f++) {
		var t = f / 13, fx = 560 + t * 640, fy = 870 - t * 50, fh = 46 - t * 30, fw = 5 - t * 3;
		fence += 'M' + r1(fx) + ' ' + r1(fy) + 'h' + r1(fw) + 'v' + r1(-fh) + 'h' + r1(-fw) + 'z';
	}
	var wire = 'M562 836Q880 812 1200 808M562 852Q880 826 1200 815';

	// lone tree silhouette
	function tree(x, y, s) {
		var d = 'M' + x + ' ' + y + 'c' + 2 * s + ' ' + -30 * s + ' ' + 2 * s + ' ' + -60 * s + ' ' + -4 * s + ' ' + -90 * s + 'l' + 9 * s + ' 0c' + -3 * s + ' ' + 30 * s + ' ' + -1 * s + ' ' + 60 * s + ' ' + 4 * s + ' ' + 90 * s + 'z';
		var blobs = '';
		for (var i = 0; i < 22; i++) {
			var a = rnd() * Math.PI * 2, rr = rnd();
			blobs += '<circle cx="' + r1(x + Math.cos(a) * rr * 52 * s) + '" cy="' + r1(y - 104 * s + Math.sin(a) * rr * 30 * s) + '" r="' + r1((12 + rnd() * 14) * s) + '"/>';
		}
		return '<path d="' + d + '"/>' + blobs;
	}

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
		'<stop offset="0" stop-color="#07071a"/><stop offset=".45" stop-color="#151534"/><stop offset=".72" stop-color="#2a2852"/><stop offset=".8" stop-color="#3a3566"/></linearGradient>' +
		'<radialGradient id="flash" cx="' + BX + '" cy="' + (BY - 30) + '" r="760" gradientUnits="userSpaceOnUse" gradientTransform="translate(' + BX + ' ' + BY + ') scale(1 .62) translate(' + -BX + ' ' + -BY + ')">' +
		'<stop offset="0" stop-color="#e4dcff" stop-opacity=".95"/><stop offset=".12" stop-color="#a796ff" stop-opacity=".75"/><stop offset=".38" stop-color="#5a4fc4" stop-opacity=".38"/><stop offset=".7" stop-color="#2a2a7a" stop-opacity=".12"/><stop offset="1" stop-color="#1a1a50" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="cloudLit" cx="' + BX + '" cy="' + BY + '" r="900" gradientUnits="userSpaceOnUse">' +
		'<stop offset="0" stop-color="#d6ccff"/><stop offset=".18" stop-color="#8e7fe6"/><stop offset=".45" stop-color="#4a4296"/><stop offset=".75" stop-color="#28265a"/><stop offset="1" stop-color="#1b1a3e"/></radialGradient>' +
		'<radialGradient id="cloudRim" cx="' + BX + '" cy="' + BY + '" r="560" gradientUnits="userSpaceOnUse">' +
		'<stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".3" stop-color="#c3b6ff" stop-opacity=".7"/><stop offset=".7" stop-color="#6f62d8" stop-opacity=".15"/><stop offset="1" stop-color="#6f62d8" stop-opacity="0"/></radialGradient>' +
		'<linearGradient id="deckMask" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff"/><stop offset=".7" stop-color="#999"/><stop offset=".78" stop-color="#000"/></linearGradient>' +
		'<mask id="deck"><rect width="1600" height="1000" fill="url(#deckMask)"/></mask>' +
		'<linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b6aa8" stop-opacity=".5"/><stop offset="1" stop-color="#6b6aa8" stop-opacity="0"/></linearGradient>' +
		'<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1932"/><stop offset="1" stop-color="#05050c"/></linearGradient>' +
		'<radialGradient id="strike" cx="' + GX + '" cy="' + GY + '" r="420" gradientUnits="userSpaceOnUse" gradientTransform="translate(' + GX + ' ' + GY + ') scale(1 .3) translate(' + -GX + ' ' + -GY + ')">' +
		'<stop offset="0" stop-color="#cfc4ff" stop-opacity=".85"/><stop offset=".25" stop-color="#7d70d8" stop-opacity=".35"/><stop offset="1" stop-color="#3b3590" stop-opacity="0"/></radialGradient>' +
		'<linearGradient id="vig" x1="0" y1="0" x2="1" y2="0"><stop offset=".55" stop-color="#03030c" stop-opacity="0"/><stop offset="1" stop-color="#03030c" stop-opacity=".55"/></linearGradient>' +
		// textured cloud layers: fractal noise thresholded into alpha, coloured by the fill
		'<filter id="cA" filterUnits="userSpaceOnUse" x="-80" y="-80" width="1760" height="920"><feTurbulence type="fractalNoise" baseFrequency=".0028 .0075" numOctaves="5" seed="11"/><feGaussianBlur stdDeviation="2.5"/>' +
		'<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.6 0 0 0 -.95"/><feComposite in="SourceGraphic" operator="in"/></filter>' +
		'<filter id="cB" filterUnits="userSpaceOnUse" x="-80" y="-80" width="1760" height="920"><feTurbulence type="fractalNoise" baseFrequency=".0034 .009" numOctaves="4" seed="3"/><feGaussianBlur stdDeviation="5" result="n"/>' +
		'<feDiffuseLighting in="n" surfaceScale="26" diffuseConstant="1.6" lighting-color="#fff" result="l"><fePointLight x="' + BX + '" y="' + (BY - 20) + '" z="190"/></feDiffuseLighting>' +
		'<feColorMatrix in="n" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 0 0 0 -1.2" result="a"/><feComposite in="l" in2="a" operator="in" result="la"/><feComposite in="la" in2="SourceGraphic" operator="arithmetic" k1="1"/></filter>' +
'<filter id="cC" filterUnits="userSpaceOnUse" x="-80" y="-80" width="1760" height="920"><feTurbulence type="fractalNoise" baseFrequency=".006 .016" numOctaves="4" seed="27"/><feGaussianBlur stdDeviation="1.5"/>' +
		'<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 0 0 0 -2.1"/><feComposite in="SourceGraphic" operator="in"/></filter>' +
		'<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>' +
		'<filter id="glow2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>' +
		'<filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>' +
		'</defs>' +
		'<rect width="1600" height="1000" fill="url(#sky)"/>' +
		// big diffuse flash behind the clouds
		'<rect width="1600" height="1000" fill="url(#flash)"/>' +
		// cloud deck: dark base, lit billows, bright rims near the bolt
		'<g mask="url(#deck)">' +
		'<rect x="-60" y="-60" width="1720" height="820" fill="#100f26" filter="url(#cA)" opacity=".92"/>' +
		'<rect x="-60" y="-60" width="1720" height="820" fill="url(#cloudLit)" filter="url(#cB)" opacity=".95"/>' +
		'<rect x="-60" y="-60" width="1720" height="820" fill="url(#cloudRim)" filter="url(#cC)" opacity=".8"/>' +
		'<rect x="-60" y="-60" width="1720" height="820" fill="#0b0a1e" filter="url(#cC)" opacity=".3" transform="translate(40 26)"/>' +
		'</g>' +
		// darker shelf along the cloud base
		'<ellipse cx="1100" cy="470" rx="760" ry="70" fill="#0c0b20" opacity=".55" filter="url(#soft)"/>' +
		'<ellipse cx="420" cy="350" rx="420" ry="40" fill="#120f2c" opacity=".35" filter="url(#soft)"/>' +
		// rain shafts hanging from the cloud base
		'<path d="M860 470L1010 470L960 800L800 800Z M1120 480L1330 480L1270 800L1060 800Z M1420 470L1620 470L1600 800L1370 800Z M30 380L230 380L190 790L-10 790Z" fill="url(#shaft)" filter="url(#soft)" opacity=".75"/>' +
		'<path d="' + rainFar + '" stroke="#8d8fc8" stroke-width="1.1" opacity=".26" fill="none"/>' +
		// spider lightning in the cloud base
		'<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="' + spider + '" stroke="#9c8cff" stroke-width="10" opacity=".45" filter="url(#glow)"/>' +
		'<path d="' + spider + '" stroke="#e8e2ff" stroke-width="1.3" opacity=".65"/>' +
		// main bolt: wide glow, halo, core
		'<path d="' + boltMain + boltBr + '" stroke="#8f7dff" stroke-width="22" opacity=".55" filter="url(#glow)"/>' +
		'<path d="' + boltMain + '" stroke="#c9bfff" stroke-width="6" opacity=".85" filter="url(#glow2)"/>' +
		'<path d="' + boltBr + '" stroke="#c9bfff" stroke-width="3" opacity=".7" filter="url(#glow2)"/>' +
		'<path d="' + boltTw + '" stroke="#b8acff" stroke-width="1" opacity=".55"/>' +
		'<path d="' + boltBr + '" stroke="#f4f1ff" stroke-width="1.3"/>' +
		'<path d="' + boltMain + '" stroke="#fff" stroke-width="2.6"/>' +
		'</g>' +
		// plains
		'<path d="' + hillsFar + '" fill="#211f40"/>' +
		'<rect width="1600" height="1000" fill="url(#strike)"/>' +
		'<path d="' + hillsMid + '" fill="#141327"/>' +
		'<ellipse cx="' + GX + '" cy="' + (GY + 30) + '" rx="300" ry="40" fill="#8a7de8" opacity=".14" filter="url(#soft)"/>' +
		'<g fill="#0a0a16">' + tree(1330, 842, 0.62) + '<path d="' + fence + '"/></g>' +
		'<path d="' + wire + '" stroke="#0a0a16" stroke-width="1.2" fill="none"/>' +
		'<path d="' + hillsNear + '" fill="url(#ground)"/>' +
		'<path d="' + grass + '" stroke="#06060e" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
		// near rain over everything, very faint
		'<path d="' + rainNear + '" stroke="#b9bce8" stroke-width="1" opacity=".1" fill="none"/>' +
		// darken the right edge where the timer sits
		'<rect width="1600" height="1000" fill="url(#vig)"/>' +
		'</svg>';

	var S = 'html.jlt-thunderstorm ';
	var PANEL = 'rgba(14,13,34,0.64)';
	var css = [
		S + '.mywindow:not(.fixed),' + S + '.popup,' + S + '.dialog{background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.5),inset 0 0 0 1px rgba(180,165,255,0.14) !important}',
		S + '#leftbar{background-color:rgba(10,9,26,0.66) !important;box-shadow:inset -1px 0 0 rgba(180,165,255,0.14)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(4,3,14,0.58) !important}',
		S + '#leftbar #logo{background:linear-gradient(135deg,#2c2a6e,#6a54d8 55%,#b9a8ff) !important;color:#fff !important;text-shadow:0 0 0.35em rgba(220,210,255,0.6)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(170,150,255,0.16) !important}',
		S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(140,120,255,0.3) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(110,100,230,0.26) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.05) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(170,150,255,0.18) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.06) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(160,150,255,0.14) !important;color:#ecebfa !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(180,165,255,0.18) !important}',
		S + '.click{color:#b9adff}',
		S + '.times.pb{color:#ffd65c !important}',
		S + '#lcd,' + S + '#multiphase{color:#f2f0ff;text-shadow:0 0 0.06em rgba(3,2,12,0.95),0 0 0.25em rgba(4,3,18,0.85),0 0 0.7em rgba(150,130,255,0.32)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(3,2,12,0.9),0 0 0.5em rgba(4,3,18,0.7)}',
		S + '.jltheme-tile.active{outline-color:#a594ff}'
	].join('');

	jlThemes.register({
		id: 'thunderstorm',
		name: 'Thunderstorm',
		palette: '#eef#012#113#225#b9f#fff#53c#fd5',
		background: svg,
		css: css,
		timer: '#f77#8e9#fd6#5a8#f77'
	});
})();
