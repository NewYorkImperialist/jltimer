"use strict";

/**
 * jlTimer analysis dashboard (Tools > Reconstruct > analysis, opens a dialog).
 *
 * Everything is computed in the browser from the saved solves, only while the dialog is open:
 * - every solve with a move record (virtual or smart cube, 3x3) is split into CFOP steps by
 *   csTimer's own reconstruction (recons.calcRecons, 'cf4op'), its OLL / PLL case is identified
 *   (cubeutil case tables) and its move timestamps give pauses, turning time and rotations;
 * - the per-solve results are kept in memory (keyed by session, date and move record), so
 *   reopening is instant and a new solve adds only its own work;
 * - the work runs in small time slices (setTimeout) with a progress bar, and waits while the
 *   timer is running.
 * Nothing is stored. The scope / range choices are ordinary properties (kernel.setProp).
 */
var jlDash = execMain(function() {
	var PAUSE = 300; // ms: a gap between two inputs this long or longer is a pause
	var SLICE = 25; // ms of work per time slice
	var STEPS = ['cross', 'F2L 1', 'F2L 2', 'F2L 3', 'F2L 4', 'OLL', 'PLL'];
	var ROT = /^[xyz]/;
	var PLL_SKIP = 21;
	var OLL_SKIP = 0;

	var cache = {}; // solve key -> analysis object | 0 (no move record)
	var aggCache = null; // {key, res}
	var dialogDiv = $('<div class="jld">');
	var dialogWrap = $('<div>').append(dialogDiv);
	var isOpen = false;
	var jobId = 0;
	var shown = null; // {res, scope, range} currently rendered
	var eoTable = null;
	var resizeTid = 0;
	var renderCount = 0;
	var doneJob = 0;

	// ---------- per-solve analysis ----------

	function newCube() {
		var c = new mathlib.CubieCube();
		c.ori = 0;
		return c;
	}

	// number of oriented last-layer edges of each OLL case (from the case image: 'D' = oriented)
	function ollEO(oc) {
		if (!eoTable) {
			eoTable = [];
			for (var i = 0; i < 58; i++) {
				var face = scramble_333.getOLLImage(i)[0];
				var n = 0;
				for (var j = 1; j < 9; j += 2) {
					n += face.charAt(j) == 'D' ? 1 : 0;
				}
				eoTable.push(n);
			}
		}
		return oc >= 0 && oc < 58 ? eoTable[oc] : -1;
	}

	function parseEvents(str) {
		var toks = str.split(/ +/);
		var ev = [];
		for (var i = 0; i < toks.length; i++) {
			var k = toks[i].lastIndexOf('@');
			if (k > 0) {
				ev.push([toks[i].slice(0, k), +toks[i].slice(k + 1)]);
			}
		}
		return ev;
	}

	function hasMoves(times) {
		return times && times[4] && typeof times[4][0] == 'string' && times[4][0].length > 0 &&
			(!times[4][1] || times[4][1] == '333');
	}

	// returns 0 (no move record) or {ok: false} (not a complete CFOP split) or
	// {ok, st: [[recog, exec, turns, pause, rotations] x 7 steps], pause, turn, mv, rot, oll, pll, eo}
	function analyzeSolve(times) {
		if (!hasMoves(times)) {
			return 0;
		}
		// the split does not depend on the penalty: a DNF is replayed too, and the penalty is read
		// from the record when aggregating (so a changed penalty needs no recompute)
		var tt = times[0][0] < 0 ? [[0].concat(times[0].slice(1))].concat(times.slice(1)) : times;
		var rec = null;
		try {
			rec = recons.calcRecons(tt, 'cf4op');
		} catch (e) {
			rec = null;
		}
		var data = rec && rec.data;
		if (!data || data.length != 7) {
			return {ok: false};
		}
		for (var i = 0; i < 7; i++) {
			if (!data[i]) {
				return {ok: false};
			}
		}
		var st = [];
		var ends = [];
		var mv = 0;
		for (var s = 0; s < 7; s++) {
			var d = data[6 - s];
			st.push([d[1] - d[0], d[2] - d[1], d[3], 0, 0]);
			ends.push(d[2]);
			mv += d[3];
		}
		var ev = parseEvents(times[4][0]);
		// rotations made during inspection (all at 0 ms) are not part of the solve
		var k = 0;
		while (k < ev.length && ev[k][1] == 0 && ROT.test(ev[k][0])) {
			k++;
		}
		var pause = 0;
		var turn = 0;
		var rot = 0;
		var si = 0;
		for (var j = k; j < ev.length; j++) {
			var ts = ev[j][1];
			while (si < 6 && ends[si] < ts) {
				si++;
			}
			if (ROT.test(ev[j][0])) {
				rot++;
				st[si][4]++;
			}
			if (j > k) {
				var g = ts - ev[j - 1][1];
				if (g >= PAUSE) {
					pause += g;
					st[si][3] += g;
				} else {
					turn += g;
				}
			}
		}
		var c = newCube();
		var pll = PLL_SKIP;
		var oll = OLL_SKIP;
		try {
			if (data[0][5].length) {
				c.invFrom(data[0][4]);
				pll = cubeutil.getIdentData('PLL')[0](c.toFaceCube());
			}
			if (data[1][5].length) {
				c.invFrom(data[1][4]);
				oll = cubeutil.getIdentData('OLL')[0](c.toFaceCube());
			}
		} catch (e) {
			pll = oll = -1;
		}
		return {ok: true, st: st, pause: pause, turn: turn, mv: mv, rot: rot, oll: oll, pll: pll, eo: ollEO(oll)};
	}

	function solveKey(sidx, times) {
		return sidx + '|' + (times[3] || 0) + '|' + (hasMoves(times) ? times[4][0].length : 0) + '|' + times[0][1];
	}

	// ---------- loading the scope ----------

	function sessionType(sd, idx) {
		return ((sd[idx] || {}).opt || {}).scrType || '333';
	}

	// entries {s: session, i: index, t: record}, oldest first
	function loadScope(scope, callback) {
		var cur = ~~kernel.getProp('session');
		var list = [];
		var nCur = stats.getTimesStatsTable().timesLen;
		for (var i = 0; i < nCur; i++) {
			list.push({s: cur, i: i, t: stats.timesAt(i)});
		}
		if (scope != 'a') {
			callback(list, 1);
			return;
		}
		var sd = JSON.parse(kernel.getProp('sessionData'));
		var type = sessionType(sd, cur);
		var sessionN = ~~kernel.getProp('sessionN');
		var mgr = stats.getSessionManager();
		var nSess = 1;
		var proc = Promise.resolve();
		for (var r = 0; r < sessionN; r++) {
			var idx = mgr.rank2idx(r + 1);
			if (idx == cur || sessionType(sd, idx) != type) {
				continue;
			}
			proc = proc.then((function(idx) {
				return storage.get(idx).then(function(times) {
					nSess += times.length ? 1 : 0;
					for (var j = 0; j < times.length; j++) {
						list.push({s: idx, i: j, t: times[j]});
					}
				});
			}).bind(null, idx));
		}
		proc.then(function() {
			// stable sort by date
			for (var i = 0; i < list.length; i++) {
				list[i].o = i;
			}
			list.sort(function(a, b) {
				return ((a.t[3] || 0) - (b.t[3] || 0)) || (a.o - b.o);
			});
			callback(list, nSess);
		});
	}

	function applyRange(list, range) {
		var m = /^([nd])(\d+)$/.exec(range || '');
		if (!m) {
			return list;
		}
		if (m[1] == 'n') {
			return list.slice(Math.max(0, list.length - ~~m[2]));
		}
		var since = ~~(+new Date / 1000) - ~~m[2] * 86400;
		var i = list.length;
		while (i > 0 && (list[i - 1].t[3] || 0) >= since) {
			i--;
		}
		return list.slice(i);
	}

	// ---------- background work ----------

	function timerBusy() {
		return window.timer && timer.getCurTime && timer.getCurTime() > 0;
	}

	// run step() in time slices until it returns true; never while the timer runs or the dialog is closed
	function runSliced(myJob, step, done) {
		function tick() {
			if (myJob != jobId || !isOpen) {
				return;
			}
			if (timerBusy()) {
				setTimeout(tick, 500);
				return;
			}
			var t0 = performance.now();
			while (performance.now() - t0 < SLICE) {
				if (step()) {
					done();
					return;
				}
			}
			setTimeout(tick, 0);
		}
		setTimeout(tick, 0);
	}

	function update() {
		if (!isOpen) {
			return;
		}
		var myJob = ++jobId;
		doneJob = 0;
		var scope = kernel.getProp('jlDashScope', 's');
		var range = kernel.getProp('jlDashRange', 'all');
		var t0 = performance.now();
		if (!shown) {
			renderProgress('loading solves', 0);
		}
		loadScope(scope, function(list, nSess) {
			if (myJob != jobId || !isOpen) {
				return;
			}
			// analyse the solves not cached yet
			var todo = [];
			for (var i = 0; i < list.length; i++) {
				var key = solveKey(list[i].s, list[i].t);
				list[i].k = key;
				if (!(key in cache)) {
					todo.push(list[i]);
				}
			}
			var pos = 0;
			var n0 = todo.length;
			var lastDraw = 0;
			if (n0 > 0) {
				renderProgress('analysing solves', 0, n0);
			}
			runSliced(myJob, function() {
				var end = Math.min(pos + 40, n0);
				for (; pos < end; pos++) {
					cache[todo[pos].k] = analyzeSolve(todo[pos].t);
				}
				if (pos >= n0) {
					return true;
				}
				var now = performance.now();
				if (now - lastDraw > 100) {
					lastDraw = now;
					renderProgress('analysing solves', pos, n0);
				}
				return false;
			}, function() {
				for (var i = 0; i < list.length; i++) {
					list[i].a = cache[list[i].k];
				}
				aggregateAll(myJob, list, scope, range, nSess, n0, t0);
			});
		});
	}

	function signature(list) {
		var sum = 0;
		for (var i = 0; i < list.length; i++) {
			sum = (sum * 31 + list[i].t[0][0] + list[i].t[0][1]) % 1000000007;
		}
		return list.length + ':' + sum + ':' + (list.length ? list[list.length - 1].k : '');
	}

	function aggregateAll(myJob, list, scope, range, nSess, nNew, t0) {
		var key = scope + '|' + range + '|' + kernel.getProp('session') + '|' + kernel.getProp('trim', 'p5') + '|' + signature(list);
		if (aggCache && aggCache.key == key) {
			done(aggCache.res);
			return;
		}
		var sel = applyRange(list, range);
		// baseline for the step comparison: the whole scope, or its last 100 solves when the range is everything
		var isAll = sel.length == list.length;
		var base = isAll ? list.slice(Math.max(0, list.length - 100)) : list;
		var agg = new Aggregator(sel);
		runSliced(myJob, function() {
			return agg.step();
		}, function() {
			var res = agg.result();
			res.base = stepStats(base);
			res.baseLabel = isAll ? 'last 100' : 'all';
			res.baseIsSub = isAll;
			res.scopeN = list.length;
			res.nSess = nSess;
			aggCache = {key: key, res: res};
			done(res);
		});

		function done(res) {
			res.ms = Math.round(performance.now() - t0);
			res.nNew = nNew;
			shown = {res: res, scope: scope, range: range};
			doneJob = myJob;
			render();
		}
	}

	// ---------- aggregation ----------

	function timeOf(t) {
		return t[0][0] < 0 ? -1 : t[0][0] + t[0][1];
	}

	function mean(arr) {
		var s = 0;
		for (var i = 0; i < arr.length; i++) {
			s += arr[i];
		}
		return arr.length ? s / arr.length : 0;
	}

	function sdev(arr) {
		if (arr.length < 2) {
			return 0;
		}
		var m = mean(arr);
		var s = 0;
		for (var i = 0; i < arr.length; i++) {
			s += (arr[i] - m) * (arr[i] - m);
		}
		return Math.sqrt(s / (arr.length - 1));
	}

	// sigma without the fastest and slowest 5% (one bad solve, e.g. a forgotten timer, would dominate otherwise)
	function trimSd(arr) {
		var a = arr.slice().sort(function(x, y) {
			return x - y;
		});
		var k = Math.floor(a.length * 0.05);
		return sdev(a.slice(k, a.length - k));
	}

	// mean [recog, exec, turns, pause, rotations] per step over the complete, non-DNF solves
	function stepStats(list) {
		var sum = [];
		for (var s = 0; s < 7; s++) {
			sum.push([0, 0, 0, 0, 0]);
		}
		var n = 0;
		for (var i = 0; i < list.length; i++) {
			var a = list[i].a;
			if (!a || !a.ok || list[i].t[0][0] < 0) {
				continue;
			}
			n++;
			for (var s = 0; s < 7; s++) {
				for (var j = 0; j < 5; j++) {
					sum[s][j] += a.st[s][j];
				}
			}
		}
		for (var s = 0; s < 7; s++) {
			for (var j = 0; j < 5; j++) {
				sum[s][j] = n ? sum[s][j] / n : 0;
			}
		}
		return {n: n, st: sum};
	}

	// the averages run through csTimer's TimeStat (same trimming as the session stats), sliced
	function Aggregator(list) {
		this.list = list;
		this.vals = list.map(function(e) {
			return timeOf(e.t);
		});
		var n = list.length;
		this.win = n >= 300 ? 100 : n >= 36 ? 12 : 5;
		this.sizes = [5, 12, 100];
		this.wIdx = this.sizes.indexOf(this.win);
		var vals = this.vals;
		this.ts = new TimeStat(this.sizes, 0, function(i) {
			return vals[i];
		});
		this.ts.genStats();
		this.roll = [];
		this.bestAt = {};
		this.pos = 0;
	}

	Aggregator.prototype.step = function() {
		var ts = this.ts;
		var end = Math.min(this.pos + 200, this.vals.length);
		for (; this.pos < end; this.pos++) {
			var prev = [];
			for (var j = 0; j < 3; j++) {
				prev[j] = ts.bestAvg(j, 0);
			}
			var prevSingle = ts.bestTime;
			ts.toLength(this.pos + 1);
			var la = ts.lastAvg[this.wIdx];
			this.roll.push(la && la[0] > 0 ? la[0] : null);
			for (var j = 0; j < 3; j++) {
				if (ts.bestAvg(j, 0) != prev[j]) {
					this.bestAt[j] = this.pos;
				}
			}
			if (ts.bestTime != prevSingle) {
				this.bestAt.s = ts.bestTimeIndex;
			}
		}
		return this.pos >= this.vals.length;
	};

	Aggregator.prototype.result = function() {
		var list = this.list;
		var vals = this.vals;
		var ts = this.ts;
		var res = {n: list.length, win: this.win, roll: this.roll};
		var ok = [];
		var nDnf = 0;
		for (var i = 0; i < vals.length; i++) {
			if (vals[i] < 0) {
				nDnf++;
			} else {
				ok.push(vals[i]);
			}
		}
		res.nDnf = nDnf;
		res.nOk = ok.length;
		res.mean = mean(ok);
		res.sd = sdev(ok);
		var sorted = ok.slice().sort(function(a, b) {
			return a - b;
		});
		res.sorted = sorted;
		res.median = sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : 0;
		var self = this;
		var dateOf = function(i) {
			return i >= 0 && list[i] ? list[i].t[3] || 0 : 0;
		};
		res.best = {
			single: [ts.bestTime > 0 ? ts.bestTime : -1, dateOf(self.bestAt.s)],
			ao5: [ts.bestAvg(0, 0), dateOf(self.bestAt[0])],
			ao12: [ts.bestAvg(1, 0), dateOf(self.bestAt[1])],
			ao100: [ts.bestAvg(2, 0), dateOf(self.bestAt[2])]
		};
		res.first = dateOf(0);
		res.last = dateOf(list.length - 1);

		// move-record metrics (complete, non-DNF solves)
		var nMoves = 0;
		var an = [];
		for (var i = 0; i < list.length; i++) {
			var a = list[i].a;
			if (a) {
				nMoves++;
			}
			if (a && a.ok && vals[i] >= 0) {
				an.push(i);
			}
		}
		res.nMoves = nMoves;
		res.nAn = an.length;
		var sumT = 0, sumP = 0, sumTurn = 0, sumMv = 0, sumRot = 0;
		var ll = {ollSkip: 0, pllSkip: 0, llSkip: 0, eo: [0, 0, 0, 0, 0], eoN: 0, n: 0};
		var olls = {}, plls = {};
		for (var k = 0; k < an.length; k++) {
			var i = an[k];
			var a = list[i].a;
			sumT += vals[i];
			sumP += a.pause;
			sumTurn += a.turn;
			sumMv += a.mv;
			sumRot += a.rot;
			if (a.oll < 0 || a.pll < 0) {
				continue;
			}
			ll.n++;
			ll.ollSkip += a.oll == OLL_SKIP ? 1 : 0;
			ll.pllSkip += a.pll == PLL_SKIP ? 1 : 0;
			ll.llSkip += a.oll == OLL_SKIP && a.pll == PLL_SKIP ? 1 : 0;
			if (a.eo >= 0) {
				ll.eo[a.eo]++;
				ll.eoN++;
			}
			if (a.oll != OLL_SKIP) {
				var o = olls[a.oll] = olls[a.oll] || [0, 0];
				o[0]++;
				o[1] += a.st[5][0] + a.st[5][1];
			}
			if (a.pll != PLL_SKIP) {
				var p = plls[a.pll] = plls[a.pll] || [0, 0];
				p[0]++;
				p[1] += a.st[6][0] + a.st[6][1];
			}
		}
		res.pauseShare = sumT ? sumP / sumT : 0;
		res.pauseMean = an.length ? sumP / an.length : 0;
		res.anMean = an.length ? sumT / an.length : 0;
		res.tps = sumT ? sumMv / sumT * 1000 : 0;
		res.etps = sumTurn ? sumMv / sumTurn * 1000 : 0;
		res.rot = an.length ? sumRot / an.length : 0;
		res.ll = ll;
		res.olls = caseRows(olls, 'OLL');
		res.plls = caseRows(plls, 'PLL');
		var steps = stepStats(list);
		res.st = steps.st;

		// slowest solves, with the step that lost the most time against its mean
		var idx = [];
		for (var i = 0; i < vals.length; i++) {
			if (vals[i] >= 0) {
				idx.push(i);
			}
		}
		idx.sort(function(a, b) {
			return vals[b] - vals[a];
		});
		res.slow = idx.slice(0, 10).map(function(i) {
			var e = list[i];
			var row = {t: vals[i], d: e.t[3] || 0, rec: e.t, s: e.s, i: e.i, step: -1, over: 0};
			if (e.a && e.a.ok && steps.n) {
				for (var s = 0; s < 7; s++) {
					var over = e.a.st[s][0] + e.a.st[s][1] - steps.st[s][0] - steps.st[s][1];
					if (over > row.over) {
						row.over = over;
						row.step = s;
					}
				}
			}
			return row;
		});

		// consistency: sigma per block of consecutive solves
		var bs = ok.length >= 300 ? 100 : Math.max(10, Math.round(ok.length / 8));
		res.blockSize = bs;
		res.blocks = [];
		for (var b = 0; b + bs <= ok.length; b += bs) {
			var blk = ok.slice(b, b + bs);
			res.blocks.push([trimSd(blk), mean(blk)]);
		}
		res.tsd = trimSd(ok);
		return res;
	};

	function caseRows(map, step) {
		var rows = [];
		for (var c in map) {
			rows.push({c: ~~c, n: map[c][0], mean: map[c][1] / map[c][0]});
		}
		var total = 0;
		for (var i = 0; i < rows.length; i++) {
			total += rows[i].n;
		}
		// a case needs a few solves to be called slow
		var minN = Math.max(3, Math.min(10, Math.floor(total / 200)));
		rows = rows.filter(function(r) {
			return r.n >= minN;
		}).sort(function(a, b) {
			return b.mean - a.mean;
		});
		return {rows: rows.slice(0, 5), minN: minN, step: step};
	}

	// ---------- formatting ----------

	function fT(ms) {
		return ms < 0 ? 'DNF' : kernel.pretty(Math.round(ms));
	}

	function fS(ms, digits) {
		return (ms / 1000).toFixed(digits === undefined ? 2 : digits);
	}

	function fP(x, digits) {
		return (x * 100).toFixed(digits === undefined ? 1 : digits) + '%';
	}

	function fN(n) {
		return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	function fD(ts) {
		if (!ts) {
			return '';
		}
		var d = new Date(ts * 1000);
		return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
	}

	function signed(ms) {
		return (ms > 0 ? '+' : ms < 0 ? '−' : '±') + fS(Math.abs(ms));
	}

	function esc(s) {
		return $('<div>').text(s).html();
	}

	// ---------- SVG charts ----------

	function niceStep(span, n) {
		var raw = span / Math.max(1, n);
		var p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
		var cands = [1, 2, 2.5, 5, 10];
		for (var i = 0; i < cands.length; i++) {
			if (cands[i] * p >= raw) {
				return cands[i] * p;
			}
		}
		return 10 * p;
	}

	function colors() {
		return {
			font: kernel.getProp('col-font') || '#000',
			link: kernel.getProp('col-link') || '#00f'
		};
	}

	// series: [{v: [number|null], color, dash, width}], all the same length (the x axis is the index)
	// xLabels: [[index, text]]
	function lineChart(w, h, series, xLabels, yFmt, yZero) {
		var col = colors();
		var padL = 44, padR = 8, padT = 8, padB = 20;
		var n = 0, lo = Infinity, hi = -Infinity;
		series.forEach(function(s) {
			n = Math.max(n, s.v.length);
			for (var i = 0; i < s.v.length; i++) {
				if (s.v[i] != null) {
					lo = Math.min(lo, s.v[i]);
					hi = Math.max(hi, s.v[i]);
				}
			}
		});
		if (!isFinite(lo)) {
			return '';
		}
		if (yZero) {
			lo = 0;
		}
		if (hi - lo < 1e-9) {
			hi = lo + 1;
		}
		var step = niceStep(hi - lo, 4);
		lo = Math.floor(lo / step) * step;
		hi = Math.ceil(hi / step) * step;
		var pw = w - padL - padR, ph = h - padT - padB;
		var X = function(i) {
			return padL + (n > 1 ? i / (n - 1) : 0.5) * pw;
		};
		var Y = function(v) {
			return padT + (1 - (v - lo) / (hi - lo)) * ph;
		};
		var out = ['<svg class="jld-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img">'];
		for (var v = lo; v <= hi + step / 2; v += step) {
			var y = Y(v).toFixed(1);
			out.push('<line x1="' + padL + '" x2="' + (w - padR) + '" y1="' + y + '" y2="' + y + '" stroke="' + col.font + '" stroke-opacity="0.15"/>');
			out.push('<text x="' + (padL - 5) + '" y="' + y + '" dy="0.32em" text-anchor="end">' + yFmt(v) + '</text>');
		}
		(xLabels || []).forEach(function(l, j, arr) {
			var anchor = j == 0 && arr.length > 1 ? 'start' : j == arr.length - 1 && arr.length > 1 ? 'end' : 'middle';
			out.push('<text x="' + X(l[0]).toFixed(1) + '" y="' + (h - 5) + '" text-anchor="' + anchor + '">' + l[1] + '</text>');
		});
		// at most ~1.5 points per pixel
		var stride = Math.max(1, Math.floor(n / (pw * 1.5)));
		series.forEach(function(s) {
			var d = [];
			var pen = false;
			for (var i = 0; i < s.v.length; i++) {
				if (i % stride && i != s.v.length - 1) {
					continue;
				}
				if (s.v[i] == null) {
					pen = false;
					continue;
				}
				d.push((pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s.v[i]).toFixed(1));
				pen = true;
			}
			out.push('<path d="' + d.join('') + '" fill="none" stroke="' + (s.color || col.link) + '" stroke-width="' + (s.width || 1.6) +
				'"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + (s.opacity ? ' stroke-opacity="' + s.opacity + '"' : '') +
				' stroke-linejoin="round"/>');
			if (s.dots) {
				for (var i = 0; i < s.v.length; i++) {
					if (s.v[i] != null) {
						out.push('<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(s.v[i]).toFixed(1) + '" r="2.2" fill="' + (s.color || col.link) + '"/>');
					}
				}
			}
		});
		out.push('</svg>');
		return out.join('');
	}

	function histChart(w, h, sorted) {
		var col = colors();
		if (sorted.length < 2) {
			return '';
		}
		var q = function(p) {
			return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
		};
		var a = q(0.005), b = q(0.995);
		var widths = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 60000];
		var bw = widths[widths.length - 1];
		for (var i = 0; i < widths.length; i++) {
			if ((b - a) / widths[i] <= 28) {
				bw = widths[i];
				break;
			}
		}
		var lo = Math.floor(a / bw) * bw;
		var nb = Math.max(1, Math.floor((b - lo) / bw) + 1);
		var cnt = [];
		for (var i = 0; i < nb; i++) {
			cnt.push(0);
		}
		for (var i = 0; i < sorted.length; i++) {
			cnt[Math.max(0, Math.min(nb - 1, Math.floor((sorted[i] - lo) / bw)))]++;
		}
		var mx = Math.max.apply(null, cnt);
		var padL = 8, padR = 8, padT = 14, padB = 20;
		var pw = w - padL - padR, ph = h - padT - padB;
		var cw = pw / nb;
		var out = ['<svg class="jld-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img">'];
		var med = q(0.5);
		for (var i = 0; i < nb; i++) {
			var bh = cnt[i] / mx * ph;
			var x = padL + i * cw;
			out.push('<rect x="' + (x + 0.5).toFixed(1) + '" y="' + (padT + ph - bh).toFixed(1) + '" width="' + Math.max(1, cw - 1).toFixed(1) +
				'" height="' + bh.toFixed(1) + '" fill="' + col.link + '" fill-opacity="0.55"><title>' +
				(i == nb - 1 ? '≥ ' : '') + fS(lo + i * bw, bw < 1000 ? 2 : 0) + (i == nb - 1 ? '' : ' to ' + fS(lo + (i + 1) * bw, bw < 1000 ? 2 : 0)) +
				' s: ' + cnt[i] + '</title></rect>');
		}
		var mxv = padL + (med - lo) / bw * cw;
		out.push('<line x1="' + mxv.toFixed(1) + '" x2="' + mxv.toFixed(1) + '" y1="' + (padT - 4) + '" y2="' + (padT + ph) + '" stroke="' + col.font + '" stroke-dasharray="3 3"/>');
		out.push('<text x="' + mxv.toFixed(1) + '" y="' + (padT - 5) + '" text-anchor="middle">median ' + fS(med) + '</text>');
		var labEvery = Math.max(1, Math.ceil(nb / Math.max(1, Math.floor(pw / 44))));
		for (var i = 0; i <= nb; i += labEvery) {
			out.push('<text x="' + (padL + i * cw).toFixed(1) + '" y="' + (h - 5) + '" text-anchor="middle">' + fS(lo + i * bw, bw < 1000 ? 1 : 0) + '</text>');
		}
		out.push('</svg>');
		return out.join('');
	}

	// ---------- rendering ----------

	var SCOPES = [['s', 'this session'], ['a', 'all sessions']];
	var RANGES = [['n100', 'last 100'], ['n500', 'last 500'], ['n1000', 'last 1000'], ['n5000', 'last 5000'],
		['d7', 'last 7 days'], ['d30', 'last 30 days'], ['d90', 'last 90 days'], ['d365', 'last year'], ['all', 'all solves']];

	function selectHtml(name, options, val) {
		var ret = ['<select data-opt="' + name + '">'];
		for (var i = 0; i < options.length; i++) {
			ret.push('<option value="' + options[i][0] + '"' + (options[i][0] == val ? ' selected' : '') + '>' + options[i][1] + '</option>');
		}
		ret.push('</select>');
		return ret.join('');
	}

	function barHtml(scope, range, status) {
		return '<div class="jld-bar">' + selectHtml('jlDashScope', SCOPES, scope) + selectHtml('jlDashRange', RANGES, range) +
			'<span class="jld-status">' + status + '</span></div>';
	}

	function bindBar() {
		dialogDiv.find('select').change(function(e) {
			var t = $(e.target);
			kernel.setProp(t.attr('data-opt'), t.val());
			update();
		});
	}

	function renderProgress(what, done, total) {
		if (!isOpen) {
			return;
		}
		var scope = kernel.getProp('jlDashScope', 's');
		var range = kernel.getProp('jlDashRange', 'all');
		var pct = total ? done / total * 100 : 0;
		var text = total ? what + ' ' + fN(done) + ' / ' + fN(total) : what + '...';
		var prog = dialogDiv.find('.jld-prog');
		if (prog.length) {
			prog.find('.jld-progfill').css('width', pct.toFixed(1) + '%');
			prog.find('.jld-progtext').text(text);
			return;
		}
		var html = barHtml(scope, range, '') + '<div class="jld-prog"><div class="jld-progtrack"><span class="cntbar jld-progfill" style="width:' +
			pct.toFixed(1) + '%"></span></div><div class="jld-progtext">' + text + '</div></div>';
		if (shown) {
			// keep the old numbers visible (dimmed) below the progress bar
			dialogDiv.children('.jld-bar').replaceWith(html);
			dialogDiv.addClass('jld-busy');
		} else {
			dialogDiv.html(html);
		}
		bindBar();
	}

	function sec(title, take, body, extraCls) {
		return '<section class="jld-sec' + (extraCls ? ' ' + extraCls : '') + '"><h3>' + title + '</h3>' +
			(take ? '<p class="jld-take">' + take + '</p>' : '') + body + '</section>';
	}

	function card(label, value, sub, title) {
		return '<div class="jld-card"' + (title ? ' title="' + title + '"' : '') + '><div class="jld-cl">' + label + '</div><div class="jld-cv">' + value +
			'</div><div class="jld-cs">' + (sub || '&nbsp;') + '</div></div>';
	}

	function chartWidth() {
		var w = dialogDiv.width() || 600;
		return Math.max(240, Math.min(900, Math.floor(w - 24)));
	}

	function render() {
		if (!isOpen || !shown) {
			return;
		}
		renderCount++;
		var res = shown.res;
		dialogDiv.removeClass('jld-busy');
		var status = fN(res.n) + ' solves' + (res.n ? ' · ' + fD(res.first) + ' to ' + fD(res.last) : '') +
			(shown.scope == 'a' ? ' · ' + res.nSess + ' sessions' : '');
		var html = [barHtml(shown.scope, shown.range, status)];
		if (res.n == 0) {
			html.push('<div class="jld-empty">No solves in this range.</div>');
			dialogDiv.html(html.join(''));
			bindBar();
			return;
		}
		var w = chartWidth();
		html.push(renderOverview(res));
		html.push(renderProgressChart(res, w));
		html.push(renderSteps(res));
		html.push(renderLL(res));
		html.push(renderConsistency(res, w));
		html.push(renderSlowest(res));
		html.push('<div class="jld-note">Computed in your browser from the saved solves; nothing is stored. ' +
			'Step splits use csTimer\'s reconstruction (CFOP, <i>cf4op</i>) and need a move record (virtual cube or smart cube, 3x3). ' +
			'A pause is a gap of ' + PAUSE + ' ms or more between two inputs. Rotations (x, y, z) are counted separately and are not turns. ' +
			'Averages use the same trimming as the session stats. ' +
			(res.nNew ? fN(res.nNew) + ' solves analysed now' : 'All solves came from the cache') + ', ' + (res.ms / 1000).toFixed(1) + ' s.</div>');
		dialogDiv.html(html.join(''));
		bindBar();
		dialogDiv.find('.jld-replay').click(procReplay);
		dialogDiv.find('.jld-pllstats').click(function() {
			if (window.algStat && algStat.showDialog) {
				algStat.showDialog();
			}
		});
	}

	function renderOverview(res) {
		var cards = [];
		cards.push(card('solves', fN(res.n), fN(res.nMoves) + ' with moves'));
		cards.push(card('mean', fT(res.mean), 'median ' + fT(res.median)));
		cards.push(card('σ', fT(res.sd), res.mean ? fP(res.sd / res.mean, 0) + ' of mean' : ''));
		cards.push(card('DNF rate', fP(res.nDnf / res.n), fN(res.nDnf) + ' DNF'));
		var b = res.best;
		cards.push(card('best single', fT(b.single[0]), fD(b.single[1])));
		['ao5', 'ao12', 'ao100'].forEach(function(k) {
			cards.push(card('best ' + k, b[k][0] > 0 ? fT(b[k][0]) : '-', b[k][0] > 0 ? fD(b[k][1]) : 'needs ' + k.slice(2) + ' solves'));
		});
		if (res.nAn) {
			cards.push(card('TPS', res.tps.toFixed(2), res.etps.toFixed(2) + ' while turning', 'turns per second over the whole solve; "while turning" leaves out pauses'));
			cards.push(card('pausing', fP(res.pauseShare, 0), fS(res.pauseMean) + ' s per solve', 'share of solve time spent in gaps of ' + PAUSE + ' ms or more'));
			cards.push(card('rotations', res.rot.toFixed(1), 'per solve'));
		}
		var take = '';
		if (res.nAn) {
			var g = recGroups(res.st);
			take = 'Pausing is ' + fP(res.pauseShare, 0) + ' of your solve time (' + fS(res.pauseMean) + ' s of ' + fS(res.anMean) + ' s). ' +
				'Your biggest recognition pause is ' + g[0][0] + ': ' + fS(g[0][1]) + ' s per solve.';
		} else {
			take = 'Mean ' + fT(res.mean) + ' over ' + fN(res.nOk) + ' finished solves. No move records here, so there is no step, TPS or pause data.';
		}
		return sec('Overview', take, '<div class="jld-cards">' + cards.join('') + '</div>');
	}

	// recognition per step group, largest first
	function recGroups(st) {
		var g = [['F2L (finding pairs)', st[1][0] + st[2][0] + st[3][0] + st[4][0]], ['OLL', st[5][0]], ['PLL', st[6][0]]];
		return g.sort(function(a, b) {
			return b[1] - a[1];
		});
	}

	function renderProgressChart(res, w) {
		var roll = res.roll;
		var name = 'ao' + res.win;
		var bestLine = [];
		var best = Infinity;
		var firstV = null, lastV = null;
		for (var i = 0; i < roll.length; i++) {
			if (roll[i] != null) {
				best = Math.min(best, roll[i]);
				firstV = firstV == null ? roll[i] : firstV;
				lastV = roll[i];
			}
			bestLine.push(isFinite(best) ? best : null);
		}
		if (firstV == null) {
			return sec('Progress', 'Not enough finished solves for a rolling ' + name + '.', '');
		}
		var n = res.n;
		var xl = [[0, fD(res.first)], [n - 1, fD(res.last)]];
		if (w > 420 && n > 2) {
			xl.splice(1, 0, [Math.floor((n - 1) / 2), '#' + fN(Math.floor((n - 1) / 2) + 1)]);
		}
		var col = colors();
		var svg = lineChart(w, 190, [
			{v: bestLine, color: col.font, dash: '4 3', width: 1.2, opacity: 0.7},
			{v: roll, width: 1.8}
		], xl, function(v) {
			return fS(v, v % 1000 ? 1 : 0);
		});
		var diff = lastV - firstV;
		var take = 'Rolling ' + name + ' went from ' + fS(firstV) + ' to ' + fS(lastV) + ' s (' + signed(diff) + ' s)';
		take += lastV - best < 0.01 * best ? '; you are at your best ' + name + ' in this range.' :
			'; the best was ' + fS(best) + ' s, ' + fS(lastV - best) + ' s below where you are now.';
		var legend = '<div class="jld-legend"><span class="jld-key" style="border-color:' + col.link + '"></span>rolling ' + name +
			'<span class="jld-key jld-keydash" style="border-color:' + col.font + '"></span>best ' + name + ' so far</div>';
		return sec('Progress', take, legend + '<div class="jld-chart">' + svg + '</div>');
	}

	function renderSteps(res) {
		if (!res.nAn) {
			return sec('Steps', 'No solves with a move record in this range.', '');
		}
		var st = res.st, base = res.base.st;
		var lc = colors().link;
		var maxT = 0;
		for (var s = 0; s < 7; s++) {
			maxT = Math.max(maxT, st[s][0] + st[s][1]);
		}
		var rows = [];
		var tot = [0, 0, 0, 0, 0], btot = 0;
		var worst = null;
		var bestD = null;
		for (var s = 0; s < 7; s++) {
			var r = st[s];
			var t = r[0] + r[1];
			var bt = base[s][0] + base[s][1];
			for (var j = 0; j < 5; j++) {
				tot[j] += r[j];
			}
			btot += bt;
			var d = res.baseIsSub ? bt - t : t - bt;
			if (res.base.n && (!worst || d > worst[1])) {
				worst = [STEPS[s], d];
			}
			if (res.base.n && (!bestD || d < bestD[1])) {
				bestD = [STEPS[s], d];
			}
			rows.push('<tr><td class="jld-l">' + STEPS[s] + '</td>' +
				'<td>' + (s == 0 ? '-' : fS(r[0])) + '</td><td>' + fS(r[1]) + '</td>' +
				'<td class="jld-tot">' + fS(t) + '<div class="jld-sbar"><span class="jld-rec" style="width:' + (r[0] / maxT * 100).toFixed(1) +
				'%"></span><span class="jld-exe" style="background:' + lc + ';width:' + (r[1] / maxT * 100).toFixed(1) + '%"></span></div></td>' +
				'<td>' + r[2].toFixed(1) + '</td><td>' + (r[1] > 0 ? (r[2] / r[1] * 1000).toFixed(2) : '-') + '</td>' +
				'<td>' + fS(r[3]) + '</td><td>' + r[4].toFixed(1) + '</td>' +
				'<td>' + (res.base.n ? signed(d) : '-') + '</td></tr>');
		}
		var dTot = res.baseIsSub ? btot - (tot[0] + tot[1]) : tot[0] + tot[1] - btot;
		rows.push('<tr class="jld-sum"><td class="jld-l">total</td><td>' + fS(tot[0]) + '</td><td>' + fS(tot[1]) + '</td><td class="jld-tot">' + fS(tot[0] + tot[1]) +
			'</td><td>' + tot[2].toFixed(1) + '</td><td>' + (tot[1] > 0 ? (tot[2] / tot[1] * 1000).toFixed(2) : '-') + '</td><td>' + fS(tot[3]) + '</td><td>' + tot[4].toFixed(1) +
			'</td><td>' + (res.base.n ? signed(dTot) : '-') + '</td></tr>');
		var dHead = res.baseIsSub ? 'last 100 vs all' : 'vs all';
		var head = '<tr><th class="jld-l">step</th><th title="recognition: from the end of the previous step to the first turn of this one">recog</th>' +
			'<th title="execution: first to last turn of the step">exec</th><th>time</th><th title="turns (HTM, rotations not counted)">turns</th>' +
			'<th title="turns / execution time">TPS</th><th title="sum of gaps of ' + PAUSE + ' ms or more in the step">pause</th><th title="rotations (x, y, z)">rot</th>' +
			'<th title="' + (res.baseIsSub ? 'last 100 solves minus all solves in scope' : 'this range minus all solves in scope (' + fN(res.base.n) + ')') + '">' + dHead + '</th></tr>';
		var g = recGroups(st);
		var take = 'Recognition is ' + fP(tot[0] / (tot[0] + tot[1]), 0) + ' of the step time; ' + g[0][0] + ' recognition is the largest at ' + fS(g[0][1]) + ' s.';
		if (worst && res.base.n) {
			// the delta column is (last 100 - all) or (this range - all): negative = faster
			var who = res.baseIsSub ? 'Over your last 100 solves' : 'In this range';
			if (bestD[1] < -0.02) {
				take += ' ' + who + ' ' + bestD[0] + ' is ' + fS(-bestD[1]) + ' s faster than over all solves' +
					(worst[1] > 0.02 ? ', but ' + worst[0] + ' is ' + fS(worst[1]) + ' s slower.' : '.');
			} else if (worst[1] > 0.02) {
				take += ' ' + who + ' no step is faster than over all solves; ' + worst[0] + ' is ' + fS(worst[1]) + ' s slower.';
			} else {
				take += ' ' + who + ' every step is within 0.02 s of all solves.';
			}
		}
		var legend = '<div class="jld-legend"><span class="jld-rec jld-sw"></span>recognition<span class="jld-exe jld-sw" style="background:' + lc + '"></span>execution' +
			'<span class="jld-dim">times in seconds, mean of ' + fN(res.nAn) + ' complete solves</span></div>';
		return sec('Steps', take, legend + '<div class="jld-scroll"><table class="table jld-table">' + head + rows.join('') + '</table></div>');
	}

	function caseImg(step, c) {
		var img = $('<img>');
		try {
			cubeutil.getIdentData(step)[1](c, img);
		} catch (e) {
			return '';
		}
		return '<img src="' + img.attr('src') + '" alt=""/>';
	}

	function caseName(step, c) {
		try {
			return cubeutil.getIdentData(step)[1](c)[2];
		} catch (e) {
			return '?';
		}
	}

	function renderLL(res) {
		var ll = res.ll;
		if (!ll.n) {
			return sec('Last layer', 'No solves with a move record in this range.', '');
		}
		var rows = [
			['OLL skip', ll.ollSkip / ll.n, 1 / 216, ll.ollSkip, '1/216'],
			['PLL skip', ll.pllSkip / ll.n, 1 / 18, ll.pllSkip, '1/18', 'PLL solved after OLL, also when only an AUF was left (no AUF at all: 1/72)'],
			['LL skip', ll.llSkip / ll.n, 1 / 3888, ll.llSkip, '1/3888', 'OLL and PLL skip in the same solve'],
			['LL edges oriented: 4', ll.eoN ? ll.eo[4] / ll.eoN : 0, 1 / 8, ll.eo[4], '12.5%', 'last-layer edges already oriented when OLL starts'],
			['LL edges oriented: 2', ll.eoN ? ll.eo[2] / ll.eoN : 0, 6 / 8, ll.eo[2], '75%', 'last-layer edges already oriented when OLL starts'],
			['LL edges oriented: 0', ll.eoN ? ll.eo[0] / ll.eoN : 0, 1 / 8, ll.eo[0], '12.5%', 'last-layer edges already oriented when OLL starts']
		];
		var t1 = ['<table class="table jld-table jld-ll"><tr><th class="jld-l"></th><th>you</th><th>N</th><th>chance</th></tr>'];
		rows.forEach(function(r) {
			t1.push('<tr' + (r[5] ? ' title="' + r[5] + '"' : '') + '><td class="jld-l">' + r[0] + '</td><td>' + fP(r[1]) + '</td><td>' + fN(r[3]) + '</td><td class="jld-dim">' +
				fP(r[2], r[2] < 0.01 ? 2 : 1) + '</td></tr>');
		});
		t1.push('</table>');
		var caseTable = function(cr) {
			if (!cr.rows.length) {
				return '<div class="jld-dim">not enough ' + cr.step + ' data</div>';
			}
			var t = ['<table class="table jld-table jld-cases"><tr><th class="jld-l">slowest ' + cr.step + '</th><th>N</th><th>mean</th></tr>'];
			cr.rows.forEach(function(r) {
				t.push('<tr><td class="jld-l">' + caseImg(cr.step, r.c) + '<span>' + esc(caseName(cr.step, r.c)) + '</span></td><td>' + fN(r.n) + '</td><td>' + fS(r.mean) + '</td></tr>');
			});
			t.push('</table>');
			return t.join('');
		};
		var eoRate = ll.eoN ? ll.eo[4] / ll.eoN : 0;
		var take = 'Edges are already oriented at OLL in ' + fP(eoRate, 0) + ' of solves (chance 12.5%)';
		take += eoRate > 0.2 ? ', so your F2L is setting up the last layer. ' : '. ';
		take += 'OLL skips ' + fP(ll.ollSkip / ll.n) + ' (chance 0.5%), PLL skips ' + fP(ll.pllSkip / ll.n) + ' (chance 5.6%).';
		if (res.plls.rows.length) {
			take += ' Slowest PLL: ' + esc(caseName('PLL', res.plls.rows[0].c)) + ' (' + fS(res.plls.rows[0].mean) + ' s).';
		}
		var link = window.algStat && algStat.showDialog ? '<div class="jld-more"><span class="click jld-pllstats">PLL stats: every case, recognition and AUF ›</span></div>' : '';
		return sec('Last layer', take, '<div class="jld-cols">' + t1.join('') + caseTable(res.olls) + caseTable(res.plls) + '</div>' +
			'<div class="jld-dim jld-small">Case times are recognition + execution. A case needs at least ' + res.plls.minN + ' solves to be listed.</div>' + link);
	}

	function renderConsistency(res, w) {
		var hist = histChart(w, 150, res.sorted);
		var body = '<div class="jld-chart">' + hist + '</div>';
		var take = 'σ is ' + fS(res.sd) + ' s (' + fP(res.mean ? res.sd / res.mean : 0, 0) + ' of your mean)';
		take += res.tsd < res.sd * 0.85 ? '; without the fastest and slowest 5% it is ' + fS(res.tsd) + ' s, so a few outliers inflate it.' : '.';
		if (res.blocks.length >= 2) {
			var sds = res.blocks.map(function(b) {
				return b[0];
			});
			var bsvg = lineChart(w, 130, [{v: sds, width: 1.6, dots: sds.length <= 60}], [[0, 'first'], [sds.length - 1, 'latest']], function(v) {
				return fS(v, 1);
			});
			body += '<div class="jld-sub">σ per block of ' + res.blockSize + ' finished solves, fastest and slowest 5% of each block left out</div><div class="jld-chart">' + bsvg + '</div>';
			var f = sds[0], l = sds[sds.length - 1];
			take += ' Per block of ' + res.blockSize + ' (same trimming) your latest has σ ' + fS(l) + ' s against ' + fS(f) + ' s in the first' +
				(l < f * 0.9 ? ': you are more consistent now.' : l > f * 1.1 ? ': less consistent than at the start.' : ': about the same.');
		}
		return sec('Consistency', take, body);
	}

	function renderSlowest(res) {
		var rows = ['<table class="table jld-table jld-slow"><tr><th class="jld-l">#</th><th>time</th><th class="jld-l">date</th><th class="jld-l">lost most in</th><th></th></tr>'];
		var stepCnt = {};
		res.slow.forEach(function(r, k) {
			if (r.step >= 0) {
				var grp = r.step >= 1 && r.step <= 4 ? 'F2L' : STEPS[r.step];
				stepCnt[grp] = (stepCnt[grp] || 0) + 1;
			}
			rows.push('<tr><td class="jld-l">' + (k + 1) + '</td><td>' + fT(r.t) + '</td><td class="jld-l">' + fD(r.d) + '</td><td class="jld-l">' +
				(r.step >= 0 ? STEPS[r.step] + ' <span class="jld-dim">+' + fS(r.over) + ' s</span>' : '<span class="jld-dim">no move record</span>') + '</td><td>' +
				(hasMoves(r.rec) ? '<span class="click jld-replay" data-k="' + k + '">replay</span>' : '') + '</td></tr>');
		});
		rows.push('</table>');
		var top = null;
		for (var g in stepCnt) {
			if (!top || stepCnt[g] > stepCnt[top]) {
				top = g;
			}
		}
		var take = top ? 'Of your ' + res.slow.length + ' slowest solves, ' + stepCnt[top] + ' lost the most time in ' + top + '.' :
			'Your slowest solves have no move record, so the step is unknown.';
		return sec('Slowest solves', take, '<div class="jld-scroll">' + rows.join('') + '</div>');
	}

	function procReplay(e) {
		var k = ~~$(e.target).attr('data-k');
		var r = shown && shown.res.slow[k];
		if (!r || !hasMoves(r.rec) || !window.replay) {
			return;
		}
		replay.popupReplay(r.rec[1], r.rec[4][0], '333');
	}

	// ---------- dialog / tool ----------

	function showDialog() {
		isOpen = true;
		var onClose = function() {
			isOpen = false;
			jobId++;
		};
		// the last result is shown at once when it is for the same choices (then refreshed if solves changed)
		if (shown && (shown.scope != kernel.getProp('jlDashScope', 's') || shown.range != kernel.getProp('jlDashRange', 'all'))) {
			shown = null;
		}
		kernel.showDialog([dialogWrap, onClose, undefined, onClose], 'jldash', 'Analysis', function() {
			// sizes are known once the dialog is shown
			shown && render();
		});
		if (shown) {
			render();
		}
		update();
	}

	function execFunc(fdiv, signal) {
		if (fdiv == undefined || /^scr/.exec(signal)) {
			return;
		}
		var div = $('<div class="jld-tool">').html('Progress, CFOP steps, last layer, consistency and slowest solves, ' +
			'computed from your solves when you open it.<br><span class="click jld-open">open analysis</span>');
		div.find('.jld-open').click(showDialog);
		fdiv.empty().append(div);
	}

	$(function() {
		if (typeof tools != "undefined") {
			tools.regTool('jldash', TOOLS_RECONS + '>' + 'analysis', execFunc);
		}
		// another dialog (replay, PLL stats) replaces this one: stop the work
		kernel.regListener('jldash', 'dialog', function(signal, value) {
			if (isOpen && value != 'jldash') {
				isOpen = false;
				jobId++;
			}
		});
		kernel.regListener('jldash', 'property', function(signal, value) {
			if (isOpen && shown && /^col-/.test(value[0])) {
				render();
			}
		}, /^col-(font|link|button|board|back)$/);
		$(window).on('resize', function() {
			if (!isOpen || !shown) {
				return;
			}
			clearTimeout(resizeTid);
			resizeTid = setTimeout(render, 150);
		});
	});

	return {
		showDialog: showDialog,
		analyzeSolve: analyzeSolve,
		isOpen: function() {
			return isOpen;
		},
		// for tests / debugging
		cacheSize: function() {
			return Object.keys(cache).length;
		},
		isDone: function() {
			return doneJob == jobId && doneJob > 0;
		},
		renderCount: function() {
			return renderCount;
		},
		lastResult: function() {
			return shown && shown.res;
		}
	};
});
