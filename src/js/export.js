"use strict";

var exportFunc = execMain(function() {
	var wcaLoginUrl = 'https://www.worldcubeassociation.org/oauth/authorize?client_id=63a89d6694b1ea2d7b7cbbe174939a4d2adf8dd26e69acacd1280af7e7727554&response_type=code&scope=public&redirect_uri=' + encodeURI(location.href.split('?')[0]);
	var gglLoginUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=738060786798-octf9tngnn8ibd6kau587k34au263485.apps.googleusercontent.com&response_type=token&scope=https://www.googleapis.com/auth/drive.appdata&redirect_uri=' + encodeURI(location.href.split('?')[0]);

	var exportDiv = $('<div />');
	var exportTable = $('<table class="expOauth expUpDown">');

	var wcaDataTd = $('<td></td>');
	var wcaDataTr = $('<tr>').append('<td class="img"/>', wcaDataTd);
	var inServWCA = $('<a class="click"/>').html(EXPORT_FROMSERV + ' (csTimer)').click(downloadData);
	var outServWCA = $('<a class="click"/>').html(EXPORT_TOSERV + ' (csTimer)').click(uploadDataClk);

	var gglDataTd = $('<td></td>');
	var gglDataTr = $('<tr>').append('<td class="img"/>', gglDataTd);
	var inServGGL = $('<a class="click"/>');
	var outServGGL = $('<a class="click"/>');

	var inFile = $('<input type="file" id="file" accept="text/*"/>');
	var inOtherFile = $('<input type="file" id="file" accept="text/*"/>');
	var outFile = $('<a class="click"/>').html(EXPORT_TOFILE);

	var inServ = $('<a class="click"/>').html(EXPORT_FROMSERV + ' (csTimer)').click(downloadData);
	var outServ = $('<a class="click"/>').html(EXPORT_TOSERV + ' (csTimer)').click(uploadDataClk);

	var expString;

	exportTable.append(
		$('<tr>').append(
			$('<td>').append($('<a class="click"/>').html(EXPORT_FROMFILE).click(function() {
				inFile.click();
			})),
			$('<td>').append(outFile)),
		$('<tr>').append(
			$('<td>').append(inServ),
			$('<td>').append(outServ)),
		$('<tr>').append(
			$('<td colspan=2>').append($('<a class="click"/>').html(EXPORT_FROMOTHER).click(function() {
				inOtherFile.click();
			}))
		)
	);

	function updateExpString() {
		return storage.exportAll().then(function(exportObj) {
			exportObj['properties'] = mathlib.str2obj(localStorage['properties']);
			expString = JSON.stringify(exportObj);
		});
	}

	function importData() {
		var dataobj = null;
		try {
			dataobj = JSON.parse(this.result);
		} catch (e) {
			logohint.push(LGHINT_INVALID);
			return;
		}
		previewImport(dataobj, inFileMeta);
	}

	function loadData(data, skipConfirm, onDone) {
		var sessionDelta = 0;
		var solveAdd = 0;
		var solveRm = 0;
		storage.exportAll().then(function(exportObj) {
			if (skipConfirm) {
				return Promise.resolve();
			}
			for (var sessionIdx = 1; sessionIdx <= ~~kernel.getProp('sessionN'); sessionIdx++) {
				var times = mathlib.str2obj(exportObj['session' + sessionIdx] || []);
				var timesNew = mathlib.str2obj(data['session' + sessionIdx] || []);
				if (times.length != timesNew.length) {
					sessionDelta++;
					solveAdd += Math.max(timesNew.length - times.length, 0);
					solveRm += Math.max(times.length - timesNew.length, 0);
				}
			}
			if ($.confirm(IMPORT_FINAL_CONFIRM
					.replace("%d", sessionDelta)
					.replace("%a", solveAdd)
					.replace("%r", solveRm)
				)) {
				return Promise.resolve();
			} else {
				return Promise.reject();
			}
		}).then(function() {
			if ('properties' in data) {
				var devData = localStorage['devData'] || '{}';
				var wcaData = localStorage['wcaData'] || '{}';
				var gglData = localStorage['gglData'] || '{}';
				var locData = localStorage['locData'] || '{}';
				localStorage.clear();
				localStorage['devData'] = devData;
				localStorage['wcaData'] = wcaData;
				localStorage['gglData'] = gglData;
				localStorage['locData'] = locData;
				localStorage['properties'] = mathlib.obj2str(data['properties']);
				kernel.loadProp();
			}
			storage.importAll(data).then(function() {
				// onDone may return a promise (e.g. saving the undo copy): reload only once it settled
				var reload = function() {
					location.reload();
				};
				Promise.resolve(onDone && onDone()).then(reload, reload);
			});
		}, $.noop);
	}

	// ---------- jlTimer: safer import ----------
	// Importing a file used to replace everything after one confirm. Now it shows a preview (per session:
	// now vs file), then Replace all or Merge. Either way the current data is first downloaded as a backup
	// file and kept for "Undo import" until the next reload, and after the reload the solve counts in
	// storage are checked against what the import should have written.
	// Cloud restore/sync keep calling loadData directly and never see the preview.
	var UNDO_KEY = 'jlImportUndo'; // IndexedDB (sessions store) key: pre-import export text, survives the import's reload only
	var MARK_KEY = 'jlImport'; // sessionStorage: what the import that just reloaded the page did and expects
	var undoText = null; // pre-import data, in memory until the page is reloaded
	var undoDiv = $('<div class="expOauth jlimpundo">').hide();

	function downloadText(text, name) {
		if (!window.Blob) {
			return false;
		}
		var tmpFile = $('<a class="click"/>');
		tmpFile.attr('href', URL.createObjectURL(new Blob([text], {
			'type': 'text/plain'
		})));
		tmpFile.attr('download', name);
		tmpFile.appendTo('body');
		tmpFile[0].click();
		tmpFile.remove();
		return true;
	}

	function plainText(html) { // session names are stored as HTML; show them as text without running anything
		try {
			return new DOMParser().parseFromString(String(html), 'text/html').body.textContent;
		} catch (e) {
			return String(html);
		}
	}

	function fmtNum(n) {
		return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	function fmtDay(ts) {
		return ts ? mathlib.time2str(ts, '%Y-%M-%D') : '';
	}

	function parseObj(val, def) {
		try {
			var ret = mathlib.str2obj(val);
			return ret && typeof ret == 'object' ? ret : def;
		} catch (e) {
			return def;
		}
	}

	// per-session view of an export object. Sessions beyond sessionN are not imported (storage.importAll),
	// so they are not counted. A file without properties keeps the current sessionN.
	function summarize(data, fallbackN) {
		var props = 'properties' in data ? parseObj(data['properties'], {}) : null;
		var sd = props ? parseObj(props['sessionData'], {}) : parseObj(kernel.getProp('sessionData'), {});
		var n = props ? (~~props['sessionN'] || 15) : fallbackN;
		var ret = { n: n, list: [], total: 0, newest: 0, props: props, sd: sd };
		for (var i = 1; i <= n; i++) {
			var times = parseObj(data['session' + i], []);
			if (!$.isArray(times)) {
				times = [];
			}
			var first = 0, last = 0;
			for (var j = 0; j < times.length; j++) {
				var ts = times[j] && times[j][3];
				if (ts > 0) {
					first = first && first < ts ? first : ts;
					last = last > ts ? last : ts;
				}
			}
			var entry = sd[i] && typeof sd[i] == 'object' ? sd[i] : {};
			var name = entry['name'] === undefined ? i : entry['name'];
			var type = scramble.getTypeName((entry['opt'] || {})['scrType'] || '333') || '';
			ret.list.push({
				idx: i,
				name: name,
				label: plainText(name),
				puzzle: plainText(type.split('>').pop()),
				times: times,
				count: times.length,
				first: first,
				last: last,
				entry: entry
			});
			ret.total += times.length;
			ret.newest = Math.max(ret.newest, last);
		}
		return ret;
	}

	function solveKey(t) {
		t = $.isArray(t) ? t : [];
		return (t[3] || 0) + '|' + ((t[0] || [])[1]) + '|' + t[1];
	}

	// Merge rule: file session N goes into current session N if both exist and their names are equal;
	// otherwise (different name, or N beyond the current sessions) it becomes a new session at the end.
	// In a matched session the solves are united, a solve counting as present when its timestamp, raw
	// time (ignoring the penalty) and scramble match; the local copy wins. Current session settings are
	// kept, only missing fields are taken from the file. Empty file sessions are skipped.
	function mergeData(cur, file) {
		var props = JSON.parse(JSON.stringify(cur.props || {}));
		var sd = JSON.parse(JSON.stringify(cur.sd || {}));
		var out = { 'properties': props };
		var counts = [];
		var report = [];
		var n = cur.n;
		for (var i = 1; i <= cur.n; i++) {
			out['session' + i] = cur.list[i - 1].times;
			counts[i - 1] = cur.list[i - 1].count;
		}
		for (var i = 0; i < file.list.length; i++) {
			var f = file.list[i];
			if (f.count == 0) {
				continue;
			}
			var c = f.idx <= cur.n ? cur.list[f.idx - 1] : null;
			if (c && String(c.name) === String(f.name)) {
				var seen = {};
				for (var j = 0; j < c.times.length; j++) {
					seen[solveKey(c.times[j])] = 1;
				}
				var add = [];
				for (var j = 0; j < f.times.length; j++) {
					if (!$.isArray(f.times[j])) {
						continue;
					}
					var key = solveKey(f.times[j]);
					if (!seen[key]) {
						seen[key] = 1;
						add.push(f.times[j]);
					}
				}
				var entry = sd[c.idx] = sd[c.idx] && typeof sd[c.idx] == 'object' ? sd[c.idx] : {};
				for (var key in f.entry) {
					if (entry[key] === undefined && key != 'stat' && key != 'date' && key != 'rank') {
						entry[key] = JSON.parse(JSON.stringify(f.entry[key]));
					}
				}
				if (add.length == 0) {
					continue;
				}
				var merged = c.times.concat(add).map(function(t, k) {
					return [t, k];
				});
				merged.sort(function(a, b) {
					return ((a[0][3] || 0) - (b[0][3] || 0)) || (a[1] - b[1]);
				});
				merged = merged.map(function(p) {
					return p[0];
				});
				out['session' + c.idx] = merged;
				counts[c.idx - 1] = merged.length;
				delete entry['stat']; // recomputed when the session is opened, as in "merge sessions"
				entry['date'] = [(merged[0] || [])[3], (merged.at(-1) || [])[3]];
				report.push({ idx: c.idx, label: c.label, added: add.length, isNew: false });
			} else {
				n++;
				var entry = JSON.parse(JSON.stringify(f.entry));
				entry['name'] = f.name;
				entry['opt'] = entry['opt'] || {};
				entry['rank'] = n; // after all current sessions, in file order
				delete entry['stat'];
				sd[n] = entry;
				out['session' + n] = f.times;
				counts[n - 1] = f.count;
				report.push({ idx: n, from: f.idx, label: f.label, added: f.count, isNew: true });
			}
		}
		props['sessionN'] = n;
		props['sessionData'] = JSON.stringify(sd);
		var added = 0;
		for (var i = 0; i < report.length; i++) {
			added += report[i].added;
		}
		return { data: out, counts: counts, report: report, added: added };
	}

	function countsOf(sum) {
		return sum.list.map(function(s) {
			return s.count;
		});
	}

	function sessionRef(s) {
		return (s.isNew ? 'new session ' : 'session ') + s.idx + ' "' + s.label + '"';
	}

	function mergeReportText(report) {
		return report.map(function(s) {
			return sessionRef(s) + ': +' + fmtNum(s.added);
		}).join(', ');
	}

	function countCell(s, other) {
		var td = $('<td>');
		if (!s) {
			return td.text('-');
		}
		td.append($('<span>').text(fmtNum(s.count)));
		if (other && s.count < other.count) {
			td.append($('<b>').text(' (-' + fmtNum(other.count - s.count) + ')'));
		}
		if (s.first) {
			td.append('<br>', $('<span class="jlimpdate">').text(fmtDay(s.first) + (fmtDay(s.last) != fmtDay(s.first) ? ' - ' + fmtDay(s.last) : '')));
		}
		return td;
	}

	function buildPreview(cur, file, merge, meta) {
		var div = $('<div class="jlimp">');
		if (meta) {
			div.append($('<div>').text('File: ' + (meta.name || '') +
				(meta.modified ? ' (saved ' + mathlib.time2str(meta.modified / 1000, '%Y-%M-%D %h:%m') + ')' : '')));
		}
		var table = $('<table class="table jlimptable">').append(
			$('<tr>').append('<th>#</th>', $('<th>').text('Session'), $('<th>').text('Now'), $('<th>').text('File')));
		var hidden = 0;
		var warns = [];
		var replaced = [];
		for (var i = 1; i <= Math.max(cur.n, file.n); i++) {
			var c = cur.list[i - 1];
			var f = file.list[i - 1];
			if ((!c || c.count == 0) && (!f || f.count == 0)) {
				hidden++;
				continue;
			}
			var nameTd = $('<td class="jlimpname">');
			var main = c || f;
			nameTd.append($('<span>').text(main.label), ' ', $('<span class="jlimpdate">').text(main.puzzle));
			if (c && f && String(c.name) !== String(f.name)) {
				nameTd.append('<br>', $('<span class="jlimpdate">').text('file: ' + f.label + ' ' + f.puzzle));
				if (c.count > 0) {
					replaced.push(c);
				}
			}
			table.append($('<tr>').append($('<td>').text(i), nameTd, countCell(c), countCell(f, c)));
			if (c && c.count > 0 && (!f || f.count == 0)) {
				warns.push('Session ' + i + ' "' + c.label + '" (' + fmtNum(c.count) + ' solves) is ' +
					(f ? 'empty' : 'not') + ' in the file: Replace all removes it.');
			}
		}
		table.append($('<tr>').append('<th></th>', $('<th>').text('Total'),
			$('<th>').text(fmtNum(cur.total)), $('<th>').text(fmtNum(file.total))));
		div.append($('<div class="jlimpscroll">').append(table));
		if (hidden) {
			div.append($('<div class="jlimpdate">').text(hidden + ' empty session' + (hidden == 1 ? '' : 's') + ' not shown.'));
		}
		if (file.total < cur.total) {
			warns.unshift('The file has fewer solves than you have now (' + fmtNum(file.total) + ' vs ' +
				fmtNum(cur.total) + '): Replace all removes at least ' + fmtNum(cur.total - file.total) + '.');
		}
		for (var i = 0; i < replaced.length; i++) {
			warns.push('Session ' + replaced[i].idx + ' is "' + replaced[i].label + '" here but "' + file.list[replaced[i].idx - 1].label +
				'" in the file: Replace all overwrites it, Merge adds the file\'s one as a new session.');
		}
		if (file.newest && cur.newest > file.newest) {
			warns.push('The file is older than your data: its newest solve is from ' + fmtDay(file.newest) +
				', yours from ' + fmtDay(cur.newest) + '.');
		}
		if (!file.props) {
			warns.push('The file has no settings; only solves are imported.');
		}
		if (warns.length) {
			var ul = $('<ul class="jlimpwarn">');
			for (var i = 0; i < warns.length; i++) {
				ul.append($('<li>').text(warns[i]));
			}
			div.append($('<div>').append($('<b>').text('Warnings')), ul);
		}
		div.append($('<div class="jlimpnote">').append(
			$('<div>').text('Replace all: your data becomes exactly the file (sessions, solves and settings).'),
			$('<div>').text(merge.added ? 'Merge: adds ' + fmtNum(merge.added) + ' solve' + (merge.added == 1 ? '' : 's') +
				' and removes nothing (' + mergeReportText(merge.report) + ').' :
				'Merge: nothing to add, every solve in the file is already here.'),
			$('<div>').text(cur.total ? 'Either way, your current data is downloaded first as a backup file, and Export > Undo import can restore it until you reload the page.' :
				'You have no solves now, so no backup file is downloaded; Export > Undo import can still restore your current settings until you reload the page.')));
		return div;
	}

	var previewDiv = null;

	function previewImport(data, meta) {
		if (!data || typeof data != 'object' || $.isArray(data)) {
			logohint.push(LGHINT_INVALID);
			return;
		}
		storage.exportAll().then(function(curObj) {
			curObj['properties'] = parseObj(localStorage['properties'], {});
			var n = ~~kernel.getProp('sessionN');
			var cur = summarize(curObj, n);
			var file = summarize(data, n);
			var merge = mergeData(cur, file);
			var div = buildPreview(cur, file, merge, meta);
			previewDiv && previewDiv.remove(); // the dialog parks old contents off-screen; drop the last preview
			previewDiv = div;
			kernel.showDialog([div, undefined, undefined, $.noop, ['Replace all', function() {
				applyImport('replace', data, countsOf(file), { total: file.total, sessions: file.n }, cur.total > 0);
				return true;
			}], ['Merge', function() {
				if (!merge.added) {
					logohint.push('Nothing to merge: every solve in the file is already here');
					return true;
				}
				applyImport('merge', merge.data, merge.counts, { added: merge.added, report: merge.report }, cur.total > 0);
				return true;
			}], [CANCEL_LANG, function() {
				return true;
			}]], 'export', 'Import preview');
		});
	}

	// stores what to check after the reload, keeps a copy of the old data for undo, keeps the background image
	function finishLoad(mark, oldText, bgImg) {
		var jobs = [];
		if (oldText) {
			jobs.push(storage.setKey(UNDO_KEY, oldText));
		}
		if (bgImg !== undefined) {
			jobs.push(storage.setKey('bgImgFile', bgImg));
		}
		return Promise.all(jobs).then(function() {
			try {
				window.sessionStorage[MARK_KEY] = JSON.stringify(mark);
			} catch (e) {}
		});
	}

	function applyImport(mode, data, counts, info, download) {
		logohint.push(download ? 'Saving a backup of your current data...' : 'Importing...');
		Promise.all([exportFunc.getExportString(), storage.getKey('bgImgFile')]).then(function(r) {
			var oldText = r[0];
			var fileName = 'jltimer_backup_before_import_' + mathlib.time2str(new Date() / 1000, '%Y%M%D_%h%m%s') + '.txt';
			if (!download || !downloadText(oldText, fileName)) {
				fileName = null;
			}
			var mark = { 'mode': mode, 'counts': counts, 'info': info, 'backup': fileName };
			setTimeout(function() { // let the download start before the page reloads
				loadData(data, true, finishLoad.bind(null, mark, oldText, r[1]));
			}, fileName ? 500 : 0);
		});
	}

	function undoImport() {
		if (!undoText) {
			return;
		}
		if (!$.confirm('Restore your data from before the import? Solves recorded since the import are removed.')) {
			return;
		}
		var data = JSON.parse(undoText);
		var counts = countsOf(summarize(data, ~~kernel.getProp('sessionN')));
		storage.getKey('bgImgFile').then(function(bgImg) {
			loadData(data, true, finishLoad.bind(null, { 'mode': 'undo', 'counts': counts }, null, bgImg));
		});
	}

	// after the reload: recount the solves per session in storage and compare with what was written
	function checkImport() {
		var mark = null;
		try {
			mark = JSON.parse(window.sessionStorage[MARK_KEY] || 'null');
			delete window.sessionStorage[MARK_KEY];
		} catch (e) {}
		Promise.all([storage.getKey(UNDO_KEY), storage.exportAll()]).then(function(r) {
			if (r[0] !== undefined) {
				storage.delKey(UNDO_KEY); // in memory from here on: gone after the next reload
			}
			if (!mark || !mark['counts']) {
				return;
			}
			if (mark['mode'] != 'undo' && typeof r[0] == 'string') {
				undoText = r[0];
				undoDiv.empty().append($('<span class="click">').text('Undo import (restore the data from before the last import)').click(function() {
					kernel.hideDialog();
					undoImport();
				})).show();
			}
			var counts = mark['counts'];
			var n = ~~kernel.getProp('sessionN');
			var bad = [];
			var total = 0;
			for (var i = 1; i <= Math.max(n, counts.length); i++) {
				var have = (r[1]['session' + i] || []).length;
				var want = ~~counts[i - 1];
				total += have;
				if (have != want) {
					bad.push('session ' + i + ' has ' + fmtNum(have) + ', expected ' + fmtNum(want));
				}
			}
			if (n != counts.length) {
				bad.unshift(n + ' sessions, expected ' + counts.length);
			}
			var info = mark['info'] || {};
			var head = mark['mode'] == 'undo' ? 'Restored the data from before the import.' :
				mark['mode'] == 'merge' ? 'Merged the file: added ' + fmtNum(info['added']) + ' solves (' + mergeReportText(info['report'] || []) + ').' :
				'Imported the file, replacing all data.';
			var check = bad.length ? 'Check FAILED: ' + bad.join('; ') + '.' :
				'Check OK: ' + fmtNum(total) + ' solves in ' + n + ' sessions, as expected.';
			logohint.push(bad.length ? 'Import check failed' : 'Import check OK');
			var div = $('<div class="jlimp">').append($('<div>').text(head), $('<div class="jlimpcheck">').text(check));
			if (mark['backup']) {
				div.append($('<div class="jlimpdate">').text('Your previous data was downloaded as ' + mark['backup'] + '.'));
			}
			var values = [div, $.noop, undefined, $.noop];
			if (undoText) {
				div.append($('<div class="jlimpdate">').text('Undo import stays available in Export until you reload the page.'));
				values.push(['Undo import', function() {
					undoImport();
					return true;
				}]);
			}
			kernel.showDialog(values, 'export', bad.length ? 'Import check failed' : 'Import done');
		});
	}

	var inFileMeta = null;

	function importFile(reader) {
		if (this.files.length) {
			var f = this.files[0];
			inFileMeta = { name: f.name, modified: f.lastModified };
			reader.readAsText(f, "UTF-8");
			this.value = ''; // choosing the same file again still fires 'change'
		}
	}

	function isValidId(id) {
		return id && /^[A-Za-z0-9]+$/.exec(id);
	}

	function getDataId(key1, key2) {
		try {
			return JSON.parse(localStorage[key1])[key2] || '';
		} catch (err) {
			return '';
		}
	}

	function getId(e) {
		var id = null;
		if (e.target === outServWCA[0] || e.target === inServWCA[0]) {
			id = getDataId('wcaData', 'cstimer_token');
		} else {
			id = $.prompt(EXPORT_USERID, getDataId('locData', 'id'));
			if (id == null) {
				return;
			}
			localStorage['locData'] = JSON.stringify({ id: id, compid: getDataId('locData', 'compid') });
			kernel.pushSignal('export', ['account', 'locData']);
		}
		if (!isValidId(id)) {
			$.alert(EXPORT_INVID);
			return;
		}
		return id;
	}

	function getLocalDataSliced(id) {
		return storage.exportAll().then(function(exportObj) {
			var slices = {};
			var baseObj = {};
			baseObj['properties'] = mathlib.str2obj(localStorage['properties']);
			for (var key in exportObj) {
				baseObj[key] = [];
				var times = exportObj[key];
				for (var i = 0; i < times.length; i+= 1000) {
					var timesSlice = LZString.compressToEncodedURIComponent(JSON.stringify(times.slice(i, i + 1000)));
					var sliceHash = $.sha256(timesSlice);
					slices['slice' + sliceHash] = timesSlice;
					baseObj[key].push(sliceHash);
				}
			}
			if (id != undefined) {
				slices[id] = LZString.compressToEncodedURIComponent(JSON.stringify(baseObj));
			}
			return slices;
		}).catch(console.log);
	}

	function uploadData(id) {
		return getLocalDataSliced(id).then(function(slices) {
			var ids = [];
			for (var key in slices) {
				if (key == id) {
					continue;
				}
				ids.push(key);
			}
			var prepass;
			if (ids.length == 0) {
				prepass = Promise.resolve({'retcode': 0, 'datas': []});
			} else {
				prepass = $.ppost('https://cstimer.net/userdata2.php', {
					'id': id,
					'exists': ids.join(',')
				}, 'json');
			}
			return prepass.then(function(val) {
				if (val['retcode'] != 0) {
					return Promise.reject();
				}
				var exists = val['datas'];
				var ids = [];
				var datas = [];
				for (var key in slices) {
					if (exists.indexOf(key) != -1 && key != id) {
						continue;
					}
					ids.push(key);
					datas.push(slices[key]);
				}
				return $.ppost('https://cstimer.net/userdata2.php', {
					'id': id,
					'ids': ids.join(','),
					'datas': datas.join(',')
				}, 'json');
			}).then(function(val) {
				return val['retcode'] == 0 ? Promise.resolve() : Promise.reject();
			});
		});
	}

	function uploadDataClk(e) {
		var id = getId(e);
		if (!id) {
			return;
		}
		var target = $(e.target);
		var rawText = target.html();
		target.html('...');
		uploadData(id).then(function() {
			$.alert(EXPORT_UPLOADED);
		}, function() {
			$.alert(EXPORT_ERROR);
		}).then(function() {
			target.html(rawText);
		});
	}

	// files = [{nsolv: xx, size: xx, modifiedTime: xx}]
	function promptWhichFile(files) {
		var msg = EXPORT_WHICH.replace('%d', files.length);
		var msgfmt = EXPORT_WHICH_ITEM;
		var msgf = [msg];
		for (var ff = 0; ff < files.length; ff++) {
			var nsolv = Math.max(0, ~~files[ff].nsolv);
			var size = ~~files[ff].size;
			msgf.push((ff + 1) + '. ' + msgfmt.replace('%s', nsolv || (size ? Math.ceil(size / 1024) + ' KB' : 'N/A'))
				.replace('%t', new Date(files[ff].modifiedTime).toLocaleString()));
		}
		return ~~$.prompt(msgf.join('\n'), '1');
	}

	function downloadData(e) {
		var id = getId(e);
		if (!id) {
			return;
		}
		var target = $(e.target);
		var rawText = target.html();
		target.html('Check File List...');

		var cntCallback = function(val) {
			var cnt = ~~val['data'];
			if (cnt == 0) {
				return Promise.reject('No Data Found');
			}
			var idx = 1;
			if (kernel.getProp('expp')) {
				idx = promptWhichFile(val['files'] || mathlib.valuedArray(cnt, {}));
				if (idx <= 0 || idx > cnt) {
					return Promise.reject('Invalid input');
				}
			}
			target.html('Import Data...');
			return $.ppost('https://cstimer.net/userdata2.php', {
				'id': id,
				'offset': idx - 1
			}, 'json').then(dataCallback);
		};

		var dataCallback = function(val) {
			var retcode = val['retcode'];
			if (retcode == 404) {
				return Promise.reject(EXPORT_NODATA);
			} else if (retcode != 0) {
				return Promise.reject('');
			}

			var metaObj = {};
			var baseObj = {};
			var jobs = Promise.resolve(baseObj);
			try {
				metaObj = JSON.parse(LZString.decompressFromEncodedURIComponent(val['data']));
			} catch (err) {
				DEBUG && console.log('[export] error', err);
				return Promise.reject('');
			}
			var keys = [];
			var arrs = [];
			for (var key in metaObj) {
				if (!key.startsWith('session') || metaObj[key].length == 0 || $.isArray(metaObj[key][0])) {
					baseObj[key] = metaObj[key];
					continue;
				}
				var times = [];
				baseObj[key] = times;
				for (var i = 0; i < metaObj[key].length; i++) {
					keys.push('slice' + metaObj[key][i]);
					arrs.push(times);
				}
			}
			if (keys.length > 0) {
				var localSlices = {};
				jobs = jobs.then(function() {
					return getLocalDataSliced();
				}).then(function(slices) {
					localSlices = slices;
					var reqKeys = keys.filter(function(elem) { return !(elem in localSlices); });
					if (reqKeys.length == 0) {
						return {'retcode':0,'datas':{}};
					}
					return $.ppost('https://cstimer.net/userdata2.php', {
						'id': id,
						'ids': reqKeys.join(',')
					}, 'json');
				}).then(function(val) {
					if (val['retcode'] != 0) {
						return Promise.reject('retcode=' + val['retcode']);
					}
					var datas = [];
					for (var key in val['datas']) {
						datas[keys.indexOf(key)] = val['datas'][key];
					};
					for (var i = 0; i < keys.length; i++) {
						datas[i] = datas[i] || localSlices[keys[i]];
						if (datas[i] == undefined) {
							return Promise.reject('error, incorrect data');
						}
						Array.prototype.push.apply(arrs[i], JSON.parse(LZString.decompressFromEncodedURIComponent(datas[i])));
					}
					return baseObj;
				});
			}
			return jobs.then(function(data) {
				previewImport(data, { name: 'csTimer server' });
			});
		};

		var jobs = Promise.resolve({'data':1});
		if (kernel.getProp('expp')) {
			jobs = $.ppost('https://cstimer.net/userdata2.php', {
				'id': id,
				'cnt': 1
			}, 'json');
		}
		return jobs.then(cntCallback).catch(function(msg) {
			$.alert(EXPORT_ERROR + (msg ? ': ' + msg : ''));
		}).then(function() {
			target.html(rawText);
		});
	}

	function downloadDataGGL() {
		var gglToken = getDataId('gglData', 'access_token');
		if (!gglToken) {
			return;
		}
		inServGGL.html('Check File List...');
		$.ajax('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&orderBy=modifiedTime desc&q=name%3D%27cstimer.txt%27&fields=files%28id%2Csize%2CmodifiedTime%29', {
			'type': 'GET',
			'beforeSend': function(xhr) {
				xhr.setRequestHeader("Authorization", "Bearer " + gglToken);
			}
		}).success(function(data, status, xhr) {
			var files = data['files'];
			if (files.length == 0) {
				$.alert('No Data Found');
				return updateUserInfoFromGGL();
			}
			var idx = 1;
			if (kernel.getProp('expp')) {
				idx = promptWhichFile(files);
				if (idx <= 0 || idx > files.length) {
					return updateUserInfoFromGGL();
				}
			}
			inServGGL.html('Import Data...');
			var fileId = files[idx - 1]['id'];
			$.ajax('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
				'type': 'GET',
				'beforeSend': function(xhr) {
					xhr.setRequestHeader("Authorization", "Bearer " + gglToken);
				}
			}).success(function(data) {
				try {
					data = JSON.parse(LZString.decompressFromEncodedURIComponent(data));
				} catch (e) {
					$.alert('No Valid Data Found');
					return updateUserInfoFromGGL();
				}
				updateUserInfoFromGGL();
				previewImport(data, { name: 'Google Drive' });
			}).error(function() {
				$.alert(EXPORT_ERROR + '\nPlease Re-login');
				logoutFromGGL();
			});

			// removeRedundantGoogleFiles
			for (var i = 10; i < files.length; i++) {
				$.ajax('https://www.googleapis.com/drive/v3/files/' + files[i]['id'], {
					'type': 'DELETE',
					'beforeSend': function(xhr) {
						xhr.setRequestHeader("Authorization", "Bearer " + gglToken);
					}
				});
			}
		}).error(function() {
			$.alert(EXPORT_ERROR + '\nPlease Re-login');
			logoutFromGGL();
		});
	}

	function uploadDataGGL(gglToken) {
		gglToken = gglToken || getDataId('gglData', 'access_token');
		if (!gglToken) {
			return Promise.reject('Invalid Account');
		}
		outServGGL.html('Create File...');
		return new Promise(function(resolve, reject) {
			$.ajax('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
				'type': 'POST',
				'contentType': 'application/json',
				'data': JSON.stringify({
					'parents': ['appDataFolder'],
					'name': 'cstimer.txt'
				}),
				'beforeSend': function(xhr) {
					xhr.setRequestHeader("Authorization", "Bearer " + gglToken);
				}
			}).success(function(data, status, xhr) {
				var uploadUrl = xhr.getResponseHeader('location');
				outServGGL.html('Uploading Data...');
				$.ajax(uploadUrl, {
					'type': 'PUT',
					'contentType': 'text/plain',
					'data': LZString.compressToEncodedURIComponent(expString)
				}).success(function(data, status, xhr) {
					updateUserInfoFromGGL();
					resolve();
				}).error(function(data, status, xhr) {
					logoutFromGGL();
					reject(EXPORT_ERROR);
				});
			}).error(function(data, status, xhr) {
				logoutFromGGL();
				if (data.status == 401) {
					reject('Timeout, Please Re-login');
				} else {
					reject(EXPORT_ERROR);
				}
			});
		});
	}

	function showExportDiv() {
		updateExpString().then(function() {
			if (window.Blob) {
				var blob = new Blob([expString], {
					'type': 'text/plain'
				});
				outFile.attr('href', URL.createObjectURL(blob));
				outFile.attr('download', 'jltimer_' + mathlib.time2str(new Date() / 1000, '%Y%M%D_%h%m%s') + '.txt');
			}
			kernel.showDialog([exportDiv, 0, undefined, 0, [EXPORT_ONLYOPT, exportProperties], [EXPORT_ACCOUNT, exportAccounts]], 'export', EXPORT_DATAEXPORT);
		});
		solvesAfterExport = 0;
	}

	function exportByPrompt(expOpt) {
		var compOpt = LZString.compressToEncodedURIComponent(JSON.stringify(expOpt));
		var ret = $.prompt(EXPORT_CODEPROMPT, compOpt);
		if (!ret || ret == compOpt) {
			return;
		}
		try {
			ret = JSON.parse(LZString.decompressFromEncodedURIComponent(ret));
		} catch (e) {
			return;
		}
		return ret;
	}

	function exportProperties() {
		var data = JSON.parse(localStorage['properties']);
		var expOpt = {};
		for (var key in data) {
			if (!key.startsWith('session')) {
				expOpt[key] = data[key];
			}
		}
		var newOpt = exportByPrompt(expOpt);
		if (!newOpt) {
			return false;
		}
		data = JSON.parse(localStorage['properties']);
		for (var key in data) {
			if (key.startsWith('session')) {
				newOpt[key] = data[key];
			}
		}
		localStorage['properties'] = mathlib.obj2str(newOpt);
		location.reload();
		return false;
	}

	function exportAccounts() {
		var expOpt = {
			'wcaData': localStorage['wcaData'],
			'gglData': localStorage['gglData'],
			'locData': localStorage['locData']
		};
		var newOpt = exportByPrompt(expOpt);
		if (!newOpt) {
			return false;
		}
		for (var key in expOpt) {
			if (newOpt[key]) {
				localStorage[key] = newOpt[key];
				kernel.pushSignal('export', ['account', key]);
			}
		}
		location.reload();
		return false;
	}

	function updateUserInfoFromWCA() {
		var wcaData = JSON.parse(localStorage['wcaData'] || '{}');
		wcaDataTr.unbind('click');
		inServWCA.unbind('click').removeClass('click');
		outServWCA.unbind('click').removeClass('click');
		if (!wcaData['access_token']) {
			wcaDataTd.html(EXPORT_LOGINWCA);
			wcaDataTr.click(function() {
				location.href = wcaLoginUrl;
			}).addClass('click');
		} else {
			var me = wcaData['wca_me'];
			wcaDataTd.html('WCAID: ' + me['wca_id'] + '<br>' + 'Name: ' + me['name']);
			wcaDataTr.click(logoutFromWCA.bind(undefined, true)).addClass('click');
			inServWCA.addClass('click').click(downloadData);
			outServWCA.addClass('click').click(uploadDataClk);
		}
	}

	function updateUserInfoFromGGL() {
		var gglData = JSON.parse(localStorage['gglData'] || '{}');
		gglDataTr.unbind('click');
		inServGGL.unbind('click').removeClass('click').html(EXPORT_FROMSERV + ' (Google)');
		outServGGL.unbind('click').removeClass('click').html(EXPORT_TOSERV + ' (Google)');
		if (!gglData['access_token']) {
			gglDataTd.html(EXPORT_LOGINGGL);
			gglDataTr.click(function() {
				location.href = gglLoginUrl;
			}).addClass('click');
		} else {
			var me = gglData['ggl_me'];
			gglDataTd.html('Name: ' + me['displayName'] + '<br>' + 'Email: ' + me['emailAddress']);
			gglDataTr.click(logoutFromGGL.bind(undefined, true)).addClass('click');
			inServGGL.addClass('click').click(downloadDataGGL);
			outServGGL.addClass('click').click(function() {
				uploadDataGGL().then(function() {
					$.alert(EXPORT_UPLOADED);
				}, function(errmsg) {
					$.alert(errmsg);
				});
			});
		}
	}

	function logoutFromWCA(cfm) {
		if (cfm && !$.confirm(EXPORT_LOGOUTCFM)) {
			return;
		}
		delete localStorage['wcaData'];
		kernel.pushSignal('export', ['account', 'wcaData']);
	}

	function logoutFromGGL(cfm) {
		if (cfm && !$.confirm(EXPORT_LOGOUTCFM)) {
			return;
		}
		delete localStorage['gglData'];
		kernel.pushSignal('export', ['account', 'gglData']);
	}

	function procSignal(signal, value) {
		if (value[0] == 'atexpa') {
			if (value[1] == 'id') {
				var id = getDataId('locData', 'id');
				if (!isValidId(id) || value[2] == 'modify') {
					id = $.prompt(EXPORT_USERID, id);
					if (!isValidId(id)) {
						if (id != null) {
							$.alert(EXPORT_INVID);
						}
						kernel.setProp('atexpa', 'a');
						return;
					}
					localStorage['locData'] = JSON.stringify({ id: id, compid: getDataId('locData', 'compid') });
					kernel.pushSignal('export', ['account', 'locData']);
				}
			} else if (value[1] == 'wca') {
				if (!isValidId(getDataId('wcaData', 'cstimer_token'))) {
					$.alert('Please Login with WCA Account in Export Panel First');
					kernel.setProp('atexpa', 'a');
					return;
				}
			} else if (value[1] == 'ggl') {
				if (!getDataId('gglData', 'access_token')) {
					$.alert('Please Login with Google Account in Export Panel First');
					kernel.setProp('atexpa', 'a');
					return;
				}

			}
		} else if (signal == 'export') {
			if (value[1] == 'wcaData') {
				updateUserInfoFromWCA();
			} else if (value[1] == 'gglData') {
				updateUserInfoFromGGL();
			}
		}
	}

	var exportTid;

	function startBackExport() {
		if (exportTid) {
			clearTimeout(exportTid);
		}
		exportTid = setTimeout(doBackExport, 1000);
	}

	function doBackExport() {
		var atexpa = kernel.getProp('atexpa', 'a');
		if (atexpa == 'n' || atexpa == 'a') {
			return;
		}
		updateExpString().then(function() {
			if (atexpa == 'id' || atexpa == 'wca') {
				var id = atexpa == 'id' ? getDataId('locData', 'id') : getDataId('wcaData', 'cstimer_token');
				if (!isValidId(id)) {
					logohint.push(LGHINT_AEXPABT);
					kernel.setProp('atexpa', 'a');
					return;
				}
				uploadData(id).then(function() {
					logohint.push(LGHINT_AEXPSUC);
				}, function() {
					logohint.push(LGHINT_AEXPFAL);
				});
			} else if (atexpa == 'f') {
				if (window.Blob) {
					downloadText(expString, 'jltimer_' + mathlib.time2str(new Date() / 1000, '%Y%M%D_%h%m%s') + '.txt');
				}
			} else if (atexpa == 'ggl') {
				var gglToken = getDataId('gglData', 'access_token');
				if (!gglToken) {
					logohint.push(LGHINT_AEXPABT);
					kernel.setProp('atexpa', 'a');
					return;
				}
				uploadDataGGL(gglToken).then(function() {
					logohint.push(LGHINT_AEXPSUC);
				}, function() {
					logohint.push(LGHINT_AEXPFAL);
				});
			}
		});
		exportTid = 0;
		solvesAfterExport = 0;
	}

	var solvesAfterExport = 0;

	function newTimePushed() {
		solvesAfterExport += 1;
		if (solvesAfterExport >= kernel.getProp('atexpi', 100)) {
			var atexpa = kernel.getProp('atexpa', 'a');
			if (atexpa == 'n') {
				return;
			} else if (atexpa == 'a') {
				if (solvesAfterExport % 100 == 0) {
					logohint.push(EXPORT_AEXPALERT.replace('%d', solvesAfterExport));
				}
				return;
			}
			startBackExport();
		}
	}

	$(function() {
		kernel.regListener('export', 'time', newTimePushed);
		kernel.regListener('export', 'property', procSignal, /^atexpa$/);
		kernel.regListener('export', 'export', procSignal, /^account$/);
		kernel.regProp('kernel', 'atexpa', 1, PROPERTY_AUTOEXP, ['a', ['n', 'f', 'id', 'wca', 'ggl', 'a'], PROPERTY_AUTOEXP_OPT.split('|')]);
		kernel.regProp('kernel', 'atexpi', ~1, 'Auto Export Interval (Solves)', [100, [50, 100, 200, 500], ['50', '100', '200', '500']]);
		kernel.regProp('kernel', 'expp', 0, PROPERTY_IMPPREV, [false]);

		kernel.addButton('export', BUTTON_EXPORT, showExportDiv, 2);
		exportDiv.append('<br>',
			$('<div class="expOauth">').append(
				$('<table id="wcaLogin">').append(wcaDataTr),
				$('<table class="expUpDown">').append($('<tr>').append(
					$('<td>').append(inServWCA),
					$('<td>').append(outServWCA)))),
			$('<div class="expOauth">').append(
				$('<table id="gglLogin">').append(gglDataTr),
				$('<table class="expUpDown">').append($('<tr>').append(
					$('<td>').append(inServGGL),
					$('<td>').append(outServGGL)))),
			exportTable, undoDiv);
		checkImport();
		if (window.FileReader && window.Blob) {
			var reader = new FileReader();
			reader.onload = importData;
			var readerOther = new FileReader();
			readerOther.onload = function() {
				var n_import = stats.importSessions(TimerDataConverter(this.result));
				if (n_import == 0) {
					logohint.push(LGHINT_IMPORT0);
				}
			};
			inFile.change(importFile.bind(inFile[0], reader));
			inOtherFile.change(importFile.bind(inOtherFile[0], readerOther));
		}

		if ($.urlParam('code')) { //WCA oauth
			wcaDataTd.html(EXPORT_LOGINAUTHED);
			$.post('oauthwca.php', {
				'code': $.urlParam('code')
			}, function(val) {
				if ('access_token' in val) {
					localStorage['wcaData'] = JSON.stringify(val);
					kernel.pushSignal('export', ['account', 'wcaData']);
				} else {
					$.alert(EXPORT_ERROR);
					logoutFromWCA();
				}
			}, 'json').error(function() {
				$.alert(EXPORT_ERROR);
				logoutFromWCA();
			}).always(function() {
				updateUserInfoFromWCA();
				$.clearUrl('code');
			});
			showExportDiv();
		} else {
			updateUserInfoFromWCA();
		}

		if ($.hashParam('access_token')) { //Google oauth
			var access_token = $.hashParam('access_token');
			gglDataTd.html(EXPORT_LOGINAUTHED);
			$.get('https://www.googleapis.com/drive/v3/about', {
				'fields': 'user',
				'access_token': access_token
			}, function(val) {
				if ('user' in val) {
					localStorage['gglData'] = JSON.stringify({
						'access_token': access_token,
						'ggl_me': val['user']
					});
					kernel.pushSignal('export', ['account', 'gglData']);
				} else {
					$.alert(EXPORT_ERROR);
					logoutFromGGL();
				}
			}, 'json').error(function(data, status, xhr) {
				if (data.status == 401) {
					$.alert('Timeout, Please Re-login');
				} else {
					$.alert(EXPORT_ERROR);
				}
				logoutFromGGL();
			}).always(function() {
				updateUserInfoFromGGL();
				$.clearHash();
			});
			showExportDiv();
		} else {
			updateUserInfoFromGGL();
		}
	});

	return {
		getExportString: function() {
			return updateExpString().then(function() {
				return expString;
			});
		},
		loadData: loadData,
		addSection: function(elem) {
			exportDiv.append(elem);
		},
		exportProperties: exportProperties,
		isValidId: isValidId,
		getDataId: getDataId,
		logoutFromWCA: logoutFromWCA,
		wcaLoginUrl: wcaLoginUrl
	};
});
