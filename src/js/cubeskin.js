// @ts-check
"use strict";

// jlTimer cube skins: colour presets, sticker styles and body colours for the virtual cube.
//   Options > Color: "Cube skin" (writes the six colours into the existing colcube property, which stays the one
//   source of truth for colours, so custom colours keep working), "Sticker style", "Cube body" and a live preview.
// The 3D NxN renderer (twisty/twistynnn.js) reads jlCubeSkin.style() when it builds a cube, and
// puzzleFactory.restyle() pushes a change to every cube already on screen (main cube, replay) without rebuilding it.
// Defaults (Standard / Classic / Auto) are exactly the csTimer look: floating stickers with thin black outlines.
var jlCubeSkin = execMain(function() {
	// colcube order is U R F D L B; the default puts yellow on U, so the slots are the roles Y O B W R G.
	// Every preset keeps six faces apart for normal vision and for protan/deutan/tritan simulations
	// (min CIEDE2000 between any two faces; Standard itself drops to 3.8 for deutan orange/green):
	//   pastel 19.7 / 11.3   sakura 24.9 / 16.6   night 31.9 / 18.4   katana 25.8 / 15.1   contrast 25.0 / 18.8
	var PRESETS = [
		{ id: 'std', name: 'Standard', cols: '#ff0#fa0#00f#fff#f00#0d0' },
		{ id: 'pastel', name: 'Pastel', cols: '#fe7#e97#99e#fff#d67#7cc' },
		// butter, blossom pink, plum, white, deep rose, matcha
		{ id: 'sakura', name: 'Sakura', cols: '#ed7#e9c#738#fff#c34#8a8', softBody: 'white' },
		// citrine, topaz, amethyst, moonstone, garnet, emerald
		{ id: 'night', name: 'Night', cols: '#fd3#d85#43a#cef#901#076' },
		// gold, sakura pink, lacquer black, ivory, crimson, steel; the black face needs a lighter body
		{ id: 'katana', name: 'Katana', cols: '#cb2#f9d#222#eed#a12#679', body: '#54565c' },
		// mostly light/dark steps (white, grey, charcoal) plus three clear hues; pure black body so charcoal stands out
		{ id: 'mono', name: 'High contrast', cols: '#ed2#999#47f#fff#d21#333', body: '#000' }
	];

	// stickerWidth: sticker size on a cubie face of 2; round: corner rounding (fraction of the edge);
	// shade: darken faces turned away from the light; sheen: corner highlight; body: what "Auto" body means
	var STYLES = {
		classic: { name: 'Classic', stickerWidth: 1.7, round: 0, border: true, shade: 0, sheen: false, body: null },
		stickerless: { name: 'Stickerless', stickerWidth: 1.93, round: 0.13, border: false, shade: 0.13, sheen: false, body: '#1c1c1e' },
		glossy: { name: 'Glossy', stickerWidth: 1.78, round: 0.1, border: false, shade: 0.12, sheen: true, body: '#141414' },
		soft: { name: 'Soft', stickerWidth: 1.68, round: 0.24, border: false, shade: 0.08, sheen: false, body: 'plum' }
	};
	var STYLE_IDS = ['classic', 'stickerless', 'glossy', 'soft'];

	var BODIES = { black: '#141414', white: '#ebe5de', plum: '#4f2440' };
	var BODY_IDS = ['auto', 'black', 'white', 'plum', 'theme'];
	var BODY_NAMES = ['Auto', 'Black', 'White', 'Plum', 'Theme'];

	var DEFAULT_COLS = PRESETS[0].cols;

	function presetById(id) {
		for (var i = 0; i < PRESETS.length; i++) {
			if (PRESETS[i].id == id) {
				return PRESETS[i];
			}
		}
		return null;
	}

	function norm(cols) {
		return (String(cols || '').match(/#[0-9a-fA-F]{3}/g) || []).join('').toLowerCase();
	}

	function presetOf(cols) {
		cols = norm(cols);
		for (var i = 0; i < PRESETS.length; i++) {
			if (PRESETS[i].cols == cols) {
				return PRESETS[i].id;
			}
		}
		return 'custom';
	}

	// '#rgb' or '#rrggbb' -> 0xrrggbb ($.nearColor would round six digits down to the 3-digit palette)
	function toInt(hex) {
		hex = String(hex).replace('#', '');
		if (hex.length == 3) {
			hex = hex.replace(/./g, '$&$&');
		}
		return parseInt(hex, 16) || 0;
	}

	function rgbOf(n) {
		return [n >> 16 & 255, n >> 8 & 255, n & 255];
	}

	function luma(n) {
		var c = rgbOf(n);
		return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
	}

	function scaleInt(n, f) {
		var c = rgbOf(n);
		return Math.round(Math.min(255, c[0] * f)) << 16 | Math.round(Math.min(255, c[1] * f)) << 8 | Math.round(Math.min(255, c[2] * f));
	}

	// body colour (int) for a style id + body setting, or null for no body (Classic + Auto: the original look)
	function bodyColor(styleId, bodyId) {
		var st = STYLES[styleId] || STYLES.classic;
		var hex = null;
		if (bodyId == 'auto' || !bodyId) {
			var pre = presetById(kernel.getProp('jlCubeSkin', 'std'));
			hex = st.body == null ? null : (pre && (styleId == 'soft' && pre.softBody || pre.body)) || st.body;
		} else if (bodyId == 'theme') {
			hex = kernel.getProp('col-font', '#552233');
		} else {
			hex = BODIES[bodyId] || null;
		}
		if (hex && BODIES[hex]) {
			hex = BODIES[hex];
		}
		return hex && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex) ? toInt(hex) : null;
	}

	// what the renderer needs; read once per cube build or skin change, never per frame
	function style() {
		var id = kernel.getProp('jlCubeStyle', 'classic');
		var st = STYLES[id] || STYLES.classic;
		var body = bodyColor(id, kernel.getProp('jlCubeBody', 'auto'));
		var edge = null;
		if (body != null && luma(body) > 0.12) {
			// faint seams between the cubies on lighter bodies
			edge = scaleInt(body, luma(body) > 0.6 ? 0.86 : 0.72);
		}
		return {
			'id': STYLES[id] ? id : 'classic',
			'stickerWidth': st.stickerWidth,
			'round': st.round,
			'border': st.border,
			'shade': st.shade,
			'sheen': st.sheen,
			'body': body,
			'bodyEdge': edge
		};
	}

	// ---------- live preview (Options): a small cube drawn with the same rules as the renderer ----------
	var prevWrap = $('<div class="jlskin-prev">');
	var prevCanvas = $('<canvas class="jlskin-cube" width="184" height="184" aria-hidden="true">');
	var prevSwatch = $('<div class="jlskin-sw" aria-hidden="true">');
	var prevLabel = $('<span class="jlskin-name">');
	prevWrap.append($('<span class="jlskin-cap">').text('Cube preview'), prevCanvas, $('<div class="jlskin-side">').append(prevLabel, prevSwatch));

	// light (world space) shared with the renderer (lib/threemin.js jlSkinQuad)
	var LIGHT = [-0.36, 0.84, 0.4];

	function shadeHex(n, shade, lvl) {
		var f = 1 - shade * (1 - lvl / 15);
		var c = rgbOf(n);
		return 'rgb(' + Math.round(c[0] * f) + ',' + Math.round(c[1] * f) + ',' + Math.round(c[2] * f) + ')';
	}

	function quadPath(ctx, q, r) {
		ctx.beginPath();
		if (!r) {
			ctx.moveTo(q[0][0], q[0][1]);
			for (var i = 1; i < 4; i++) {
				ctx.lineTo(q[i][0], q[i][1]);
			}
			ctx.closePath();
			return;
		}
		for (var i = 0; i < 4; i++) {
			var p = q[i], pv = q[(i + 3) & 3], nx = q[(i + 1) & 3];
			var ax = p[0] + (pv[0] - p[0]) * r, ay = p[1] + (pv[1] - p[1]) * r;
			var bx = p[0] + (nx[0] - p[0]) * r, by = p[1] + (nx[1] - p[1]) * r;
			i == 0 ? ctx.moveTo(ax, ay) : ctx.lineTo(ax, ay);
			ctx.bezierCurveTo(ax + (p[0] - ax) * 0.55, ay + (p[1] - ay) * 0.55, bx + (p[0] - bx) * 0.55, by + (p[1] - by) * 0.55, bx, by);
		}
		ctx.closePath();
	}

	function drawPreview() {
		var el = /** @type {HTMLCanvasElement} */ (prevCanvas[0]);
		var dpr = Math.min(3, window.devicePixelRatio || 1);
		var css = 92;
		if (el.width != css * dpr) {
			el.width = el.height = css * dpr;
		}
		var ctx = el.getContext('2d');
		if (!ctx) {
			return;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, css, css);
		var st = style();
		var cols = (kernel.getProp('colcube') || DEFAULT_COLS).match(/#[0-9a-fA-F]{3}/g) || [];
		// isometric cube around the corner C where U, F and R meet; X/Z run back-right/back-left, Y down (per cubie)
		var e = 14, cx = 46, cy = 46.5;
		var X = [Math.cos(Math.PI / 6) * e, -e / 2], Z = [-X[0], -e / 2], Y = [0, e];
		/** @type {Array<[number, number[], number[], number[], number[]]>} */
		var faces = [
			// [colcube index, origin, u axis, v axis (per cubie), world normal]; the virtual cube starts with
			// D (white) on top, B (green) in front and L (red) on the right, so the preview shows those
			[3, [cx + 3 * Z[0], cy + 3 * Z[1]], X, [-Z[0], -Z[1]], [0, 1, 0]],
			[5, [cx + 3 * Z[0], cy + 3 * Z[1]], [-Z[0], -Z[1]], Y, [0, 0, 1]],
			[4, [cx, cy], X, Y, [1, 0, 0]]
		];
		for (var f = 0; f < 3; f++) {
			var fc = faces[f];
			var o = fc[1], u = fc[2], v = fc[3], n = fc[4];
			var lvl = Math.round((n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] + 1) * 7.5);
			var corner = function(x, y) {
				return [o[0] + u[0] * x / 2 + v[0] * y / 2, o[1] + u[1] * x / 2 + v[1] * y / 2];
			};
			if (st['body'] != null) {
				quadPath(ctx, [corner(0, 0), corner(6, 0), corner(6, 6), corner(0, 6)], 0);
				ctx.fillStyle = shadeHex(st['body'], st['shade'] ? Math.min(0.45, st['shade'] * 2.2) : 0, lvl);
				ctx.fill();
				if (st['bodyEdge'] != null) {
					ctx.strokeStyle = '#' + ('00000' + st['bodyEdge'].toString(16)).slice(-6);
					ctx.lineWidth = 0.5;
					for (var k = 0; k < 3; k++) {
						for (var m = 0; m < 3; m++) {
							quadPath(ctx, [corner(k * 2, m * 2), corner(k * 2 + 2, m * 2), corner(k * 2 + 2, m * 2 + 2), corner(k * 2, m * 2 + 2)], 0);
							ctx.stroke();
						}
					}
				}
			}
			var col = toInt(cols[fc[0]] || '#888');
			var h = st['stickerWidth'] / 2;
			for (var i = 0; i < 3; i++) {
				for (var j = 0; j < 3; j++) {
					var mx = i * 2 + 1, my = j * 2 + 1;
					var q = [corner(mx - h, my - h), corner(mx + h, my - h), corner(mx + h, my + h), corner(mx - h, my + h)];
					quadPath(ctx, q, st['round']);
					ctx.fillStyle = shadeHex(col, st['shade'], lvl);
					ctx.fill();
					if (st['border']) {
						ctx.strokeStyle = '#000';
						ctx.lineWidth = 0.6;
						ctx.stroke();
					}
					if (st['sheen']) {
						// highlight wedge from the corner nearest the top-left, as in the renderer
						var best = 0;
						for (var b = 1; b < 4; b++) {
							if (q[b][0] + q[b][1] < q[best][0] + q[best][1]) {
								best = b;
							}
						}
						var p0 = q[best], pu = q[(best + 1) & 3], pv = q[(best + 3) & 3];
						var ux = pu[0] - p0[0], uy = pu[1] - p0[1], vx = pv[0] - p0[0], vy = pv[1] - p0[1];
						ctx.beginPath();
						ctx.moveTo(p0[0] + (ux + vx) * 0.13, p0[1] + (uy + vy) * 0.13);
						ctx.lineTo(p0[0] + ux * 0.7 + vx * 0.13, p0[1] + uy * 0.7 + vy * 0.13);
						ctx.quadraticCurveTo(p0[0] + (ux + vx) * 0.3, p0[1] + (uy + vy) * 0.3, p0[0] + ux * 0.13 + vx * 0.7, p0[1] + uy * 0.13 + vy * 0.7);
						ctx.closePath();
						ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + 0.15 * lvl / 15).toFixed(3) + ')';
						ctx.fill();
					}
				}
			}
		}
		prevSwatch.empty();
		var faceNames = 'URFDLB';
		for (var s = 0; s < cols.length; s++) {
			prevSwatch.append($('<span>').css('background', cols[s]).attr('title', faceNames[s]));
		}
		var pre = presetById(kernel.getProp('jlCubeSkin', 'std'));
		prevLabel.text((pre ? pre.name : 'Custom') + ' · ' + (STYLES[st['id']] || STYLES.classic).name);
	}

	// ---------- properties ----------
	var isReg = false;

	// called by kernel.js right after "Cube" colours, so the rows sit next to them in Options > Color
	function regProps() {
		if (isReg) {
			return;
		}
		isReg = true;
		kernel.regProp('color', 'jlCubeSkin', 1, 'Cube skin', ['std',
			PRESETS.map(function(p) { return p.id; }).concat('custom'),
			PRESETS.map(function(p) { return p.name; }).concat('Custom')]);
		kernel.regProp('color', 'jlCubeStyle', 1, 'Sticker style', ['classic', STYLE_IDS,
			STYLE_IDS.map(function(id) { return STYLES[id].name; })]);
		kernel.regProp('color', 'jlCubeBody', 1, 'Cube body', ['auto', BODY_IDS, BODY_NAMES]);
		kernel.regProp('color', 'jlCubePrev', 5, prevWrap, ['']);
	}

	var restyleTid = 0;

	function restyle() {
		clearTimeout(restyleTid);
		restyleTid = setTimeout(function() {
			drawPreview();
			var pf = window['puzzleFactory'];
			pf && pf['restyle'] && pf['restyle']();
		}, 0);
	}

	// keep the colour pickers of the "Cube" row in sync after a preset wrote colcube
	function syncPickers(cols) {
		var list = String(cols || '').match(/#[0-9a-fA-F]{3}/g) || [];
		$('input.mulcolor[name="colcube"]').each(function() {
			var i = ~~$(this).attr('data') - 1;
			list[i] && $(this).val($.nearColor(list[i], 0, true));
		});
	}

	function procSignal(signal, value) {
		var key = value[0];
		if (key == 'jlCubeSkin') {
			var pre = presetById(value[1]);
			if (pre && value[2] != 'set' && norm(kernel.getProp('colcube')) != pre.cols) {
				kernel.setProp('colcube', pre.cols);
				syncPickers(pre.cols);
			}
		} else if (key == 'colcube') {
			var id = presetOf(value[1]);
			if (kernel.getProp('jlCubeSkin', 'std') != id) {
				kernel.setProp('jlCubeSkin', id);
			}
		} else if (key == 'col-font' && kernel.getProp('jlCubeBody', 'auto') != 'theme') {
			return;
		}
		restyle();
	}

	$(function() {
		regProps();
		// an existing custom colour scheme shows as "Custom" rather than "Standard"
		var id = presetOf(kernel.getProp('colcube'));
		if (kernel.getProp('jlCubeSkin', 'std') != id && (id != 'custom' || presetById(kernel.getProp('jlCubeSkin', 'std')))) {
			kernel.setProp('jlCubeSkin', id, 'set');
		}
		kernel.regListener('jlskin', 'property', procSignal, /^(?:jlCubeSkin|jlCubeStyle|jlCubeBody|colcube|col-font)$/);
		drawPreview();
	});

	return {
		style: style,
		regProps: regProps,
		presets: function() {
			return PRESETS.map(function(p) {
				return { id: p.id, name: p.name, cols: p.cols };
			});
		},
		styles: function() {
			return STYLE_IDS.slice();
		},
		drawPreview: drawPreview
	};
});
