"use strict";

// jlTimer enhanced theme: Koi Pond - a top-down view of a dark green-blue pond.
// Lily pads and pink lotus flowers at the edges, orange-white koi gliding, soft ripples.
// Everything is generated here from a fixed seed (same view every load).
(function() {
	var seed = 0x6b01;

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

	function pt(p) {
		return Math.round(p[0]) + ' ' + Math.round(p[1]);
	}

	// shrink an absolute M/L/C/Z path (integer coords) to relative commands
	function rel(d) {
		var out = '', cx = 0, cy = 0, sx = 0, sy = 0, re = /([MLCZ])([^MLCZ]*)/g, m;
		function num(v) {
			return (v < 0 ? '' : ' ') + v;
		}
		while ((m = re.exec(d))) {
			var c = m[1], a = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
			if (c == 'Z') {
				out += 'z';
				cx = sx; cy = sy;
				continue;
			}
			if (c == 'M') {
				out += 'M' + a[0] + num(a[1]);
				cx = sx = a[0]; cy = sy = a[1];
				continue;
			}
			var s = c.toLowerCase();
			for (var i = 0; i < a.length; i += 2) {
				s += (i ? num(a[i] - cx) : a[i] - cx) + num(a[i + 1] - cy);
			}
			if (c == 'L') {
				cx = a[0]; cy = a[1];
			} else {
				cx = a[4]; cy = a[5];
			}
			out += s;
		}
		return out;
	}

	var defs = '';
	var uid = 0;

	// ---- koi: drawn in local units (s along the body, n across, fractions of L), bent along a spine ----
	// x, y: centre; a: heading (deg); L: length; k: body bend; v: variety; tf: extra tail flick
	function koi(x, y, a, L, k, v, tf) {
		var ar = a * Math.PI / 180, ca = Math.cos(ar), sa = Math.sin(ar);
		// integrate the spine from the nose (s=.55) back to the tail tip (s=-.9)
		var S0 = 0.55, DS = 0.025, sp = [], px = 0, py = 0, ph = 0, i;
		for (i = 0; i <= 58; i++) {
			var s = S0 - i * DS;
			sp.push([px, py, ph]);
			var cur = k * 1.5 + (s < -0.2 ? tf * (-0.2 - s) * 3.2 : 0);
			ph -= cur * DS;
			px -= Math.cos(ph) * DS;
			py -= Math.sin(ph) * DS;
		}

		function map(s, n) {
			var f = (S0 - s) / DS, j = Math.max(0, Math.min(57, Math.floor(f))), u = f - j;
			var A = sp[j], B = sp[j + 1];
			var qx = A[0] + (B[0] - A[0]) * u, qy = A[1] + (B[1] - A[1]) * u, q = A[2] + (B[2] - A[2]) * u;
			var lx = (qx - sp[22][0] - n * Math.sin(q)) * L, ly = (qy - sp[22][1] + n * Math.cos(q)) * L;
			return [x + lx * ca - ly * sa, y + lx * sa + ly * ca];
		}

		function cpath(cmds) { // ['M',s,n] | ['C',s,n,s,n,s,n]
			var d = '';
			for (var i = 0; i < cmds.length; i++) {
				var c = cmds[i];
				d += c[0] == 'M' ? 'M' + pt(map(c[1], c[2])) : 'C' + pt(map(c[1], c[2])) + ' ' + pt(map(c[3], c[4])) + ' ' + pt(map(c[5], c[6]));
			}
			return rel(d + 'Z');
		}

		function blob(cs, cn, rs, rn) { // irregular closed blob (Catmull-Rom through jittered ellipse points)
			var p = [], m = 7, i;
			for (i = 0; i < m; i++) {
				var t = i / m * Math.PI * 2, j = 0.7 + rnd() * 0.5;
				p.push([cs + Math.cos(t) * rs * j, cn + Math.sin(t) * rn * j]);
			}
			var c = [['M', p[0][0], p[0][1]]];
			for (i = 0; i < m; i++) {
				var p0 = p[(i + m - 1) % m], p1 = p[i], p2 = p[(i + 1) % m], p3 = p[(i + 2) % m];
				c.push(['C', p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
			}
			return cpath(c);
		}

		function hw(t) {
			return 0.125 * Math.max(0.085, Math.pow(Math.sin(Math.PI * Math.pow(t, 1.3)), 0.62));
		}
		var N = 16, body = 'M' + pt(map(-0.5, -hw(0))), back = '';
		for (i = 0; i <= N; i++) {
			var t = Math.pow(i / N, 0.85);
			body += 'L' + pt(map(t - 0.5, i == N ? 0 : hw(t)));
			back = 'L' + pt(map(t - 0.5, -hw(t))) + back;
		}
		body = rel(body + back.replace(/^L[^L]*/, '') + 'Z');

		var tail = cpath([
			['M', -0.46, 0.035],
			['C', -0.56, 0.08, -0.68, 0.19, -0.82, 0.25],
			['C', -0.87, 0.2, -0.82, 0.13, -0.79, 0.09],
			['C', -0.76, 0.05, -0.73, 0.02, -0.7, 0],
			['C', -0.73, -0.02, -0.76, -0.05, -0.79, -0.09],
			['C', -0.82, -0.13, -0.87, -0.2, -0.82, -0.25],
			['C', -0.68, -0.19, -0.56, -0.08, -0.46, -0.035]
		]);
		var fins = '', rays = '';
		for (var sg = -1; sg <= 1; sg += 2) {
			fins += cpath([
				['M', 0.26, 0.105 * sg],
				['C', 0.2, 0.2 * sg, 0.1, 0.29 * sg, 0.0, 0.28 * sg],
				['C', 0.02, 0.2 * sg, 0.09, 0.14 * sg, 0.14, 0.115 * sg],
				['C', 0.18, 0.11 * sg, 0.22, 0.105 * sg, 0.26, 0.105 * sg]
			]);
			fins += cpath([
				['M', -0.05, 0.09 * sg],
				['C', -0.09, 0.14 * sg, -0.14, 0.18 * sg, -0.2, 0.175 * sg],
				['C', -0.17, 0.13 * sg, -0.14, 0.1 * sg, -0.12, 0.08 * sg],
				['C', -0.1, 0.085 * sg, -0.07, 0.09 * sg, -0.05, 0.09 * sg]
			]);
			for (i = 0; i < 3; i++) {
				rays += 'M' + pt(map(0.2 - i * 0.03, 0.11 * sg)) + 'L' + pt(map(0.12 - i * 0.05, (0.25 - i * 0.02) * sg));
				rays += 'M' + pt(map(-0.48, 0.02 * sg)) + 'L' + pt(map(-0.72 - i * 0.03, (0.07 + i * 0.065) * sg));
			}
		}
		var spine = 'M' + pt(map(-0.3, 0));
		for (i = 1; i <= 6; i++) {
			spine += 'L' + pt(map(-0.3 + i * 0.11, 0));
		}
		var dorsal = 'M' + pt(map(-0.26, 0));
		for (i = 1; i <= 4; i++) {
			dorsal += 'L' + pt(map(-0.26 + i * 0.085, 0));
		}

		// varieties: 0 kohaku (white + red-orange), 1 sanke (adds black), 2 orange ogon, 3 tancho-ish
		var base = v == 2 ? '#f2872e' : '#f7f2e8';
		var red = v == 2 ? '#ffb663' : '#e64e28';
		var pat = '';
		if (v == 0) {
			pat = blob(0.37, 0.0, 0.1, 0.12) + blob(0.12, -0.03, 0.15, 0.13) + blob(-0.18, 0.04, 0.12, 0.14);
		} else if (v == 1) {
			pat = blob(0.3, -0.03, 0.14, 0.11) + blob(-0.07, 0.04, 0.17, 0.14);
		} else if (v == 2) {
			pat = blob(0.42, 0, 0.08, 0.07);
		} else {
			pat = blob(0.37, 0, 0.065, 0.06) + blob(0.0, 0.07, 0.08, 0.05);
		}
		var blk = v == 1 ? blob(0.08, -0.08, 0.055, 0.045) + blob(-0.26, -0.05, 0.045, 0.04) + blob(0.18, 0.09, 0.035, 0.03) : '';
		var id = 'k' + (uid++);
		defs += '<path id="' + id + '" d="' + body + '"/><clipPath id="' + id + 'c"><use href="#' + id + '"/></clipPath>';
		var e1 = map(0.43, 0.058), e2 = map(0.43, -0.058), er = r1(L * 0.012);
		var finCol = v == 2 ? '#ffcf96' : '#ffe9dc';
		var u = '<use href="#' + id + '"';
		return '<g>' +
			'<g transform="translate(' + r1(L * 0.09) + ' ' + r1(L * 0.12) + ')" fill="#010b0c" opacity=".45" filter="url(#bs)">' + u + '/><path d="' + tail + '"/></g>' +
			'<g filter="url(#bk)">' +
			'<path d="' + tail + fins + '" fill="' + finCol + '" fill-opacity=".5" stroke="' + finCol + '" stroke-opacity=".75" stroke-width="' + r1(L * 0.006) + '"/>' +
			'<path d="' + rel(rays) + '" stroke="' + finCol + '" stroke-opacity=".4" stroke-width="' + r1(L * 0.004) + '" fill="none"/>' +
			u + ' fill="' + base + '"/>' +
			'<g clip-path="url(#' + id + 'c)">' +
			'<path d="' + pat + '" fill="' + red + '"/>' +
			(blk ? '<path d="' + blk + '" fill="#1b1716"/>' : '') +
			'<path d="' + rel(spine) + '" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="' + r1(L * 0.05) + '" stroke-linecap="round" filter="url(#bl)"/>' +
			u + ' fill="none" stroke="#3a160c" stroke-opacity=".4" stroke-width="' + r1(L * 0.035) + '" filter="url(#bl)"/>' +
			'</g>' +
			'<path d="' + rel(dorsal) + '" fill="none" stroke="' + (v == 2 ? '#c4581a' : '#d6cbbb') + '" stroke-opacity=".7" stroke-width="' + r1(L * 0.012) + '" stroke-linecap="round"/>' +
			'<circle cx="' + r1(e1[0]) + '" cy="' + r1(e1[1]) + '" r="' + er + '" fill="#1c1410"/>' +
			'<circle cx="' + r1(e2[0]) + '" cy="' + r1(e2[1]) + '" r="' + er + '" fill="#1c1410"/>' +
			'</g></g>';
	}

	// ---- lily pads ----
	function pad(x, y, r, notch, g) { // notch: angle (deg) of the slit
		var na = notch * Math.PI / 180, hwid = 0.16 + rnd() * 0.06;
		var ph = rnd() * 6, d = 'M' + Math.round(x) + ' ' + Math.round(y);
		var n = 28;
		for (var i = 0; i <= n; i++) {
			var th = na + hwid + (Math.PI * 2 - hwid * 2) * i / n;
			var rr = r * (1 + 0.025 * Math.sin(th * 3 + ph) + 0.015 * Math.sin(th * 7 + ph * 2));
			d += 'L' + Math.round(x + Math.cos(th) * rr) + ' ' + Math.round(y + Math.sin(th) * rr);
		}
		d = rel(d + 'Z');
		var veins = '';
		for (i = 0; i < 11; i++) {
			var va = na + hwid + (Math.PI * 2 - hwid * 2) * (i + 0.5) / 11;
			veins += 'M' + Math.round(x) + ' ' + Math.round(y) + 'l' + Math.round(Math.cos(va) * r * 0.9) + ' ' + Math.round(Math.sin(va) * r * 0.9);
		}
		var so = Math.round(r * 0.12), id = 'p' + (uid++);
		defs += '<path id="' + id + '" d="' + d + '"/>';
		return '<use href="#' + id + '" fill="url(#' + (g ? 'pad2' : 'pad1') + ')" stroke="' + (g ? '#9cc27a' : '#84b86c') + '" stroke-opacity=".55" stroke-width="2"/>' +
			'<path d="' + veins + '" stroke="#b5dc8e" stroke-opacity=".22" stroke-width="1.3" fill="none"/>' +
			'<circle cx="' + Math.round(x) + '" cy="' + Math.round(y) + '" r="' + r1(r * 0.05) + '" fill="#a9cf86" opacity=".35"/>|' +
			'<use href="#' + id + '" x="' + so + '" y="' + Math.round(so * 1.3) + '"/>';
	}

	// ---- lotus (top-down) ----
	function petal(x, y, len, w, ang) {
		var a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
		function P(u, v) {
			return Math.round(x + u * c - v * s) + ' ' + Math.round(y + u * s + v * c);
		}
		return rel('M' + P(0, 0) + 'C' + P(len * 0.3, w * 0.75) + ' ' + P(len * 0.75, w * 0.85) + ' ' + P(len, 0) +
			'C' + P(len * 0.75, -w * 0.85) + ' ' + P(len * 0.3, -w * 0.75) + ' ' + P(0, 0) + 'Z');
	}

	function lotus(x, y, R, rot) {
		var id = 'lg' + (uid++);
		defs += '<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + x + '" cy="' + y + '" r="' + R + '"><stop offset="0" stop-color="#fff6f2"/><stop offset=".45" stop-color="#fbd3df"/><stop offset=".85" stop-color="#ef8fb2"/><stop offset="1" stop-color="#df6f9a"/></radialGradient>';
		var out = '<circle cx="' + x + '" cy="' + y + '" r="' + r1(R * 1.5) + '" fill="url(#lglow)"/>';
		out += '<circle cx="' + r1(x + R * 0.12) + '" cy="' + r1(y + R * 0.16) + '" r="' + r1(R * 0.85) + '" fill="#010a0b" opacity=".45" filter="url(#bs)"/>';
		var layers = [[9, 1, 0.38, 0, 1], [7, 0.76, 0.34, 25, 0.97], [6, 0.52, 0.27, 8, 0.95]];
		for (var l = 0; l < layers.length; l++) {
			var L = layers[l], d = '';
			for (var i = 0; i < L[0]; i++) {
				d += petal(x, y, R * L[1] * (0.92 + rnd() * 0.12), R * L[2], rot + L[3] + i * 360 / L[0] + (rnd() - 0.5) * 8);
			}
			out += '<path d="' + d + '" fill="url(#' + id + ')" fill-opacity="' + L[4] + '" stroke="#c9507f" stroke-opacity=".38" stroke-width="' + r1(R * 0.012) + '"/>';
		}
		out += '<circle cx="' + x + '" cy="' + y + '" r="' + r1(R * 0.2) + '" fill="#f2c64a"/>' +
			'<circle cx="' + x + '" cy="' + y + '" r="' + r1(R * 0.13) + '" fill="#c8d468" stroke="#a6b44c" stroke-width="1"/>';
		var dots = '';
		for (i = 0; i < 7; i++) {
			var da = i * 0.9 + rot;
			var dr = i == 0 ? 0 : R * 0.075;
			dots += '<circle cx="' + r1(x + Math.cos(da) * dr) + '" cy="' + r1(y + Math.sin(da) * dr) + '" r="' + r1(R * 0.018) + '"/>';
		}
		out += '<g fill="#8a9a36">' + dots + '</g>';
		var cr = R * 0.195, circ = 2 * Math.PI * cr;
		out += '<circle cx="' + x + '" cy="' + y + '" r="' + r1(cr) + '" fill="none" stroke="#f6d76a" stroke-width="' + r1(R * 0.11) + '" stroke-dasharray="' + r1(circ / 44) + ' ' + r1(circ / 44) + '"/>';
		return out;
	}

	// ---- ripples ----
	function ripple(x, y, r0, n) {
		var o = '';
		for (var i = 0; i < n; i++) {
			var r = r0 * (1 + i * 0.75 + i * i * 0.08);
			o += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r1(r) + '" ry="' + r1(r * 0.96) + '" stroke-opacity="' + r1((0.34 - i * 0.07) * 100) / 100 + '" stroke-width="' + r1(1.8 - i * 0.3) + '"/>';
		}
		return o;
	}

	// ---- layout (keep the area behind the right-side timer, ~x1440-1600 y380-620, calm) ----
	var pads = '', padSh = '';
	var P = [ // x, y, r, notch, variant
		// top-left
		[70, 70, 120, 40, 0], [240, 30, 78, 150, 1], [40, 250, 70, 300, 1], [330, 150, 46, 210, 0],
		// top-right
		[1520, 60, 115, 120, 0], [1330, 40, 70, 20, 1], [1590, 230, 78, 200, 1], [1235, 120, 40, 250, 0],
		// bottom-left
		[80, 930, 128, 320, 1], [270, 975, 80, 60, 0], [40, 740, 66, 10, 0], [400, 900, 44, 280, 1],
		// bottom-right
		[1535, 935, 120, 220, 1], [1340, 970, 78, 300, 0], [1590, 760, 64, 140, 0], [1215, 900, 42, 80, 1],
		// sparse pads for narrow (phone) crops
		[880, 18, 58, 100, 1], [655, 985, 54, 340, 0]
	];
	for (var i = 0; i < P.length; i++) {
		var pp = pad(P[i][0], P[i][1], P[i][2], P[i][3], P[i][4]).split('|');
		pads += pp[0];
		padSh += pp[1];
	}
	var flowers = lotus(205, 140, 66, 7) + lotus(1395, 150, 58, 31) + lotus(185, 830, 62, 18) + lotus(1450, 860, 70, 3) + lotus(760, 975, 34, 12);

	// little floating petals and duckweed
	var bits = '', weed = '';
	var fp = [[360, 260, 30], [1270, 250, 120], [470, 820, 200], [1180, 790, 75], [960, 70, 300]];
	for (i = 0; i < fp.length; i++) {
		bits += petal(fp[i][0], fp[i][1], 22, 8, fp[i][2]);
	}
	var wc = [[300, 330], [1300, 300], [330, 760], [1250, 760], [700, 60], [1000, 950]];
	for (i = 0; i < wc.length; i++) {
		for (var j = 0; j < 10; j++) {
			var wr = Math.pow(rnd(), 0.7) * 34, wa = rnd() * 6.283;
			weed += '<circle cx="' + Math.round(wc[i][0] + Math.cos(wa) * wr * 1.4) + '" cy="' + Math.round(wc[i][1] + Math.sin(wa) * wr) + '" r="' + r1(1.6 + rnd() * 2.2) + '"/>';
		}
	}

	var fish = koi(800, 830, 196, 230, 0.5, 0, 0.9) + // bottom centre, heading left
		koi(545, 900, 200, 150, 0.4, 2, -0.8) +
		koi(425, 470, 78, 200, -0.6, 1, -1) + // left side, swimming down
		koi(1255, 650, 250, 190, 0.6, 0, 1) + // right, below/left of the timer, heading up
		koi(1040, 250, 330, 160, -0.5, 3, -0.9) +
		koi(610, 215, 12, 140, 0.3, 2, 0.8);

	var rip = ripple(1015, 880, 18, 5) + ripple(470, 230, 14, 4) + ripple(1185, 380, 12, 4) + ripple(330, 640, 10, 4) + ripple(905, 120, 12, 4);

	var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
		'<defs>' +
		'<radialGradient id="water" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#0f3a3c"/><stop offset=".55" stop-color="#0b2d31"/><stop offset="1" stop-color="#051a1f"/></radialGradient>' +
		'<radialGradient id="pad1" cx=".45" cy=".4" r=".65"><stop offset="0" stop-color="#5e9c4c"/><stop offset=".7" stop-color="#3f7c3c"/><stop offset="1" stop-color="#2c6332"/></radialGradient>' +
		'<radialGradient id="pad2" cx=".45" cy=".4" r=".65"><stop offset="0" stop-color="#7aa94e"/><stop offset=".7" stop-color="#4f8a3e"/><stop offset="1" stop-color="#376d33"/></radialGradient>' +
		'<radialGradient id="lglow"><stop offset="0" stop-color="#ffb3cf" stop-opacity=".22"/><stop offset="1" stop-color="#ffb3cf" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="calm" gradientUnits="userSpaceOnUse" cx="1520" cy="500" r="300" gradientTransform="translate(1520 500) scale(1 .85) translate(-1520 -500)"><stop offset="0" stop-color="#03141a" stop-opacity=".7"/><stop offset=".55" stop-color="#03141a" stop-opacity=".4"/><stop offset="1" stop-color="#03141a" stop-opacity="0"/></radialGradient>' +
		'<radialGradient id="vig" cx=".5" cy=".5" r=".72"><stop offset=".6" stop-color="#010809" stop-opacity="0"/><stop offset="1" stop-color="#010809" stop-opacity=".5"/></radialGradient>' +
		'<filter id="caus" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .011" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .85  0 0 0 0 .8  0 0 0 1.6 -.75"/></filter>' +
		'<filter id="deep" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".003" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .01  0 0 0 0 .05  0 0 0 0 .05  0 0 0 2.2 -1"/></filter>' +
		'<filter id="bs" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>' +
		'<filter id="bk" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".7"/></filter>' +
		'<filter id="bl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>' +
		'<filter id="bg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>' +
		defs +
		'</defs>' +
		'<rect width="1600" height="1000" fill="url(#water)"/>' +
		'<rect width="1600" height="1000" filter="url(#deep)" opacity=".8"/>' +
		// soft sky reflections on the surface
		'<g fill="#5fa5a0" filter="url(#bg)" opacity=".16">' +
		'<ellipse cx="700" cy="520" rx="380" ry="150" transform="rotate(-18 700 520)"/>' +
		'<ellipse cx="1080" cy="760" rx="260" ry="90" transform="rotate(-18 1080 760)"/>' +
		'<ellipse cx="420" cy="300" rx="240" ry="80" transform="rotate(-18 420 300)"/>' +
		'</g>' +
		'<rect width="1600" height="1000" filter="url(#caus)" opacity=".16"/>' +
		// fish below the surface
		fish +
		// surface: ripples, pads, flowers
		'<g fill="none" stroke="#c4ece0">' + rip + '</g>' +
		'<g fill="#010a0b" opacity=".45" filter="url(#bs)">' + padSh + '</g>' +
		pads +
		'<g fill="#8fc45e" opacity=".75">' + weed + '</g>' +
		'<path d="' + bits + '" fill="#f6b6cb" stroke="#d76c96" stroke-opacity=".4" stroke-width=".8" opacity=".9"/>' +
		flowers +
		// calm zone behind the timer + vignette
		'<rect width="1600" height="1000" fill="url(#calm)"/>' +
		'<rect width="1600" height="1000" fill="url(#vig)"/>' +
		'</svg>';

	var S = 'html.jlt-koi-pond ';
	var PANEL = 'rgba(6,30,32,0.6)';

	var css = [
		S + '.mywindow:not(.fixed),' + S + '.popup,' + S + '.dialog{background-color:' + PANEL + ' !important;box-shadow:0 0.2em 1.4em rgba(0,0,0,0.45),inset 0 0 0 1px rgba(170,230,210,0.14) !important}',
		S + '.dialog{background-color:rgba(5,26,28,0.8) !important}',
		S + '#leftbar{background-color:rgba(4,24,26,0.64) !important;box-shadow:inset -1px 0 0 rgba(170,230,210,0.14)}',
		S + '#leftbar::before,' + S + '.mywindow::before{box-shadow:none !important}',
		S + '#gray{background-color:rgba(1,10,12,0.55) !important}',
		S + '#leftbar #logo{background:radial-gradient(ellipse at 78% 30%,rgba(255,245,235,0.35),rgba(255,245,235,0) 45%),linear-gradient(150deg,#f07a3e,#d9482a 60%,#a8321c) !important;color:#fff !important;text-shadow:0 0.04em 0.25em rgba(80,15,5,0.7)}',
		S + 'html:not(.m) .mybutton:hover,' + S + '.mybutton:active,' + S + '.tab:active{background-color:rgba(170,235,210,0.14) !important}',
		S + '.tab.enable,' + S + '.cntbar,' + S + '.selected,' + S + '.sflt div.sgrp{background-color:rgba(236,110,70,0.32) !important}',
		S + '.mybutton.enable{background-color:rgba(236,110,70,0.45) !important}',
		S + 'table.opttable tr th:first-child,' + S + 'div.helptable h2,' + S + 'div.helptable h3{background-color:rgba(70,150,110,0.3) !important}',
		S + 'input:disabled,' + S + 'table.opttable tr:nth-child(odd) td:first-child,' + S + 'div.helptable li:nth-child(odd){background:rgba(255,255,255,0.05) !important}',
		S + 'html:not(.m) .times:hover,' + S + 'html:not(.m) .click:hover,' + S + '.times:active,' + S + '.click:active,' + S + 'html:not(.m) #avgstr .click:hover{background-color:rgba(170,235,210,0.16) !important}',
		S + 'textarea{background-color:rgba(255,255,255,0.06) !important}',
		S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background:rgba(150,220,200,0.13) !important;color:#eafaf4 !important}',
		S + 'select>option{color:#000;background:#fff}',
		S + '.table,' + S + '.table td,' + S + '.table th{border-color:rgba(170,230,210,0.17) !important}',
		S + '.click{color:#ffb3c8}',
		S + '.times.pb{color:#ffd877 !important}',
		S + '#lcd,' + S + '#multiphase{color:#f3fbf7;text-shadow:0 0 0.06em rgba(1,10,12,0.9),0 0 0.25em rgba(2,14,16,0.85),0 0 0.7em rgba(255,170,200,0.22)}',
		S + '#avgstr,' + S + '#scrambleTxt{text-shadow:0 0 0.15em rgba(1,10,12,0.9),0 0 0.5em rgba(2,14,16,0.7)}',
		S + '.jltheme-tile.active{outline-color:#ffb3c8}',
		'@media (max-aspect-ratio:1/1){html.jlt-koi-pond.jlt-on{background-position:50% center !important}}'
	].join('');

	jlThemes.register({
		id: 'koi-pond',
		name: 'Koi Pond',
		palette: '#eff#122#234#356#fbc#fff#d43#fd7',
		background: svg,
		css: css,
		timer: '#f9b#9ec#fe9#6c9#f9b'
	});
})();
