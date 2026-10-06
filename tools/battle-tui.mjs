#!/usr/bin/env node
// jlTimer battle TUI: a minimal terminal client for csTimer's battle rooms.
// Usage: node tools/battle-tui.mjs [username] [roomId]
// Needs Node 22+ (built-in WebSocket) and the scrambler module: run `make module` once.
//
// Battle rooms are csTimer's service at cstimer.net. jlTimer does not operate it,
// and the server can change or refuse connections at any time.

import { createRequire } from 'node:module';
import readline from 'node:readline';

const SERVER = 'wss://cstimer.net/ws20230409';
const HEARTBEAT_MS = 15000;
const CALL_TIMEOUT_MS = 5000;

const require = createRequire(import.meta.url);
let scrambler;
try {
	scrambler = require('../npm_export/cstimer_module.js');
} catch (e) {
	console.error('Scrambler not built. Run `make module` in the jlTimer repo first.');
	process.exit(1);
}
const newScramble = () => scrambler.getScramble('333').trim();

// ---------- terminal helpers ----------
const tty = process.stdout.isTTY;
const c = (code, s) => tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = s => c('2', s), bold = s => c('1', s);
const STATUS_COLOR = { READY: '37', INSPECT: '36', SOLVING: '33', SOLVED: '32', LOSS: '31' };
const STATUS_NAME = { READY: 'ready', INSPECT: 'inspecting', SOLVING: 'solving', SOLVED: 'solved', LOSS: 'away' };
const pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
const lpad = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };

// time = [penalty, ms]: penalty -1 = DNF, 2000 = +2
function fmtTime(t) {
	if (!t) return 'N/A';
	if (t[0] === -1) return 'DNF';
	const total = t[1] + t[0];
	const cs = Math.floor(total / 10);
	const sec = Math.floor(cs / 100), m = Math.floor(sec / 60);
	const frac = String(cs % 100).padStart(2, '0');
	const body = m > 0 ? `${m}:${String(sec % 60).padStart(2, '0')}.${frac}` : `${sec}.${frac}`;
	return t[0] === 2000 ? body + '+' : body;
}

// "12.34", "1:02.50", "1234" (= 12.34), "12.34+" (+2), "DNF"
function parseTime(s) {
	s = s.trim();
	if (/^dnf$/i.test(s)) return [-1, 0];
	const plus2 = s.endsWith('+');
	if (plus2) s = s.slice(0, -1);
	let ms;
	if (/^\d+$/.test(s)) {
		const v = +s;
		ms = (Math.floor(v / 100) % 100) * 1000 + (v % 100) * 10 + Math.floor(v / 10000) * 60000;
	} else {
		const m = /^(?:(\d+):)?(\d+(?:\.\d{1,3})?)$/.exec(s);
		if (!m) return null;
		ms = Math.round(((+m[1] || 0) * 60 + +m[2]) * 1000);
	}
	return ms > 0 ? [plus2 ? 2000 : 0, ms] : null;
}

function displayName(accountId) {
	accountId = String(accountId).replace(/[\u0000-\u001f\u007f-\u009f]/g, ''); // no terminal control codes from other players
	if (accountId.includes('|')) return accountId.split('|')[1];
	return accountId.length > 10 ? accountId.slice(0, 4) + '...' + accountId.slice(-3) : accountId;
}

// ---------- connection ----------
let ws = null, connected = false, msgSeq = 1;
const pending = new Map();
let user = '', room = '', roomInfo = null, heartbeat = null, joined = false;
let notice = '', timerStart = 0, ticker = null, quitting = false;

function call(msg) {
	return new Promise((resolve, reject) => {
		if (!connected) return reject(new Error('not connected'));
		msg.msgid = msgSeq++;
		pending.set(msg.msgid, resolve);
		ws.send(JSON.stringify(msg));
		setTimeout(() => pending.delete(msg.msgid) && reject(new Error('timeout')), CALL_TIMEOUT_MS);
	});
}

function connect() {
	return new Promise((resolve, reject) => {
		ws = new WebSocket(SERVER);
		ws.onopen = () => { connected = true; resolve(); };
		ws.onerror = () => { if (!connected) reject(new Error('could not connect to ' + SERVER)); };
		ws.onclose = () => {
			connected = false; joined = false;
			clearInterval(heartbeat);
			if (quitting) return;
			setNotice('disconnected, reconnecting in 3s...');
			setTimeout(() => rejoin().catch(() => {}), 3000);
		};
		ws.onmessage = e => {
			const msg = JSON.parse(e.data);
			if (pending.has(msg.msgid)) {
				pending.get(msg.msgid)(msg);
				pending.delete(msg.msgid);
			}
			if (msg.roomInfo) {
				roomInfo = msg.roomInfo;
				render();
			}
		};
	});
}

async function rejoin() {
	await connect();
	const ret = await call({ action: 'joinRoom', roomId: room, accountId: user, scramble: newScramble() });
	if (ret.code === -403) throw new Error('room is full (7 players max)');
	joined = true;
	clearInterval(heartbeat);
	heartbeat = setInterval(() => connected && ws.send(JSON.stringify({ action: 'heartBeat', roomId: room, accountId: user })), HEARTBEAT_MS);
	setNotice(ret.code === 1 ? 'rejoined room ' + room : 'joined room ' + room);
}

async function setStatus(status) {
	if (!joined) return;
	const ret = await call({ action: 'updateStatus', roomId: room, accountId: user, status }).catch(() => null);
	if (ret && ret.code === -403) setNotice('not in the room');
}

