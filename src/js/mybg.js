"use strict";

// jlTimer "Your images": the user's own pictures as enhanced themes, at full strength, with matching colors.
// They show up in the Enhanced theme gallery (About → Enhanced themes, Options → color) next to the built-in themes.
// Storage (IndexedDB 'sessions' store via storage.setKey; never in the export file, kept across imports):
//   'jlBgMeta'     {v: 1, list: [entry, ...]} in gallery order
//   'jlBg:<id>'    the picture (Blob; downscaled to <= 2560 px and re-encoded when it was bigger)
//   'jlBg:<id>:t'  a small thumbnail Blob for the gallery tiles
// entry: {id, name, w, h, palette: '#rgb' x 8 (font, background, panels, buttons, links, logo, logo background, PBs),
//         clusters: [[r, g, b, share], ...], fit: 'cover'|'contain'|'tile', pos: [x%, y%], blur: 0..20 (px), dim: -60..60 (%), added}
// The chosen picture is the ordinary jlTheme property, value 'img-<id>'. If the picture is missing (another browser,
// cleared site data) the theme falls back to Sakura.
var jlBgImages = execMain(function() {
	var META_KEY = 'jlBgMeta';
	var MAX_IMAGES = 12;
	var MAX_SIDE = 2560;
	var KEEP_BYTES = 1500000; // a small enough upload is stored as it is
	var THUMB_SIDE = 360;
	var FALLBACK = 'sakura';
	var NOTE = 'Your pictures stay in this browser only (not in exports). Add with the tile, drop a file here or paste an image. Up to ' + MAX_IMAGES + '.';

	var supported = !!((window.indexedDB || window.webkitIndexedDB) && window.Blob && window.URL && URL.createObjectURL &&
		document.createElement('canvas').getContext);
	var list = null; // entries once loaded from IndexedDB
	var loading = null;
	var urls = {}; // id -> object URL of the picture
	var thumbs = {}; // id -> object URL of the thumbnail
	var activeId = null; // picture on the page now
	var wantId = null; // 'img-...' requested before the list was loaded
	var layer = null;
	var sections = []; // the "Your images" blocks (About and Options)
	var editor = null;
	var editId = null;
	var saveTimer = 0;
	var cssTimer = 0;

	// ---------- colors ----------
	function clamp(v, lo, hi) {
		return Math.max(lo, Math.min(hi, v));
	}

	function rgb2hsl(c) {
		var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var l = (max + min) / 2, h = 0, s = 0, d = max - min;
		if (d > 1e-6) {
			s = d / (1 - Math.abs(2 * l - 1));
			h = max == r ? ((g - b) / d + 6) % 6 : max == g ? (b - r) / d + 2 : (r - g) / d + 4;
			h *= 60;
		}
		return [h, clamp(s, 0, 1), l];
	}

	function hsl2rgb(h, s, l) {
		var c = (1 - Math.abs(2 * l - 1)) * s;
		var x = c * (1 - Math.abs((h / 60) % 2 - 1));
		var m = l - c / 2;
		var k = Math.floor(((h % 360) + 360) % 360 / 60);
		var rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
		return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
	}

	// the kernel keeps colors as 12-bit '#rgb', so palettes are built and checked at that precision
	function quant(c) {
		return [0, 1, 2].map(function(i) {
			return Math.round(clamp(c[i], 0, 255) / 17) * 17;
		});
	}

	function hex3(c) {
		c = quant(c);
		return '#' + [0, 1, 2].map(function(i) {
			return (c[i] / 17).toString(16);
		}).join('');
	}

	function parseHex(s) {
		var m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
		if (m) {
			return [parseInt(m[1], 16) * 17, parseInt(m[2], 16) * 17, parseInt(m[3], 16) * 17];
		}
		m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
		return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
	}

	function lum(c) {
		var v = [0, 1, 2].map(function(i) {
			var x = c[i] / 255;
			return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
	}

	function contrast(a, b) {
		var la = lum(a), lb = lum(b);
		return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
	}

	function mix(a, b, t) { // t of a, 1 - t of b
		return [0, 1, 2].map(function(i) {
			return a[i] * t + b[i] * (1 - t);
		});
	}

	function rgba(c, a) {
		return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (Math.round(a * 100) / 100) + ')';
	}

	// move the lightness of hsl color fg away from the backgrounds until it reaches ratio against all of them
	function readable(fg, bgs, ratio) {
		var h = fg[0], s = fg[1], l = fg[2];
		var bgLum = bgs.reduce(function(acc, b) {
			return acc + lum(b);
		}, 0) / bgs.length;
		var step = bgLum > 0.18 ? -0.01 : 0.01;
		for (var i = 0; i < 120; i++) {
			var c = quant(hsl2rgb(h, s, l));
			var worst = Math.min.apply(null, bgs.map(function(b) {
				return contrast(c, b);
			}));
			if (worst >= ratio || l <= 0 || l >= 1) {
				return c;
			}
			l = clamp(l + step, 0, 1);
		}
		return quant(hsl2rgb(h, s, l));
	}

	// k-means on the downscaled picture's pixels; returns [[r, g, b, share], ...] biggest first
	function kmeans(px, k) {
		if (!px.length) {
			return [[128, 128, 128, 1]];
		}
		px.sort(function(a, b) {
			return lum(a) - lum(b);
		});
		var cen = [];
		for (var i = 0; i < k; i++) {
			cen.push(px[Math.floor((i + 0.5) / k * px.length)].slice(0, 3));
		}
		var asg = new Array(px.length);
		for (var it = 0; it < 12; it++) {
			var sum = cen.map(function() {
				return [0, 0, 0, 0];
			});
			for (var p = 0; p < px.length; p++) {
				var best = 0, bd = 1e9;
				for (var j = 0; j < k; j++) {
					var dr = px[p][0] - cen[j][0], dg = px[p][1] - cen[j][1], db = px[p][2] - cen[j][2];
					var d = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
					if (d < bd) {
						bd = d;
						best = j;
					}
				}
				asg[p] = best;
				sum[best][0] += px[p][0];
				sum[best][1] += px[p][1];
				sum[best][2] += px[p][2];
				sum[best][3]++;
			}
			for (var j = 0; j < k; j++) {
				if (sum[j][3]) {
					cen[j] = [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3], sum[j][3] / px.length];
				} else {
					cen[j][3] = 0;
				}
			}
		}
		return cen.filter(function(c) {
			return c[3] > 0;
		}).map(function(c) {
			return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(c[3] * 1000) / 1000];
		}).sort(function(a, b) {
			return b[3] - a[3];
		});
	}

	// the 8 csTimer colors for a picture, readable on its translucent panels
	function derivePalette(clusters) {
		var meanLum = 0;
		clusters.forEach(function(c) {
			meanLum += lum(c) * c[3];
		});
		var dark = meanLum < 0.2;
		var dom = rgb2hsl(clusters[0]);
		var vivid = null, vScore = -1, second = null, sScore = -1;
		clusters.forEach(function(c) {
			var h = rgb2hsl(c);
			var sc = h[1] * (0.3 + Math.sqrt(c[3])) * (h[2] > 0.15 && h[2] < 0.88 ? 1 : 0.3);
			if (sc > vScore) {
				vScore = sc;
				vivid = h;
			}
		});
		clusters.forEach(function(c) {
			var h = rgb2hsl(c);
			var dh = Math.abs(((h[0] - vivid[0]) % 360 + 540) % 360 - 180);
			var sc = h[1] * Math.sqrt(c[3]) * (dh > 35 ? 1 : 0);
			if (h[1] > 0.2 && sc > sScore) {
				sScore = sc;
				second = h;
			}
		});
		var bh = dom[0], bs = Math.min(dom[1], 0.45);
		var ah = vivid[0], as = vivid[1] < 0.12 ? vivid[1] : clamp(vivid[1], 0.35, 0.8);
		var ph = second ? second[0] : (ah + 30) % 360, ps = second ? clamp(second[1], 0.45, 0.85) : clamp(as + 0.2, 0.3, 0.85);
		var back, board, button, font, link, logo, logoback, pbs;
		if (dark) {
			back = quant(hsl2rgb(bh, Math.min(bs, 0.4), 0.09));
			board = quant(hsl2rgb(bh, Math.min(bs, 0.35), 0.14));
			button = quant(hsl2rgb(ah, Math.min(as, 0.5), 0.3));
			font = [bh, Math.min(bs, 0.25), 0.93];
			link = [ah, as, 0.72];
			logo = quant(hsl2rgb(ah, 0.3, 0.97));
			logoback = [ah, clamp(as, 0, 0.7), 0.38];
			pbs = [ph, ps, 0.7];
		} else {
			back = quant(hsl2rgb(bh, bs, 0.93));
			board = quant(hsl2rgb(bh, bs, 0.97));
			button = quant(hsl2rgb(ah, Math.min(as, 0.6), 0.86));
			font = [bh, Math.min(bs, 0.4), 0.17];
			link = [ah, as, 0.36];
			logo = quant(hsl2rgb(ah, 0.3, 0.98));
			logoback = [ah, clamp(as, 0, 0.7), 0.42];
			pbs = [ph, ps, 0.4];
		}
		font = readable(font, [board, back, button], 7);
		link = readable(link, [board, back], 4.5);
		pbs = readable(pbs, [board], 4.5);
		logoback = readable(logoback, [logo], 4.5);
		return [font, back, board, button, link, logo, logoback, pbs].map(hex3).join('');
	}

	function shadeOf(dim) { // color and strength of the dim/brighten overlay
		return dim < 0 ? [[0, 0, 0], -dim / 100] : [[255, 255, 255], dim / 100];
	}

	function currentColors() {
		return ['col-font', 'col-back', 'col-board', 'col-button', 'col-link'].map(function(k) {
			return parseHex(kernel.getProp(k));
		});
	}

	// lowest panel opacity that keeps font and link color at 4.5:1 over every big area of the (dimmed) picture
	function panelInfo(e, cols) {
		var font = cols[0], board = cols[2], link = cols[4];
		var sh = shadeOf(e.dim);
		var areas = (e.clusters || []).filter(function(c) {
			return c[3] >= 0.02;
		}).map(function(c) {
			return mix(sh[0], c, sh[1]);
		});
		var worstAt = function(a) {
			var w = 99;
			areas.forEach(function(c) {
				var eff = quant(mix(board, c, a));
				w = Math.min(w, contrast(font, eff), contrast(link, eff));
			});
			return w;
		};
		var a = 0.5;
		while (a < 0.94 && worstAt(a) < 4.5) {
			a += 0.02;
		}
		return { alpha: a, contrast: Math.round(worstAt(a) * 100) / 100 };
	}

	function genCss(e) {
		var c = currentColors();
		var font = c[0], back = c[1], board = c[2], button = c[3], link = c[4];
		var info = panelInfo(e, c);
		var dark = lum(board) < 0.2;
		var S = 'html.jlt-img ';
		var glow = '0 0 2px ' + rgba(back, 1) + ',0 0 10px ' + rgba(back, 0.95) + ',0 0 26px ' + rgba(back, 0.85);
		return [
			'html.jlt-on.jlt-img{background-color:' + rgba(back, 1) + ' !important;background-image:none !important}',
			S + '.mywindow:not(.fixed),' + S + '#leftbar{background-color:' + rgba(board, info.alpha) + ' !important;border-color:' + rgba(link, 0.3) + ' !important}',
			S + '.dialog,' + S + '.popup{background-color:' + rgba(board, Math.max(info.alpha, 0.9)) + ' !important;border-color:' + rgba(link, 0.4) + ' !important}',
			S + '.mywindow::before,' + S + '.popup,' + S + '.dialog,' + S + '#leftbar::before{box-shadow:0 .3em 1.4em rgba(0,0,0,' + (dark ? 0.4 : 0.18) + ') !important}',
			S + '.mybutton.enable,' + S + '.tab.enable,' + S + '.cntbar,' + S + '.selected{background-color:' + rgba(button, 0.8) + ' !important}',
			'html.jlt-img:not(.m) .mybutton:hover{background-color:' + rgba(button, 0.55) + ' !important}',
			S + 'select,' + S + 'input[type="button"],' + S + 'input[type="text"]{background-color:' + rgba(back, 0.82) + ' !important;border-color:' + rgba(link, 0.45) + ' !important}',
			S + '#gray{background-color:rgba(0,0,0,' + (dark ? 0.45 : 0.25) + ') !important}',
			S + '#lcd,' + S + '#multiphase{text-shadow:' + glow + '}',
			S + '#avgstr{text-shadow:0 0 3px ' + rgba(back, 1) + ',0 0 10px ' + rgba(back, 0.9) + '}',
			S + '#logo{box-shadow:0 .15em .6em rgba(0,0,0,.25)}',
			S + '.jltheme-tile.active{outline-color:' + rgba(link, 1) + '}',
			S + '.jlbg-ed input[type="range"]{accent-color:' + rgba(link, 1) + '}'
		].join('');
	}

	// ---------- storage ----------
	function load() {
		if (!loading) {
			loading = supported ? storage.getKey(META_KEY).then(function(meta) {
				list = (meta && $.isArray(meta['list']) ? meta['list'] : []).filter(function(e) {
					return e && /^[a-z0-9]+$/.test(e['id']) && /^(#[0-9a-fA-F]{3}){8}$/.test(e['palette']);
				});
				return list;
			}, function() {
				list = [];
				return list;
			}) : Promise.resolve(list = []);
		}
		return loading;
	}

	function saveMeta() {
		clearTimeout(saveTimer);
		saveTimer = 0;
		return storage.setKey(META_KEY, { 'v': 1, 'list': list });
	}

	function saveSoon() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(saveMeta, 400);
	}

	function find(id) {
		for (var i = 0; list && i < list.length; i++) {
			if (list[i]['id'] == id) {
				return list[i];
			}
		}
		return null;
	}

	function blobUrl(id, thumb) {
		var cache = thumb ? thumbs : urls;
		if (cache[id]) {
			return Promise.resolve(cache[id]);
		}
		return storage.getKey('jlBg:' + id + (thumb ? ':t' : '')).then(function(blob) {
			if (!blob || !window.Blob || !(blob instanceof Blob)) {
				return null;
			}
			cache[id] = cache[id] || URL.createObjectURL(blob);
			return cache[id];
		});
	}

	// ---------- the page background ----------
	function ensureLayer() {
		if (!layer) {
			layer = $('<div id="jlbg" aria-hidden="true"><div class="jlbg-img"></div><div class="jlbg-shade"></div></div>').prependTo('body');
		}
		return layer;
	}

	// fit, focal point, blur and dim on a background box; scale shrinks blur and tile size for the small preview
	function layout(box, e, scale) {
		var blur = e['blur'] * scale;
		var pad = blur ? -Math.ceil(blur * 2) + 'px' : '0';
		box.children('.jlbg-img').css({
			'background-size': e['fit'] == 'tile' ? (scale == 1 ? 'auto' : Math.round(e['w'] * scale) + 'px auto') : e['fit'],
			'background-repeat': e['fit'] == 'tile' ? 'repeat' : 'no-repeat',
			'background-position': e['pos'][0] + '% ' + e['pos'][1] + '%',
			'filter': blur ? 'blur(' + (Math.round(blur * 10) / 10) + 'px)' : 'none',
			'top': pad,
			'left': pad,
			'right': pad,
			'bottom': pad
		});
		var sh = shadeOf(e['dim']);
		box.children('.jlbg-shade').css('background-color', rgba(sh[0], sh[1]));
	}

	function updateCss() {
		var e = find(activeId);
		if (e) {
			jlThemes.styleTag().text(genCss(e));
		}
	}

	function show(e) {
		var html = $('html');
		html.addClass('jlt-on jlt-img');
		ensureLayer().show();
		layout(layer, e, 1);
		var changed = activeId != e['id'];
		activeId = e['id'];
		updateCss();
		if (changed) {
			layer.children('.jlbg-img').css('background-image', 'none');
		}
		blobUrl(e['id']).then(function(url) {
			if (activeId != e['id']) {
				return;
			}
			if (!url) {
				fallback();
				return;
			}
			layer.children('.jlbg-img').css('background-image', 'url("' + url + '")');
		});
	}

	function hide() {
		activeId = null;
		layer && layer.hide().children('.jlbg-img').css('background-image', 'none');
	}

	function fallback() {
		hide();
		logohint.push('Your background picture is not in this browser; switched to ' + FALLBACK);
		kernel.setProp('jlTheme', FALLBACK); // 'modify': takes over Sakura's colors too
	}

	// called by jlThemes.apply for every jlTheme change
	function apply(id, signalType) {
		var m = /^img-([a-z0-9]+)$/.exec(id || '');
		if (!m) {
			wantId = null;
			hide();
			renderActive();
			return;
		}
		if (!list) {
			wantId = [id, signalType];
			$('html').addClass('jlt-on jlt-img');
			load().then(function() {
				if (wantId && wantId[0] == id && kernel.getProp('jlTheme') == id) {
					var w = wantId;
					wantId = null;
					jlThemes.refresh();
					apply(w[0], w[1]);
				}
			});
			return;
		}
		var e = find(m[1]);
		if (!e) {
			setTimeout(fallback, 0);
			return;
		}
		if (signalType == 'modify') {
			jlThemes.setColors(e['palette']);
		}
		show(e);
		renderActive();
	}

	// ---------- adding pictures ----------
	function decode(file) {
		return new Promise(function(resolve, reject) {
			var img = new Image();
			var url = URL.createObjectURL(file);
			img.onload = function() {
				resolve(img);
				setTimeout(function() {
					URL.revokeObjectURL(url);
				}, 1000);
			};
			img.onerror = function() {
				URL.revokeObjectURL(url);
				reject(new Error('decode'));
			};
			img.src = url;
		});
	}

	function canvasFrom(src, w, h, fill) {
		var cv = document.createElement('canvas');
		cv.width = w;
		cv.height = h;
		var ctx = cv.getContext('2d');
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fillRect(0, 0, w, h);
		}
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(src, 0, 0, w, h);
		return cv;
	}

	function toBlob(cv, type, q) {
		return new Promise(function(resolve) {
			if (cv.toBlob) {
				cv.toBlob(resolve, type, q);
			} else {
				resolve(null);
			}
		});
	}

	function encode(img, w, h) {
		var cv = canvasFrom(img, w, h);
		return toBlob(cv, 'image/webp', 0.85).then(function(b) {
			if (b && b.type == 'image/webp') {
				return b;
			}
			return toBlob(canvasFrom(img, w, h, '#fff'), 'image/jpeg', 0.85);
		});
	}

	function newId() {
		var id;
		do {
			id = (+new Date).toString(36) + Math.floor(Math.random() * 1296).toString(36);
		} while (find(id));
		return id;
	}

	function nameOf(file) {
		var n = $.trim(String(file.name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' '));
		if (!n || /^image$/i.test(n)) {
			n = 'Picture ' + (list.length + 1);
		}
		return n.slice(0, 40);
	}

	function processFile(file) {
		return decode(file).then(function(img) {
			var w = img.naturalWidth, h = img.naturalHeight;
			if (!w || !h) {
				throw new Error('decode');
			}
			var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
			var tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
			var keep = scale == 1 && file.size <= KEEP_BYTES && /^image\/(jpeg|png|webp|gif)$/.test(file.type);
			var full = keep ? Promise.resolve(file) : encode(img, tw, th);
			var ts = Math.min(1, THUMB_SIDE / Math.max(tw, th));
			var thumb = toBlob(canvasFrom(img, Math.max(1, Math.round(tw * ts)), Math.max(1, Math.round(th * ts)), '#fff'), 'image/jpeg', 0.8);
			var ps = 48 / Math.max(w, h);
			var small = canvasFrom(img, Math.max(1, Math.round(w * ps)), Math.max(1, Math.round(h * ps)));
			var data = small.getContext('2d').getImageData(0, 0, small.width, small.height).data;
			var px = [];
			for (var i = 0; i < data.length; i += 4) {
				if (data[i + 3] >= 128) {
					px.push([data[i], data[i + 1], data[i + 2]]);
				}
			}
			var clusters = kmeans(px, 6);
			return Promise.all([full, thumb]).then(function(b) {
				if (!b[0] || !b[1]) {
					throw new Error('encode');
				}
				var e = {
					'id': newId(),
					'name': nameOf(file),
					'w': tw,
					'h': th,
					'bytes': b[0].size,
					'palette': derivePalette(clusters),
					'clusters': clusters,
					'fit': 'cover',
					'pos': [50, 50],
					'blur': 0,
					'dim': 0,
					'added': +new Date
				};
				return storage.setKey('jlBg:' + e['id'], b[0]).then(function() {
					return storage.setKey('jlBg:' + e['id'] + ':t', b[1]);
				}).then(function() {
					return e;
				}, function() {
					storage.delKey('jlBg:' + e['id']);
					throw new Error('space');
				});
			});
		});
	}

	function message(text) {
		sections.forEach(function(s) {
			s.find('.jlbg-msg').text(text || '');
		});
	}

	function addFiles(files, where) {
		files = $.grep(files || [], function(f) {
			return f && /^image\//.test(f.type || '');
		});
		if (!files.length) {
			message('That is not a picture. Use a JPEG, PNG, WebP or GIF file.');
			return Promise.resolve();
		}
		if (!supported) {
			message('This browser cannot store pictures for jlTimer.');
			return Promise.resolve();
		}
		var added = null;
		var problem = '';
		var idx = 0;
		message('Adding...');
		var next = function() {
			if (idx >= files.length) {
				return;
			}
			if (list.length >= MAX_IMAGES) {
				problem = 'You have ' + MAX_IMAGES + ' pictures, the most jlTimer keeps. Delete one to add another.';
				return;
			}
			var file = files[idx++];
			return processFile(file).then(function(e) {
				list.push(e);
				added = e;
				return saveMeta();
			}, function(err) {
				problem = err && err.message == 'space' ? 'Not enough storage space in this browser for "' + (file.name || 'the picture') + '".' :
					'Could not read "' + (file.name || 'the picture') + '". Try a JPEG or PNG file.';
			}).then(next);
		};
		return load().then(next).then(function() {
			message(problem);
			if (added) {
				jlThemes.refresh();
				render();
				kernel.setProp('jlTheme', 'img-' + added['id']);
				openEditor(added['id'], where);
			}
		});
	}

	// ---------- gallery ----------
	function esc(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function options() {
		var vals = [], strs = [];
		(list || []).forEach(function(e) {
			vals.push('img-' + e['id']);
			strs.push('Your image: ' + esc(e['name']));
		});
		return [vals, strs];
	}

	function section(where) {
		var div = $('<div class="jlbg-mine">').attr('data-where', where).append(
			where == 'about' ? $('<div class="jltheme-sub">').text('Your images') : $('<div class="jlbg-label">').text('Your images'),
			$('<div class="jltheme-gallery jlbg-tiles">'),
			$('<div class="jlbg-note">').text(NOTE),
			$('<div class="jlbg-msg" role="status" aria-live="polite">'));
		sections.push(div);
		if (list) {
			renderOne(div);
		} else {
			load().then(render);
		}
		return div;
	}

	function tileFor(e) {
		var cols = e['palette'].match(/#[0-9a-fA-F]{3}/g);
		var tile = $('<div class="jltheme-tile jlbg-tile click" role="button" tabindex="0">').attr({
			'data-img': e['id'],
			'title': e['name']
		}).append(
			$('<span class="jltheme-name">').text(e['name']).css({ color: cols[5], 'background-color': cols[6] }),
			$('<span class="jlbg-edit click" role="button" tabindex="0">').text('Edit').attr('title', 'Adjust, rename or delete'));
		if (thumbs[e['id']]) {
			tile.css('background-image', 'url("' + thumbs[e['id']] + '")');
		} else {
			tile.css('background-color', cols[1]);
			blobUrl(e['id'], true).then(function(url) {
				url && $('.jlbg-tile[data-img="' + e['id'] + '"]').css('background-image', 'url("' + url + '")');
			});
		}
		return tile;
	}

	function renderOne(div) {
		var tiles = div.children('.jlbg-tiles').empty();
		if (!supported) {
			div.find('.jlbg-note').text('This browser cannot store pictures for jlTimer.');
			return;
		}
		(list || []).forEach(function(e) {
			tiles.append(tileFor(e));
		});
		var full = list && list.length >= MAX_IMAGES;
		tiles.append($('<label class="jltheme-tile jlbg-add click">').toggleClass('jlbg-full', !!full).attr('title', full ? 'Delete a picture to add another' : 'Add a picture from this device').append(
			$('<input type="file" accept="image/*" multiple class="jlbg-file">').prop('disabled', !!full),
			$('<span>').text(full ? MAX_IMAGES + ' of ' + MAX_IMAGES : '+ Add image')));
		renderActive();
	}

	function render() {
		sections.forEach(renderOne);
	}

	function renderActive() {
		var cur = kernel.getProp('jlTheme');
		$('.jlbg-tile').each(function() {
			$(this).toggleClass('active', 'img-' + $(this).attr('data-img') == cur);
		});
	}

	// ---------- editor ----------
	function rangeRow(cls, label, min, max, step) {
		return $('<label class="jlbg-range">').append($('<span class="jlbg-rl">').text(label),
			$('<input type="range">').addClass(cls).attr({ min: min, max: max, step: step }), $('<span class="jlbg-rv">'));
	}

	function buildEditor() {
		var fit = $('<span class="jlbg-seg">');
		[['cover', 'Cover'], ['contain', 'Contain'], ['tile', 'Tile']].forEach(function(f) {
			fit.append($('<input type="button" class="jlbg-fit">').attr('data-fit', f[0]).val(f[1]));
		});
		var grid = $('<span class="jlbg-grid" title="Focal point">');
		for (var i = 0; i < 9; i++) {
			grid.append($('<input type="button" class="jlbg-pt" value="">').attr({ 'data-x': (i % 3) * 50, 'data-y': Math.floor(i / 3) * 50, 'aria-label': 'Focus ' + ['top', 'middle', 'bottom'][Math.floor(i / 3)] + ' ' + ['left', 'center', 'right'][i % 3] }));
		}
		editor = $('<div class="jlbg-ed">').append(
			$('<div class="jlbg-prev" title="Tap or drag to set the focal point"><div class="jlbg-img"></div><div class="jlbg-shade"></div><div class="jlbg-dot"></div></div>'),
			$('<div class="jlbg-ctl">').append(
				$('<label class="jlbg-row">').append($('<span class="jlbg-rl">').text('Name'), $('<input type="text" class="jlbg-name" maxlength="40">')),
				$('<div class="jlbg-row">').append($('<span class="jlbg-rl">').text('Fit'), fit),
				$('<div class="jlbg-row">').append($('<span class="jlbg-rl">').text('Focus'), grid, $('<span class="jlbg-hint">').text('or tap the preview')),
				rangeRow('jlbg-blur', 'Blur', 0, 20, 1),
				rangeRow('jlbg-dim', 'Dim / brighten', -60, 60, 5),
				$('<div class="jlbg-row">').append($('<span class="jlbg-rl">').text('Colors'), $('<span class="jlbg-sw">'),
					$('<input type="button" class="jlbg-usecol">').val('Use picture colors')),
				$('<div class="jlbg-row jlbg-btns">').append(
					$('<input type="button" class="jlbg-del">').val('Delete'),
					$('<input type="button" class="jlbg-done">').val('Done'))));
	}

	function syncEditor() {
		var e = find(editId);
		if (!editor || !e) {
			return;
		}
		var vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
		var prev = editor.find('.jlbg-prev');
		var em = parseFloat(prev.css('font-size')) || 14;
		// the page's shape: 16em wide on landscape screens, 10em tall on portrait ones (phones)
		prev.css({ 'aspect-ratio': vw + ' / ' + vh, 'width': Math.round(vw >= vh ? 16 * em : 10 * em * vw / vh) + 'px' });
		var pw = prev.width() || 200;
		prev.css('background-color', e['palette'].substr(4, 4));
		layout(prev, e, pw / vw);
		prev.find('.jlbg-dot').css({ left: e['pos'][0] + '%', top: e['pos'][1] + '%' });
		editor.find('.jlbg-fit').each(function() {
			$(this).toggleClass('jlbg-on', $(this).attr('data-fit') == e['fit']);
		});
		editor.find('.jlbg-pt').each(function() {
			$(this).toggleClass('jlbg-on', +$(this).attr('data-x') == e['pos'][0] && +$(this).attr('data-y') == e['pos'][1]);
		});
		editor.find('.jlbg-blur').val(e['blur']).next().text(e['blur'] + ' px');
		editor.find('.jlbg-dim').val(e['dim']).next().text(e['dim'] == 0 ? 'off' : (e['dim'] < 0 ? 'dim ' + -e['dim'] : 'brighten ' + e['dim']) + '%');
		var sw = editor.find('.jlbg-sw').empty();
		e['palette'].match(/#[0-9a-fA-F]{3}/g).forEach(function(c) {
			sw.append($('<i>').css('background-color', c));
		});
	}

	// the dialog parks closed contents off-screen, so ':visible' is not enough
	function onScreen(s) {
		var r = s[0].getBoundingClientRect();
		return r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
	}

	function shownSection() {
		return $.grep(sections, onScreen)[0] || null;
	}

	function openEditor(id, where) {
		var e = find(id);
		if (!e) {
			return;
		}
		editor || buildEditor();
		editId = id;
		// open in the gallery that was used (Options or About)
		var target = where && where.length ? where : shownSection() || sections[0];
		if (!target) {
			return;
		}
		editor.insertAfter(target.children('.jlbg-tiles'));
		editor.find('.jlbg-name').val(e['name']);
		blobUrl(id).then(function(url) {
			url && editId == id && editor.find('.jlbg-prev .jlbg-img').css('background-image', 'url("' + url + '")');
		});
		syncEditor();
		$('.jlbg-tile').removeClass('editing').filter('[data-img="' + id + '"]').addClass('editing');
	}

	function closeEditor() {
		if (saveTimer) {
			saveMeta();
		}
		editId = null;
		editor && editor.detach();
		$('.jlbg-tile').removeClass('editing');
	}

	// an adjustment changed: preview, page background (if this is the theme on now), save soon
	function adjusted(e) {
		syncEditor();
		if (activeId == e['id']) {
			layout(layer, e, 1);
			clearTimeout(cssTimer);
			cssTimer = setTimeout(updateCss, 30);
		}
		saveSoon();
	}

	function deleteImage(id) {
		var e = find(id);
		if (!e || !$.confirm('Delete the picture "' + e['name'] + '"? It is removed from this browser.')) {
			return;
		}
		closeEditor();
		list.splice(list.indexOf(e), 1);
		saveMeta();
		storage.delKey('jlBg:' + id);
		storage.delKey('jlBg:' + id + ':t');
		var wasOn = kernel.getProp('jlTheme') == 'img-' + id;
		jlThemes.refresh();
		if (wasOn) {
			hide();
			kernel.setProp('jlTheme', FALLBACK);
		}
		[urls, thumbs].forEach(function(c) {
			c[id] && URL.revokeObjectURL(c[id]);
			delete c[id];
		});
		message('');
		render();
	}

	function setFocus(prev, ev) {
		var e = find(editId);
		var o = ev.originalEvent || ev;
		var pt = o.touches && o.touches.length ? o.touches[0] : o;
		var r = prev[0].getBoundingClientRect();
		if (!e || !r.width) {
			return;
		}
		e['pos'] = [Math.round(clamp((pt.clientX - r.left) / r.width, 0, 1) * 100), Math.round(clamp((pt.clientY - r.top) / r.height, 0, 1) * 100)];
		adjusted(e);
	}

	function fromClipboard(ev) {
		var cd = (ev.originalEvent || ev).clipboardData;
		var files = [];
		if (cd && cd.items) {
			for (var i = 0; i < cd.items.length; i++) {
				if (cd.items[i].kind == 'file' && /^image\//.test(cd.items[i].type)) {
					var f = cd.items[i].getAsFile();
					f && files.push(f);
				}
			}
		}
		return files;
	}

	function bindEvents() {
		var doc = $(document);
		// delegated: the Options dialog rebuilds its rows (and drops their jQuery handlers) when options are added
		doc.on('click', '.jlbg-tile', function(ev) {
			var id = $(this).attr('data-img');
			if ($(ev.target).closest('.jlbg-edit').length) {
				editId == id ? closeEditor() : openEditor(id, $(this).closest('.jlbg-mine'));
				return false;
			}
			kernel.setProp('jlTheme', 'img-' + id);
			if (editId && editId != id) {
				openEditor(id, $(this).closest('.jlbg-mine'));
			}
		});
		doc.on('keydown', '.jlbg-tile, .jlbg-edit', function(ev) {
			if (ev.which == 13 || ev.which == 32) {
				$(ev.target).click();
				return false;
			}
		});
		doc.on('change', '.jlbg-file', function() {
			var files = Array.prototype.slice.call(this.files || []);
			this.value = '';
			addFiles(files, $(this).closest('.jlbg-mine'));
		});
		doc.on('dragover', '.jlbg-mine', function(ev) {
			ev.preventDefault();
			$(this).addClass('jlbg-drop');
		});
		doc.on('dragleave drop', '.jlbg-mine', function() {
			$(this).removeClass('jlbg-drop');
		});
		doc.on('drop', '.jlbg-mine', function(ev) {
			ev.preventDefault();
			var dt = (ev.originalEvent || ev).dataTransfer;
			addFiles(dt ? Array.prototype.slice.call(dt.files || []) : [], $(this));
		});
		doc.on('paste', function(ev) {
			var where = shownSection();
			if (!where) {
				return;
			}
			var files = fromClipboard(ev);
			if (files.length) {
				ev.preventDefault();
				addFiles(files, where);
			}
		});
		// editor
		doc.on('click', '.jlbg-fit', function() {
			var e = find(editId);
			if (e) {
				e['fit'] = $(this).attr('data-fit');
				adjusted(e);
			}
		});
		doc.on('click', '.jlbg-pt', function() {
			var e = find(editId);
			if (e) {
				e['pos'] = [+$(this).attr('data-x'), +$(this).attr('data-y')];
				adjusted(e);
			}
		});
		doc.on('input change', '.jlbg-blur, .jlbg-dim', function() {
			var e = find(editId);
			if (e) {
				e[$(this).hasClass('jlbg-blur') ? 'blur' : 'dim'] = +$(this).val();
				adjusted(e);
			}
		});
		doc.on('input', '.jlbg-name', function() {
			var e = find(editId);
			if (e) {
				e['name'] = $(this).val().slice(0, 40);
				$('.jlbg-tile[data-img="' + e['id'] + '"]').attr('title', e['name']).children('.jltheme-name').text(e['name']);
				saveSoon();
			}
		});
		doc.on('change', '.jlbg-name', function() {
			var e = find(editId);
			if (e) {
				e['name'] = $.trim(e['name']) || 'Picture';
				$(this).val(e['name']);
				saveMeta();
				jlThemes.refresh();
				render();
			}
		});
		doc.on('keydown', '.jlbg-ed input', function(ev) {
			ev.stopPropagation(); // typing a name must not start the timer or trigger shortcuts
			if (ev.which == 13 && $(this).hasClass('jlbg-name')) {
				$(this).blur();
			}
		});
		doc.on('click', '.jlbg-usecol', function() {
			var e = find(editId);
			if (e) {
				kernel.setProp('jlTheme', 'img-' + e['id']);
				jlThemes.setColors(e['palette']);
			}
		});
		doc.on('click', '.jlbg-del', function() {
			deleteImage(editId);
		});
		doc.on('click', '.jlbg-done', closeEditor);
		var dragging = null;
		doc.on('pointerdown', '.jlbg-prev', function(ev) {
			dragging = $(this);
			setFocus(dragging, ev);
			return false;
		});
		doc.on('pointermove', function(ev) {
			dragging && setFocus(dragging, ev);
		});
		doc.on('pointerup pointercancel', function() {
			if (dragging) {
				dragging = null;
				saveMeta();
			}
		});
		$(window).on('resize', function() {
			editId && syncEditor();
		});
	}

	jlThemes.setImages({
		options: options,
		apply: apply,
		section: section
	});

	$(function() {
		bindEvents();
		// Options → color: the same "Your images" tiles under Enhanced theme (an internal property row that only shows them)
		kernel.regProp('color', 'jlBgUi', 5, section('opt'), ['']);
		kernel.regListener('jlbg', 'property', function() {
			if (activeId) {
				clearTimeout(cssTimer);
				cssTimer = setTimeout(updateCss, 0);
			}
		}, /^col-(font|back|board|button|link)$/);
		load().then(function() {
			if (list.length) {
				jlThemes.refresh();
			}
			render();
		});
	});

	return {
		// for tests and debugging
		list: function() {
			return load().then(function() {
				return JSON.parse(JSON.stringify(list));
			});
		},
		info: function(id) {
			var e = find(id);
			return e ? panelInfo(e, currentColors()) : null;
		},
		derivePalette: derivePalette,
		contrast: function(a, b) {
			return contrast(parseHex(a), parseHex(b));
		},
		addFiles: addFiles,
		MAX_IMAGES: MAX_IMAGES
	};
});
