// @ts-check
"use strict";

// jlTimer enhanced themes: a color palette, artwork for the background and optional CSS.
// Each theme lives in its own file in js/themes/ and calls jlThemes.register({...}):
//   id         'aurora' (lowercase letters, digits, dashes)
//   name       'Aurora' (shown in Options and the About gallery)
//   palette    '#fff#123#234#345#8cf#fff#123' (+ optional 8th: PBs) - font, background, panels,
//              buttons, links, logo, logo background; same format as csTimer color schemes
//   background inline '<svg ...>' artwork, or any CSS background-image value (gradients)
//   css        optional extra CSS; scope every rule with html.jlt-<id>
//   timer      optional timer colors '#f00#0d0#dd0#080#f00' (col-timer)
//   animate    optional living background: function(env) returning {frame(dt, env), resize?(env), stop?()}.
//              js/themes.js owns the canvas (fixed, behind the panels, pointer-events:none), the frame loop
//              (delta time, 30 fps on phones), the "Animated background" setting, pausing while timing or
//              while the tab is hidden, and prefers-reduced-motion. See JlThemeEnv for what env holds.
// Choosing a theme saves its palette as ordinary manual colors, so exports stay csTimer-compatible.
// The user's own pictures ("Your images", js/mybg.js) plug in through setImages(): their ids are 'img-<id>'.
var jlThemes = execMain(function() {
	/** @type {Array<JlTheme>} */
	var themes = [];
	var isReady = false;
	var styleTag = $('<style id="jltheme-style">');
	var gallery = $('<div class="jltheme-gallery">');
	var COLOR_PROPS = ['col-font', 'col-back', 'col-board', 'col-button', 'col-link', 'col-logo', 'col-logoback', 'col-pbs'];
	/** @type {ThemeImages} */
	var images = null; // js/mybg.js: {options(), apply(id, signalType), section()}
	var pendingModify = null; // a built-in theme chosen (e.g. as fallback) before its file registered

	/** @param {string} id @return {JlTheme} */
	function find(id) {
		for (var i = 0; i < themes.length; i++) {
			if (themes[i].id == id) {
				return themes[i];
			}
		}
		return null;
	}

	/** @param {JlTheme} t @return {string} */
	function backgroundCss(t) {
		var bg = $.trim(t.background || '');
		if (/^<svg/i.test(bg)) {
			return 'url("data:image/svg+xml,' + encodeURIComponent(bg) + '")';
		}
		return bg || 'none';
	}

	/** @param {JlTheme} t @return {boolean} false if the theme is invalid or already registered */
	function register(t) {
		if (!t || !/^[a-z0-9-]+$/.test(t.id) || find(t.id) || !/^(#[0-9a-fA-F]{3}){7,8}$/.test(t.palette || '')) {
			DEBUG && console.log('[themes] invalid theme', t && t.id);
			return false;
		}
		themes.push(t);
		if (isReady) { // registered after start-up (e.g. while developing a theme)
			regThemeProp();
			addTile(t);
			if (kernel.getProp('jlTheme') == t.id) {
				apply(t.id, pendingModify == t.id ? 'modify' : 'set');
			}
		}
		return true;
	}

	function regThemeProp() {
		var extra = images ? images.options() : [[], []];
		kernel.regProp('color', 'jlTheme', 1, 'Enhanced theme', ['sakura',
			['none'].concat(themes.map(function(t) { return t.id; }), extra[0]),
			['None'].concat(themes.map(function(t) { return t.name; }), extra[1])]);
	}

	/** @param {string} palette */
	function setColors(palette) {
		var cols = palette.match(/#[0-9a-fA-F]{3}/g);
		for (var i = 0; i < cols.length; i++) {
			kernel.setProp(COLOR_PROPS[i], $.nearColor(cols[i], 0, true));
		}
	}

	/** @param {string} id @param {string} signalType */
	function apply(id, signalType) {
		var html = $('html');
		themes.forEach(function(t) {
			html.removeClass('jlt-' + t.id);
		});
		html.removeClass('jlt-on jlt-img');
		var t = find(id);
		styleTag.text('');
		gallery.children().removeClass('active');
		pendingModify = !t && signalType == 'modify' ? id : null;
		if (images) {
			images.apply(id, signalType); // shows the picture for 'img-<id>', hides it otherwise
		}
		anim.setTheme(t);
		if (!t) {
			return;
		}
		html.addClass('jlt-on jlt-' + t.id);
		styleTag.text('html.jlt-on.jlt-' + t.id + '{background-image:' + backgroundCss(t) + ' !important}' + (t.css || ''));
		gallery.children('[data-id="' + t.id + '"]').addClass('active');
		if (signalType == 'modify') { // chosen by the user: take over the theme's colors
			setColors(t.palette);
			if (t.timer) {
				kernel.setProp('col-timer', t.timer);
			}
		}
	}

	// ---------- living backgrounds (theme.animate) ----------
	var anim = (function() {
		var ANIM_PROP = 'jlThemeAnim';
		/** @type {JlTheme} */
		var theme = null;
		var inst = null; // what theme.animate(env) returned
		/** @type {JlThemeEnv} */
		var env = null;
		/** @type {JQuery} */
		var canvas = null;
		var raf = 0;
		var last = 0;
		var mode = null; // property value: 'n' off, 'y' on, 'p' on, pause while timing (null until registered)
		var timing = false;
		var needResize = true;
		var fadeTimer = 0;

		function reducedMotion() {
			return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
		}

		function isPhone() {
			return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || Math.min(window.innerWidth, window.innerHeight) < 600;
		}

		/** @param {string} bg @return {Array<number>} [width, height] of the svg viewBox */
		function viewBox(bg) {
			var m = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(bg || '');
			return m ? [+m[1], +m[2]] : [1600, 1000];
		}

		function measure() {
			var el = /** @type {HTMLCanvasElement} */ (canvas[0]);
			var w = window.innerWidth;
			var h = window.innerHeight;
			var dpr = Math.min(window.devicePixelRatio || 1, 2);
			el.width = Math.round(w * dpr);
			el.height = Math.round(h * dpr);
			// the artwork is html's background with background-size:cover, centered on html's box
			var rect = document.documentElement.getBoundingClientRect();
			var bw = rect.width || w;
			var bh = Math.max(rect.height, h);
			var vb = viewBox(theme.background);
			var s = Math.max(bw / vb[0], bh / vb[1]);
			env.w = w;
			env.h = h;
			env.dpr = dpr;
			env.phone = isPhone();
			env.artScale = s;
			env.artBox = vb;
			env.artX = rect.left + (bw - vb[0] * s) / 2;
			env.artY = rect.top + (bh - vb[1] * s) / 2;
			needResize = false;
			inst.resize && inst.resize(env);
		}

		/** @param {number} now */
		function loop(now) {
			raf = requestAnimationFrame(loop);
			var dt = now - last;
			if (env.phone && dt < 30) { // 30 fps on phones
				return;
			}
			last = now;
			if (needResize) {
				measure();
			}
			inst.frame(Math.min(dt, 100) / 1000, env);
		}

		function wanted() {
			return !!(inst && mode && mode != 'n' && !(mode == 'p' && timing) && !document.hidden);
		}

		// starts or stops the frame loop to match the theme, the setting, the timer and the tab
		function update() {
			if (theme && theme.animate && mode && mode != 'n' && !inst) {
				canvas = $('<canvas id="jltheme-anim" class="jlta-off" aria-hidden="true">').prependTo('body');
				var el = /** @type {HTMLCanvasElement} */ (canvas[0]);
				env = /** @type {JlThemeEnv} */ ({ canvas: el, ctx: el.getContext('2d'), w: 0, h: 0, dpr: 1, phone: false,
					artScale: 1, artBox: [1600, 1000], artX: 0, artY: 0,
					art: function(x, y) {
						return [env.artX + x * env.artScale, env.artY + y * env.artScale];
					}
				});
				try {
					inst = theme.animate(env);
				} catch (e) {
					DEBUG && console.log('[themes] animate failed', e);
				}
				if (!inst) {
					canvas.remove();
					canvas = null;
					return;
				}
				needResize = true;
			} else if (inst && !(theme && theme.animate && mode && mode != 'n')) {
				cancelAnimationFrame(raf);
				raf = 0;
				inst.stop && inst.stop();
				inst = null;
				canvas.remove();
				canvas = null;
				return;
			}
			if (!inst) {
				return;
			}
			var run = wanted();
			if (run && !raf) {
				last = performance.now();
				raf = requestAnimationFrame(loop);
			} else if (!run && raf) {
				cancelAnimationFrame(raf); // frozen; nothing runs until the timer is idle again
				raf = 0;
			}
			// pause while timing: the frozen petals fade out (compositor only), and fade back in afterwards
			clearTimeout(fadeTimer);
			var show = !(mode == 'p' && timing);
			if (show && canvas.hasClass('jlta-off')) {
				fadeTimer = setTimeout(function() {
					canvas && canvas.removeClass('jlta-off');
				}, 0);
			} else if (!show) {
				canvas.addClass('jlta-off');
			}
		}

		$(window).on('resize orientationchange', function() {
			needResize = true; // measured on the next frame
		});
		document.addEventListener('visibilitychange', update);

		return {
			/** @param {JlTheme} t */
			setTheme: function(t) {
				if (theme == t) {
					return;
				}
				theme = t;
				if (inst) { // another animated theme: start over with its own state
					var m = mode;
					mode = 'n';
					update();
					mode = m;
				}
				update();
			},
			register: function() {
				kernel.regListener('jlthemeanim', 'property', function(signal, value) {
					mode = value[1];
					update();
				}, new RegExp('^' + ANIM_PROP + '$'));
				kernel.regListener('jlthemeanim', 'timerStatus', function(signal, value) {
					var t = value != -1;
					if (t != timing) {
						timing = t;
						update();
					}
				});
				kernel.regProp('color', ANIM_PROP, 1, 'Animated background', [reducedMotion() ? 'n' : 'p', ['n', 'y', 'p'],
					['Off', 'On', 'On, pause while timing']]);
			},
			/** @return {boolean} */
			running: function() {
				return !!raf;
			}
		};
	})();

	/** @param {JlTheme} t */
	function addTile(t) {
		var cols = t.palette.match(/#[0-9a-fA-F]{3}/g);
		var tile = $('<div class="jltheme-tile click">').attr({ 'data-id': t.id, 'title': t.name }).css('background-image', backgroundCss(t)).append(
			$('<span class="jltheme-name">').text(t.name).css({ color: cols[5], 'background-color': cols[6] }));
		tile.click(function() {
			kernel.setProp('jlTheme', t.id);
		});
		if (kernel.getProp('jlTheme') == t.id) {
			tile.addClass('active');
		}
		gallery.append(tile);
	}

	$(function() {
		styleTag.appendTo('head');
		kernel.regListener('jlthemes', 'property', function(signal, value) {
			apply(value[1], value[2]);
		}, /^jlTheme$/);
		regThemeProp(); // announces the saved theme, so the listener comes first
		themes.forEach(addTile);
		// About page: an "Enhanced themes" section after the color scheme list (help.js turns it into a tab)
		var schemes = $('#about ul').filter(function() {
			return $(this).find('a.click[href^="#"]').length > 5;
		}).first();
		var section = [$('<h2>').text('Enhanced themes'),
			$('<div>').append('<p>Artwork backgrounds with matching colors. Click one to use it; Options → color → Enhanced theme → None turns it off.</p>',
				images ? images.section('about') : '', images ? $('<div class="jltheme-sub">').text('Built-in themes') : '', gallery)];
		if (schemes.length) {
			schemes.after(section);
		} else {
			$('#about').append(section);
		}
		isReady = true;
		// "Animated background" after Enhanced theme and its "Your images" row (js/mybg.js registers that on ready)
		setTimeout(anim.register, 0);
	});

	return {
		register: register,
		list: function() {
			return themes.slice();
		},
		apply: apply,
		setColors: setColors,
		refresh: function() { // the list of the user's images changed
			if (isReady) {
				regThemeProp();
			}
		},
		/** @param {ThemeImages} api */
		setImages: function(api) {
			images = api;
		},
		styleTag: function() {
			return styleTag;
		},
		/** @return {boolean} whether a theme animation frame loop is running */
		animating: function() {
			return anim.running();
		}
	};
});
