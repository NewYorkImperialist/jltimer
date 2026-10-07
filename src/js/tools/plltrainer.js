"use strict";

/**
 * jlTimer PLL trainer (Tools > Reconstruction > PLL trainer).
 *
 * Drills the weakest PLL cases on the virtual cube with csTimer's own PLL training scrambles:
 * a drill is the scramble type 'pll' with a case filter whose values are weights (see
 * scrMgr.rndState), in a session of its own ("PLL drill") so the main sessions get no drill solves.
 *
 * - weakness: algStat.weakness() over the solves of every session but the drill one
 *   (score = (case mean - PLL mean) / PLL sigma + 0.5 / sqrt(N + 1), higher = weaker)
 * - modes: weakest N (equal chances), weighted (all cases, weight e^score), picked cases
 * - each attempt: solved F2L + OLL, random pre-/post-AUF (the training scramble), optional random y
 *   of the whole cube; the virtual timer starts when the case is shown, so the recorded time is
 *   recognition + execution and the PLL stats split it as for a full solve
 * - nothing here reads keys: the controls are click spans, so cube keys always reach the timer
 */
var pllDrill = execMain(function() {
	var SS_NAME = 'PLL drill';
	var TYPE = 'pll';
	var STEP = 'PLL';
	var NCASE = 21;
	var MAX_WEIGHT = 1000;
	var SCORE_CLAMP = 1.5;

	// a common alg per case, in the order of csTimer's PLL table (scramble_333_edit.js pll_map)
	var ALGS = [
		"M2 U M2 U2 M2 U M2", // H
		"M2 U M U2 M' U M2", // Ua
		"M2 U' M U2 M' U' M2", // Ub
		"M' U M2 U M2 U M' U2 M2", // Z
		"x R' U R' D2 R U' R' D2 R2 x'", // Aa
		"x R2 D2 R U R' D2 R U' R x'", // Ab
		"x' R U' R' D R U R' D' R U R' D R U' R' D' x", // E
		"R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", // F
		"R2 U R' U R' U' R U' R2 U' D R' U R D'", // Ga
		"R' U' R U D' R2 U R' U R U' R U' R2 D", // Gb
		"R2 U' R U' R U R' U R2 U D' R U' R' D", // Gc
		"R U R' U' D R2 U' R U' R' U R' U R2 D'", // Gd
		"R' U L' U2 R U' R' U2 R L", // Ja
		"R U R' F' R U R' U' R' F R2 U' R'", // Jb
		"R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'", // Na
		"R' U R U' R' F' U' F R U R' F R' F' R U' R", // Nb
		"R U' R' U' R U R D R' U' R D' R' U2 R'", // Ra
		"R2 F R U R U' R' F' R U2 R' U2 R", // Rb
		"R U R' U' R' F R2 U' R' U' R U R' F'", // T
		"R' U R' U' y R' F' R2 U' R' U R' F R F", // V
		"F R U' R' U' R U R' F' R U R' U' R' F R F'" // Y
	];

	var MODES = [['n', 'weakest N', 'only the N weakest cases, equally often'],
		['w', 'weighted', 'every case, weaker ones more often (weight e^score)'],
		['p', 'pick', 'the cases you pick (click rows), equally often']];
	var NS = [3, 5, 7, 10];

	var toolDiv = null;
	var weak = null; // algStat.weakness() of the real solves
	var weakTid = 0;
	var curCase = -1; // case of the current scramble (-1: not a drill scramble)
	var revealed = false;
	var results = []; // attempts of this run: {c, want, tot, rec, exe, tps, dnf}
	var imgCache = {};
	var imgCol = '';

	// ---------- state ----------

	function getMode() {
		return kernel.getProp('pllDrMode', 'n');
	}

	function getN() {
		return ~~kernel.getProp('pllDrN', 5) || 5;
	}

	function getPicks() {
		try {
			return JSON.parse(kernel.getProp('pllDrPick', '[]')) || [];
		} catch (e) {
			return [];
		}
	}

	function sessionData() {
		return JSON.parse(kernel.getProp('sessionData', '{}')) || {};
	}

	function sessionValid(idx, data) {
		return idx > 0 && idx <= ~~kernel.getProp('sessionN') && !!data[idx];
	}

	// the drill session: the remembered one if it still carries the drill name, else any session with it
	function sessionIdx() {
		var data = sessionData();
		var idx = ~~kernel.getProp('pllDrSs', 0);
		if (sessionValid(idx, data) && data[idx]['name'] == SS_NAME) {
			return idx;
		}
		for (var i = 1; i <= ~~kernel.getProp('sessionN'); i++) {
			if (data[i] && data[i]['name'] == SS_NAME) {
				return i;
			}
		}
		return 0;
	}

	function isActive() {
		return !!kernel.getProp('pllDrOn', false) && ~~kernel.getProp('session') == ~~kernel.getProp('pllDrSs', 0) &&
			kernel.getProp('scrType') == TYPE;
	}

	var lastRot = '';

	// whole-cube rotation added to the setup of the virtual cube (virtual.js), random y if enabled
	function setupRotation() {
		lastRot = kernel.getProp('pllDrRot', false) ? mathlib.rndEl(['', 'y', 'y2', "y'"]) : '';
		return lastRot;
	}

	// ---------- case odds ----------

	// chance of each case (sums to 1) in the current mode, from the weakness rows
	function caseOdds() {
		var odds = mathlib.valuedArray(NCASE, 0);
		var rows = weak ? weak.rows : [];
		var mode = getMode();
		var sum = 0;
		if (mode == 'p') {
			var picks = getPicks();
			for (var i = 0; i < picks.length; i++) {
				if (picks[i] >= 0 && picks[i] < NCASE) {
					odds[picks[i]] = 1;
				}
			}
		} else if (mode == 'w') {
			for (var i = 0; i < rows.length; i++) {
				odds[rows[i].c] = Math.exp(Math.max(-SCORE_CLAMP, Math.min(SCORE_CLAMP, rows[i].score)));
			}
		} else {
			for (var i = 0; i < Math.min(getN(), rows.length); i++) {
				odds[rows[i].c] = 1;
			}
		}
		for (var i = 0; i < NCASE; i++) {
			sum += odds[i];
		}
		if (sum == 0) {
			return null;
		}
		for (var i = 0; i < NCASE; i++) {
			odds[i] /= sum;
		}
		return odds;
	}

	// the scramble filter for the odds: weights up to MAX_WEIGHT (> 1, so csTimer reads them as weights)
	function oddsFilter(odds) {
		var max = Math.max.apply(null, odds);
		return odds.map(function(p) {
			return p > 0 ? Math.max(1, Math.round(p / max * MAX_WEIGHT)) : 0;
		});
	}

	function applyFilter() {
		var odds = caseOdds();
		if (!odds) {
			return false;
		}
		kernel.setProp('scrFlt', JSON.stringify([TYPE, oddsFilter(odds)]));
		return true;
	}

	// ---------- start / stop ----------

	function start() {
		if (!weak) {
			loadWeak(start);
			return;
		}
		if (!caseOdds()) {
			logohint.push('PLL trainer: pick at least one case');
			return;
		}
		var cur = ~~kernel.getProp('session');
		var ss = sessionIdx();
		if (cur != ss) {
			kernel.setProp('pllDrPrev', cur);
			kernel.setProp('pllDrFlt', kernel.getProp('scrFlt') || '');
		}
		results = [];
		// set before the switch: the drill session loads the 'pll' type, which then reads this filter
		applyFilter();
		if (!ss) {
			var opt = {};
			opt['scrType'] = TYPE;
			ss = stats.getSessionManager().createNamedSession(SS_NAME, opt);
			kernel.setProp('pllDrSs', ss);
		} else {
			kernel.setProp('pllDrSs', ss);
			if (cur != ss) {
				kernel.setProp('session', ss);
			}
		}
		if (kernel.getProp('scrType') != TYPE) {
			kernel.setProp('scrType', TYPE);
		}
		kernel.setProp('pllDrOn', true);
		render();
	}

	function stop() {
		kernel.setProp('pllDrOn', false);
		var ss = ~~kernel.getProp('pllDrSs', 0);
		var prev = ~~kernel.getProp('pllDrPrev', 0);
		if (~~kernel.getProp('session') == ss && prev != ss && sessionValid(prev, sessionData())) {
			kernel.setProp('session', prev);
			var flt = kernel.getProp('pllDrFlt', '');
			if (flt) { // the filter of before the drill (csTimer keeps one filter, for the last type)
				kernel.setProp('scrFlt', flt);
			}
		}
		curCase = -1;
		render();
	}

	// "drill weakest N" of the PLL stats table
	function drillWeakest() {
		kernel.setProp('pllDrMode', 'n');
		showTool();
		weak = null;
		loadWeak(start);
	}

	// put the trainer in the tools panel (first slot unless it is already shown) and show the panel
	function showTool() {
		var nTools = ~~kernel.getProp('NTools', 1);
		var funcs = JSON.parse(kernel.getProp('toolsfunc'));
		if (funcs.slice(0, nTools).indexOf('plltrainer') == -1) {
			funcs[0] = 'plltrainer';
			kernel.setProp('toolsfunc', JSON.stringify(funcs), 'session');
		}
		kernel.ui.setWindowShown('tools', true);
	}

	// ---------- data ----------

	function loadWeak(callback) {
		var myTid = ++weakTid;
		algStat.loadRecs(STEP, sessionIdx(), function(recs) {
			if (myTid != weakTid) {
				return;
			}
			weak = algStat.weakness(recs, STEP);
			if (isActive()) {
				applyFilter();
			}
			render();
			callback && callback();
		});
	}

	// PLL case of a PLL training scramble (the scramble leaves F2L + OLL solved)
	function scrambleCase(scr) {
		var c = new mathlib.CubieCube();
		c.ori = 0;
		var moves = (scr || '').split(/\s+/);
		for (var i = 0; i < moves.length; i++) {
			c.selfMoveStr(moves[i], false);
		}
		return cubeutil.getIdentData(STEP)[0](c.toFaceCube());
	}

	// mean PLL time per case of the drill session's solves
	function drillMeans() {
		var ret = {};
		if (~~kernel.getProp('session') != ~~kernel.getProp('pllDrSs', 0)) {
			return ret;
		}
		var recs = algStat.curSessionRecs(STEP);
		for (var i = 0; i < recs.length; i++) {
			var r = ret[recs[i].c] = ret[recs[i].c] || {n: 0, sum: 0};
			r.n++;
			r.sum += recs[i].tot;
		}
		return ret;
	}

	function procSignal(signal, value) {
		if (signal == 'scramble') {
			var c = value[0] == TYPE ? scrambleCase(value[1]) : -1;
			curCase = c >= 0 && c < NCASE ? c : -1;
			revealed = false;
			renderCur();
		} else if (signal == 'timestd') {
			if (!isActive()) {
				return;
			}
			var res = {want: scrambleCase(value[1]), dnf: value[0][0] < 0};
			var r = !res.dnf && algStat.analyzeTimes(STEP, value);
			if (r) {
				res.c = r.c;
				res.tot = r.tot;
				res.rec = r.rec;
				res.exe = r.exe;
				res.tps = r.exe > 0 ? r.mv / r.exe * 1000 : -1;
			}
			results.push(res);
			render();
		} else if (signal == 'property') {
			if (value[0] == 'session' && kernel.getProp('pllDrOn', false) && ~~value[1] != ~~kernel.getProp('pllDrSs', 0)) {
				kernel.setProp('pllDrOn', false); // left the drill session by hand: the drill ends there
			}
			$.delayExec('plltrainer', render, 50);
		}
	}

	// ---------- rendering ----------

	function caseImg(c) {
		var col = kernel.getProp('colcube');
		if (col != imgCol) {
			imgCache = {};
			imgCol = col;
		}
		if (!(c in imgCache)) {
			var img = $('<img>');
			cubeutil.getIdentData(STEP)[1](c, img);
			imgCache[c] = img.attr('src');
		}
		return imgCache[c];
	}

	function caseName(c) {
		return c >= 0 && c < NCASE ? cubeutil.getIdentData(STEP)[1](c)[2] : '?';
	}

	function fmtTime(v) {
		return v == undefined || v < 0 ? '-' : kernel.pretty(Math.round(v));
	}

	function chip(cls, data, label, sel, title) {
		return '<span class="click jlpt-chip ' + cls + (sel ? ' selected' : '') + '" data-v="' + data + '"' +
			(title ? ' title="' + title + '"' : '') + '>' + label + '</span>';
	}

	function curHtml() {
		if (!isActive()) {
			return '';
		}
		if (curCase < 0) {
			return '<div class="jlpt-cur"><span class="jlpt-dim">waiting for a PLL scramble...</span></div>';
		}
		var html = ['<div class="jlpt-cur">'];
		if (!revealed) {
			html.push('<span class="jlpt-dim">Space shows the case on the cube</span>',
				'<span class="click jlpt-btn jlpt-reveal" title="show the case and an alg for it">show alg</span>');
		} else {
			html.push('<img src="' + caseImg(curCase) + '"/>',
				'<span class="jlpt-cname">' + caseName(curCase) + '</span>',
				'<span class="jlpt-alg">' + ALGS[curCase] + '</span>',
				'<span class="click jlpt-btn jlpt-reveal">hide</span>');
		}
		html.push('</div>');
		return html.join('');
	}

	function lastHtml() {
		if (!isActive() || results.length == 0) {
			return '';
		}
		var html = ['<div class="jlpt-last">'];
		var shown = results.slice(-2).reverse();
		for (var i = 0; i < shown.length; i++) {
			var r = shown[i];
			html.push('<div class="jlpt-res' + (i == 0 ? ' jlpt-res0' : '') + '">');
			if (r.dnf || r.c == undefined) {
				html.push('<span class="jlpt-cname">' + caseName(r.want) + '</span><span>' + (r.dnf ? 'DNF' : 'no move data') + '</span>');
			} else {
				var ok = r.c == r.want;
				html.push('<span class="jlpt-cname">' + caseName(r.c) + '</span>',
					'<span class="jlpt-time">' + fmtTime(r.tot) + '</span>',
					'<span class="jlpt-split">' + fmtTime(r.rec) + ' recog + ' + fmtTime(r.exe) + ' exec' +
					(r.tps > 0 ? ' &middot; ' + r.tps.toFixed(1) + ' TPS' : '') + '</span>',
					ok ? '' : '<span class="jlpt-warn" title="the stats identified a different case than the scramble set up">case ' + caseName(r.want) + '?</span>');
			}
			html.push('</div>');
		}
		var n = 0;
		var sum = 0;
		for (var i = 0; i < results.length; i++) {
			if (results[i].tot != undefined) {
				n++;
				sum += results[i].tot;
			}
		}
		html.push('<div class="jlpt-run jlpt-dim">this drill: ' + results.length + ' attempt' + (results.length == 1 ? '' : 's') +
			(n ? ' &middot; mean ' + fmtTime(sum / n) : '') + '</div>');
		html.push('</div>');
		return html.join('');
	}

	function tableHtml() {
		if (!weak) {
			return '<div class="jlpt-dim jlpt-pad">loading PLL stats...</div>';
		}
		var odds = caseOdds() || mathlib.valuedArray(NCASE, 0);
		var picks = getPicks();
		var mode = getMode();
		var dm = drillMeans();
		var html = ['<div class="jlpt-scroll"><table class="table jlpt-table"><thead><tr>',
			'<th>case</th><th title="real solves of the case">N</th><th title="mean PLL time (recognition + execution) of the real solves">mean</th>',
			'<th title="weakness score: (case mean - PLL mean) / PLL σ + 0.5 / √(N + 1)">weak</th>',
			'<th title="chance of the case in this drill">odds</th><th title="mean PLL time in the drill session">drill</th></tr></thead><tbody>'];
		for (var i = 0; i < weak.rows.length; i++) {
			var row = weak.rows[i];
			var on = odds[row.c] > 0;
			var d = dm[row.c];
			html.push('<tr data-c="' + row.c + '" class="' + (on ? 'jlpt-on' : 'jlpt-off') + (mode == 'p' ? ' click jlpt-pick' : '') + '">',
				'<td class="jlpt-name">' + (mode == 'p' ? '<span class="jlpt-box' + (picks.indexOf(row.c) != -1 ? ' selected' : '') + '"></span>' : '') +
				'<img src="' + caseImg(row.c) + '"/><span>' + row.name + '</span></td>',
				'<td>' + row.n + '</td>',
				'<td>' + fmtTime(row.tot) + '</td>',
				'<td>' + row.score.toFixed(2) + '</td>',
				'<td>' + (on ? Math.round(odds[row.c] * 100) + '%' : '-') + '</td>',
				'<td>' + (d ? fmtTime(d.sum / d.n) + '<span class="jlpt-dim"> ×' + d.n + '</span>' : '-') + '</td>',
				'</tr>');
		}
		html.push('</tbody></table></div>');
		html.push('<div class="jlpt-foot jlpt-dim">' + (weak.n ? 'scored from ' + weak.n + ' PLLs of all sessions but "' + SS_NAME + '" &middot; mean ' +
			fmtTime(weak.mean) + ' &middot; σ ' + fmtTime(weak.sd) : 'no PLL data yet: every case scores the same') +
			' <span class="click jlpt-reload" title="recompute the scores">↻</span></div>');
		return html.join('');
	}

	function render() {
		if (!toolDiv) {
			return;
		}
		var active = isActive();
		var mode = getMode();
		var html = ['<div class="jlpt-head"><span class="jlpt-title">PLL trainer</span>',
			'<span class="jlpt-state' + (active ? ' selected' : '') + '">' + (active ? 'drilling in "' + SS_NAME + '"' : 'off') + '</span>',
			'<span class="click jlpt-btn jlpt-go' + (active ? '' : ' selected') + '">' + (active ? 'stop' : 'start drill') + '</span></div>'];
		html.push('<div class="jlpt-ctrl"><span class="jlpt-group">');
		for (var i = 0; i < MODES.length; i++) {
			html.push(chip('jlpt-mode', MODES[i][0], MODES[i][1], mode == MODES[i][0], MODES[i][2]));
		}
		html.push('</span>');
		if (mode == 'n') {
			html.push('<span class="jlpt-group">');
			for (var i = 0; i < NS.length; i++) {
				html.push(chip('jlpt-n', NS[i], NS[i], getN() == NS[i]));
			}
			html.push('</span>');
		}
		html.push(chip('jlpt-rot', '', 'random y', kernel.getProp('pllDrRot', false), 'turn the whole cube by a random y at each setup'), '</div>');
		html.push('<div class="jlpt-live">' + curHtml() + '</div>', lastHtml(), tableHtml());
		toolDiv.html(html.join(''));
	}

	function renderCur() {
		toolDiv && toolDiv.find('.jlpt-live').html(curHtml());
	}

	function procClick(e) {
		var t = $(e.target).closest('.click');
		if (t.length == 0) {
			return;
		}
		kernel.blur();
		if (t.hasClass('jlpt-go')) {
			isActive() ? stop() : start();
			return;
		} else if (t.hasClass('jlpt-reveal')) {
			revealed = !revealed;
			renderCur();
			return;
		} else if (t.hasClass('jlpt-reload')) {
			weak = null;
			render();
			loadWeak();
			return;
		} else if (t.hasClass('jlpt-mode')) {
			kernel.setProp('pllDrMode', t.attr('data-v'));
		} else if (t.hasClass('jlpt-n')) {
			kernel.setProp('pllDrN', ~~t.attr('data-v'));
		} else if (t.hasClass('jlpt-rot')) {
			kernel.setProp('pllDrRot', !kernel.getProp('pllDrRot', false));
		} else if (t.hasClass('jlpt-pick')) {
			var c = ~~t.attr('data-c');
			var picks = getPicks();
			var idx = picks.indexOf(c);
			idx == -1 ? picks.push(c) : picks.splice(idx, 1);
			kernel.setProp('pllDrPick', JSON.stringify(picks));
		}
		if (isActive()) {
			applyFilter();
		}
		render();
	}

	function execFunc(fdiv, signal) {
		if (fdiv == undefined) {
			toolDiv = null;
			return;
		}
		if (/^scr/.exec(signal) && toolDiv && $.contains(document, toolDiv[0])) {
			return;
		}
		toolDiv = $('<div class="jlpt">').click(procClick);
		fdiv.empty().append(toolDiv);
		render();
		if (!weak) {
			loadWeak();
		}
	}

	$(function() {
		if (typeof tools != "undefined") {
			tools.regTool('plltrainer', TOOLS_RECONS + '>' + 'PLL trainer', execFunc);
		}
		kernel.regListener('plltrainer', 'scramble', procSignal);
		kernel.regListener('plltrainer', 'timestd', procSignal);
		kernel.regListener('plltrainer', 'property', procSignal, /^(?:session|pllDrOn)$/);
	});

	return {
		ALGS: ALGS,
		isActive: isActive,
		setupRotation: setupRotation,
		sessionIdx: sessionIdx,
		getN: getN,
		caseOdds: caseOdds,
		scrambleCase: scrambleCase,
		start: start,
		stop: stop,
		drillWeakest: drillWeakest,
		reload: function(callback) {
			weak = null;
			loadWeak(callback);
		},
		getWeak: function() {
			return weak;
		},
		getResults: function() {
			return results;
		},
		getLastRotation: function() {
			return lastRot;
		}
	};
});
