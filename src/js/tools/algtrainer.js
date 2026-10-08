"use strict";

/**
 * jlTimer last-layer trainers (Tools > Reconstruction > PLL trainer / OLL trainer).
 *
 * Each trainer drills the weakest cases of one step on the virtual cube with csTimer's own training
 * scrambles: a drill is the scramble type ('pll' / 'oll') with a case filter whose values are weights
 * (see scrMgr.rndState), in a session of its own ("PLL drill" / "OLL drill") so the main sessions get
 * no drill solves.
 *
 * - weakness: algStat.weakness() over the solves of every session but the drill one
 *   (score = (case mean - step mean) / step sigma + 0.5 / sqrt(N + 1), higher = weaker)
 * - modes: weakest N (equal chances), weighted (all cases, weight e^score), picked cases
 * - each attempt: the training scramble (PLL: solved F2L + OLL; OLL: solved F2L, random LL permutation;
 *   random pre-/post-AUF), optional random y of the whole cube; the virtual timer starts when the case
 *   is shown, so the recorded time is recognition + execution and the stats split it as for a full solve
 * - completion: PLL when the cube is solved; OLL as soon as the last layer is oriented (any AUF or
 *   permutation, so a full LL solve counts too), see isDone() and timer/virtual.js
 * - nothing here reads keys: the controls are click spans, so cube keys always reach the timer
 */
