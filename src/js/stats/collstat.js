// @ts-check
"use strict";

/**
 * jlTimer COLL / ZBLL stats (Tools > Reconstruct > COLL / ZBLL stats).
 *
 * A CFOP solve has no COLL or ZBLL step of its own: the alg shows up as an OCLL (an OLL with all
 * last-layer edges oriented) whose OLL step also solves the corners (the PLL left is Ua, Ub, H, Z or a
 * skip) or the whole last layer (PLL skip). So this tool pairs the OLL and PLL records of each solve
 * (algstat.js, from csTimer's cf4op reconstruction) and, for the OCLL ones, the corners-only case at the
 * start of the OLL step (cubeutil's COLL table, any AUF): 40 COLL cases in 7 OCLL shapes.
 *
 * "COLL" below means "corners solved after the OLL step". A plain OCLL alg leaves them solved by chance
 * in 1/6 of solves (the corner permutation is random: 4 of its 24 states are solved up to AUF), so a rate
 * near 100% means the user knows the COLLs of that shape. After a COLL the edges are random, and the PLL
 * is a skip in 1/12 of solves. The skips beyond that chance are ZBLLs (one solve cannot tell a ZBLL from
 * luck, a COLL case can): a known ZBLL turns 1/12 of the case's solves into skips, so the excess skips of a
 * case, over n / 12, estimate how many of its 12 ZBLLs the user knows. A ZBLL alg is often as long as the
 * COLL alg, so the move count cannot tell them apart; it is only shown in the skip list (SLIP+ moves away
 * from the usual alg of the case = another alg).
 *
 * Nothing is stored. The work runs in small time slices and waits while the timer runs.
 */
