# Metric suite: performance and timing accuracy

Tests that measure numbers, not behaviour: how fast the virtual cube reacts to keys, how exact recorded times are,
what animations cost per frame, how long the heavy stats views take. Each metric has a pass/fail threshold, so a
change that makes the timer slower or less exact shows up as a FAIL.

## Running

```sh
npm install            # once: playwright-core (drives Chrome) and the type checker
make local             # the suite measures dist/local; it does not build
npm run metrics        # everything, 3 runs per metric (about 13 min)
npm run metrics:quick  # a subset, 1 run (about 1.6 min)
make metrics           # make local + npm run metrics   (also: make metrics-quick)
```

Options (`node tests/metrics/run.mjs ...`):

| option | meaning |
|---|---|
| `--runs N` | runs per group (default 3; quick 1). The reported value is the median over runs. |
| `--quick` | only the quick groups, with fewer rates / solves / styles |
| `--only g1,g2` | only these groups (`load`, `cube-latency`, `timing-accuracy`, `cube-render-cost`, `theme-anim`, `pb-celebration`, `dashboard`, `stats-ui`, `phone`) |
| `--json` | print the whole report as JSON on stdout (progress goes to stderr) |
| `--update-baseline` | write the measured values into `baseline.json` (merged: `--only` updates only those) |

Environment:

| variable | meaning |
|---|---|
| `CHROME` | Chrome / Chromium binary. Default: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| `METRICS_ROOT` | measure another static build instead of `dist/local` (e.g. a copy with an injected regression, or an older build for A/B) |
| `JLTIMER_DATA` | csTimer/jlTimer export used by `dashboard` and `stats-ui`. Default: the author's export in `~/Downloads` (10.5k virtual solves). If the file is missing, or with `JLTIMER_DATA=synthetic`, ~10k synthetic solves with move logs are generated (fixed seed; `JLTIMER_SYNTH_N` changes the count). |

The runner serves `dist/local` itself (a small Node static server on the first free port in 8310-8319), starts
headless Chrome once per group run, blocks all network requests that are not to that server (cloud backup API etc.),
and exits with code 1 if any metric FAILs (2 on setup errors: no build, no Chrome).

## Reading the output

```
[cube-latency]
metric               value  unit  threshold  result  Δ base
burst.firstDrawP95    16.2    ms      <= 24    PASS    +0.3
```

* **value**: median over the runs of the per-run value (each per-run value is itself e.g. a p95 over ~80 keys).
* **threshold**: `<= x` or `>= x` (from `thresholds.json`); **result** PASS / FAIL (FAIL rows also print what the
  metric means). A group that crashes reports `<group>.error` as FAIL.
* **Δ base**: difference to `baseline.json` (the committed reference run), for spotting trends that are still within
  the threshold.
* Every run writes `tests/metrics/results/<timestamp>.json` (gitignored) with all per-run values, the commit, the
  Chrome version and the data set.

## The metrics

All times are milliseconds on the page's `performance.now()` clock. "Key" times use the key event's own
`event.timeStamp` (when the browser received the key), so input delay on a busy page counts against the app.

### 1. cube-latency (desktop 1280x800, virtual cube, default settings)
Keys are sent through Chrome's real input pipeline (CDP) on a schedule: Ua perm, T perm and an F2L-like run with
y/y' rotations (79 keys, default keymap) at 8 / 12 / 15 / 20 keys/s (±35 % jitter), and **burst**: groups of four keys
28 ms apart (finger tricks, ~36 tps locally), where turns queue up.

| metric | plain meaning |
|---|---|
| `firstDrawMed` / `firstDrawP95` | key → the end of the first animation frame that draws that turn moving |
| `turnDoneP95` | key → the frame that shows the turn finished |
| `maxBacklog` | most turns waiting at once (1 = only the one turning) |
| `lastKeyLag` | last key → the cube shows every move (how far the cube trails your hands) |
| `droppedFrames`, `frameGapP95` | animation smoothness while turning (60 Hz = 16.7 ms) |
| `missedMoves` | keys that did not turn the cube |

The burst thresholds catch a broken catch-up (queued turns wait their full duration: first draw p95 ~42 ms instead
of ~16) and any work added to the key path.

