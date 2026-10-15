var replay = execMain(function() {

	var div;
	var puzzleDiv;
	var puzzleObj;
	var puzzle;
	var options = {};;
	var rawRecons;
	var autoOri = true;

	var rangeTime;
	var txtTime;
	var speeds = [0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0, 5.0];
	var speedIdx = 4;
	var txtSpeed;
	var shareURL;
	var algSpan;
	var playSpan;
	var curScramble;
	var moveSeqTd;

	var startTs = 0;
	var activeTid = 0;
	var scrMoves = [];
	var playMoves = []; //[[move, time], ...]
	var curPlayIdx = 0;
	var curTime = 0;
	var status = 0; // 0 - idle, 1 - play
	var maxMoveLen = 0;

	var vrcOriStr = VRCREPLAY_ORI.split('|');

	// annotations (display-only): CFOP step segments, pauses, slips
	var tlDiv; // timeline strip
	var tlSegs; // step segments, slip markers, playhead
	var tlMarks; // pause row
	var tlHead; // playhead
	var sumDiv; // per-step summary
	var annot = null; // {total, segs, pauses, slips}
	var replayInfo = {};
	var slipIdx = {}; // playMoves index -> 1
	var PAUSE_MIN = 300;
	var PAUSE_LONG = 1000;

	function setStatus(_status) {
		if (_status != status) {
			status = _status;
			playSpan.html(status ? '\ue801' : '\ue800');
		}
	}

	function startPlayMoves() {
		if (activeTid) {
			clearTimeout(activeTid);
			activeTid = 0;
		}
		startTs = +new Date - curTime;
		setStatus(1);
		updateTime();
	}

	function normTime(ts, inv) {
		if (inv) {
			return ts < 0 ? -1 : ts * speeds[speedIdx];
		} else {
			return ts < 0 ? -2000 : ts / speeds[speedIdx];
		}
	}

	function goToTime(tt) {
		for (var i = 0; i < playMoves.length; i++) {
			if (playMoves[i][1] >= tt) {
				return goToStep(i);
			}
		}
		return goToStep(playMoves.length);
	}

	function goToStep(step) {
		if (step > curPlayIdx) {
			for (var i = curPlayIdx; i < step; i++) {
				if (Math.abs(step - 1 - i) > 3) {
					puzzleObj.applyMoves([playMoves[i][0]]);
				} else {
					puzzleObj.addMoves([playMoves[i][0]]);
				}
			}
		} else if (step < curPlayIdx) {
			for (var i = curPlayIdx - 1; i >= step; i--) {
				var move = puzzleObj.moveInv(playMoves[i][0])
				if (Math.abs(step - 1 - i) > 3) {
					puzzleObj.applyMoves([move]);
				} else {
					puzzleObj.addMoves([move]);
				}
			}
		}
		curPlayIdx = step;
		var movets = playMoves[Math.max(0, step - 1)];
		curTime = normTime(movets ? movets[1] : 0);
		updateTime();
	}

	function procClick(e) {
		var obj = $(e.target);
		var seg = obj.closest('[data-seg]');
		if (seg.length && div.has(seg[0]).length) {
			setStatus(0);
			goToStep(~~seg.attr('data-seg'));
			return;
		}
		if (!obj.hasClass('click') && !obj.is('input')) {
			return;
		}
		var key = obj.attr('data');
		var _status = status;
		var ctime = normTime(curTime, true);
		setStatus(0);
		if (key == 'l') {
			if (curPlayIdx > 0) {
				goToStep(curPlayIdx - 1);
			}
		} else if (key == 'n') {
			if (curPlayIdx < playMoves.length) {
				goToStep(curPlayIdx + 1);
			}
		} else if (key == 'p') {
			if (_status == 0 && playMoves.length > 0 && curTime >= normTime(playMoves.at(-1)[1])) {
				goToStep(0);
			}
			setStatus(1 - _status);
			if (status == 1) {
				startPlayMoves();
			}
		} else if (key == 's') {
			goToStep(0);
		} else if (key == 'e') {
			goToStep(playMoves.length);
		} else if (key == 'r') {
			goToTime(rangeTime.val());
		} else if (key == 's+') {
			speedIdx = Math.min(speedIdx + 1, speeds.length - 1);
			txtSpeed.html(speeds[speedIdx] + 'x');
			curTime = normTime(ctime);
		} else if (key == 's-') {
			speedIdx = Math.max(speedIdx - 1, 0);
			txtSpeed.html(speeds[speedIdx] + 'x');
			curTime = normTime(ctime);
		} else if (key == 'a') {
			$.clipboardCopy(shareURL).then(
				logohint.push.bind(logohint, LGHINT_LINKCOPY),
				logohint.push.bind(logohint, 'Copy Failed')
			);
		} else if (key == 'o') {
			autoOri = !autoOri;
			if (autoOri) {
				obj.html(vrcOriStr[1]);
			} else {
				obj.html(vrcOriStr[0]);
			}
			goToStep(0);
			parseRecons(rawRecons);
		}
	}

	function execLoop() {
		var ts = +new Date - startTs;
		if (activeTid) {
			clearTimeout(activeTid);
			activeTid = 0;
		}
		if (status == 0) {
			return curTime;
		}
		while (curPlayIdx < playMoves.length && normTime(playMoves[curPlayIdx][1]) <= ts) {
			puzzleObj.addMoves([playMoves[curPlayIdx][0]]);
			curPlayIdx++;
		}
		if (curPlayIdx >= playMoves.length) {
			return ts;
		}
		activeTid = setTimeout(execLoop, normTime(playMoves[curPlayIdx][1]) - ts);
		return ts;
	}

	function updateTime() {
		curTime = execLoop();
		var lastTs = playMoves.length > 0 ? playMoves.at(-1)[1] : 0;
		curTime = Math.min(curTime, normTime(lastTs));
		rangeTime.val(normTime(curTime, true));
		txtTime.html((curTime >= 0 ? kernel.pretty(normTime(curTime, true)) : '--') + '/' + kernel.pretty(lastTs));
		updateMoveTd();
		updateHead();
		if (curTime >= normTime(lastTs)) {
			setStatus(0);
		}
		if (status == 1) {
			requestAnimFrame(updateTime);
		}
	}

	function updateMoveTd() {
		var startIdx = Math.max(curPlayIdx - 4, 0);
		var endIdx = Math.min(curPlayIdx + 5, playMoves.length);
		var moves = [];
		for (var i = -4; i < 5; i++) {
			var idx = i + curPlayIdx;
			var pad;
			if (idx < 0 || idx >= playMoves.length) {
				moves[i + 4] = '<span style="color:#888;">~</span>';
				pad = mathlib.valuedArray(maxMoveLen - 1, ' ').join('');
			} else {
				var move = puzzleObj.move2str(playMoves[idx][0]);
				pad = mathlib.valuedArray(maxMoveLen - move.length, ' ').join('');
				var isRot = puzzleObj.isRotation(playMoves[idx][0]);
				if (slipIdx[idx]) {
					move = '<span class="rpl-slipmv">' + move + '</span>';
				} else if (isRot) {
					move = '<span style="color:#888;">' + move + '</span>';
				}
				moves[i + 4] = move;
			}
			if (i == 0) {
				moves[i + 4] = '<b><u>' + moves[i + 4] + '</u></b>';
			}
			moves[i + 4] = pad + moves[i + 4];
		}
		moveSeqTd.empty();
		moveSeqTd.html(moves.join('<br>'));
	}

	function fixMoveOri(move, isInit) {
		if (!autoOri || !/^\d+$/.exec(puzzle) || puzzle == '112') { // a 1x1x2 replays in the orientation it was solved in
			return isInit ? [] : move;
		}
		var targetOri = kernel.getProp('giiOri');
		if (targetOri == 'auto') {
			return isInit ? [] : move;
		}
		if (isInit) {
			return puzzleObj.parseScramble(mathlib.CubieCube.rot2str[targetOri]);
		}
		targetOri = mathlib.CubieCube.rotMulI[0][~~targetOri];
		var axis = 'URFDLB'.indexOf(move[2]);
		axis = mathlib.CubieCube.rotMulM[targetOri][axis * 3] / 3;
		move = move.slice();
		move[2] = 'URFDLB'.charAt(axis);
		return move;
	}

	function parseRecons(recons) {
		rawRecons = recons;
		algSpan.attr('href', cubeutil.getAlgCubingUrl(
			(recons || '').replace(/@(\d+)/g, '/*$1*/').replace(/-/g, '&#45;'),
			curScramble || '',
			puzzle
		));
		var movets = recons.split(' ');
		var moves = [];
		var tstamp = [];
		for (var i = 0; i < movets.length; i++) {
			var m = /^(.*)@(\d+)$/.exec(movets[i]);
			if (!m) {
				continue;
			}
			moves.push(m[1]);
			tstamp.push(~~m[2]);
		}
		var puzzleMoves = puzzleObj.parseScramble(moves.join(' '));
		if (puzzleMoves.length != tstamp.length) {
			console.log('parse error');
			buildAnnot(null);
			return;
		}
		rangeTime.attr('min', -1);
		rangeTime.attr('max', tstamp.at(-1));
		playMoves = fixMoveOri(null, true);
		for (var i = 0; i < playMoves.length; i++) {
			playMoves[i] = [playMoves[i], -1];
		}
		for (var i = 0; i < puzzleMoves.length; i++) {
			if (tstamp[i] == 0 && puzzleObj.isRotation(puzzleMoves[i])) {
				tstamp[i] -= 1;
			}
			playMoves.push([fixMoveOri(puzzleMoves[i]), tstamp[i]]);
		}
		maxMoveLen = 0;
		for (var i = 0; i < playMoves.length; i++) {
			maxMoveLen = Math.max(maxMoveLen, ("" + puzzleObj.move2str(playMoves[i][0])).length);
		}
		curPlayIdx = 0;
		curTime = normTime(-1);
		startPlayMoves();
		buildAnnot(moves, tstamp, playMoves.length - puzzleMoves.length);
	}

	// ---------- annotations ----------

	var STEP_SHORT = {'cross': 'x', 'f2l-1': '1', 'f2l-2': '2', 'f2l-3': '3', 'f2l-4': '4', 'oll': 'o', 'pll': 'p'};

	function fmtSec(ms) {
		return (ms / 1000).toFixed(ms < 10000 ? 2 : 1);
	}

	// move token -> [base, quarter turns], or null for notation we don't understand
	function splitMove(mv) {
		var m = /^((?:\d+-)?\d*[A-Za-z]+)(2'|2|'|)$/.exec(mv);
		if (!m) {
			return null;
		}
		return [m[1], {'': 1, "'": 3, '2': 2, "2'": 2}[m[2]]];
	}

	// pairs of consecutive moves where the second undoes the first (R R', U2 U2)
	function findSlips(moves, tstamp) {
		var ret = [];
		for (var i = 0; i + 1 < moves.length; i++) {
			if (tstamp[i] <= 0) { // orientation moves recorded before the solve starts
				continue;
			}
			var a = splitMove(moves[i]);
			var b = splitMove(moves[i + 1]);
			if (a && b && a[0] == b[0] && (a[1] + b[1]) % 4 == 0) {
				ret.push(i);
				i++;
			}
		}
		return ret;
	}

	function findPauses(tstamp) {
		var ret = [];
		var last = 0;
		for (var i = 0; i < tstamp.length; i++) {
			if (tstamp[i] < 0) {
				continue;
			}
			if (tstamp[i] - last >= PAUSE_MIN) {
				ret.push([last, tstamp[i]]);
			}
			last = Math.max(last, tstamp[i]);
		}
		return ret;
	}

	function caseName(step, transCubie) {
		var ident = cubeutil.getIdentData(step);
		var c = new mathlib.CubieCube();
		c.invFrom(transCubie);
		var cur = ident[0](c.toFaceCube());
		if (!(cur >= ident[2] && cur < ident[3])) {
			return null;
		}
		return ident[1](cur)[2];
	}

	// cf4op step data of a 333 solve: [{name, start, first, end, mv, cs, idx}, ...] from cross to pll
	function calcSteps(reconStr, tstamp, prefixLen, total) {
		if (typeof recons == 'undefined' || !recons.calcRecons) {
			return null;
		}
		// steps only make sense for a solve that ends solved: trust the caller's DNF flag for a recorded solve,
		// otherwise check that the moves solve the scramble
		if ('dnf' in replayInfo) {
			if (replayInfo['dnf']) {
				return null;
			}
		} else {
			var c = new mathlib.CubieCube();
			c.ori = 0;
			var toks = ((curScramble || '') + ' ' + reconStr).split(/ +/);
			for (var i = 0; i < toks.length; i++) {
				c.selfMoveStr(toks[i], false);
			}
			if (cubeutil.getProgress(c, 'n') != 0) {
				return null;
			}
		}
		var rec = recons.calcRecons([[0, total], curScramble || '', '', 0, [reconStr, '333']], 'cf4op');
		if (!rec || !rec.data[6]) {
			return null;
		}
		var names = cubeutil.getStepNames('cf4op');
		var segs = [];
		for (var i = names.length - 1; i >= 0; i--) {
			var d = rec.data[i];
			if (!d) {
				break;
			}
			var cs = null;
			if (d[3] > 0 && (names[i] == 'oll' || names[i] == 'pll')) {
				cs = caseName(names[i].toUpperCase(), d[4]);
			}
			// replay position at the step start: every move up to the previous step's last one
			var idx = prefixLen;
			while (idx - prefixLen < tstamp.length && (tstamp[idx - prefixLen] < d[0] || d[0] > 0 && tstamp[idx - prefixLen] == d[0])) {
				idx++;
			}
			segs.push({
				name: names[i],
				di: i,
				start: d[0],
				first: Math.max(d[0], Math.min(d[1], d[2])),
				end: d[2],
				mv: d[3],
				cs: cs,
				idx: idx
			});
		}
		return segs;
	}

	// mean step time (recog + exec) per cf4op data index over the latest 100 solves of the current session
	function sessionStepMeans() {
		if (typeof stats == 'undefined' || !stats.getExtraInfo) {
			return null;
		}
		try {
			var n = stats.getTimesStatsTable().timesLen;
			var sum = [0, 0, 0, 0, 0, 0, 0];
			var cnt = 0;
			for (var i = n - 1; i >= 0 && i >= n - 100; i--) {
				var rec = stats.getExtraInfo('recons_cf4op', i);
				if (!rec || rec.data.length != 7 || !rec.data[0]) {
					continue;
				}
				for (var j = 0; j < 7; j++) {
					sum[j] += rec.data[j][2] - rec.data[j][0];
				}
				cnt++;
			}
			if (cnt < 5) {
				return null;
			}
			return {
				mean: sum.map(function(v) {
					return v / cnt;
				}),
				n: cnt
			};
		} catch (e) {
			return null;
		}
	}

	function buildAnnot(moves, tstamp, prefixLen) {
		annot = null;
		slipIdx = {};
		if (!moves || moves.length == 0 || replayInfo['plain']) {
			renderAnnot();
			return;
		}
		var total = Math.max(1, tstamp.at(-1));
		var segs = null;
		if (puzzle == '333') {
			try {
				segs = calcSteps(rawRecons, tstamp, prefixLen, total);
			} catch (e) {
				segs = null;
			}
		}
		if (segs && segs.length) {
			total = Math.max(total, segs.at(-1).end);
		}
		var slips = findSlips(moves, tstamp);
		for (var i = 0; i < slips.length; i++) {
			slipIdx[prefixLen + slips[i]] = 1;
			slipIdx[prefixLen + slips[i] + 1] = 1;
		}
		annot = {
			total: total,
			segs: segs && segs.length ? segs : null,
			pauses: findPauses(tstamp),
			slips: slips.map(function(i) {
				return [tstamp[i], moves[i] + ' ' + moves[i + 1]];
			}),
			means: segs && segs.length == 7 ? sessionStepMeans() : null
		};
		renderAnnot();
	}

	function pct(ts) {
		return Math.max(0, Math.min(100, ts / annot.total * 100));
	}

	function segLabels(s) {
		var nm = s.name + (s.cs ? ' ' + s.cs : '');
		var dt = ((s.end - s.start) / 1000).toFixed(1) + 's';
		return [
			nm + ' ' + s.mv + ' mv ' + dt,
			nm + ' ' + dt,
			(s.cs || s.name) + ' ' + dt,
			s.cs || s.name,
			s.name,
			STEP_SHORT[s.name],
			''
		];
	}

	var fitTid = 0;

	function fitLabels(retry) {
		clearTimeout(fitTid);
		if (!annot) {
			return;
		}
		if (tlSegs[0].clientWidth == 0) { // dialog not laid out yet
			retry = retry || 0;
			if (retry < 30) {
				fitTid = setTimeout(fitLabels.bind(null, retry + 1), 100);
			}
			return;
		}
		fitLayout();
		if (!annot.segs) {
			return;
		}
		tlSegs.children('.rpl-seg').each(function() {
			var seg = $(this);
			var lbl = seg.children('.rpl-lbl');
			var cands = segLabels(annot.segs[~~seg.attr('data-k')]);
			for (var i = 0; i < cands.length; i++) {
				lbl.text(cands[i]);
				if (lbl[0].scrollWidth <= lbl[0].clientWidth) {
					break;
				}
			}
		});
	}

	// with the step bar and summary shown, give the cube whatever height the other rows leave
	function fitLayout() {
		var box = div.parent();
		var cont = puzzleDiv.children().first(); // twisty container, sized 100% by twisty.js
		if (!annot || !annot.segs || !box.height()) {
			if (div[0].style.height != '98%') {
				div.css('height', '98%');
				puzzleDiv.css('height', '80%');
				cont.css('height', '100%');
				puzzleObj && puzzleObj.resize();
			}
			return;
		}
		div.css('height', 'auto');
		var others = div.outerHeight(true) - puzzleDiv.parent().outerHeight();
		// keep the cube at least ~45% of the dialog; the summary scrolls on short screens
		var h = Math.max(box.height() - others - 8, box.height() * 0.45);
		h = Math.max(140, Math.floor(Math.min(h, box.width() - moveSeqTd.outerWidth() - 8)));
		if (puzzleDiv[0].style.height != h + 'px') {
			puzzleDiv.css('height', h + 'px');
			cont.css('height', h + 'px');
			puzzleObj && puzzleObj.resize();
		}
	}

	function renderAnnot() {
		tlSegs.empty();
		tlMarks.empty();
		sumDiv.empty();
		if (!annot) {
			tlDiv.hide();
			fitLayout();
			return;
		}
		tlDiv.show();
		var segs = annot.segs;
		tlSegs.toggleClass('rpl-plain', !segs);
		for (var i = 0; segs && i < segs.length; i++) {
			var s = segs[i];
			if (s.end <= s.start) {
				continue;
			}
			var w = pct(s.end) - pct(s.start);
			var rw = (s.first - s.start) / (s.end - s.start) * 100;
			var seg = $('<div class="rpl-seg">').attr({
				'data-seg': s.idx,
				'data-k': i,
				'title': segLabels(s)[0] + ' (recog ' + fmtSec(s.first - s.start) + ', exec ' + fmtSec(s.end - s.first) + ')'
			}).css({
				left: pct(s.start) + '%',
				width: w + '%'
			}).append(
				$('<span class="cntbar rpl-rec">').css('width', rw + '%'),
				$('<span class="cntbar rpl-exe">').css({left: rw + '%', width: (100 - rw) + '%'}),
				$('<span class="rpl-lbl">')
			);
			tlSegs.append(seg);
		}
		tlSegs.append(tlHead);
		for (var i = 0; i < annot.pauses.length; i++) {
			var p = annot.pauses[i];
			var dt = p[1] - p[0];
			tlMarks.append($('<span class="rpl-pause">').toggleClass('rpl-long', dt >= PAUSE_LONG).attr('title', fmtSec(dt) + ' s pause').css({
				left: pct(p[0]) + '%',
				width: (pct(p[1]) - pct(p[0])) + '%'
			}));
		}
		for (var i = 0; i < annot.slips.length; i++) {
			tlSegs.append($('<span class="rpl-slip">').attr('title', 'slip: ' + annot.slips[i][1]).css('left', pct(annot.slips[i][0]) + '%'));
		}
		renderSummary();
		fitLabels(0);
		updateHead();
	}

	function renderSummary() {
		var pauseTot = 0;
		var nLong = 0;
		for (var i = 0; i < annot.pauses.length; i++) {
			var dt = annot.pauses[i][1] - annot.pauses[i][0];
			pauseTot += dt;
			nLong += dt >= PAUSE_LONG ? 1 : 0;
		}
		var info = [annot.pauses.length + ' pause' + (annot.pauses.length == 1 ? '' : 's') + ' \u2265' + PAUSE_MIN / 1000 + 's (' + fmtSec(pauseTot) + 's'
			+ (nLong ? ', ' + nLong + ' \u2265' + PAUSE_LONG / 1000 + 's' : '') + ')'];
		info.push(annot.slips.length ? '<span class="rpl-slipmv">' + annot.slips.length + ' slip' + (annot.slips.length == 1 ? '' : 's') + '</span>' : '0 slips');
		var segs = annot.segs;
		if (segs) {
			var means = annot.means;
			var worst = -1;
			var worstDiff = 0;
			for (var i = 0; means && i < segs.length; i++) {
				var diff = segs[i].end - segs[i].start - means.mean[segs[i].di];
				if (diff > worstDiff) {
					worstDiff = diff;
					worst = i;
				}
			}
			var tb = $('<table class="table rpl-sum">');
			tb.append('<tr><th>step</th><th>recog</th><th>exec</th><th>turns</th><th>tps</th>' +
				(means ? '<th title="vs mean of the last ' + means.n + ' solves of this session">vs avg</th>' : '') + '</tr>');
			for (var i = 0; i < segs.length; i++) {
				var s = segs[i];
				var tt = s.end - s.start;
				var row = $('<tr>').attr('data-seg', s.idx);
				row.append(
					$('<td class="click">').text(s.name + (s.cs ? ' ' + s.cs : (s.mv == 0 ? ' skip' : ''))),
					$('<td>').text(s.name == 'cross' ? '-' : fmtSec(s.first - s.start)),
					$('<td>').text(fmtSec(s.end - s.first)),
					$('<td>').text(s.mv),
					$('<td>').text(s.mv > 0 && tt > 0 ? (s.mv / tt * 1000).toFixed(1) : '-')
				);
				if (means) {
					var diff = Math.round((tt - means.mean[s.di]) / 10) * 10;
					row.append($('<td>').toggleClass('rpl-slipmv', i == worst).text((diff >= 0 ? '+' : '\u2212') + fmtSec(Math.abs(diff))));
				}
				tb.append(row);
			}
			sumDiv.append(tb);
		}
		sumDiv.append($('<div class="rpl-info">').html(info.join(' \u00b7 ')));
	}

	function updateHead() {
		if (!annot || !tlHead) {
			return;
		}
		var t = curTime < 0 ? 0 : normTime(curTime, true);
		tlHead.css('left', pct(t) + '%');
	}

	// info (optional): {dnf: bool} for a recorded solve, {plain: true} for a non-solve move sequence (no annotations)
	function popupReplay(scramble, recons, _puzzle, info) {
		replayInfo = info && typeof info == 'object' ? info : {};
		puzzle = _puzzle || tools.puzzleType(tools.getCurScramble()[0]) || '333';
		// Accept scramble types (222so) or puzzle ids (222)
		if (tools.puzzleType(puzzle)) {
			puzzle = tools.puzzleType(puzzle);
		}
		var size = ['222', '333', '444', '555', '666', '777', '888', '999', '101010', '111111'].indexOf(puzzle);
		curScramble = scramble;
		shareURL = new URL('?vrcreplay=' + LZString.compressToEncodedURIComponent(JSON.stringify([scramble, recons, puzzle])), location).toString();
		var options = {
			puzzle: 'cube3',
		};
		if (size != -1) {
			options['puzzle'] = 'cube' + (size + 2);
		} else if (/^udpoly$/.exec(puzzle)) {
			options.puzzle = puzzle;
			options.scramble = scramble;
		} else if (puzzleFactory.twistyre.exec(puzzle)) {
			options.puzzle = puzzle;
		}
		kernel.showDialog([div, function() {
			setStatus(0);
		}, undefined, function() {
			setStatus(0);
		}], 'replay', VRCREPLAY_TITLE, function() {
			puzzleFactory.init(options, $.noop, puzzleDiv, function(ret, isInit) {
				div.unbind('click').click(procClick);
				rangeTime.unbind('input click').bind('input', procClick);
				puzzleObj = ret;
				puzzleObj && puzzleObj.resize();
				scrMoves = puzzleObj.parseScramble(scramble);
				puzzleObj.applyMoves(scrMoves);
				parseRecons(recons);
			});
		});
	}

	function bindDomElem(elem, scramble, recons, puzzle) {
		if (!elem.hasClass('click')) {
			elem.addClass('click');
		}
		elem.unbind('click').click(function() {
			popupReplay(scramble, recons, puzzle);
		});
	}

	$(function() {
		div = $('<table style="height:98%">');
		puzzleDiv = $('<td style="height:80%">');
		var spanTpl = $.format.bind(null, '<span class="click playbutton" data="{0}">{1}</span>');
		rangeTime = $('<input type="range" style="width:50%;" data="r">');
		txtTime = $('<span style="user-select:none;"></span>');
		txtSpeed = $('<span style="user-select:none;">1x</span>');
		algSpan = $('<a target="_blank">\u23efAlg</a>');
		playSpan = $(spanTpl(['p', '\ue800']));
		moveSeqTd = $('<td style="width:0%;font-family:monospace;white-space:pre;">');
		tlSegs = $('<div class="rpl-segs">');
		tlMarks = $('<div class="rpl-marks">');
		tlHead = $('<div class="rpl-head">');
		tlDiv = $('<div class="rpl-tl">').append(tlSegs, tlMarks).hide();
		sumDiv = $('<div class="rpl-sumdiv">');
		$(window).on('resize', function() {
			if (tlDiv.is(':visible')) {
				fitLabels(0);
			}
		});
		div.append(
			$('<tr>').append($('<td colspan=2>').append(
				spanTpl(['o', vrcOriStr[1]]), '| ',
				algSpan, ' |',
				spanTpl(['a', VRCREPLAY_SHARE])
			)),
			$('<tr>').append(puzzleDiv, moveSeqTd),
			$('<tr>').append($('<td colspan=2>').append($('<div style="display:flex;justify-content:center;align-items:center;">').append(txtSpeed, ' ', rangeTime, ' ', txtTime))),
			$('<tr>').append($('<td colspan=2>').append(tlDiv)),
			$('<tr>').append($('<td colspan=2>').append(
				spanTpl(['s-', '\ue807']),
				spanTpl(['s+', '\ue806']),
				spanTpl(['s', '\ue802']),
				spanTpl(['l', '\ue804']),
				playSpan,
				spanTpl(['n', '\ue805']),
				spanTpl(['e', '\ue803'])
			)),
			$('<tr>').append($('<td colspan=2>').append(sumDiv))
		);
		var req = $.urlParam('vrcreplay');
		if (req) {
			$.clearUrl('vrcreplay');
			try {
				req = JSON.parse(LZString.decompressFromEncodedURIComponent(decodeURIComponent(req)));
				setTimeout(function() {
					popupReplay(req[0], req[1], req[2]);
				}, 500);
			} catch (e) {
				console.log(e);
			}
		}
	});

	return {
		popupReplay: popupReplay,
		bindDomElem: bindDomElem
	}
});