var algDrill = execMain(function() {
	var MAX_WEIGHT = 1000;
	var SCORE_CLAMP = 1.5;

	// a common alg per case, in the order of csTimer's PLL table (scramble_333_edit.js pll_map)
	var PLL_ALGS = [
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

	// a common alg per case, by csTimer's OLL index (scramble_333_edit.js oll_map; 0 is the skip),
	// which follows the standard OLL numbering; each one is checked to set up its case (see the tests)
	var OLL_ALGS = [
		"", // skip
		"R U2 R2 F R F' U2 R' F R F'", // 1
		"F R U R' U' F' f R U R' U' f'", // 2
		"f R U R' U' f' U' F R U R' U' F'", // 3
		"f R U R' U' f' U F R U R' U' F'", // 4
		"r' U2 R U R' U r", // 5
		"r U2 R' U' R U' r'", // 6
		"r U R' U R U2 r'", // 7
		"l' U' L U' L' U2 l", // 8
		"R U R' U' R' F R2 U R' U' F'", // 9
		"R U R' U R' F R F' R U2 R'", // 10
		"r U R' U R' F R F' R U2 r'", // 11
		"M' R' U' R U' R' U2 R U' R r'", // 12
		"F U R U' R2 F' R U R U' R'", // 13
		"R' F R U R' F' R F U' F'", // 14
		"l' U' l L' U' L U l' U l", // 15
		"r U r' R U R' U' r U' r'", // 16
		"R U R' U R' F R F' U2 R' F R F'", // 17
		"r U R' U R U2 r2 U' R U' R' U2 r", // 18
		"r' R U R U R' U' M' R' F R F'", // 19
		"r U R' U' M2 U R U' R' U' M'", // 20
		"R U2 R' U' R U R' U' R U' R'", // 21
		"R U2 R2 U' R2 U' R2 U2 R", // 22
		"R2 D' R U2 R' D R U2 R", // 23
		"r U R' U' r' F R F'", // 24
		"F' r U R' U' r' F R", // 25
		"R U2 R' U' R U' R'", // 26
		"R U R' U R U2 R'", // 27
		"r U R' U' r' R U R U' R'", // 28
		"R U R' U' R U' R' F' U' F R U R'", // 29
		"F R' F R2 U' R' U' R U R' F2", // 30
		"R' U' F U R U' R' F' R", // 31
		"L U F' U' L' U L F L'", // 32
		"R U R' U' R' F R F'", // 33
		"R U R2 U' R' F R U R U' F'", // 34
		"R U2 R2 F R F' R U2 R'", // 35
		"L' U' L U' L' U L U L F' L' F", // 36
		"F R' F' R U R U' R'", // 37
		"R U R' U R U' R' U' R' F R F'", // 38
		"L F' L' U' L U F U' L'", // 39
		"R' F R U R' U' F' U R", // 40
		"R U R' U R U2 R' F R U R' U' F'", // 41
		"R' U' R U' R' U2 R F R U R' U' F'", // 42
		"F' U' L' U L F", // 43
		"F U R U' R' F'", // 44
		"F R U R' U' F'", // 45
		"R' U' R' F R F' U R", // 46
		"R' U' R' F R F' R' F R F' U R", // 47
		"F R U R' U' R U R' U' F'", // 48
		"r U' r2 U r2 U r2 U' r", // 49
		"r' U r2 U' r2 U' r2 U r'", // 50
		"F U R U' R' U R U' R' F'", // 51
		"R U R' U R U' B U' B' R'", // 52
		"l' U2 L U L' U' L U L' U l", // 53
		"r U2 R' U' R U R' U' R U' r'", // 54
		"R' F R U R U' R2 F' R2 U' R' U R U R'", // 55
		"r' U' r U' R' U R U' R' U R r' U r", // 56
		"R U R' U' M' U R U' r'" // 57
	];

	// an applied move sequence (scramble or solve) on a CubieCube in csTimer's frame
	function applySeq(c, seq) {
		var moves = (seq || '').split(/\s+/);
		for (var i = 0; i < moves.length; i++) {
			moves[i] && c.selfMoveStr(moves[i], false);
		}
		return c;
	}

	function newCube() {
		var c = new mathlib.CubieCube();
		c.ori = 0;
		return c;
	}

	// OLL done: the F2L of the setup (D layer of the cube's own frame, whatever the whole-cube rotation)
	// solved and the U-layer pieces oriented, permuted or not. Only this frame counts: a state that merely
	// looks like a solved F2L + OLL on another axis (possible with a permuted last layer) does not end it.
	function ollDone(c) {
		return algStat.ollDone(c);
	}

	var CONFIGS = {
		'PLL': {
			id: 'plltrainer',
			title: 'PLL trainer',
			ssName: 'PLL drill',
			type: 'pll',
			prop: 'pllDr',
			algs: PLL_ALGS,
			ns: [3, 5, 7, 10]
		},
		'OLL': {
			id: 'olltrainer',
			title: 'OLL trainer',
			ssName: 'OLL drill',
			type: 'oll',
			prop: 'ollDr',
			algs: OLL_ALGS,
			ns: [3, 5, 10, 15],
			fam: true,
			done: ollDone
		}
	};

	var MODES = [['n', 'weakest N', 'only the N weakest cases, equally often'],
		['w', 'weighted', 'every case, weaker ones more often (weight e^score)'],
		['p', 'pick', 'the cases you pick (click rows), equally often']];

	function Trainer(STEP) {
		var cfg = CONFIGS[STEP];
		var SS_NAME = cfg.ssName;
		var TYPE = cfg.type;
		var P = cfg.prop;
		var ALGS = cfg.algs;
		var IDENT = cubeutil.getIdentData(STEP);
		var FIRST = IDENT[2]; // first case index (OLL: 1, the skip 0 is never drilled)
		var NFLT = IDENT[3]; // length of the scramble filter
		var NS = cfg.ns;

		var toolDiv = null;
		var weak = null; // algStat.weakness() of the real solves
		var weakTid = 0;
		var curCase = -1; // case of the current scramble (-1: not a drill scramble)
		var revealed = false;
		var results = []; // attempts of this run: {c, want, tot, rec, exe, tps, dnf}
		var imgCache = {};
		var imgCol = '';

		function isCase(c) {
			return c >= FIRST && c < NFLT;
		}

		// ---------- state ----------

		function getMode() {
			return kernel.getProp(P + 'Mode', 'n');
		}

		function getN() {
			return ~~kernel.getProp(P + 'N', 5) || 5;
		}

		function getPicks() {
			try {
				return JSON.parse(kernel.getProp(P + 'Pick', '[]')) || [];
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
			var idx = ~~kernel.getProp(P + 'Ss', 0);
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
			return !!kernel.getProp(P + 'On', false) && ~~kernel.getProp('session') == ~~kernel.getProp(P + 'Ss', 0) &&
				kernel.getProp('scrType') == TYPE;
		}

		var lastRot = '';

		// whole-cube rotation added to the setup of the virtual cube (virtual.js), random y if enabled
		function setupRotation() {
			lastRot = kernel.getProp(P + 'Rot', false) ? mathlib.rndEl(['', 'y', 'y2', "y'"]) : '';
			return lastRot;
		}

		// ---------- case odds ----------

		// chance of each case (sums to 1) in the current mode, from the weakness rows
		function caseOdds() {
			var odds = mathlib.valuedArray(NFLT, 0);
			var rows = weak ? weak.rows : [];
			var mode = getMode();
			var sum = 0;
			if (mode == 'p') {
				var picks = getPicks();
				for (var i = 0; i < picks.length; i++) {
					if (isCase(picks[i])) {
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
			for (var i = 0; i < NFLT; i++) {
				sum += odds[i];
			}
			if (sum == 0) {
				return null;
			}
			for (var i = 0; i < NFLT; i++) {
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
				logohint.push(cfg.title + ': pick at least one case');
				return;
			}
			// one drill at a time: the other trainer's drill ends first (back to its previous session)
			var other = active();
			if (other && other != me) {
				other.stop();
			}
			var cur = ~~kernel.getProp('session');
			var ss = sessionIdx();
			if (cur != ss) {
				kernel.setProp(P + 'Prev', cur);
				kernel.setProp(P + 'Flt', kernel.getProp('scrFlt') || '');
			}
			results = [];
			// set before the switch: the drill session loads the drill type, which then reads this filter
			applyFilter();
			if (!ss) {
				var opt = {};
				opt['scrType'] = TYPE;
				ss = stats.getSessionManager().createNamedSession(SS_NAME, opt);
				kernel.setProp(P + 'Ss', ss);
			} else {
				kernel.setProp(P + 'Ss', ss);
				if (cur != ss) {
					kernel.setProp('session', ss);
				}
			}
			if (kernel.getProp('scrType') != TYPE) {
				kernel.setProp('scrType', TYPE);
			}
			kernel.setProp(P + 'On', true);
			render();
		}

		function stop() {
			kernel.setProp(P + 'On', false);
			var ss = ~~kernel.getProp(P + 'Ss', 0);
			var prev = ~~kernel.getProp(P + 'Prev', 0);
			if (~~kernel.getProp('session') == ss && prev != ss && sessionValid(prev, sessionData())) {
				kernel.setProp('session', prev);
				var flt = kernel.getProp(P + 'Flt', '');
				if (flt) { // the filter of before the drill (csTimer keeps one filter, for the last type)
					kernel.setProp('scrFlt', flt);
				}
			}
			curCase = -1;
			render();
		}

		// "drill weakest N" of the stats table
		function drillWeakest() {
			kernel.setProp(P + 'Mode', 'n');
			showTool();
			weak = null;
			loadWeak(start);
		}

		// put the trainer in the tools panel (first slot unless it is already shown) and show the panel
		function showTool() {
			var nTools = ~~kernel.getProp('NTools', 1);
			var funcs = JSON.parse(kernel.getProp('toolsfunc'));
			if (funcs.slice(0, nTools).indexOf(cfg.id) == -1) {
				funcs[0] = cfg.id;
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

		// case of a training scramble of the drill type
		function scrambleCase(scr) {
			return IDENT[0](applySeq(newCube(), scr).toFaceCube());
		}

		// the attempt is done (OLL: the last layer is oriented; PLL: no check, the solved cube ends it):
		// setup = the scramble as given to the virtual cube (with the setup rotation), moves = every move
		// of the attempt. The virtual cube first turns the whole cube by the training pre-scramble (z2 for
		// yellow on top); it is left out here, so the cube is seen in the scramble's own frame (F2L on D)
		// and the moves, relative to the solver's view, act the same.
		function isDone(setup, moves) {
			if (!cfg.done) {
				return false;
			}
			var c = applySeq(newCube(), setup);
			for (var i = 0; i < moves.length; i++) {
				c.selfMoveStr(moves[i], false);
			}
			return cfg.done(c);
		}

		// mean time per case of the drill session's solves
		function drillMeans() {
			var ret = {};
			if (~~kernel.getProp('session') != ~~kernel.getProp(P + 'Ss', 0)) {
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
				curCase = isCase(c) ? c : -1;
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
				if (value[0] == 'session' && kernel.getProp(P + 'On', false) && ~~value[1] != ~~kernel.getProp(P + 'Ss', 0)) {
					kernel.setProp(P + 'On', false); // left the drill session by hand: the drill ends there
				}
				$.delayExec(cfg.id, render, 50);
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
				IDENT[1](c, img);
				imgCache[c] = img.attr('src');
			}
			return imgCache[c];
		}

		function caseName(c) {
			return isCase(c) ? IDENT[1](c)[2] : '?';
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
				return '<div class="jlpt-cur"><span class="jlpt-dim">waiting for a ' + STEP + ' scramble...</span></div>';
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

		function rowHtml(row, odds, picks, mode, dm) {
			var on = odds[row.c] > 0;
			var d = dm[row.c];
			return ['<tr data-c="' + row.c + '" class="' + (on ? 'jlpt-on' : 'jlpt-off') + (mode == 'p' ? ' click jlpt-pick' : '') + '">',
				'<td class="jlpt-name">' + (mode == 'p' ? '<span class="jlpt-box' + (picks.indexOf(row.c) != -1 ? ' selected' : '') + '"></span>' : '') +
				'<img src="' + caseImg(row.c) + '"/><span>' + row.name + '</span></td>',
				'<td>' + row.n + '</td>',
				'<td>' + fmtTime(row.tot) + '</td>',
				'<td>' + row.score.toFixed(2) + '</td>',
				'<td>' + (on ? Math.round(odds[row.c] * 100) + '%' : '-') + '</td>',
				'<td>' + (d ? fmtTime(d.sum / d.n) + '<span class="jlpt-dim"> ×' + d.n + '</span>' : '-') + '</td>',
				'</tr>'].join('');
		}

		function tableHtml() {
			if (!weak) {
				return '<div class="jlpt-dim jlpt-pad">loading ' + STEP + ' stats...</div>';
			}
			var odds = caseOdds() || mathlib.valuedArray(NFLT, 0);
			var picks = getPicks();
			var mode = getMode();
			var dm = drillMeans();
			var html = ['<div class="jlpt-scroll"><table class="table jlpt-table"><thead><tr>',
				'<th>case</th><th title="real solves of the case">N</th><th title="mean ' + STEP + ' time (recognition + execution) of the real solves">mean</th>',
				'<th title="weakness score: (case mean - ' + STEP + ' mean) / ' + STEP + ' σ + 0.5 / √(N + 1)">weak</th>',
				'<th title="chance of the case in this drill">odds</th><th title="mean ' + STEP + ' time in the drill session">drill</th></tr></thead><tbody>'];
			if (mode == 'p' && cfg.fam) {
				// the picker: cases grouped by family, in case order; a family row picks / unpicks the family
				var byC = {};
				for (var i = 0; i < weak.rows.length; i++) {
					byC[weak.rows[i].c] = weak.rows[i];
				}
				var fams = algStat.families(STEP);
				for (var f = 0; f < fams.length; f++) {
					var cs = [];
					for (var c = FIRST; c < NFLT; c++) {
						if (algStat.caseFamily(caseName(c)) == fams[f][0]) {
							cs.push(c);
						}
					}
					var nPick = cs.filter(function(c) {
						return picks.indexOf(c) != -1;
					}).length;
					html.push('<tr class="click jlpt-fam" data-f="' + fams[f][0] + '" title="pick or unpick every ' + fams[f][0] + ' case">' +
						'<td colspan="6"><span class="jlpt-box' + (nPick == cs.length ? ' selected' : '') + '"></span>' + fams[f][0] +
						' <span class="jlpt-dim">' + nPick + '/' + cs.length + '</span></td></tr>');
					for (var i = 0; i < cs.length; i++) {
						html.push(rowHtml(byC[cs[i]], odds, picks, mode, dm));
					}
				}
			} else {
				for (var i = 0; i < weak.rows.length; i++) {
					html.push(rowHtml(weak.rows[i], odds, picks, mode, dm));
				}
			}
			html.push('</tbody></table></div>');
			html.push('<div class="jlpt-foot jlpt-dim">' + (weak.n ? 'scored from ' + weak.n + ' ' + STEP + 's of all sessions but "' + SS_NAME + '" &middot; mean ' +
				fmtTime(weak.mean) + ' &middot; σ ' + fmtTime(weak.sd) : 'no ' + STEP + ' data yet: every case scores the same') +
				' <span class="click jlpt-reload" title="recompute the scores">↻</span></div>');
			return html.join('');
		}

		function render() {
			if (!toolDiv) {
				return;
			}
			var active = isActive();
			var mode = getMode();
			var html = ['<div class="jlpt-head"><span class="jlpt-title">' + cfg.title + '</span>',
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
			html.push(chip('jlpt-rot', '', 'random y', kernel.getProp(P + 'Rot', false), 'turn the whole cube by a random y at each setup'), '</div>');
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
				kernel.setProp(P + 'Mode', t.attr('data-v'));
			} else if (t.hasClass('jlpt-n')) {
				kernel.setProp(P + 'N', ~~t.attr('data-v'));
			} else if (t.hasClass('jlpt-rot')) {
				kernel.setProp(P + 'Rot', !kernel.getProp(P + 'Rot', false));
			} else if (t.hasClass('jlpt-pick')) {
				var c = ~~t.attr('data-c');
				var picks = getPicks();
				var idx = picks.indexOf(c);
				idx == -1 ? picks.push(c) : picks.splice(idx, 1);
				kernel.setProp(P + 'Pick', JSON.stringify(picks));
			} else if (t.hasClass('jlpt-fam')) {
				var fam = t.attr('data-f');
				var picks = getPicks();
				var cs = [];
				for (var c = FIRST; c < NFLT; c++) {
					if (algStat.caseFamily(caseName(c)) == fam) {
						cs.push(c);
					}
				}
				var all = cs.every(function(c) {
					return picks.indexOf(c) != -1;
				});
				picks = picks.filter(function(c) {
					return cs.indexOf(c) == -1;
				});
				if (!all) {
					picks = picks.concat(cs);
				}
				kernel.setProp(P + 'Pick', JSON.stringify(picks));
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
				tools.regTool(cfg.id, TOOLS_RECONS + '>' + cfg.title, execFunc);
			}
			kernel.regListener(cfg.id, 'scramble', procSignal);
			kernel.regListener(cfg.id, 'timestd', procSignal);
			kernel.regListener(cfg.id, 'property', procSignal, new RegExp('^(?:session|' + P + 'On)$'));
		});

		var me = {
			ALGS: ALGS,
			isActive: isActive,
			isDone: isDone,
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
		return me;
	}

	var trainers = {
		'PLL': Trainer('PLL'),
		'OLL': Trainer('OLL')
	};

	// the trainer whose drill is running (at most one: each needs its own session and scramble type)
	function active() {
		for (var step in trainers) {
			if (trainers[step].isActive()) {
				return trainers[step];
			}
		}
		return null;
	}

	return {
		trainers: trainers,
		active: active,
		applySeq: applySeq,
		ollDone: ollDone
	};
});

var pllDrill = execMain(function() {
	return algDrill.trainers['PLL'];
});
var ollDrill = execMain(function() {
	return algDrill.trainers['OLL'];
});