var collStat = execMain(function() {
	var PLL_SKIP = 21;
	var EDGE_ONLY = {0: 1, 1: 1, 2: 1, 3: 1, 21: 1}; // PLL cases H, Ua, Ub, Z and the skip
	var CHANCE = 1 / 6; // corners solved up to AUF after a plain OCLL alg
	var SKIP_AFTER = 1 / 12; // PLL skip after the corners are solved, edges random
	var KNOWN = 0.75; // a shape / case counts as known from this rate on
	var SLICE = 25; // ms of work per time slice
	// shape key (prefix of the COLL case name), name, OLL case name
	var SHAPES = [
		['H', 'H', 'OCLL-21'],
		['Pi', 'Pi', 'OCLL-22'],
		['U', 'U (headlights)', 'OCLL-23'],
		['T', 'T', 'OCLL-24'],
		['L', 'L (bowtie)', 'OCLL-25'],
		['S', 'Sune', 'OCLL-27'],
		['aS', 'Antisune', 'OCLL-26']
	];
	var SKIP_LIST = 15;
	var SLIP = 4; // moves away from the usual alg of the case that mark a skip as "another alg"
	var USUAL_MIN = 3; // corners-solved, non-skip solves of a case needed for its usual move count

	var toolDiv = null;
	var dialogDiv = $('<div class="jlas jlas-full jlcs">');
	var dialogWrap = $('<div>').append(dialogDiv);
	var isDialog = false;
	var jobId = 0;
	var others = null; // {session, recs}: the other sessions, for scope 'a'
	var shown = null; // last result: {scope, n, recs}
	var imgCache = {};
	var imgCol = '';
	var ollIdx = null;

	// ---------- per solve ----------

	function collName(c) {
		return cubeutil.getIdentData('COLL')[1](c)[2];
	}

	function shapeOf(c) {
		return collName(c).split('-')[0];
	}

	function shapeName(key) {
		for (var i = 0; i < SHAPES.length; i++) {
			if (SHAPES[i][0] == key) {
				return SHAPES[i][1];
			}
		}
		return key;
	}

	// OLL case index of each shape (for its image)
	function shapeOll(key) {
		if (!ollIdx) {
			ollIdx = {};
			var ident = cubeutil.getIdentData('OLL');
			for (var c = ident[2]; c < ident[3]; c++) {
				var name = ident[1](c)[2];
				for (var i = 0; i < SHAPES.length; i++) {
					if (SHAPES[i][2] == name) {
						ollIdx[SHAPES[i][0]] = c;
					}
				}
			}
		}
		return ollIdx[key];
	}

	// o, p: OLL and PLL records of one solve (algstat.js); t: the solve
	// return {coll, shape, ocll: OLL case, o: OLL time, ll: OLL + PLL time, pc: PLL case, cs: corners solved
	// after the OLL step, skip: PLL skip, mv: OLL turns (HTM), mvc: OLL moves as executed without AUF, d: date, t}
	// or undefined (not an OCLL)
	function pairOf(o, p, t) {
		if (!o || !p || !(o.coll >= 0 && o.coll < 40)) {
			return;
		}
		return {
			coll: o.coll,
			shape: shapeOf(o.coll),
			ocll: o.c,
			o: o.tot,
			ll: o.tot + p.tot,
			pc: p.c,
			cs: !!EDGE_ONLY[p.c],
			skip: p.c == PLL_SKIP,
			mv: o.mv,
			mvc: o.mvc,
			d: o.d,
			t: t
		};
	}

	// ---------- loading (sliced) ----------

	function timerBusy() {
		return window.timer && timer.getCurTime && timer.getCurTime() > 0;
	}

	// call fn(i) for i in [0, n) in time slices, then done(); stops when myJob is outdated
	function sliced(myJob, n, fn, done, progress) {
		var i = 0;

		function tick() {
			if (myJob != jobId || !visible()) {
				return;
			}
			if (timerBusy()) {
				setTimeout(tick, 500);
				return;
			}
			var t0 = performance.now();
			while (i < n && performance.now() - t0 < SLICE) {
				fn(i++);
			}
			if (i >= n) {
				done();
				return;
			}
			progress && progress(i, n);
			setTimeout(tick, 0);
		}
		tick();
	}

	// pairs of the current session (stats caches the reconstructions and records)
	function loadSession(myJob, callback) {
		var n = stats.getTimesStatsTable().timesLen;
		var nSolves = 0;
		var recs = [];
		sliced(myJob, n, function(i) {
			var o = stats.getExtraInfo('algstat_OLL', i);
			var p = stats.getExtraInfo('algstat_PLL', i);
			nSolves += o && p ? 1 : 0;
			var r = pairOf(o, p, stats.timesAt(i));
			r && recs.push(r);
		}, function() {
			callback(recs, nSolves);
		}, function(i, n) {
			renderLoading(i, n);
		});
	}

	// pairs of every other session
	function loadOthers(myJob, callback) {
		var cur = ~~kernel.getProp('session');
		var sessionN = ~~kernel.getProp('sessionN');
		var mgr = stats.getSessionManager();
		var all = [];
		var proc = Promise.resolve();
		for (var r = 0; r < sessionN; r++) {
			var idx = mgr.rank2idx(r + 1);
			if (idx == cur) {
				continue;
			}
			proc = proc.then((function(idx) {
				return storage.get(idx).then(function(times) {
					Array.prototype.push.apply(all, times);
				});
			}).bind(null, idx));
		}
		proc.then(function() {
			var recs = [];
			var nSolves = 0;
			sliced(myJob, all.length, function(i) {
				var o = algStat.analyzeTimes('OLL', all[i]);
				var p = algStat.analyzeTimes('PLL', all[i]);
				nSolves += o && p ? 1 : 0;
				var r = pairOf(o, p, all[i]);
				r && recs.push(r);
			}, function() {
				others = {session: cur, recs: recs, nSolves: nSolves};
				callback();
			}, function(i, n) {
				renderLoading(i, n);
			});
		});
	}

	// ---------- aggregation ----------

	function newGroup() {
		return {n: 0, cs: 0, skip: 0, alt: 0, oCs: 0, oOt: 0, llCs: 0, llOt: 0};
	}

	function addTo(g, r) {
		g.n++;
		if (r.cs) {
			g.cs++;
			g.oCs += r.o;
			g.llCs += r.ll;
		} else {
			g.oOt += r.o;
			g.llOt += r.ll;
		}
		g.skip += r.skip ? 1 : 0;
		g.alt += r.alt ? 1 : 0;
	}

	// means and rates of a group; times are -1 when the group is empty
	function finish(g) {
		var nOt = g.n - g.cs;
		g.rate = g.n ? g.cs / g.n : 0;
		g.oCsM = g.cs ? g.oCs / g.cs : -1;
		g.oOtM = nOt ? g.oOt / nOt : -1;
		g.llCsM = g.cs ? g.llCs / g.cs : -1;
		g.llOtM = nOt ? g.llOt / nOt : -1;
		g.gain = g.cs >= 5 && nOt >= 5 ? g.llOtM - g.llCsM : null;
		// skips at the chance rate if every corners-solved solve were a COLL: the excess are ZBLLs.
		// z ZBLL solves among cs: skip = z + (cs - z) / 12
		g.luck = g.cs * SKIP_AFTER;
		g.excess = Math.max(0, (g.skip - g.luck) / (1 - SKIP_AFTER));
		// known ZBLLs (of one COLL case): each covers 1/12 of the case's solves; only when the skips are
		// clearly above chance (2 sigma + 1)
		g.zb = g.n && g.skip - g.luck > 2 * Math.sqrt(g.luck) + 1 ? g.excess / (g.n * SKIP_AFTER) : 0;
		return g;
	}

	// recs: pairs, oldest first; nSolves: solves with an OLL and a PLL record
	function median(arr) {
		var a = arr.slice().sort(function(x, y) {
			return x - y;
		});
		return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : -1;
	}

	function aggregate(recs, nSolves) {
		// the usual alg length of each case: its corners-solved solves that still needed a PLL
		var mvs = {};
		for (var i = 0; i < recs.length; i++) {
			var r = recs[i];
			if (r.cs && !r.skip) {
				(mvs[r.coll] = mvs[r.coll] || []).push(r.mvc);
			}
		}
		var usual = {};
		for (var ck in mvs) {
			usual[ck] = mvs[ck].length >= USUAL_MIN ? median(mvs[ck]) : -1;
		}
		for (var i = 0; i < recs.length; i++) {
			var r = recs[i];
			r.usual = r.coll in usual ? usual[r.coll] : -1;
			r.alt = r.skip && r.usual >= 0 && Math.abs(r.mvc - r.usual) >= SLIP;
		}
		var shapes = {};
		var cases = {};
		var tot = newGroup();
		for (var i = 0; i < SHAPES.length; i++) {
			shapes[SHAPES[i][0]] = newGroup();
		}
		var skips = [];
		for (var i = 0; i < recs.length; i++) {
			var r = recs[i];
			if (!shapes[r.shape]) {
				shapes[r.shape] = newGroup();
			}
			addTo(shapes[r.shape], r);
			addTo(cases[r.coll] = cases[r.coll] || newGroup(), r);
			addTo(tot, r);
			if (r.skip) {
				skips.push(r);
			}
		}
		var shapeRows = [];
		for (var i = 0; i < SHAPES.length; i++) {
			var g = finish(shapes[SHAPES[i][0]]);
			g.key = SHAPES[i][0];
			g.name = SHAPES[i][1];
			g.zb = 0; // the sum over its cases, below
			shapeRows.push(g);
		}
		finish(tot);
		tot.zb = 0;
		var caseRows = [];
		var ident = cubeutil.getIdentData('COLL');
		for (var s = 0; s < SHAPES.length; s++) {
			for (var c = ident[2]; c < ident[3]; c++) {
				if (shapeOf(c) != SHAPES[s][0]) {
					continue;
				}
				var g = finish(cases[c] || newGroup());
				g.c = c;
				g.key = SHAPES[s][0];
				g.name = collName(c);
				caseRows.push(g);
				shapeRows[s].zb += g.zb;
				tot.zb += g.zb;
			}
		}
		return {
			nSolves: nSolves,
			n: recs.length,
			tot: tot,
			shapes: shapeRows,
			cases: caseRows,
			skips: skips.slice(-SKIP_LIST).reverse(),
			nSkip: skips.length
		};
	}

	// ---------- rendering ----------

	function img(kind, c) {
		var col = kernel.getProp('colcube');
		if (col != imgCol) {
			imgCache = {};
			imgCol = col;
		}
		var key = kind + c;
		if (!(key in imgCache)) {
			var el = $('<img>');
			cubeutil.getIdentData(kind)[1](c, el);
			imgCache[key] = el.attr('src');
		}
		return '<img src="' + imgCache[key] + '"/>';
	}

	function fT(v) {
		return v < 0 ? '-' : kernel.pretty(Math.round(v));
	}

	function fP(x, digits) {
		return (x * 100).toFixed(digits === undefined ? 0 : digits) + '%';
	}

	function fGain(g) {
		if (g === null) {
			return '-';
		}
		return (g > 0 ? '−' : g < 0 ? '+' : '±') + (Math.abs(g) / 1000).toFixed(2);
	}

	function fD(ts) {
		if (!ts) {
			return '';
		}
		var d = new Date(ts * 1000);
		return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
	}

	function selectHtml(name, options, val) {
		var ret = ['<select data-opt="' + name + '">'];
		for (var i = 0; i < options.length; i++) {
			ret.push('<option value="' + options[i][0] + '"' + (options[i][0] == val ? ' selected' : '') + '>' + options[i][1] + '</option>');
		}
		ret.push('</select>');
		return ret.join('');
	}

	function rateHtml(g) {
		if (!g.n) {
			return '-';
		}
		return '<span class="' + (g.rate >= KNOWN && g.n >= 4 ? 'jlas-weak' : '') + '">' + fP(g.rate) + '</span>';
	}

	// columns: key, header, tooltip, compact view
	var SHAPE_COLS = [
		['name', 'shape', 'OCLL shape: the OLL with all last-layer edges oriented', 1],
		['n', 'N', 'solves with this OCLL', 1],
		['rate', 'COLL', 'share of these solves with the corners solved after the OLL step (the PLL was Ua, Ub, H, Z or a skip); ' +
			'chance with a plain OCLL alg: 16.7%', 1],
		['oCsM', 'OLL c', 'mean OLL time (recognition + execution) when the corners were solved after it', 0],
		['oOtM', 'OLL o', 'mean OLL time when they were not', 0],
		['llCsM', 'LL c', 'mean OLL + PLL time when the corners were solved after the OLL', 1],
		['llOtM', 'LL o', 'mean OLL + PLL time when they were not', 1],
		['gain', 'gain', 'LL o - LL c: how much faster your last layer is when the corners get solved in the OLL step (5+ solves each way)', 0],
		['skip', 'LL skip', 'PLL skips after this OCLL (also when only an AUF was left); in brackets the number expected by chance ' +
			'after the corners were solved (1 in 12)', 0],
		['zbll', 'ZBLL≈', 'ZBLLs you seem to know, from the skips above chance in each COLL case (each known ZBLL makes 1 in 12 of ' +
			'the case\'s solves a skip)', 0]
	];

	var CASE_COLS = [
		['name', 'case', 'COLL case (csTimer\'s names), from the corners when the OLL starts', 1],
		['n', 'N', 'solves with this case', 1],
		['rate', 'COLL', 'share of these solves with the corners solved after the OLL step (chance 16.7%)', 1],
		['oCsM', 'OLL c', 'mean OLL time when the corners were solved after it', 1],
		['llCsM', 'LL c', 'mean OLL + PLL time when the corners were solved after the OLL', 1],
		['llOtM', 'LL o', 'mean OLL + PLL time when they were not', 1],
		['skip', 'LL skip', 'PLL skips after this case; in brackets the number expected by chance after the corners were solved (1 in 12)', 1],
		['zbll', 'ZBLL≈', 'ZBLLs of this case you seem to know: skips above chance / (N / 12); 0 unless the skips are clearly above chance', 1]
	];

	function cell(key, g, kind) {
		switch (key) {
			case 'name':
				return (kind == 'OLL' ? img('OLL', shapeOll(g.key)) : img('COLL', g.c)) + '<span>' + g.name + '</span>';
			case 'n':
				return g.n;
			case 'rate':
				return rateHtml(g);
			case 'oCsM':
			case 'oOtM':
			case 'llCsM':
			case 'llOtM':
				return fT(g[key]);
			case 'gain':
				return fGain(g.gain);
			case 'skip':
				return g.n ? g.skip + ' <span class="jlas-dim">(' + g.luck.toFixed(g.luck < 10 ? 1 : 0) + ')</span>' : '-';
			case 'zbll':
				return g.n ? (g.zb >= 0.5 ? '<b>' + Math.round(g.zb) + '</b>' : '0') : '-';
		}
	}

	function tableHtml(cols, rows, kind, isFull) {
		var html = ['<div class="jlas-scroll"><table class="table jlas-table"><thead><tr>'];
		for (var i = 0; i < cols.length; i++) {
			if (isFull || cols[i][3]) {
				html.push('<th data-col="' + cols[i][0] + '" title="' + cols[i][2] + '">' + cols[i][1] + '</th>');
			}
		}
		html.push('</tr></thead><tbody>');
		for (var r = 0; r < rows.length; r++) {
			var g = rows[r];
			var title = g.name + ': ' + (g.n ? 'corners solved after the OLL in ' + g.cs + ' of ' + g.n + ' (chance 16.7%)' : 'not seen');
			if (g.skip) {
				title += '; ' + g.skip + ' LL skips, ' + g.luck.toFixed(1) + ' expected by chance after the corners were solved';
			}
			html.push('<tr class="' + (g.n ? '' : 'jlas-skip') + '" title="' + title + '">');
			for (var i = 0; i < cols.length; i++) {
				if (isFull || cols[i][3]) {
					html.push('<td class="jlas-' + cols[i][0] + '">' + cell(cols[i][0], g, kind) + '</td>');
				}
			}
			html.push('</tr>');
		}
		html.push('</tbody></table></div>');
		return html.join('');
	}

	// one line on what the numbers say
	function takeaway(res) {
		var known = [], part = [], none = [];
		for (var i = 0; i < res.shapes.length; i++) {
			var g = res.shapes[i];
			if (g.n < 10) {
				continue;
			}
			var txt = g.name.split(' ')[0] + ' ' + fP(g.rate);
			(g.rate >= KNOWN ? known : g.rate >= 0.3 ? part : none).push(txt);
		}
		var ret = [];
		if (known.length || part.length || none.length) {
			ret.push('Corners solved with the OLL: ' + [known.length ? known.join(', ') : '', part.length ? 'partly ' + part.join(', ') : '',
				none.length ? 'not ' + none.join(', ') : ''].filter(function(x) {
				return x;
			}).join('; ') + ' (chance 16.7%).');
		}
		// within a shape (the shapes differ too much to pool): LL time with vs without the corners solved
		var gains = [];
		for (var i = 0; i < res.shapes.length; i++) {
			var g = res.shapes[i];
			if (g.cs >= 10 && g.n - g.cs >= 10) {
				gains.push(g.name.split(' ')[0] + ' ' + fGain(g.gain) + ' s');
			}
		}
		if (gains.length) {
			ret.push('OLL + PLL with the corners solved vs without: ' + gains.join(', ') + ' (shapes with 10+ solves each way).');
		}
		var t = res.tot;
		if (t.skip) {
			var zbCases = res.cases.filter(function(g) {
				return g.zb >= 0.5;
			}).sort(function(a, b) {
				return b.zb - a.zb;
			});
			ret.push(t.skip + ' LL skips after an OCLL, ' + t.luck.toFixed(0) + ' expected by chance after the corners were solved' +
				(zbCases.length ? ': the ' + Math.round(t.excess) + ' extra skips point to about ' + Math.round(t.zb) + ' ZBLLs you know (' +
					zbCases.slice(0, 5).map(function(g) {
						return g.name + ' ' + Math.round(g.zb);
					}).join(', ') + (zbCases.length > 5 ? ', ...' : '') + ').' : ': no sign of ZBLLs.'));
		}
		return ret.join(' ');
	}

	function skipsHtml(res) {
		if (!res.skips.length) {
			return '';
		}
		var html = ['<div class="jlcs-sub">Latest LL skips after an OCLL' + (res.nSkip > res.skips.length ? ' (' + res.skips.length + ' of ' + res.nSkip + ')' : '') +
			'</div><div class="jlas-scroll"><table class="table jlas-table jlcs-skips"><thead><tr><th>date</th><th data-col="name">case</th>' +
			'<th title="OLL step time (recognition + execution), the whole last layer here">OLL</th>' +
			'<th title="OLL step moves as executed, without AUF; your usual alg for the case in brackets (median over its corners-solved solves that needed a PLL)">moves</th>' +
			'<th></th></tr></thead><tbody>'];
		for (var i = 0; i < res.skips.length; i++) {
			var r = res.skips[i];
			html.push('<tr><td>' + fD(r.d) + '</td><td class="jlas-name">' + img('COLL', r.coll) + '<span>' + collName(r.coll) + '</span></td><td>' +
				fT(r.o) + '</td><td>' + (r.alt ? '<b>' + r.mvc + '</b>' : r.mvc) + ' <span class="jlas-dim">(' + (r.usual < 0 ? '-' : r.usual) + ')</span>' +
				(r.alt ? ' <span class="jlas-tag selected" title="' + SLIP + '+ moves away from your usual alg for the case: another alg (a ZBLL, or a slip that skipped by luck)">other alg</span>' : '') +
				'</td><td><span class="click jlcs-replay" data-k="' + i + '">replay</span></td></tr>');
		}
		html.push('</tbody></table></div>');
		return html.join('');
	}

	function noteHtml() {
		return '<div class="jlas-note">' +
			'A COLL or ZBLL has no step of its own in a CFOP solve: it shows up as an <b>OCLL</b> (an OLL with all last-layer edges oriented) ' +
			'whose OLL step also solves the corners. <b>COLL</b> is the share of solves with the corners solved after the OLL step ' +
			'(the PLL left was Ua, Ub, H, Z or a skip). A plain OCLL alg does that by chance in 1 of 6 solves (16.7%: the corners are in a random ' +
			'order, 4 of their 24 orders are solved up to AUF), so a rate near 100% means you know the COLLs of that shape or case ' +
			'(bold from ' + fP(KNOWN) + '). The <b>case</b> is the corners when the OLL starts (csTimer\'s COLL names, any AUF). ' +
			'<b>OLL c / o</b>: mean OLL time (recognition + execution) with (c) and without (o) the corners solved after it; <b>LL c / o</b>: ' +
			'OLL + PLL time the same way, which shows whether COLL pays off; <b>gain</b> = LL o - LL c. ' +
			'<b>LL skip</b>: the PLL was solved after the OLL step (also when only an AUF was left). After a COLL the edges are random and ' +
			'a skip happens in 1 of 12 solves (the number in brackets). One solve cannot tell a ZBLL from luck, but a COLL case can: each ZBLL of the case ' +
			'you know makes 1 in 12 of its solves a skip, so <b>ZBLL≈</b> = (skips above chance) / (N / 12), counted only when the skips are clearly above ' +
			'chance (more than 2σ + 1). In the skip list, <i>other alg</i> marks an OLL step ' + SLIP + ' or more moves away from your usual alg for the case ' +
			'(moves as executed, no AUF; the median over the case\'s corners-solved solves that still needed a PLL); a ZBLL alg is often as long as the COLL, ' +
			'so most ZBLLs do not show up there. ' +
			'ZBLL has 493 cases, too many for a table; the shape rows count them. ' +
			'Counted: finished CFOP 3x3 solves with a move record (virtual or smart cube) whose OLL and PLL steps are both found, DNFs excluded.' +
			'</div>';
	}

	function render(div, res, isFull) {
		var scope = kernel.getProp('collStatScope', 's');
		var html = ['<div class="jlas-bar0">'];
		html.push(selectHtml('collStatScope', [['s', 'this session'], ['a', 'all sessions']], scope));
		if (isFull) {
			html.push(selectHtml('collStatShape', [['', 'all shapes']].concat(SHAPES.map(function(s) {
				return [s[0], s[1]];
			})), kernel.getProp('collStatShape', '')));
		}
		html.push('<span class="jlas-sum">' + (res.n ? res.n + ' OCLL of ' + res.nSolves + ' solves (' + fP(res.n / res.nSolves, 1) + ')' :
			res.nSolves + ' solves') + '</span>');
		if (!isFull) {
			html.push('<span class="click jlas-open">full table</span>');
		}
		html.push('</div>');
		if (!res.n) {
			html.push('<div class="jlas-empty">No OCLL in these solves yet: finish CFOP 3x3 solves on the virtual cube or a smart cube.</div>');
		} else {
			if (isFull) {
				html.push('<div class="jlas-sum jlcs-take">' + takeaway(res) + '</div>');
			}
			html.push(tableHtml(SHAPE_COLS, res.shapes, 'OLL', isFull));
			if (isFull) {
				var shape = kernel.getProp('collStatShape', '');
				html.push('<div class="jlcs-sub">By COLL case' + (shape ? ': ' + shapeName(shape) : '') + '</div>');
				html.push(tableHtml(CASE_COLS, res.cases.filter(function(g) {
					return !shape || g.key == shape;
				}), 'COLL', true));
				html.push(skipsHtml(res));
				html.push(noteHtml());
			}
		}
		div.html(html.join(''));
		div.find('select').change(procChange);
		div.find('.jlas-open').click(showDialog);
		div.find('.jlcs-replay').click(procReplay);
	}

	function renderLoading(i, n) {
		var txt = 'loading ' + i + ' / ' + n;
		var targets = [];
		toolDiv && targets.push(toolDiv);
		dialogOpen() && targets.push(dialogDiv);
		for (var k = 0; k < targets.length; k++) {
			var sum = targets[k].find('.jlas-bar0 .jlas-sum');
			if (sum.length && targets[k].find('select[data-opt=collStatScope]').length) {
				sum.text(txt);
			} else {
				targets[k].html('<div class="jlas-bar0"><span class="jlas-sum">' + txt + '</span></div>');
			}
		}
	}

	function procChange(e) {
		var t = $(e.target);
		kernel.setProp(t.attr('data-opt'), t.val());
		if (t.attr('data-opt') == 'collStatScope') {
			others = null;
		}
		if (t.attr('data-opt') == 'collStatShape' && shown) {
			renderAll(shown.res);
			return;
		}
		update();
	}

	function procReplay(e) {
		var k = ~~$(e.target).attr('data-k');
		var r = shown && shown.res.skips[k];
		if (!r || !r.t || !r.t[4] || !window.replay) {
			return;
		}
		replay.popupReplay(r.t[1], r.t[4][0], '333');
	}

	function renderAll(res) {
		toolDiv && render(toolDiv, res, false);
		dialogOpen() && render(dialogDiv, res, true);
	}

	// ---------- tool + dialog ----------

	function dialogOpen() {
		if (isDialog && !dialogDiv.closest('.dialog').length) {
			isDialog = false;
		}
		return isDialog;
	}

	function visible() {
		return !!toolDiv || dialogOpen();
	}

	function update() {
		if (!visible()) {
			return;
		}
		var myJob = ++jobId;
		var scope = kernel.getProp('collStatScope', 's');
		if (scope == 'a' && (!others || others.session != ~~kernel.getProp('session'))) {
			loadOthers(myJob, function() {
				myJob == jobId && update();
			});
			return;
		}
		loadSession(myJob, function(recs, nSolves) {
			if (scope == 'a') {
				recs = others.recs.concat(recs);
				nSolves += others.nSolves;
			}
			var res = aggregate(recs, nSolves);
			shown = {scope: scope, res: res};
			renderAll(res);
		});
	}

	function showDialog() {
		isDialog = true;
		var onClose = function() {
			isDialog = false;
		};
		kernel.showDialog([dialogWrap, onClose, undefined, onClose], 'algstats', 'COLL / ZBLL stats');
		if (shown && shown.scope == kernel.getProp('collStatScope', 's')) {
			render(dialogDiv, shown.res, true);
		}
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
		toolDiv = $('<div class="jlas jlcs">');
		fdiv.empty().append(toolDiv);
		others = null;
		update();
	}

	$(function() {
		if (typeof tools != "undefined") {
			tools.regTool('collstat', TOOLS_RECONS + '>COLL / ZBLL stats', execFunc);
		}
		stats.regUtil('collstat', update);
	});

	return {
		showDialog: showDialog,
		update: update,
		pairOf: pairOf,
		aggregate: aggregate,
		// for tests
		lastResult: function() {
			return shown && shown.res;
		}
	};
});
