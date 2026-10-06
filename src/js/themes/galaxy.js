"use strict";

// jlTimer enhanced theme: Galaxy - magenta, blue and cyan nebula clouds over a dense starfield
// with a soft milky-way band. The stars are generated here from a fixed seed (same sky every load).
(function() {
	var W = 1600, H = 1000;
	var seed = 0x6a1a7e;

	function rnd() { // mulberry32
		seed = (seed + 0x6D2B79F5) | 0;
		var t = seed;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function gauss() {
		return (rnd() + rnd() + rnd() - 1.5) / 1.5;
	}

	// milky way: a band from lower left to upper right, passing above the timer
	var BX = 800, BY = 330, BA = -24 * Math.PI / 180;
	var bcos = Math.cos(BA), bsin = Math.sin(BA);

	// star buckets: [stroke-width, opacity, color] -> path data of zero-length round-capped dots
	var buckets = [
		[1.1, 0.35, '#c8d0ff'], [1.1, 0.6, '#ffffff'], [1.5, 0.45, '#dfe4ff'],
		[1.6, 0.75, '#ffffff'], [2.1, 0.6, '#cfe6ff'], [2.2, 0.85, '#fff4ea'],
		[2.8, 0.9, '#ffffff'], [1.3, 0.55, '#ffd2f0'], [1.4, 0.55, '#bff4ff']
	];
	var paths = buckets.map(function() { return ''; });

	function inCalm(x, y) { // keep the area behind the timer quieter
		var dx = (x - 800) / 430, dy = (y - 560) / 190;
		return dx * dx + dy * dy < 1;
	}

	function addStar(x, y, bright) {
		if (x < 0 || x > W || y < 0 || y > H) {
			return;
		}
		var r = rnd();
		var b;
		if (inCalm(x, y)) {
			if (rnd() < 0.55) {
				return;
			}
			b = r < 0.7 ? 0 : 2;
		} else if (bright) {
			b = r < 0.3 ? 3 : r < 0.55 ? 4 : r < 0.75 ? 5 : r < 0.85 ? 6 : r < 0.93 ? 7 : 8;
		} else {
			b = r < 0.42 ? 0 : r < 0.66 ? 1 : r < 0.8 ? 2 : r < 0.88 ? 3 : r < 0.93 ? 7 : r < 0.97 ? 8 : 4;
		}
		paths[b] += 'M' + Math.round(x) + ' ' + Math.round(y) + 'h0';
	}

	var i, u, v;
	for (i = 0; i < 1100; i++) { // field stars
		addStar(rnd() * W, rnd() * H, rnd() < 0.06);
	}
	for (i = 0; i < 1300; i++) { // band stars, dense along the axis
		u = (rnd() - 0.5) * 2100;
		v = gauss() * 150;
		addStar(BX + u * bcos - v * bsin, BY + u * bsin + v * bcos, rnd() < 0.05);
	}

	var stars = '';
	buckets.forEach(function(b, k) {
		stars += '<path stroke="' + b[2] + '" stroke-opacity="' + b[1] + '" stroke-width="' + b[0] + '" d="' + paths[k] + '"/>';
	});

	// a few bright stars with halos and diffraction spikes
	var bright = [[1405, 120, 1.2], [205, 840, 1], [1180, 905, .8], [470, 120, .75], [1530, 640, .7], [95, 360, .65], [960, 200, .6], [700, 960, .55]];
	var glows = '';
	bright.forEach(function(s) {
		var x = s[0], y = s[1], k = s[2];
		glows += '<circle cx="' + x + '" cy="' + y + '" r="' + (26 * k) + '" fill="url(#sg)"/>' +
			'<path d="M' + (x - 30 * k) + ' ' + y + 'H' + (x + 30 * k) + 'M' + x + ' ' + (y - 30 * k) + 'V' + (y + 30 * k) + '" stroke="url(#sp)" stroke-width="' + (1.2 * k) + '" opacity=".75"/>' +
			'<circle cx="' + x + '" cy="' + y + '" r="' + (1.8 * k + 0.6) + '" fill="#fff"/>';
	});

	var band = 'transform="rotate(-24 800 330)"';

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<radialGradient id="bg" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#0c0b2c"/><stop offset=".6" stop-color="#070720"/><stop offset="1" stop-color="#020210"/></radialGradient>' +
		'<radialGradient id="sg"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".25" stop-color="#bcd4ff" stop-opacity=".25"/><stop offset="1" stop-color="#8aa8ff" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="sp" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="calm" cx=".5" cy=".56" r=".5"><stop offset="0" stop-color="#05051a" stop-opacity=".78"/><stop offset=".55" stop-color="#05051a" stop-opacity=".45"/><stop offset="1" stop-color="#05051a" stop-opacity="0"/></radialGradient>' +
		'<filter id="neb" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".0045" numOctaves="4" seed="11"/><feDisplacementMap in="SourceGraphic" scale="190" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="26"/></filter>' +
		'<filter id="wisp" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="120" xChannelSelector="G" yChannelSelector="B"/><feGaussianBlur stdDeviation="11"/></filter>' +
		'<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>' +
		'<filter id="dust" x="-20%" y="-60%" width="140%" height="220%"><feTurbulence type="fractalNoise" baseFrequency=".006 .018" numOctaves="4" seed="23"/><feDisplacementMap in="SourceGraphic" scale="90" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="16"/></filter>' +
		'</defs>' +
		'<rect width="1600" height="1000" fill="url(#bg)"/>' +
		// milky-way glow
		'<g ' + band + ' filter="url(#soft)">' +
		'<ellipse cx="800" cy="330" rx="1150" ry="160" fill="#5d52a8" opacity=".5"/>' +
		'<ellipse cx="800" cy="330" rx="950" ry="75" fill="#c2b8f0" opacity=".34"/>' +
		'<ellipse cx="1180" cy="330" rx="260" ry="80" fill="#ffd7c4" opacity=".26"/>' +
		'</g>' +
		// large nebula clouds
		'<g filter="url(#neb)">' +
		'<ellipse cx="1290" cy="770" rx="330" ry="190" fill="#c0168c" opacity=".62"/>' +
		'<ellipse cx="1460" cy="640" rx="200" ry="150" fill="#7a1fd0" opacity=".55"/>' +
		'<ellipse cx="1120" cy="900" rx="260" ry="110" fill="#e0308f" opacity=".42"/>' +
		'<ellipse cx="260" cy="250" rx="320" ry="210" fill="#2236c8" opacity=".62"/>' +
		'<ellipse cx="120" cy="470" rx="190" ry="160" fill="#14a6c8" opacity=".5"/>' +
		'<ellipse cx="470" cy="120" rx="240" ry="110" fill="#5a2fd6" opacity=".45"/>' +
		'<ellipse cx="1350" cy="160" rx="230" ry="120" fill="#1db8d4" opacity=".32"/>' +
		'<ellipse cx="300" cy="900" rx="260" ry="110" fill="#3a1d9a" opacity=".42"/>' +
		'</g>' +
		// bright filaments inside the clouds
		'<g filter="url(#wisp)" fill="none" stroke-linecap="round">' +
		'<path d="M1060 820C1160 700 1300 690 1420 740S1560 700 1600 610" stroke="#ff6ec7" stroke-width="22" opacity=".38"/>' +
		'<path d="M1150 900C1240 820 1360 830 1470 790" stroke="#ffa3dc" stroke-width="10" opacity=".35"/>' +
		'<path d="M1330 580C1380 650 1480 670 1560 620" stroke="#b78cff" stroke-width="14" opacity=".3"/>' +
		'<path d="M40 330C150 230 260 300 380 200S520 110 600 60" stroke="#59d8ff" stroke-width="18" opacity=".32"/>' +
		'<path d="M60 520C130 440 220 460 270 380" stroke="#7af0ff" stroke-width="12" opacity=".35"/>' +
		'<path d="M180 160C260 120 350 170 430 110" stroke="#8fa0ff" stroke-width="10" opacity=".3"/>' +
		'</g>' +
		// dust lanes along the band
		'<g ' + band + ' filter="url(#dust)">' +
		'<ellipse cx="760" cy="338" rx="820" ry="26" fill="#05051a" opacity=".42"/>' +
		'<ellipse cx="1180" cy="318" rx="300" ry="16" fill="#05051a" opacity=".32"/>' +
		'</g>' +
		'<rect width="1600" height="1000" fill="url(#calm)"/>' +
		'<g stroke-linecap="round">' + stars + '</g>' +
		glows +
		'</svg>';

	var S = 'html.jlt-galaxy ';
	var PANEL = 'rgba(12,10,38,0.6)';
	var css = [
		S + '.mywindow:not(.fixed){background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.45),inset 0 0 0 1px rgba(170,150,255,0.14) !important}',
		S + '.popup,' + S + '.dialog{background-color:rgba(12,10,38,0.86) !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.45),inset 0 0 0 1px rgba(170,150,255,0.14) !important}',
		S + '#leftbar{background-color:rgba(8,7,28,0.62) !important;box-shadow:inset -1px 0 0 rgba(170,150,255,0.14)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(2,2,12,0.55) !important}',
		S + '#leftbar #logo{background:linear-gradient(135deg,#b0218f,#4b2cc4 60%,#1aa6c8) !important;color:#fff !important;text-shadow:0 0 0.4em rgba(255,255,255,0.35)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(190,150,255,0.16) !important}',
		S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(200,80,220,0.28) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(110,80,230,0.28) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.05) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(190,150,255,0.18) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.06) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(160,140,255,0.14) !important;color:#eef !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(170,150,255,0.18) !important}',
		S + '.click{color:#9de6ff}',
		S + '.times.pb{color:#ff8ad8 !important}',
		S + '#lcd,' + S + '#multiphase{color:#f2f0ff;text-shadow:0 0 0.06em rgba(0,0,10,0.9),0 0 0.25em rgba(4,3,20,0.85),0 0 0.7em rgba(150,100,255,0.35)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(0,0,10,0.9),0 0 0.5em rgba(4,3,20,0.7)}',
		S + '.jltheme-tile.active{outline-color:#d36bff}'
	].join('');

	jlThemes.register({
		id: 'galaxy',
		name: 'Galaxy',
		palette: '#eef#002#213#326#9de#fff#a2c#f8d',
		background: svg,
		css: css,
		timer: '#f6a#5f9#fd5#3b7#f6a'
	});
})();
