#!/usr/bin/env node
// jlTimer metric suite: performance + timing accuracy with pass/fail thresholds. See tests/metrics/README.md.
//   node tests/metrics/run.mjs [--runs N] [--quick] [--only g1,g2] [--json] [--update-baseline]
// Serves dist/local (build it first: make local) on a free port in 8310-8319 and drives headless Chrome.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve, launch, chromePath, m } from './lib.mjs';
import { getData } from './data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ROOT = path.resolve(process.env.METRICS_ROOT || path.join(REPO, 'dist/local')); // METRICS_ROOT: measure another build
const GROUPS = ['load', 'cube-latency', 'timing-accuracy', 'cube-render-cost', 'theme-anim', 'pb-celebration', 'dashboard', 'stats-ui', 'phone'];

function parseArgs(argv) {
	const a = { runs: null, quick: false, only: null, json: false, updateBaseline: false };
	for (let i = 0; i < argv.length; i++) {
		const x = argv[i];
		if (x == '--runs') a.runs = Math.max(1, +argv[++i] || 1);
		else if (x.startsWith('--runs=')) a.runs = Math.max(1, +x.slice(7) || 1);
		else if (x == '--quick') a.quick = true;
		else if (x == '--only') a.only = argv[++i].split(',');
		else if (x.startsWith('--only=')) a.only = x.slice(7).split(',');
		else if (x == '--json') a.json = true;
		else if (x == '--update-baseline') a.updateBaseline = true;
		else if (x == '-h' || x == '--help') {
			console.log('usage: node tests/metrics/run.mjs [--runs N (default 3, quick 1)] [--quick] [--only ' + GROUPS.join(',') + '] [--json] [--update-baseline]');
			process.exit(0);
		} else {
			console.error('unknown argument: ' + x);
			process.exit(2);
		}
	}
	if (a.runs == null) a.runs = a.quick ? 1 : 3;
	if (a.only) for (const g of a.only) if (!GROUPS.includes(g)) { console.error(`unknown group "${g}" (groups: ${GROUPS.join(', ')})`); process.exit(2); }
	return a;
}