async function submit(time) {
	if (!roomInfo || !roomInfo.cur[1]) return setNotice('no scramble yet, wait for the room');
	const solveId = roomInfo.cur[0];
	const ret = await call({
		action: 'uploadSolve', roomId: room, accountId: user, solveId,
		time: [time, roomInfo.cur[1]], scramble: newScramble(),
	}).catch(e => ({ code: e.message }));
	setNotice(ret.code === 0 || ret.code === 1 ? `submitted ${fmtTime(time)} for solve #${solveId + 1}` : 'submit failed: ' + ret.code);
}

async function leave() {
	quitting = true;
	clearInterval(heartbeat);
	if (connected && joined) await call({ action: 'leaveRoom', roomId: room, accountId: user }).catch(() => {});
	if (ws) ws.close();
}

// ---------- screen ----------
let rl;

function setNotice(s) { notice = s; render(); }

function render() {
	if (!rl) return;
	const out = [];
	const state = connected ? c('32', 'connected') : c('31', 'offline');
	out.push(`${bold('jlTimer battle')}  room ${bold(room)}  you ${bold(user)}  ${state}`);
	out.push(dim('csTimer battle server (cstimer.net), not operated by jlTimer'));
	out.push('');
	if (!roomInfo) {
		out.push(dim('waiting for room info...'));
	} else {
		const [curId, curScr] = roomInfo.cur;
		out.push(`${bold('Solve #' + (curId + 1))}  ${curScr || dim('(waiting for scramble)')}`);
		out.push('');
		// same columns as csTimer's battle tool: rank, player, ELO, status, last time
		const times = {};
		let roundStarted = false;
		for (const s of roomInfo.solves) {
			(times[s.accountId] = times[s.accountId] || {})[s.solveId] = s.time;
			if (s.solveId === curId) roundStarted = true;
		}
		const players = [...roomInfo.players].sort((a, b) => b.elo - a.elo);
		out.push(dim(` #  ${pad('player', 14)}${lpad('ELO', 5)}  ${pad('status', 11)}${lpad('time', 9)}`));
		players.forEach((p, i) => {
			const mine = times[p.accountId] || {};
			const solved = p.status === 'SOLVED';
			let t = fmtTime(solved ? mine[curId] : mine[curId - 1]);
			if (roundStarted && !solved) t = dim(lpad(t, 9));
			else t = lpad(t, 9);
			const name = pad(displayName(p.accountId), 14);
			const isMe = p.accountId === user || p.accountId.split('|')[0] === user;
			out.push(`${lpad(i + 1, 2)}  ${isMe ? bold(name) : name}${lpad(p.elo, 5)}  ${c(STATUS_COLOR[p.status] || '37', pad(STATUS_NAME[p.status] || p.status, 11))}${t}`);
		});
		// recent rounds
		const recent = [];
		for (let id = curId - 1; id >= Math.max(0, curId - 5); id--) {
			const row = players.filter(p => (times[p.accountId] || {})[id]).map(p => `${displayName(p.accountId)} ${fmtTime(times[p.accountId][id])}`);
			if (row.length) recent.push(dim(`#${id + 1}: `) + row.join(dim(' · ')));
		}
		if (recent.length) {
			out.push('');
			out.push(dim('recent'));
			out.push(...recent);
		}
	}
	out.push('');
	if (timerStart) out.push(c('33', bold('timing  ' + fmtTime([0, Date.now() - timerStart]))) + dim('  (Enter to stop)'));
	else if (notice) out.push(notice);
	out.push(dim('time: 12.34  1:02.50  1234  12.34+  DNF · Enter on empty line = start/stop timer · /i inspect · /r ready · /q quit'));
	process.stdout.write((tty ? '\x1b[H\x1b[2J' : '\n') + out.join('\n') + '\n');
	rl.prompt(true);
}

async function onLine(line) {
	line = line.trim();
	if (line === '') {
		if (!timerStart) {
			timerStart = Date.now();
			setStatus('SOLVING');
			ticker = setInterval(render, 100);
		} else {
			const ms = Date.now() - timerStart;
			timerStart = 0;
			clearInterval(ticker);
			await submit([0, ms]);
		}
		return render();
	}
	if (/^\/q(uit)?$/.test(line)) return quit();
	if (line === '/i') return setStatus('INSPECT');
	if (line === '/r') return setStatus('READY');
	if (line === '/s') return setStatus('SOLVING');
	const t = parseTime(line);
	if (!t) return setNotice(`could not read "${line}" as a time`);
	if (timerStart) { timerStart = 0; clearInterval(ticker); }
	await submit(t);
}

async function quit() {
	await leave();
	if (tty) process.stdout.write('\x1b[?1049l');
	console.log('left room ' + room);
	process.exit(0);
}

// ---------- start ----------
function ask(q) {
	return new Promise(res => {
		const r = readline.createInterface({ input: process.stdin, output: process.stdout });
		r.question(q, a => { r.close(); res(a.trim()); });
	});
}

async function main() {
	user = process.argv[2] || await ask('username (letters and digits): ');
	room = process.argv[3] || await ask('room id (3-20 letters/digits): ');
	if (!/^[A-Za-z0-9]+$/.test(user)) return console.error('username: letters and digits only'), process.exit(1);
	if (!/^[0-9a-zA-Z]{3,20}$/.test(room)) return console.error('room id: 3-20 letters/digits'), process.exit(1);
	console.log('connecting to ' + SERVER + ' ...');
	try {
		await rejoin();
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
	if (tty) process.stdout.write('\x1b[?1049h');
	rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
	rl.on('line', l => onLine(l).catch(e => setNotice('error: ' + e.message)));
	rl.on('close', quit);
	process.on('SIGINT', quit);
	render();
}

main();
