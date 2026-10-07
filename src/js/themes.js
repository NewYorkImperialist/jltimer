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
// Choosing a theme saves its palette as ordinary manual colors, so exports stay csTimer-compatible.
var jlThemes = execMain(function() {
	var themes = [];
	var isReady = false;
	var styleTag = $('<style id="jltheme-style">');
	var gallery = $('<div class="jltheme-gallery">');
	var COLOR_PROPS = ['col-font', 'col-back', 'col-board', 'col-button', 'col-link', 'col-logo', 'col-logoback', 'col-pbs'];

	function find(id) {
		for (var i = 0; i < themes.length; i++) {
			if (themes[i].id == id) {
				return themes[i];
			}
		}
		return null;
	}

	function backgroundCss(t) {
		var bg = $.trim(t.background || '');
		if (/^<svg/i.test(bg)) {
			return 'url("data:image/svg+xml,' + encodeURIComponent(bg) + '")';
		}
		return bg || 'none';
	}

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
				apply(t.id, 'set');
			}
		}
		return true;
	}

	function regThemeProp() {
		kernel.regProp('color', 'jlTheme', 1, 'Enhanced theme', ['sakura',
			['none'].concat(themes.map(function(t) { return t.id; })),
			['None'].concat(themes.map(function(t) { return t.name; }))]);
	}

	function apply(id, signalType) {
		var html = $('html');
		themes.forEach(function(t) {
			html.removeClass('jlt-' + t.id);
		});
		html.removeClass('jlt-on');
		var t = find(id);
		styleTag.text('');
		gallery.children().removeClass('active');
		if (!t) {
			return;
		}
		html.addClass('jlt-on jlt-' + t.id);
		styleTag.text('html.jlt-on.jlt-' + t.id + '{background-image:' + backgroundCss(t) + ' !important}' + (t.css || ''));
		gallery.children('[data-id="' + t.id + '"]').addClass('active');
		if (signalType == 'modify') { // chosen by the user: take over the theme's colors
			var cols = t.palette.match(/#[0-9a-fA-F]{3}/g);
			for (var i = 0; i < cols.length; i++) {
				kernel.setProp(COLOR_PROPS[i], $.nearColor(cols[i], 0, true));
			}
			if (t.timer) {
				kernel.setProp('col-timer', t.timer);
			}
		}
	}

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
			$('<div>').append('<p>Artwork backgrounds with matching colors. Click one to use it; Options → color → Enhanced theme → None turns it off.</p>', gallery)];
		if (schemes.length) {
			schemes.after(section);
		} else {
			$('#about').append(section);
		}
		isReady = true;
	});

	return {
		register: register,
		list: function() {
			return themes.slice();
		},
		apply: apply
	};
});
