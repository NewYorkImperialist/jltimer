"use strict";

/**
 * jlTimer per-algorithm stats ("PLL stats" tool).
 *
 * Nothing is stored: every row is computed from the saved solves. A solve that carries a move
 * record (virtual cube or smart cube, times[4]) is split into CFOP steps by csTimer's own
 * reconstruction (recons.calcRecons, method 'cf4op'), and the last-layer case of the step is
 * identified with cubeutil's case tables (AUF does not change the case).
 *
 * The STEPS table below is the place to add OLL / COLL / ZBLL later; only PLL is enabled now.
 */
var algStat = execMain(function() {

	// step config
	//   method: recons method, stage: index into the recons data (0 = last step of the method)
	//   ident: cubeutil.getIdentData key, skip: case index of an already solved step (-1 if none)
	//   leftProg: cubeutil.getProgress value while only this step is left (to count pre-AUF)
	//   skipImg: llImage pieces for the skip row
	var STEPS = {
		'PLL': {
			method: 'cf4op',
			stage: 0,
			ident: 'PLL',
			skip: 21,
			leftProg: 1,
			skipImg: 'DDDDDDDDDBBBRRRFFFLLL'
		}
	};
	var STEP = 'PLL';

	// columns: key, header, tooltip, compact view
	var COLS = [
		['name', 'case', 'PLL case (hover for AUF rates)', 1],
		['n', 'N', 'number of solves with this case', 1],
		['share', '%', 'share of analysed solves', 0],
		['tot', 'mean', 'mean PLL time (recognition + execution)', 1],
		['rec', 'recog', 'mean recognition: pause from the last OLL turn to the first PLL turn', 0],
		['exe', 'exec', 'mean execution: first to last PLL turn', 0],
		['tps', 'TPS', 'execution TPS: turns / execution time', 1],
		['mv', 'turns', 'mean turns (HTM, slice = 1, rotations not counted)', 0],
		['best', 'best', 'best PLL time', 0],
		['recent', 'last', 'mean PLL time of the most recent solves of this case', 0]
	];
	var SLOW_N = 3;

	var toolDiv = null;
	var dialogDiv = $('<div class="jlas jlas-full">');
	var dialogLink = $('<a>').css('display', 'none');
	var dialogWrap = $('<div>').append(dialogDiv, dialogLink);
	var isDialog = false;
	var solveCache = {};
	var others = null;
	var loadingTid = 0;
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
		if (!rec || !rec.data || rec.data.length < cubeutil.getStepCount(cfg.method)) {
			return;
		}
		var sdata = rec.data[cfg.stage];
		if (!sdata) {
			return;
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

	// a solve of another session (not cached by stats)
	function analyzeTimes(step, times) {
		if (!isAnalyzable(times)) {
			return;
		}
		var key = step + '|' + times[4][0];
		if (!(key in solveCache)) {
			var cfg = STEPS[step];
			var ret = analyzeRecons(recons.calcRecons(times, cfg.method), cfg);
			if (ret) {
				ret.d = times[3] || 0;
			}
			solveCache[key] = ret;
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

	function loadOthers(step, callback) {
		var curSession = ~~kernel.getProp('session');
		var sessionN = ~~kernel.getProp('sessionN');
		var mgr = stats.getSessionManager();
		var recs = [];
		var proc = Promise.resolve();
		for (var i = 0; i < sessionN; i++) {
			var idx = mgr.rank2idx(i + 1);
			if (idx == curSession) {
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
				step: step,
				session: curSession,
				recs: recs
			};
			callback();
		});
	}

	// ---------- aggregation ----------

	function aggregate(recs, step) {
		var cfg = STEPS[step];
		var ident = cubeutil.getIdentData(cfg.ident);
		var nRecent = ~~kernel.getProp('algStatRecent', 12);
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
		var rows = [];
		for (var c in cases) {
			var cs = cases[c];
			var isSkip = cs.c == cfg.skip;
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

	function sortRows(rows) {
		var col = kernel.getProp('algStatSort', 'tot');
		var dir = kernel.getProp('algStatDir', 'desc') == 'desc' ? -1 : 1;
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

	// ---------- rendering ----------

	function caseImg(row, cfg) {
		var col = kernel.getProp('colcube');
		if (col != imgCol) {
			imgCache = {};
			imgCol = col;
		}
		if (!(row.c in imgCache)) {
			var img = $('<img>');
			if (row.skip) {
				image.llImage.drawImage(cfg.skipImg, [], img);
			} else {
				cubeutil.getIdentData(cfg.ident)[1](row.c, img);
			}
			imgCache[row.c] = img.attr('src');
		}
		return imgCache[row.c];
	}

	function fmtTime(v) {
		return v < 0 ? '-' : kernel.pretty(Math.round(v));
	}

	function fmtNum(v, digits) {
		return v < 0 ? '-' : v.toFixed(digits);
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

	function render(div, recs, isFull, isLoading) {
		var cfg = STEPS[STEP];
		var scope = kernel.getProp('algStatScope', 's');
		var nRecent = ~~kernel.getProp('algStatRecent', 12);
		var html = ['<div class="jlas-bar0">'];
		html.push(selectHtml('algStatScope', [['s', 'this session'], ['a', 'all sessions']], scope));
		if (isFull) {
			html.push(selectHtml('algStatRecent', [[5, 'last 5'], [12, 'last 12'], [25, 'last 25'], [50, 'last 50']], nRecent));
		}
		var rows = isLoading ? [] : sortRows(aggregate(recs, STEP));
		var nSkip = 0;
		var maxTot = 0;
		for (var i = 0; i < rows.length; i++) {
			if (rows[i].skip) {
				nSkip = rows[i].n;
			} else {
				maxTot = Math.max(maxTot, rows[i].tot);
			}
		}
		html.push('<span class="jlas-sum">' + (isLoading ? 'loading...' :
			recs.length + ' solves, ' + (rows.length - (nSkip ? 1 : 0)) + ' cases' + (nSkip ? ', ' + nSkip + ' skips' : '')) + '</span>');
		if (!isFull) {
			html.push('<span class="click jlas-open">full table</span>');
		}
		html.push('</div>');

		if (!isLoading && rows.length == 0) {
			html.push('<div class="jlas-empty">No ' + STEP + ' data yet: finish a CFOP 3x3 solve on the virtual cube or a smart cube.</div>');
		} else if (!isLoading) {
			var sortCol = kernel.getProp('algStatSort', 'tot');
			var sortDir = kernel.getProp('algStatDir', 'desc');
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
				html.push('<tr class="' + (row.slow ? 'jlas-slow' : '') + (row.skip ? ' jlas-skip' : '') + '" title="' +
					row.name + (row.skip ? '' : ': pre-AUF in ' + Math.round(row.pre * 100) + '%, post-AUF in ' + Math.round(row.post * 100) + '% of solves') + '">');
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
				html.push('<div class="jlas-note">' +
					'<b>recog</b> is the pause from the last OLL turn to the first PLL turn; <b>exec</b> runs from the first to the last PLL turn; ' +
					'<b>mean</b> is their sum and <b>TPS</b> is turns / exec. Times are move timestamps, so the last turn counts at its start. ' +
					'<b>AUF</b>: the case is the same whatever the AUF. Pre- and post-AUF turns are part of the PLL (in exec and turns); ' +
					'a y rotation instead of a pre-AUF counts as recognition. Hover a row for its AUF rates. ' +
					'<b>Skip</b>: a solve whose PLL was already solved after OLL counts as a skip, also when it needed an AUF ' +
					'(that AUF stays in the OLL step). Skips count in N and % but not in the time columns. ' +
					'The ' + SLOW_N + ' slowest cases by mean are tagged #1-#' + SLOW_N + '. ' +
					'A dimmed <b>last ' + nRecent + '</b> means the case has no more than ' + nRecent + ' solves, so it equals the mean. ' +
					'Counted: finished 3x3 solves with a move record (virtual or smart cube), DNFs excluded.' +
					'</div>');
			}
		}
		div.html(html.join(''));
		div.find('select').change(procChange);
		div.find('th[data-col]').click(procSort);
		div.find('.jlas-open').click(showDialog);
	}

	function update() {
		if (!toolDiv && !isDialog) {
			return;
		}
		var recs = curSessionRecs(STEP);
		if (kernel.getProp('algStatScope', 's') == 'a') {
			if (!others || others.step != STEP || others.session != ~~kernel.getProp('session')) {
				renderAll([], true);
				var myTid = ++loadingTid;
				loadOthers(STEP, function() {
					if (myTid == loadingTid) {
						update();
					}
				});
				return;
			}
			recs = others.recs.concat(recs);
			// oldest first, so "last N" means the most recent solves
			recs = recs.map(function(r, i) {
				return [r, i];
			}).sort(function(a, b) {
				return (a[0].d - b[0].d) || (a[1] - b[1]);
			}).map(function(v) {
				return v[0];
			});
		}
		renderAll(recs, false);
	}

	function renderAll(recs, isLoading) {
		toolDiv && render(toolDiv, recs, false, isLoading);
		isDialog && render(dialogDiv, recs, true, isLoading);
	}

	function procChange(e) {
		var target = $(e.target);
		kernel.setProp(target.attr('data-opt'), target.val());
		if (target.attr('data-opt') == 'algStatScope') {
			others = null;
		}
		update();
	}

	function procSort(e) {
		var col = $(e.target).closest('th').attr('data-col');
		if (kernel.getProp('algStatSort', 'tot') == col) {
			kernel.setProp('algStatDir', kernel.getProp('algStatDir', 'desc') == 'desc' ? 'asc' : 'desc');
		} else {
			kernel.setProp('algStatSort', col);
			kernel.setProp('algStatDir', col == 'name' ? 'asc' : 'desc');
		}
		update();
	}

	function exportCSV() {
		var recs = curSessionRecs(STEP);
		if (kernel.getProp('algStatScope', 's') == 'a' && others) {
			recs = others.recs.concat(recs);
		}
		var cfg = STEPS[STEP];
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
			download: STEP.toLowerCase() + '_solves.csv'
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
		kernel.showDialog([dialogWrap, onClose, undefined, onClose, ['CSV', exportCSV]], 'algstats', STEP + ' stats');
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

	$(function() {
		if (typeof tools != "undefined") {
			tools.regTool('algstat', TOOLS_RECONS + '>' + 'PLL stats', execFunc);
		}
		stats.regUtil('algstat', update);
		for (var step in STEPS) {
			stats.regExtraInfo('algstat_' + step, extraFunc.bind(null, step));
		}
	});

	return {
		STEPS: STEPS,
		analyzeRecons: analyzeRecons,
		analyzeTimes: analyzeTimes,
		curSessionRecs: curSessionRecs,
		showDialog: showDialog,
		update: update
	};
});
