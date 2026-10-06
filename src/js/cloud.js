"use strict";

// jlTimer cloud backup: talks to the personal backup API in backend/.
// Login is a gesture on the virtual cube: start a solve, turn your secret algorithm, press Esc.
// The same gesture signs out. The moves never leave the browser; only PBKDF2(moves) is sent,
// and only for cancels that match the public fingerprint (move count + 12-bit tag).
var cloud = execMain(function() {
	var enc = new TextEncoder();

	// ---------- local state (localStorage.devData: not exported, kept across imports) ----------
	function readDev() {
		try {
			return JSON.parse(localStorage['devData'] || '{}') || {};
		} catch (e) {
			return {};
		}
	}

	function getState() {
		return readDev()['jlcloud'] || {};
	}

	function setState(update) {
		var dev = readDev();
		dev['jlcloud'] = $.extend(dev['jlcloud'] || {}, update);
		localStorage['devData'] = JSON.stringify(dev);
		render();
	}

	function apiUrl() {
		return (kernel.getProp('cloudUrl') || '').replace(/\/+$/, '');
	}

	function api(method, path, body, raw) {
		var st = getState();
		var headers = {};
		if (st['token']) {
			headers['Authorization'] = 'Bearer ' + st['token'];
		}
		var opts = { method: method, headers: headers };
		if (raw) {
			headers['Content-Type'] = 'application/octet-stream';
			opts.body = raw;
		} else if (body !== undefined) {
			headers['Content-Type'] = 'application/json';
			opts.body = JSON.stringify(body);
		}
		return fetch(apiUrl() + path, opts).then(function(res) {
			var ct = res.headers.get('Content-Type') || '';
			var read = ct.indexOf('json') != -1 ? res.json() : res.arrayBuffer();
			return read.then(function(data) {
				if (res.status == 401 && st['token'] && data && data['error'] == 'not signed in') {
					setState({ token: null }); // this device was signed out elsewhere
				}
				return { status: res.status, data: data };
			});
		});
	}

	// ---------- crypto ----------
	function toHex(buf) {
		return Array.prototype.map.call(new Uint8Array(buf), function(b) {
			return ('0' + b.toString(16)).slice(-2);
		}).join('');
	}

	function randomSalt() {
		var b = crypto.getRandomValues(new Uint8Array(18));
		return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	function deriveKey(norm, salt, iterations) {
		return crypto.subtle.importKey('raw', enc.encode(norm), 'PBKDF2', false, ['deriveBits']).then(function(base) {
			return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iterations || 600000 }, base, 256);
		}).then(toHex);
	}

	function fpTag(norm, salt) {
		return crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + norm)).then(function(h) {
			return parseInt(toHex(h).slice(0, 3), 16);
		});
	}

	// ---------- moves ----------
	// the login is the exact sequence of turns as pressed: ["R", "R", "U'"] -> "R R U'"
	function normalize(moves) {
		return moves.map(function(m) { return $.trim(m); }).filter(Boolean).join(' ');
	}

	// first version merged consecutive turns of one layer (R R = R2, R R' = nothing); only used to
	// recognise a login created that way when changing it
	function legacyNormalize(moves) {
		var out = [];
		for (var i = 0; i < moves.length; i++) {
			var m = /^(.*?)(2'|2|'|)$/.exec($.trim(moves[i]));
			if (!m || !m[1]) {
				continue;
			}
			var amount = { '': 1, "'": 3, '2': 2, "2'": 2 }[m[2]];
			var last = out[out.length - 1];
			if (last && last[0] == m[1]) {
				last[1] = (last[1] + amount) % 4;
				if (!last[1]) {
					out.pop();
				}
			} else {
				out.push([m[1], amount]);
			}
		}
		return out.map(function(t) {
			return t[0] + ['', '', '2', "'"][t[1]];
		}).join(' ');
	}

	function tokens(norm) {
		return norm ? norm.split(' ') : [];
	}

	// returns an error message, or null if the sequence is acceptable as a login
	function checkQuality(norm) {
		var t = tokens(norm);
		if (t.length == 0) {
			return 'No moves were made.';
		}
		for (var p = 1; p <= t.length / 2; p++) { // repeated block, e.g. (R U R' U') x4
			var periodic = true;
			for (var i = p; i < t.length && periodic; i++) {
				periodic = t[i] == t[i - p];
			}
			if (periodic) {
				return 'The sequence repeats the same block; use something less regular.';
			}
		}
		return null;
	}

	// ---------- gesture: hooks from the virtual cube ----------
	var pending = null; // {mode: 'setup'|'change'|'recover', step, captures: [], setupToken, code}
	var busy = false;

	// the moves as typed, plus the merged form used by logins saved before raw moves (so they still work)
	function candidates(moves) {
		var raw = normalize(moves);
		var legacy = legacyNormalize(moves);
		return legacy == raw ? [raw] : [raw, legacy];
	}

	function mightBeGesture(moves) {
		if (pending) {
			return true;
		}
		var fp = getState()['fp'];
		return !!(fp && apiUrl() && candidates(moves).some(function(c) { return tokens(c).length == fp['len']; }));
	}

	// called when a virtual solve is cancelled with Esc; resolves true if the attempt was used as a gesture
	function onCancelledSolve(moves) {
		if (pending) {
			return Promise.resolve(capture(normalize(moves), moves));
		}
		var st = getState();
		var fp = st['fp'];
		var cands = fp ? candidates(moves).filter(function(c) { return tokens(c).length == fp['len']; }) : [];
		if (busy || !fp || !apiUrl() || !cands.length) {
			return Promise.resolve(false);
		}
		return Promise.all(cands.map(function(c) { return fpTag(c, fp['salt']); })).then(function(tags) {
			var norm = cands[tags.indexOf(fp['tag'])];
			if (norm === undefined) {
				return false;
			}
			busy = true;
			logohint.push(st['token'] ? 'Signing out...' : 'Signing in...');
			return deriveKey(norm, st['salt'], st['iterations']).then(function(key) {
				return st['token'] ? api('POST', '/logout', { key: key }) : api('POST', '/login', { key: key, device: deviceName() });
			}).then(function(res) {
				busy = false;
				if (res.status == 200 && st['token']) {
					setState({ token: null });
					logohint.push('Signed out of jlTimer cloud');
					return true;
				} else if (res.status == 200) {
					setState({ token: res.data['token'] });
					logohint.push('Signed in to jlTimer cloud');
					setTimeout(syncFromCloud, 300);
					return true;
				} else if (res.status == 429) {
					logohint.push('Too many attempts, try again later');
					return true;
				}
				return false; // fingerprint collision: treat as an ordinary cancel
			}, function() {
				busy = false;
				logohint.push('jlTimer cloud unreachable');
				return false;
			});
		});
	}

	function deviceName() {
		var ua = navigator.userAgent;
		var os = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'device';
		var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
		return br + ' on ' + os;
	}

	// ---------- capturing a new algorithm (setup, change, recovery) ----------
	var STEP_TEXT = {
		current: 'Do your CURRENT algorithm: start a virtual solve, turn it, press Esc',
		first: 'Do your NEW algorithm: start a virtual solve, turn it, press Esc',
		confirm: 'Do the new algorithm once more to confirm, then press Esc'
	};

	function startCapture(mode, extra) {
		if (kernel.getProp('input') != 'v') {
			kernel.setProp('input', 'v');
		}
		pending = $.extend({ mode: mode, captures: [], raws: [] }, extra);
		pending.steps = mode == 'change' ? ['current', 'first', 'confirm'] : ['first', 'confirm'];
		kernel.hideDialog();
		promptStep();
	}

	function promptStep() {
		var step = pending.steps[pending.captures.length];
		$.alert(STEP_TEXT[step] + '.\n\nTo abandon, use "Cancel setup" in the Export dialog.');
		render();
	}

	function capture(norm, raw) {
		var step = pending.steps[pending.captures.length];
		if (!norm) {
			pending = null;
			logohint.push('Algorithm setup cancelled');
			render();
			return true;
		}
		if (step == 'first') {
			var err = checkQuality(norm);
			if (err) {
				$.alert(err + '\n\nTry again: ' + STEP_TEXT.first + '.');
				return true;
			}
		}
		if (step == 'confirm' && norm != pending.captures[pending.captures.length - 1]) {
			pending.captures.pop();
			pending.raws.pop();
			$.alert('That did not match. ' + STEP_TEXT.first + '.');
			return true;
		}
		pending.captures.push(norm);
		pending.raws.push(raw);
		if (pending.captures.length < pending.steps.length) {
			promptStep();
			return true;
		}
		var job = pending;
		pending = null;
		finishCapture(job);
		return true;
	}

	function newCredential(norm) {
		var salt = randomSalt();
		var fpSalt = randomSalt();
		return Promise.all([deriveKey(norm, salt), fpTag(norm, fpSalt)]).then(function(r) {
			return { salt: salt, iterations: 600000, key: r[0], fp: { salt: fpSalt, len: tokens(norm).length, tag: r[1] } };
		});
	}

	function finishCapture(job) {
		var norm = job.captures[job.captures.length - 1];
		var st = getState();
		logohint.push('Saving your algorithm...');
		var cur = job.mode == 'change' ? deriveKey(job.captures[0], st['salt'], st['iterations']) : Promise.resolve(null);
		Promise.all([newCredential(norm), cur]).then(function(r) {
			var cred = r[0];
			var body = $.extend({ device: deviceName() }, cred);
			if (job.mode == 'setup') {
				body.setupToken = job.setupToken;
				return api('POST', '/setup', body).then(done.bind(null, cred));
			} else if (job.mode == 'recover') {
				body.code = job.code;
				return api('POST', '/recover', body).then(done.bind(null, cred));
			}
			body.currentKey = r[1];
			return api('POST', '/credential', body).then(function(res) {
				var legacy = legacyNormalize(job.raws[0]);
				if (res.status != 401 || legacy == job.captures[0]) {
					return res;
				}
				return deriveKey(legacy, st['salt'], st['iterations']).then(function(key) { // login made before raw moves
					body.currentKey = key;
					return api('POST', '/credential', body);
				});
			}).then(done.bind(null, cred));
		}).catch(function() {
			$.alert('jlTimer cloud unreachable. Nothing was changed.');
		});

		function done(cred, res) {
			if (res.status != 200) {
				$.alert('The server refused this (' + (res.data && res.data['error'] || res.status) + '). Nothing was changed.');
				return;
			}
			setupNeeded = false;
			var update = { salt: cred.salt, iterations: cred.iterations, fp: cred.fp };
			if (res.data['token']) {
				update.token = res.data['token'];
			}
			setState(update);
			var n = cred.fp.len;
			if (res.data['recoveryCodes']) {
				showRecoveryCodes(res.data['recoveryCodes'], n);
			}
			logohint.push('Saved a ' + n + '-move algorithm, you are signed in');
		}
	}

	function showRecoveryCodes(codes, moves) {
		var div = $('<div style="text-align:center;line-height:1.8">').append(
			$('<p>').text('Saved your algorithm: ' + moves + ' move' + (moves == 1 ? '' : 's') + ', every key counted as pressed (rotations included).'),
			'<p><b>Recovery codes</b>: each works once if you forget your algorithm. Write them down and keep them offline. They will not be shown again.</p>',
			$('<textarea readonly style="width:80%;height:9em;font-family:monospace;font-size:1.1em">').val(codes.join('\n')));
		kernel.showDialog([div, $.noop], 'export', 'jlTimer cloud');
	}

	// ---------- backups ----------
	function countSolves() {
		try {
			var sd = JSON.parse(kernel.getProp('sessionData') || '{}');
			var n = 0;
			for (var k in sd) {
				n += ~~((sd[k]['stat'] || [])[0]);
			}
			return n;
		} catch (e) {
			return 0;
		}
	}

	function gzip(text) {
		var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
		return new Response(stream).arrayBuffer();
	}

	function gunzip(buf) {
		var stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
		return new Response(stream).text();
	}

	function backup(kind) {
		if (!getState()['token'] || !apiUrl()) {
			return Promise.reject('not signed in');
		}
		return exportFunc.getExportString().then(gzip).then(function(buf) {
			return api('POST', '/snapshots?kind=' + kind + '&solves=' + countSolves(), undefined, buf);
		}).then(function(res) {
			if (res.status == 200) {
				solvesSinceBackup = 0;
				setState({ lastBackup: Date.now(), lastSyncId: res.data['id'] });
				return res;
			}
			return Promise.reject(res.data && res.data['error'] || res.status);
		});
	}

	function backupNow() {
		backup('manual').then(function() {
			logohint.push('Backed up to jlTimer cloud');
		}, function(err) {
			$.alert('Backup failed: ' + err);
		});
	}

	var solvesSinceBackup = 0;

	function onTime() {
		solvesSinceBackup++;
		if (solvesSinceBackup >= ~~kernel.getProp('cloudEvery') && getState()['token'] && apiUrl()) {
			backup('auto').then(function() {
				logohint.push('Backed up to jlTimer cloud');
			}, function() {}); // retried after the next solve
		}
	}

	function fmtDate(ts) {
		return mathlib.time2str(ts / 1000, '%Y-%M-%D %h:%m');
	}

	function restore() {
		api('GET', '/snapshots').then(function(res) {
			if (res.status != 200) {
				return $.alert('Could not list backups: ' + (res.data && res.data['error'] || res.status));
			}
			var snaps = res.data['snapshots'];
			if (!snaps.length) {
				return $.alert('No backups yet.');
			}
			var lines = snaps.slice(0, 40).map(function(s, i) {
				return (i + 1) + ') ' + fmtDate(s.created_at) + ' · ' + s.solves + ' solves · ' + s.kind;
			});
			var pick = prompt('Restore which backup? Type its number.\nYour current data is backed up first.\n\n' + lines.join('\n'), '1');
			var snap = snaps[~~pick - 1];
			if (!snap) {
				return;
			}
			loadSnapshot(snap, snaps[0].id, true, false);
		}, function() {
			$.alert('jlTimer cloud unreachable');
		});
	}

	// download a snapshot and import it (the page reloads). backupFirst saves this device's data first.
	function loadSnapshot(snap, maxId, backupFirst, silent) {
		var first = backupFirst && countSolves() > 0 ? backup('before-restore') : Promise.resolve(null);
		if (backupFirst && countSolves() > 0) {
			logohint.push('Backing up this device first...');
		}
		first.then(function(res) {
			var seen = Math.max(maxId, res && res.data && res.data['id'] || 0);
			return api('GET', '/snapshots/' + snap.id).then(function(res) {
				if (res.status != 200) {
					return Promise.reject(res.status);
				}
				return gunzip(res.data);
			}).then(function(text) {
				var data = JSON.parse(text);
				setState({ lastSyncId: seen }); // newest backup this device has seen, so it isn't offered again
				exportFunc.loadData(data, silent);
			});
		}).catch(function(err) {
			$.alert('Loading your cloud data failed, nothing was changed: ' + err);
		});
	}

	// after signing in, or on page load while signed in: bring in newer data from another device
	function syncFromCloud() {
		if (!getState()['token'] || !apiUrl() || pending) {
			return;
		}
		api('GET', '/snapshots').then(function(res) {
			if (res.status != 200 || !res.data['snapshots'].length) {
				return;
			}
			var snaps = res.data['snapshots'];
			var maxId = Math.max.apply(null, snaps.map(function(s) { return s.id; }));
			var latest = snaps.filter(function(s) { return s.kind != 'before-restore'; })[0];
			if (!latest || latest.id <= ~~getState()['lastSyncId']) {
				return;
			}
			var local = countSolves();
			if (local == 0) {
				logohint.push('Loading your times from jlTimer cloud...');
				loadSnapshot(latest, maxId, false, true);
			} else if ($.confirm('jlTimer cloud has newer data from another device (' + latest.solves + ' solves, ' + fmtDate(latest.created_at) +
					').\n\nLoad it? This device\'s ' + local + ' solves are backed up to the cloud first.')) {
				loadSnapshot(latest, maxId, true, true);
			} else {
				setState({ lastSyncId: maxId });
			}
		}, function() {});
	}

	function devices() {
		api('GET', '/devices').then(function(res) {
			if (res.status != 200) {
				return $.alert('Could not list devices: ' + (res.data && res.data['error'] || res.status));
			}
			var devs = res.data['devices'];
			var lines = devs.map(function(d, i) {
				return (i + 1) + ') ' + d.name + (d.current ? ' (this device)' : '') + ' · last used ' + fmtDate(d.last_seen);
			});
			var pick = prompt('Signed-in devices. Type a number to sign that device out.\n\n' + lines.join('\n'), '');
			var dev = devs[~~pick - 1];
			if (!dev) {
				return;
			}
			api('POST', '/devices/' + dev.id + '/revoke', {}).then(function() {
				if (dev.current) {
					setState({ token: null });
				}
				logohint.push('Signed out ' + dev.name);
			});
		});
	}

	function signOut() {
		api('POST', '/logout', {}).then(function() {
			setState({ token: null });
			logohint.push('Signed out of jlTimer cloud');
		}, function() {
			setState({ token: null });
		});
	}

	function setServer() {
		var url = prompt('jlTimer cloud API address (e.g. https://jltimer-api.<you>.workers.dev)', apiUrl());
		if (url === null) {
			return;
		}
		url = $.trim(url);
		if (url && !/^https:\/\/[^\s/]+|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
			return $.alert('Use an https:// address (http:// only for localhost).');
		}
		kernel.setProp('cloudUrl', url);
		setState({ fp: null, salt: null, token: null });
		refreshFingerprint();
	}

	// the public login parameters: salt, iterations and gesture fingerprint
	var setupNeeded = false;

	function refreshFingerprint() {
		if (!apiUrl()) {
			return render();
		}
		api('GET', '/login/salt').then(function(res) {
			if (res.status != 200) {
				return;
			}
			setupNeeded = !!res.data['setup'];
			if (!setupNeeded) {
				setState({ salt: res.data['salt'], iterations: res.data['iterations'], fp: res.data['fp'] });
			}
			render();
		}, function() {
			render();
		});
	}

	// ---------- export dialog section ----------
	var div = $('<div class="expOauth jlcloud">');

	function button(label, fn) {
		return $('<input type="button">').val(label).click(fn);
	}

	function render() {
		var st = getState();
		div.empty().append('<b>jlTimer cloud backup</b><br>');
		if (!apiUrl()) {
			div.append('Not configured. ', button('Set server...', setServer));
			return;
		}
		var status;
		if (pending) {
			div.append($('<div>').text(STEP_TEXT[pending.steps[pending.captures.length]] + '.'),
				button('Cancel setup', function() { pending = null; render(); }));
			return;
		} else if (st['token']) {
			status = 'Signed in on this device' + (st['fp'] ? ' · algorithm: ' + st['fp']['len'] + ' moves' : '') +
				(st['lastBackup'] ? ' · last backup ' + fmtDate(st['lastBackup']) : '');
		} else if (setupNeeded) {
			status = 'No login set up yet';
		} else {
			status = 'Signed out. To sign in: start a virtual solve, turn your algorithm, press Esc.';
		}
		div.append($('<div>').text(status));
		var row = $('<div>');
		if (st['token']) {
			row.append(button('Back up now', backupNow), button('Restore...', restore), button('Devices...', devices),
				button('Change algorithm...', function() { startCapture('change'); }), button('Sign out', signOut));
		} else if (setupNeeded) {
			row.append(button('Set up login...', function() {
				var token = prompt('Setup token (the SETUP_TOKEN secret of your API)');
				token = $.trim(token || '').replace(/^[`'"*\s]+|[`'"*\s]+$/g, ''); // tolerate copy-paste extras
				if (token) {
					startCapture('setup', { setupToken: token });
				}
			}));
		} else {
			row.append(button('Use recovery code...', function() {
				var code = prompt('Recovery code (XXXXX-XXXXX)');
				code = $.trim(code || '');
				if (code) {
					startCapture('recover', { code: code });
				}
			}));
		}
		row.append(button('Server...', setServer));
		div.append(row);
	}

	$(function() {
		kernel.regProp('kernel', 'cloudUrl', ~5, 'jlTimer cloud API', ['https://jltimer-api.jltimer-backend.workers.dev']);
		kernel.regProp('kernel', 'cloudEvery', 1, 'jlTimer cloud: back up every (solves)', [25, [10, 25, 50, 100], ['10', '25', '50', '100']]);
		kernel.regListener('cloud', 'time', onTime);
		exportFunc.addSection(div);
		refreshFingerprint();
		setTimeout(syncFromCloud, 2000);
	});

	return {
		mightBeGesture: mightBeGesture,
		onCancelledSolve: onCancelledSolve,
		normalize: normalize,
		checkQuality: checkQuality,
		backup: backup
	};
});