const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } };
const git = (cmd) => { try { return execSync('git ' + cmd, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
const fmt = (v) => v == null ? '-' : (Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toFixed(1)));

// median of the runs (mean of the middle two for an even count)
function median(a) {
	const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
	if (!s.length) return null;
	const h = s.length >> 1;
	return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

function judge(id, value, th) {
	if (/\.error$/.test(id)) return 'FAIL';
	if (!th) return 'INFO';
	if (value == null) return 'FAIL';
	if (th.max != null && value > th.max) return 'FAIL';
	if (th.min != null && value < th.min) return 'FAIL';
	return 'PASS';
}
const thText = (th) => !th ? '' : th.max != null && th.min != null ? `${th.min}..${th.max}` : th.max != null ? `<= ${th.max}` : `>= ${th.min}`;

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const log = args.json ? (s) => process.stderr.write(s + '\n') : (s) => console.log(s);
	if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
		console.error(`${ROOT}/index.html not found: build first (make local)`);
		process.exit(2);
	}
	let chrome;
	try {
		chrome = chromePath();
	} catch (e) {
		console.error(e.message);
		process.exit(2);
	}
	const thresholds = readJson(path.join(HERE, 'thresholds.json'), {});
	const baseline = readJson(path.join(HERE, 'baseline.json'), { metrics: {} });
	const groups = (args.only || GROUPS);
	const t0 = Date.now();
	const srv = await serve(ROOT, [8310, 8311, 8312, 8313, 8314, 8315, 8316, 8317, 8318, 8319]);
	let data = null;
	const env = {
		url: srv.url, root: ROOT, quick: args.quick, browser: null,
		get data() { return data || (data = getData()); },
	};
	log(`jlTimer metrics: ${srv.url} (${path.relative(REPO, ROOT) || ROOT}), ${args.runs} run(s) each${args.quick ? ', quick subset' : ''}, Chrome ${chrome}`);
	const load0 = os.loadavg()[0];
	if (load0 > os.cpus().length / 2) {
		log(`WARNING: system load ${load0.toFixed(1)} on ${os.cpus().length} cores - other work competes for CPU/GPU; frame and time metrics will be noisy`);
	}
	const results = [];
	let chromeVersion = '';
	try {
		for (const g of groups) {
			const mod = (await import(`./groups/${g}.mjs`)).default;
			if (args.quick && !mod.quick) continue;
			const tg = Date.now();
			const vals = new Map();
			const meta = new Map();
			for (let r = 0; r < args.runs; r++) {
				env.browser = await launch();
				chromeVersion = chromeVersion || env.browser.version();
				let rows;
				try {
					rows = await mod.run(env, r);
				} catch (e) {
					rows = [m(g + '.error', 1, 'error', 'group failed: ' + String(e && e.message || e).split('\n')[0])];
					log(`  ${g} run ${r + 1} failed: ${e && e.stack || e}`);
				} finally {
					await env.browser.close().catch(() => {});
				}
				for (const row of rows) {
					if (!vals.has(row.id)) vals.set(row.id, []);
					vals.get(row.id).push(row.value);
					meta.set(row.id, row);
				}
			}
			for (const [id, vs] of vals) {
				const row = meta.get(id);
				const value = median(vs);
				const th = thresholds[id];
				const base = baseline.metrics[id];
				results.push({ group: g, id, label: row.label, unit: row.unit, value: value == null ? null : +value.toFixed(2), runs: vs,
					threshold: th || null, status: judge(id, value, th), baseline: base == null ? null : base,
					delta: base == null || value == null ? null : +(value - base).toFixed(2) });
			}
			log(`  ${g}: ${vals.size} metrics in ${((Date.now() - tg) / 1000).toFixed(0)} s`);
		}
	} finally {
		srv.server.close();
	}
	const secs = (Date.now() - t0) / 1000;
	const fails = results.filter((r) => r.status == 'FAIL');
	const report = {
		date: new Date().toISOString(), commit: git('rev-parse --short HEAD'), dirty: git('status --porcelain -- src') != '',
		chrome: chromeVersion, runs: args.runs, quick: args.quick, groups, data: data ? data.source : null,
		seconds: +secs.toFixed(1), loadAvg: [+load0.toFixed(2), +os.loadavg()[0].toFixed(2)], pass: fails.length == 0, failed: fails.map((r) => r.id), metrics: results,
	};
	const resDir = path.join(HERE, 'results');
	fs.mkdirSync(resDir, { recursive: true });
	const resFile = path.join(resDir, report.date.replace(/[:.]/g, '-') + '.json');
	fs.writeFileSync(resFile, JSON.stringify(report, null, 1));
	if (args.updateBaseline) {
		const nb = { updated: report.date, commit: report.commit, chrome: report.chrome, runs: report.runs, metrics: Object.assign({}, baseline.metrics) };
		for (const r of results) if (r.value != null) nb.metrics[r.id] = r.value;
		nb.metrics = Object.fromEntries(Object.entries(nb.metrics).sort());
		fs.writeFileSync(path.join(HERE, 'baseline.json'), JSON.stringify(nb, null, 1) + '\n');
	}
	if (args.json) {
		console.log(JSON.stringify(report, null, 1));
	} else {
		printTable(results);
		console.log(`\n${results.length} metrics, ${fails.length} FAIL, ${secs.toFixed(0)} s (${(secs / 60).toFixed(1)} min). Results: ${path.relative(REPO, resFile)}` +
			(args.updateBaseline ? '; baseline.json updated' : '') + (data ? `\nData: ${data.source}` : ''));
		if (fails.length) console.log('FAILED: ' + fails.map((r) => r.id).join(', '));
	}
	process.exit(fails.length ? 1 : 0);
}

function printTable(results) {
	const head = ['metric', 'value', 'unit', 'threshold', 'result', 'Δ base'];
	let group = null;
	const lines = [];
	const rows = results.map((r) => [r.id.replace(r.group + '.', ''), fmt(r.value), r.unit, thText(r.threshold), r.status,
		r.delta == null ? '' : (r.delta > 0 ? '+' : '') + fmt(r.delta), r.group, r.label]);
	const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
	const line = (cells) => cells.map((c, i) => i == 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i])).join('  ');
	for (const r of rows) {
		if (r[6] != group) {
			group = r[6];
			lines.push('', `[${group}]`, line(head), w.map((x) => '-'.repeat(x)).join('  '));
		}
		lines.push(line(r.slice(0, 6)) + (r[4] == 'FAIL' ? '   <-- ' + r[7] : ''));
	}
	console.log(lines.join('\n'));
}

main().catch((e) => {
	console.error(e && e.stack || e);
	process.exit(2);
});