### 2. timing-accuracy
Idle, and with a 30 ms busy loop every 100 ms (a stand-in for any heavy work on the main thread).
* **virtual**: scripted 25-move solves of a known scramble at ~12 tps. `moveLogErrMax` = |stored `move@ms` offset −
  key timestamp offset|; `startErrMax` = timer start vs the first turn's key; `stopErrMax` = start + recorded time vs
  the solving key; `solveVsScriptMax` (idle only) = recorded time vs the scripted schedule (includes ~1 ms injection
  jitter; with the busy task CDP's own delivery jitters, so it is not measured there); `wrongSolves` = solves with a
  wrong or missing record.
* **keyboard** timer (input "Keyboard"): hold Space 0.65 s, release = start, Space = stop. `startErrMax` vs the
  release's timestamp, `stopErrMax` vs the stop key's. The keyboard timer still takes the time when its handler runs,
  so with the busy task these are up to ~30 ms (the threshold documents that; tighten it if the keyboard timer moves
  to event timestamps like the virtual cube did).

### 3. cube-render-cost
Turning continuously at 40 keys/s, the time of the cube's own animation-frame callback (p95 / max) for the Classic,
Glossy and Soft sticker styles and a 4x4. `idleRedraws` = cube frames drawn in 2 s with nothing turning (must be 0).

### 4. theme-anim (sakura, 1280x800 @2x)
`scriptP95` / `scriptMax` = script time of one petal frame; `idleFps` = petal frames per second when idle;
`framesWhileTiming` = petal frames drawn during 2 s of a running virtual solve (the default "On, pause while timing":
must be 0); `resumeFps` = they run again after the solve.

### 5. pb-celebration
Six solves, then a best single/ao5 through the normal `time` signal. `startCost` = the main-thread task that starts
the celebration; `pushCost` = storing that solve; `frameGapP95/Max` and `scriptP95` while it plays; `framesDrawn`.
Then `jlPbFx.preview()` (the test hook) and a key press: `cutLatency` = key timestamp → no longer active,
`framesAfterKey` = celebration frames drawn after the key (≤ 1 = it stops within one frame).

### 6. dashboard (the data set's virtual-cube session)
`coldMs` = open the dashboard and compute everything (wall time), `coldLongestBlock` = longest main-thread block
meanwhile (a 5 ms interval probe; the computation runs in slices), `reopenMs` / `reopenLongestBlock` = open again
(cached), `analyzedAll` = the result covers the whole session.

### 7. stats-ui (same data)
`pllFirstOpenMs` / `pllLongestBlock` = PLL stats first open (reconstructs every solve; currently one block),
`pllCases` = rows shown; `jumpBottomMs` (+ `Sync` = the scroll handler alone) = drag the time list to the bottom,
which renders every row; `deleteAtBottomMs` (+ `Sync`) = delete a solve near the bottom (the confirm is stubbed so
only the app's work counts); `deleted` = exactly one solve removed.

### 8. load
Fresh browser context (cold cache) from localhost: `domContentLoaded`, `loadEvent`, `timerReady` (kernel up and the
time list rendered), all from navigation start. Bundle budgets: raw and gzip -9 size of `cstimer.js`, `twisty.js`,
`jlthemes.js` (theme artwork), `jlfx.js` and the gzip total. Budgets are about +10 % over the current sizes.

### 9. phone (iPhone 13 emulation + 4x CPU throttle)
The 12 tps and burst rows of cube-latency, theme-anim (petals run at 30 fps on phones) and pb-celebration.

Every group also reports `pageErrors` (uncaught page errors, must be 0).

## Caveats (headless Chrome)
* No real display: frames come from a 60 Hz software BeginFrame source and "presented" is a swap of an offscreen
  surface. Real screens add scan-out and (macOS) a compositor frame, and 120 Hz ProMotion is not modelled. Treat
  frame and draw times as relative numbers for comparing builds, not as what your eyes see.
* Frame pacing is sensitive to CPU contention. Run the suite alone (no other browser tests, builds or video calls);
  a busy machine shows up as dropped frames, frame-gap and fps FAILs first.
* CPU throttling slows the page's main thread only (not raster/GPU). iPhone emulation is viewport, DPR and touch,
  not iPhone hardware or Safari/WebKit.
* Key injection from Node has ~1 ms jitter. Single-run max values are noisy; that's why the default is 3 runs and
  the median is reported, and why max-type thresholds have generous headroom.
* Load times are from localhost with no network cost; they measure parse/startup work, not download time.

## Changing thresholds and the baseline
* Thresholds live in `thresholds.json` (`{ "max": x }`, `{ "min": x }` or both) keyed by metric id
  (`group.metric`, the id shown in the table plus the group). They were set from measured values on an M1 Mac with
  Chrome 155 (3 runs, idle machine) with headroom: about 1.5x for latency/p95, more for max and frame-gap values,
  +10 % for bundle sizes, exact for counts that must be 0. A metric without a threshold prints INFO.
* When a change makes something legitimately slower or bigger (e.g. a new feature in a bundle), re-measure, then
  edit the threshold in the same commit and say why in the commit message.
* `npm run metrics -- --update-baseline` rewrites `baseline.json` from this run (commit it) so Δ shows the change
  since then. Update it after deliberate performance changes, not to hide a regression.
* New metric: return `m(id, value, unit, label)` rows from a group module in `groups/`, add a threshold, document it
  here. Shared helpers (server, Chrome, page setup, instrumentation, key injection, stats) are in `lib.mjs`; the data
  set (real or synthetic) is in `data.mjs`.
