"use strict";

/**
 * jlTimer per-algorithm stats ("PLL stats" and "OLL stats" tools).
 *
 * Nothing is stored: every row is computed from the saved solves. A solve that carries a move
 * record (virtual cube or smart cube, times[4]) is split into CFOP steps by csTimer's own
 * reconstruction (recons.calcRecons, method 'cf4op'), and the last-layer case of the step is
 * identified with cubeutil's case tables (AUF does not change the case).
 *
 * The STEPS table below holds one entry per step; each entry gets its own tool (View) with the
 * same table. COLL / ZBLL could be added the same way.
 */
var algStat = execMain(function() {

	// step config
	//   method: recons method, stage: index into the recons data (0 = last step of the method)
	//   ident: cubeutil.getIdentData key, skip: case index of an already solved step (-1 if none)
	//   leftProg: cubeutil.getProgress value while only this step is left (to count pre-AUF)
	//   skipImg: llImage pieces for the skip row (else the ident image of the skip case)
	//   tool / title / prop: tool id, tool and dialog title, prefix of the view's properties
	//   prev: the step before (for the recognition texts), drill: the step's trainer (plltrainer.js)
	//   fam: cases are grouped by family (the part of the name before '-'), eo: show the edge
	//   orientation at the start of the step, done(cubie): the step is done in the cube's own frame (for
	//   trainer solves, which end there)
	var STEPS = {
		'PLL': {
			method: 'cf4op',
			stage: 0,
			ident: 'PLL',
			skip: 21,
			leftProg: 1,
			skipImg: 'DDDDDDDDDBBBRRRFFFLLL',
			tool: 'algstat',
			title: 'PLL stats',
			prop: 'algStat',
			prev: 'OLL',
			drill: 'pllDrill'
		},
		'OLL': {
			method: 'cf4op',
			stage: 1,
			ident: 'OLL',
			skip: 0,
			leftProg: 2,
			tool: 'ollstat',
			title: 'OLL stats',
			prop: 'ollStat',
			prev: 'F2L',
			drill: 'ollDrill',
			fam: true,
			eo: true,
			done: function(c) {
				return ollDone(c);
			}
		}
	};
	var STEP = 'PLL';

	// columns: key, header, tooltip, compact view
	function getCols(step) {
		var prev = STEPS[step].prev;
		return [
			['name', 'case', step + ' case (hover for AUF rates)', 1],
			['n', 'N', 'number of solves with this case', 1],
			['share', '%', 'share of analysed solves', 0],
			['tot', 'mean', 'mean ' + step + ' time (recognition + execution)', 1],
			['rec', 'recog', 'mean recognition: pause from the last ' + prev + ' turn to the first ' + step + ' turn', 0],
			['exe', 'exec', 'mean execution: first to last ' + step + ' turn', 0],
			['tps', 'TPS', 'execution TPS: turns / execution time', 1],
			['sd', '\u03c3', 'standard deviation of the ' + step + ' time', 0],
			['score', 'weak', 'weakness score: (case mean - ' + step + ' mean) / ' + step + ' \u03c3 + 0.5 / \u221a(N + 1); higher = weaker', 1],
			['mv', 'turns', 'mean turns (HTM, slice = 1, rotations not counted)', 0],
			['best', 'best', 'best ' + step + ' time', 0],
			['recent', 'last', 'mean ' + step + ' time of the most recent solves of this case', 0]
		];
	}
	var SLOW_N = 3;

	var solveCache = {};

	var imgCache = {};
	var imgCol = '';

	// ---------- per-solve analysis ----------

	function newCube() {
		var c = new mathlib.CubieCube();
		c.ori = 0;
		return c;
	}

	// rec: output of recons.calcRecons(times, cfg.method)
	// return {c: case, rec, exe, tot (ms), mv (HTM), pre/post: AUF before/after the alg (bool)} or undefined
	function analyzeRecons(rec, cfg) {
		// a full solve has every step; a trainer solve (PLL / OLL trainer, training scrambles) starts with
		// only the last steps left (PLL: 1, OLL: 2, the trainer stops once the LL is oriented), so the
		// recons hold those steps only
		if (!rec || !rec.data || rec.data.length < cubeutil.getStepCount(cfg.method) && rec.data.length != cfg.leftProg) {
			return;
		}
		var sdata = rec.data[cfg.stage];
		if (!sdata) {
			return;
		}
		if (rec.data.length == cfg.leftProg && cfg.stage > 0 && cfg.done) {
			sdata = trainerStep(rec.data, cfg);
		}
		var ident = cubeutil.getIdentData(cfg.ident);
		var moves = sdata[5] || [];
		var c = newCube();
		c.invFrom(sdata[4]);
		var cur = ident[0](c.toFaceCube());
		if (cur == -1) {
			return;
		}
		if (cur == cfg.skip || moves.length == 0) {
			return {c: cfg.skip, rec: 0, exe: 0, tot: 0, mv: 0, pre: false, post: false};
		}
		// first turn of the step from its own move list (calcRecons keeps 0 for the very first step)
		var tsFirst = moves[0][1];
		var ret = {
			c: cur,
			rec: tsFirst - sdata[0],
			exe: sdata[2] - tsFirst,
			tot: sdata[2] - sdata[0],
			mv: sdata[3],
			pre: false,
			post: false
		};
		// AUF: turns of the last-layer face, the one face whose turn keeps only this step left
		// (the check must use that face: the 6-axis progress would also accept e.g. the final F'
		// of a T perm as an "AUF" of the F layer)
		var llFace = '';
		var d = newCube();
		for (var f = 0; f < 6 && !llFace; f++) {
			d.init(c.ca, c.ea);
			d.selfMoveStr('URFDLB'.charAt(f), false);
			if (cubeutil.getProgress(d, cfg.method) == cfg.leftProg) {
				llFace = 'URFDLB'.charAt(f);
			}
		}
		ret.pre = !!llFace && moves[0][0].charAt(0) == llFace;
		ret.post = !!llFace && moves[moves.length - 1][0].charAt(0) == llFace;
		return ret;
	}

	// A trainer solve ends when the step is done in the solver's frame (OLL trainer: the last layer is
	// oriented), so all of it is the step. calcRecons checks the progress on 6 axes and can end the step
	// early on a state that only looks done on a side axis: e.g. an OLL ending in f' typed as F' S' (the
	// virtual cube has no f key) is, before the S', a B turn away from the end, which seen with B on top
	// is "F2L + OLL done". Then the later steps belong to this one.
	function trainerStep(data, cfg) {
		var later = newCube(); // the moves after the step
		var tmp = newCube();
		for (var k = cfg.stage - 1; k >= 0; k--) {
			mathlib.CubieCube.CubeMult(later, data[k][4], tmp);
			later.init(tmp.ca, tmp.ea);
		}
		var after = newCube();
		after.invFrom(later); // the cube once the step's own moves are done (the solve ends solved)
		var sdata = data[cfg.stage];
		if (cfg.done(after)) {
			return sdata;
		}
		var trans = newCube();
		mathlib.CubieCube.CubeMult(sdata[4], later, trans);
		var ret = [sdata[0], sdata[1], data[0][2], sdata[3], trans, sdata[5].slice(), (sdata[6] || []).slice()];
		for (var k = cfg.stage - 1; k >= 0; k--) {
			ret[3] += data[k][3];
			Array.prototype.push.apply(ret[5], data[k][5]);
		}
		return ret;
	}

	// OLL done in the cube's own frame: D layer (F2L) solved and the U-layer pieces oriented, permuted or not
	function ollDone(c) {
		for (var i = 0; i < 4; i++) {
			if (c.ca[i] >> 3 || c.ea[i] & 1 || c.ca[i + 4] != i + 4 || c.ea[i + 4] != (i + 4) * 2 || c.ea[i + 8] != (i + 8) * 2) {
				return false;
			}
		}
		return true;
	}

	function isAnalyzable(times) {
		return times && times[4] && times[0][0] >= 0 && (!times[4][1] || times[4][1] == '333');
	}

	// a solve of the current session: reuses the recons cached by stats
	function extraFunc(step, times, idx) {
		if (!isAnalyzable(times)) {
			return;
		}
		var cfg = STEPS[step];
		var ret = analyzeRecons(stats.getExtraInfo('recons_' + cfg.method, idx), cfg);
		if (ret) {
			ret.d = times[3] || 0;
		}
		return ret;
	}

	// a solve of another session (not cached by stats); one reconstruction serves every step of its method
	function analyzeTimes(step, times) {
		if (!isAnalyzable(times)) {
			return;
		}
		var key = step + '|' + times[4][0];
		if (!(key in solveCache)) {
			var method = STEPS[step].method;
			var rec = recons.calcRecons(times, method);
			for (var s in STEPS) {
				if (STEPS[s].method != method) {
					continue;
				}
				var ret = analyzeRecons(rec, STEPS[s]);
				if (ret) {
					ret.d = times[3] || 0;
				}
				solveCache[s + '|' + times[4][0]] = ret;
			}
		}
		return solveCache[key];
	}

	function curSessionRecs(step) {
		var recs = [];
		var nsolv = stats.getTimesStatsTable().timesLen;
		for (var i = 0; i < nsolv; i++) {
			var r = stats.getExtraInfo('algstat_' + step, i);
			if (r) {
				recs.push(r);
			}
		}
		return recs;
	}

	// ---------- aggregation ----------

	function aggregate(recs, step) {
		var cfg = STEPS[step];
		var ident = cubeutil.getIdentData(cfg.ident);
		var nRecent = ~~kernel.getProp(cfg.prop + 'Recent', 12);
		var cases = {};
		for (var i = 0; i < recs.length; i++) {
			var r = recs[i];
			var cs = cases[r.c] = cases[r.c] || {c: r.c, n: 0, tot: 0, rec: 0, exe: 0, mv: 0, best: 1e9, pre: 0, post: 0, tots: []};
			cs.n++;
			cs.tot += r.tot;
			cs.rec += r.rec;
			cs.exe += r.exe;
			cs.mv += r.mv;
			cs.best = Math.min(cs.best, r.tot);
			cs.pre += r.pre ? 1 : 0;
			cs.post += r.post ? 1 : 0;
			cs.tots.push(r.tot);
		}
		var stat = overallStat(recs, cfg);
		var rows = [];
		for (var c in cases) {
			var cs = cases[c];
			var isSkip = cs.c == cfg.skip;
			var sd = isSkip ? -1 : stdDev(cs.tots, cs.tot / cs.n);
			var recent = cs.tots.slice(-nRecent);
			var sumRecent = 0;
			for (var i = 0; i < recent.length; i++) {
				sumRecent += recent[i];
			}
			rows.push({
				c: cs.c,
				name: isSkip ? 'skip' : ident[1](cs.c)[2],
				skip: isSkip,
				n: cs.n,
				share: cs.n / recs.length,
				tot: isSkip ? -1 : cs.tot / cs.n,
				rec: isSkip ? -1 : cs.rec / cs.n,
				exe: isSkip ? -1 : cs.exe / cs.n,
				tps: isSkip || cs.exe <= 0 ? -1 : cs.mv / cs.exe * 1000,
				mv: isSkip ? -1 : cs.mv / cs.n,
				best: isSkip ? -1 : cs.best,
				recent: isSkip ? -1 : sumRecent / recent.length,
				sd: sd,
				score: isSkip ? -1e9 : weakScore(cs.tot / cs.n, cs.n, stat),
				nRecent: recent.length,
				pre: cs.pre / cs.n,
				post: cs.post / cs.n
			});
		}
		// the slowest cases (by mean time) are the ones to practice
		var bySlow = rows.filter(function(row) {
			return !row.skip;
		}).sort(function(a, b) {
			return b.tot - a.tot;
		});
		for (var i = 0; i < Math.min(SLOW_N, bySlow.length - 1); i++) {
			bySlow[i].slow = i + 1;
		}
		return rows;
	}

	// ---------- OLL families and edge orientation ----------

	// family of a case name: csTimer's OLL names carry it ('OCLL-23', 'Point-1', 'SLBS-12')
	function caseFamily(name) {
		return name.split('-')[0];
	}

	// the families of a step's cases, in case order: [[family, number of cases], ...]
	function families(step) {
		var ident = cubeutil.getIdentData(STEPS[step].ident);
		var ret = [];
		var idx = {};
		for (var c = ident[2]; c < ident[3]; c++) {
			var fam = caseFamily(ident[1](c)[2]);
			if (!(fam in idx)) {
				idx[fam] = ret.length;
				ret.push([fam, 0]);
			}
			ret[idx[fam]][1]++;
		}
		return ret;
	}

	var eoCache = {};

	// oriented LL edges of an OLL case: 4 (also the skip), 2 ('line' or 'L') or 0 ('dot')
	function ollEdges(c) {
		if (!(c in eoCache)) {
			var face = cubeutil.getIdentData('OLL')[1](c)[0];
			var on = [1, 3, 5, 7].map(function(i) {
				return face.charAt(i) == 'D';
			});
			var n = on[0] + on[1] + on[2] + on[3];
			eoCache[c] = n == 4 ? 'all' : n == 0 ? 'dot' : (on[0] && on[3] || on[1] && on[2]) ? 'line' : 'L';
		}
		return eoCache[c];
	}

	// edge orientation at the start of the OLL of the recs (OLL skips count as all oriented)
	// chance with random edges: all 1/8, two 6/8 (line 2/8, L 4/8), dot 1/8
	function eoStat(recs) {
		var ret = {n: recs.length, all: 0, line: 0, L: 0, dot: 0};
		for (var i = 0; i < recs.length; i++) {
			ret[ollEdges(recs[i].c)]++;
		}
		ret.two = ret.line + ret.L;
		return ret;
	}

	// ---------- weakness score ----------

	var BOOST = 0.5;

	function stdDev(vals, mean) {
		if (vals.length < 2) {
			return -1;
		}
		var sum = 0;
		for (var i = 0; i < vals.length; i++) {
			sum += (vals[i] - mean) * (vals[i] - mean);
		}
		return Math.sqrt(sum / (vals.length - 1));
	}

	// mean and sigma of all times of the step in the recs (skips excluded)
	function overallStat(recs, cfg) {
		var tots = [];
		var sum = 0;
		for (var i = 0; i < recs.length; i++) {
			if (recs[i].c != cfg.skip) {
				tots.push(recs[i].tot);
				sum += recs[i].tot;
			}
		}
		var mean = tots.length ? sum / tots.length : 0;
		return {n: tots.length, mean: mean, sd: stdDev(tots, mean)};
	}

	// weakness = z-score of the case mean against all times of the step + a boost for cases with few
	// solves (an unseen case scores the boost alone)
	function weakScore(mean, n, stat) {
		var z = n > 0 && stat.sd > 0 ? (mean - stat.mean) / stat.sd : 0;
		return z + BOOST / Math.sqrt(n + 1);
	}

	// every case of the step (unseen ones too) with its score, weakest first
	function weakness(recs, step) {
		step = step || STEP;
		var cfg = STEPS[step];
		var ident = cubeutil.getIdentData(cfg.ident);
		var rows = aggregate(recs, step).filter(function(row) {
			return !row.skip;
		});
		var seen = {};
		for (var i = 0; i < rows.length; i++) {
			seen[rows[i].c] = 1;
		}
		var stat = overallStat(recs, cfg);
		for (var c = ident[2]; c < ident[3]; c++) {
			if (!seen[c]) {
				rows.push({c: c, name: ident[1](c)[2], n: 0, tot: -1, rec: -1, exe: -1, tps: -1, sd: -1, score: weakScore(0, 0, stat)});
			}
		}
		rows.sort(function(a, b) {
			return (b.score - a.score) || (a.c - b.c);
		});
		return {rows: rows, mean: stat.mean, sd: stat.sd, n: stat.n};
	}

	// recs of every session except skipIdx (a trainer leaves out its own session)
	function loadRecs(step, skipIdx, callback) {
		var sessionN = ~~kernel.getProp('sessionN');
		var mgr = stats.getSessionManager();
		var recs = [];
		var proc = Promise.resolve();
		for (var i = 0; i < sessionN; i++) {
			var idx = mgr.rank2idx(i + 1);
			if (idx == skipIdx) {
				continue;
			}
			proc = proc.then((function(idx) {
				return storage.get(idx).then(function(times) {
					for (var j = 0; j < times.length; j++) {
						var r = analyzeTimes(step, times[j]);
						r && recs.push(r);
					}
				});
			}).bind(null, idx));
		}
		proc.then(function() {
			recs.sort(function(a, b) {
				return a.d - b.d;
			});
			callback(recs);
		});
	}

	// ---------- rendering helpers ----------

	function caseImg(row, cfg) {
		var col = kernel.getProp('colcube');
		if (col != imgCol) {
			imgCache = {};
			imgCol = col;
		}
		var key = cfg.ident + row.c;
		if (!(key in imgCache)) {
			var img = $('<img>');
			if (row.skip && cfg.skipImg) {
				image.llImage.drawImage(cfg.skipImg, [], img);
			} else {
				cubeutil.getIdentData(cfg.ident)[1](row.c, img);
			}
			imgCache[key] = img.attr('src');
		}
		return imgCache[key];
	}

	function fmtTime(v) {
		return v < 0 ? '-' : kernel.pretty(Math.round(v));
	}

	function fmtNum(v, digits) {
		return v < 0 ? '-' : v.toFixed(digits);
	}

	function fmtPct(n, total) {
		return (total ? n / total * 100 : 0).toFixed(1) + '%';
	}

	function cellHtml(key, row, cfg, maxTot) {
		switch (key) {
			case 'name':
				return '<img src="' + caseImg(row, cfg) + '"/><span>' + row.name + '</span>' +
					(row.slow ? '<span class="jlas-tag selected">#' + row.slow + '</span>' : '');
			case 'n':
				return row.n;
			case 'share':
				return (row.share * 100).toFixed(1);
			case 'tot':
				if (row.tot < 0) {
					return '-';
				}
				return fmtTime(row.tot) + '<div class="jlas-bar">' +
					'<span class="cntbar sty2" style="width:' + (row.rec / maxTot * 100).toFixed(1) + '%;"></span>' +
					'<span class="cntbar" style="width:' + (row.exe / maxTot * 100).toFixed(1) + '%;"></span></div>';
			case 'rec':
			case 'exe':
			case 'best':
				return fmtTime(row[key]);
			case 'recent':
				if (row.recent < 0) {
					return '-';
				}
				// all solves of the case are in the window: same as the mean, shown dimmed
				return row.nRecent < row.n ? fmtTime(row.recent) : '<span class="jlas-dim">' + fmtTime(row.recent) + '</span>';
			case 'tps':
				return fmtNum(row.tps, 2);
			case 'sd':
				return fmtTime(row.sd);
			case 'score':
				return row.skip ? '-' : '<span class="' + (row.score >= 0.5 ? 'jlas-weak' : '') + '">' + row.score.toFixed(2) + '</span>';
			case 'mv':
				return fmtNum(row.mv, 1);
		}
	}

	function selectHtml(name, options, val) {
		var ret = ['<select data-opt="' + name + '">'];
		for (var i = 0; i < options.length; i++) {
			ret.push('<option value="' + options[i][0] + '"' + (options[i][0] == val ? ' selected' : '') + '>' + options[i][1] + '</option>');
		}
		ret.push('</select>');
		return ret.join('');
	}

	function eoHtml(recs) {
		var eo = eoStat(recs);
		return '<div class="jlas-sum jlas-eo" title="oriented last-layer edges when the OLL starts (an OLL skip counts as all oriented); ' +
			'two: line ' + fmtPct(eo.line, eo.n) + ' (chance 25%), L ' + fmtPct(eo.L, eo.n) + ' (chance 50%)">' +
			'edges at OLL: all <b>' + fmtPct(eo.all, eo.n) + '</b> &middot; two <b>' + fmtPct(eo.two, eo.n) + '</b> &middot; dot <b>' +
			fmtPct(eo.dot, eo.n) + '</b> <span class="jlas-dim">(chance 12.5 / 75 / 12.5%)</span></div>';
	}

	function noteHtml(step, nRecent) {
		var cfg = STEPS[step];
		if (step == 'OLL') {
			return '<div class="jlas-note">' +
				'<b>recog</b> is the pause from the last F2L turn to the first OLL turn; <b>exec</b> runs from the first to the last OLL turn ' +
				'(the turn that orients the last layer); <b>mean</b> is their sum and <b>TPS</b> is turns / exec. ' +
				'Times are move timestamps, so the last turn counts at its start. ' +
				'<b>AUF</b>: the case is the same whatever the AUF; a U turn before the alg is part of the OLL (in exec and turns), ' +
				'a y rotation instead counts as recognition. Hover a row for its pre-AUF rate. ' +
				'<b>Skip</b>: a solve whose last layer was already oriented when F2L was done counts as a skip. ' +
				'Skips count in N and % but not in the time columns. ' +
				'<b>edges at OLL</b>: how many last-layer edges were oriented when the OLL started (all four, also for a skip; two, as a line or an L; ' +
				'none, a dot case), against the chance with random edges (12.5 / 75 / 12.5%). Hover it for line vs L. ' +
				'The ' + SLOW_N + ' slowest cases by mean are tagged #1-#' + SLOW_N + '. ' +
				'<b>weak</b> is the weakness score: how many σ the case mean is above the mean of all OLL times shown, ' +
				'plus 0.5 / √(N + 1) so that rarely seen cases are drilled too (higher = weaker). ' +
				'<b>drill weakest N</b> opens the OLL trainer (Tools) on the N weakest cases, scored from all sessions but the drill one. ' +
				'In a trainer solve (only the OLL to solve) <b>recog</b> runs from the moment the case is shown. ' +
				'<b>all but drill</b> leaves out the trainer\'s "OLL drill" session. ' +
				'The family list shows only the cases of one family (csTimer\'s case names: Point = dot, OCLL = edges oriented, CO = corners oriented, ...). ' +
				'A dimmed <b>last ' + nRecent + '</b> means the case has no more than ' + nRecent + ' solves, so it equals the mean. ' +
				'Counted: finished 3x3 solves with a move record (virtual or smart cube), DNFs excluded.' +
				'</div>';
		}
		return '<div class="jlas-note">' +
			'<b>recog</b> is the pause from the last OLL turn to the first PLL turn; <b>exec</b> runs from the first to the last PLL turn; ' +
			'<b>mean</b> is their sum and <b>TPS</b> is turns / exec. Times are move timestamps, so the last turn counts at its start. ' +
			'<b>AUF</b>: the case is the same whatever the AUF. Pre- and post-AUF turns are part of the PLL (in exec and turns); ' +
			'a y rotation instead of a pre-AUF counts as recognition. Hover a row for its AUF rates. ' +
			'<b>Skip</b>: a solve whose PLL was already solved after OLL counts as a skip, also when it needed an AUF ' +
			'(that AUF stays in the OLL step). Skips count in N and % but not in the time columns. ' +
			'The ' + SLOW_N + ' slowest cases by mean are tagged #1-#' + SLOW_N + '. ' +
			'<b>weak</b> is the weakness score: how many σ the case mean is above the mean of all PLL times shown, ' +
			'plus 0.5 / √(N + 1) so that rarely seen cases are drilled too (higher = weaker). ' +
			'<b>drill weakest N</b> opens the PLL trainer (Tools) on the N weakest cases, scored from all sessions but the drill one. ' +
			'In a trainer solve (only the PLL to solve) <b>recog</b> runs from the moment the case is shown. ' +
			'<b>all but drill</b> leaves out the trainer\'s "PLL drill" session. ' +
			'A dimmed <b>last ' + nRecent + '</b> means the case has no more than ' + nRecent + ' solves, so it equals the mean. ' +
			'Counted: finished 3x3 solves with a move record (virtual or smart cube), DNFs excluded.' +
			'</div>';
	}

	// ---------- one tool + dialog per step ----------

	function View(step) {
		var cfg = STEPS[step];
		var COLS = getCols(step);
		var P = cfg.prop;
		var toolDiv = null;
		var dialogDiv = $('<div class="jlas jlas-full">');
		var dialogLink = $('<a>').css('display', 'none');
		var dialogWrap = $('<div>').append(dialogDiv, dialogLink);
		var isDialog = false;
		var others = null;
		var loadingTid = 0;

		function drill() {
			return window[cfg.drill];
		}

		// the dialog is ours and open (another dialog, or hideDialog without a close callback, moves it out)
		function dialogOpen() {
			if (isDialog && !dialogDiv.closest('.dialog').length) {
				isDialog = false;
			}
			return isDialog;
		}

		// scope 'a': all sessions, 'r': all sessions but the trainer's drill session
		function drillSession(scope) {
			return scope == 'r' && drill() ? drill().sessionIdx() : 0;
		}

		function loadOthers(scope, callback) {
			var curSession = ~~kernel.getProp('session');
			var sessionN = ~~kernel.getProp('sessionN');
			var skipIdx = drillSession(scope);
			var mgr = stats.getSessionManager();
			var recs = [];
			var proc = Promise.resolve();
			for (var i = 0; i < sessionN; i++) {
				var idx = mgr.rank2idx(i + 1);
				if (idx == curSession || idx == skipIdx) {
					continue;
				}
				proc = proc.then((function(idx) {
					return storage.get(idx).then(function(times) {
						for (var j = 0; j < times.length; j++) {
							var r = analyzeTimes(step, times[j]);
							r && recs.push(r);
						}
					});
				}).bind(null, idx));
			}
			proc.then(function() {
				others = {
					session: curSession,
					scope: scope,
					recs: recs
				};
				callback();
			});
		}

		function sortRows(rows) {
			var col = kernel.getProp(P + 'Sort', 'tot');
			var dir = kernel.getProp(P + 'Dir', 'desc') == 'desc' ? -1 : 1;
			rows.sort(function(a, b) {
				// skip always last
				if (a.skip != b.skip) {
					return a.skip ? 1 : -1;
				}
				var ret = col == 'name' ? (a.c - b.c) : (a[col] - b[col]);
				return (ret || a.c - b.c) * dir;
			});
			return rows;
		}

		function render(div, recs, isFull, isLoading) {
			var scope = kernel.getProp(P + 'Scope', 's');
			var nRecent = ~~kernel.getProp(P + 'Recent', 12);
			var fam = cfg.fam ? kernel.getProp(P + 'Fam', '') : '';
			var html = ['<div class="jlas-bar0">'];
			html.push(selectHtml(P + 'Scope', [['s', 'this session'], ['a', 'all sessions'], ['r', 'all but drill']], scope));
			if (isFull) {
				html.push(selectHtml(P + 'Recent', [[5, 'last 5'], [12, 'last 12'], [25, 'last 25'], [50, 'last 50']], nRecent));
			}
			if (cfg.fam) {
				var fams = families(step);
				html.push(selectHtml(P + 'Fam', [['', 'all families']].concat(fams.map(function(f) {
					return [f[0], f[0] + ' (' + f[1] + ')'];
				})), fam));
			}
			var rows = isLoading ? [] : sortRows(aggregate(recs, step));
			var nSkip = 0;
			for (var i = 0; i < rows.length; i++) {
				if (rows[i].skip) {
					nSkip = rows[i].n;
				}
			}
			html.push('<span class="jlas-sum">' + (isLoading ? 'loading...' :
				recs.length + ' solves, ' + (rows.length - (nSkip ? 1 : 0)) + ' cases' + (nSkip ? ', ' + nSkip + ' skips' : '')) + '</span>');
			if (!isFull) {
				html.push('<span class="click jlas-open">full table</span>');
			}
			if (!isLoading && rows.length > 1 && drill()) {
				html.push('<span class="click jlas-drill" title="drill your weakest cases (scored from all sessions but the drill one) on the virtual cube">drill weakest ' + drill().getN() + '</span>');
			}
			html.push('</div>');
			if (cfg.eo && !isLoading && recs.length) {
				html.push(eoHtml(recs));
			}
			if (fam) {
				rows = rows.filter(function(row) {
					return !row.skip && caseFamily(row.name) == fam;
				});
			}
			var maxTot = 0;
			for (var i = 0; i < rows.length; i++) {
				if (!rows[i].skip) {
					maxTot = Math.max(maxTot, rows[i].tot);
				}
			}

			if (!isLoading && rows.length == 0) {
				html.push('<div class="jlas-empty">' + (fam && recs.length ? 'No ' + fam + ' case in these solves.' :
					'No ' + step + ' data yet: finish a CFOP 3x3 solve on the virtual cube or a smart cube.') + '</div>');
			} else if (!isLoading) {
				var sortCol = kernel.getProp(P + 'Sort', 'tot');
				var sortDir = kernel.getProp(P + 'Dir', 'desc');
				html.push('<div class="jlas-scroll"><table class="table jlas-table"><thead><tr>');
				for (var i = 0; i < COLS.length; i++) {
					if (!isFull && !COLS[i][3]) {
						continue;
					}
					var label = COLS[i][0] == 'recent' ? 'last ' + nRecent : COLS[i][1];
					html.push('<th class="click' + (COLS[i][0] == sortCol ? ' jlas-sorted' : '') + '" data-col="' + COLS[i][0] + '" title="' + COLS[i][2] + '">' +
						label + (COLS[i][0] == sortCol ? (sortDir == 'desc' ? ' &#9660;' : ' &#9650;') : '') + '</th>');
				}
				html.push('</tr></thead><tbody>');
				for (var r = 0; r < rows.length; r++) {
					var row = rows[r];
					var hover = row.skip ? '' : step == 'PLL' ?
						': pre-AUF in ' + Math.round(row.pre * 100) + '%, post-AUF in ' + Math.round(row.post * 100) + '% of solves' :
						': pre-AUF in ' + Math.round(row.pre * 100) + '% of solves';
					html.push('<tr class="' + (row.slow ? 'jlas-slow' : '') + (row.skip ? ' jlas-skip' : '') + '" title="' + row.name + hover + '">');
					for (var i = 0; i < COLS.length; i++) {
						if (!isFull && !COLS[i][3]) {
							continue;
						}
						html.push('<td class="jlas-' + COLS[i][0] + '">' + cellHtml(COLS[i][0], row, cfg, maxTot) + '</td>');
					}
					html.push('</tr>');
				}
				html.push('</tbody></table></div>');
				if (isFull) {
					html.push(noteHtml(step, nRecent));
				}
			}
			div.html(html.join(''));
			div.find('select').change(procChange);
			div.find('th[data-col]').click(procSort);
			div.find('.jlas-open').click(showDialog);
			div.find('.jlas-drill').click(function() {
				if (dialogOpen()) {
					kernel.hideDialog();
				}
				drill().drillWeakest();
			});
		}

		// the recs of the scope, oldest first
		function scopeRecs() {
			var recs = curSessionRecs(step);
			var scope = kernel.getProp(P + 'Scope', 's');
			if (scope == 's') {
				return recs;
			}
			if (!others || others.session != ~~kernel.getProp('session') || others.scope != scope) {
				return null;
			}
			recs = others.recs.concat(drillSession(scope) == ~~kernel.getProp('session') ? [] : recs);
			// oldest first, so "last N" means the most recent solves
			return recs.map(function(r, i) {
				return [r, i];
			}).sort(function(a, b) {
				return (a[0].d - b[0].d) || (a[1] - b[1]);
			}).map(function(v) {
				return v[0];
			});
		}

		function update() {
			if (!toolDiv && !dialogOpen()) {
				return;
			}
			var recs = scopeRecs();
			if (!recs) {
				renderAll([], true);
				var myTid = ++loadingTid;
				loadOthers(kernel.getProp(P + 'Scope', 's'), function() {
					if (myTid == loadingTid) {
						update();
					}
				});
				return;
			}
			renderAll(recs, false);
		}

		function renderAll(recs, isLoading) {
			toolDiv && render(toolDiv, recs, false, isLoading);
			dialogOpen() && render(dialogDiv, recs, true, isLoading);
		}

		function procChange(e) {
			var target = $(e.target);
			kernel.setProp(target.attr('data-opt'), target.val());
			if (target.attr('data-opt') == P + 'Scope') {
				others = null;
			}
			update();
		}

		function procSort(e) {
			var col = $(e.target).closest('th').attr('data-col');
			if (kernel.getProp(P + 'Sort', 'tot') == col) {
				kernel.setProp(P + 'Dir', kernel.getProp(P + 'Dir', 'desc') == 'desc' ? 'asc' : 'desc');
			} else {
				kernel.setProp(P + 'Sort', col);
				kernel.setProp(P + 'Dir', col == 'name' ? 'asc' : 'desc');
			}
			update();
		}

		function exportCSV() {
			var recs = curSessionRecs(step);
			var scope = kernel.getProp(P + 'Scope', 's');
			if (scope != 's' && others) {
				recs = others.recs.concat(drillSession(scope) == ~~kernel.getProp('session') ? [] : recs);
			}
			var ident = cubeutil.getIdentData(cfg.ident);
			var lines = ['date,case,recog,exec,total,turns,tps,preAUF,postAUF'];
			for (var i = 0; i < recs.length; i++) {
				var r = recs[i];
				var isSkip = r.c == cfg.skip;
				lines.push([
					r.d ? new Date(r.d * 1000).toISOString() : '',
					isSkip ? 'skip' : ident[1](r.c)[2],
					(r.rec / 1000).toFixed(3),
					(r.exe / 1000).toFixed(3),
					(r.tot / 1000).toFixed(3),
					r.mv,
					r.exe > 0 ? (r.mv / r.exe * 1000).toFixed(2) : '',
					r.pre ? 1 : 0,
					r.post ? 1 : 0
				].join(','));
			}
			var blob = new Blob([lines.join('\n') + '\n'], {
				type: 'text/csv'
			});
			var url = URL.createObjectURL(blob);
			dialogLink.attr({
				href: url,
				download: step.toLowerCase() + '_solves.csv'
			}).get(0).click();
			setTimeout(function() {
				URL.revokeObjectURL(url);
			}, 5000);
			return false;
		}

		function showDialog() {
			isDialog = true;
			var onClose = function() {
				isDialog = false;
			};
			kernel.showDialog([dialogWrap, onClose, undefined, onClose, ['CSV', exportCSV]], 'algstats', cfg.title);
			update();
		}

		function execFunc(fdiv, signal) {
			if (fdiv == undefined) {
				toolDiv = null;
				return;
			}
			if (/^scr/.exec(signal)) {
				return;
			}
			toolDiv = $('<div class="jlas">');
			fdiv.empty().append(toolDiv);
			others = null;
			update();
		}

		return {
			execFunc: execFunc,
			update: update,
			showDialog: showDialog
		};
	}

	var views = {};
	for (var step in STEPS) {
		views[step] = View(step);
	}

	$(function() {
		for (var step in STEPS) {
			if (typeof tools != "undefined") {
				tools.regTool(STEPS[step].tool, TOOLS_RECONS + '>' + STEPS[step].title, views[step].execFunc);
			}
			stats.regUtil(STEPS[step].tool, views[step].update);
			stats.regExtraInfo('algstat_' + step, extraFunc.bind(null, step));
		}
	});

	return {
		STEPS: STEPS,
		analyzeRecons: analyzeRecons,
		analyzeTimes: analyzeTimes,
		curSessionRecs: curSessionRecs,
		weakness: weakness,
		weakScore: weakScore,
		eoStat: eoStat,
		ollDone: ollDone,
		ollEdges: ollEdges,
		families: families,
		caseFamily: caseFamily,
		loadRecs: loadRecs,
		// showDialog() / update() without a step: PLL (as before OLL stats existed)
		showDialog: function(step) {
			views[typeof step == 'string' && step in views ? step : STEP].showDialog();
		},
		update: function() {
			for (var step in views) {
				views[step].update();
			}
		}
	};
});
