# jlTimer roadmap (planning only)

This document is a plan. **None of it is implemented.** There is no scaffolding, schema, dependency or runtime code for these items in the repo.

csTimer already does much of the groundwork. Each item below says what exists, what would be **extended**, and what would be **new**.

**Constraints for every item:**

- Keep the csTimer export format and storage keys working ([MIGRATION.md](MIGRATION.md)).
- Settings go in `localStorage['properties']` via `kernel.regProp`. `cleanLocalStorage` in `kernel.js` deletes any other `localStorage` key.
- Larger data (an alg library, tags) belongs in IndexedDB through `lib/storage.js` (`setKey`/`getKey`), or inside the solve record's existing comment field. **This needs a versioned design first.** Note that `storage.importAll` clears the whole object store.

## Summary

| # | Area | Type | Priority |
|---|---|---|---|
| 1 | Algorithm library | New (reuses case tables) | High |
| 2 | Integrated virtual alg trainer | Extend virtual cube + training scrambles | High |
| 3 | Random AUF / orientation / equivalent-case scrambles | Mostly exists; small extensions | Medium |
| 4 | Searchable archive, tags, filters | New UI on existing data | Medium |
| 5 | Dashboards | Extend existing stat tools | Medium |
| 6 | Bulk move-history analysis | Extend `recons.js` | Medium |
| 7 | CFOP phases + OLL/PLL identification | **Exists**; surface it better | Low |
| 8 | Annotated replay | Extend `twistyreplay.js` | Medium |
| 9 | Weak-case stats + targeted practice | Extend case stats + scramble filters | High |
| 10 | Comparing alternative algorithms | New, depends on 1, 2, 6 | Low |
| 11 | Verified alternative cross / F2L solutions | Extend solvers | Low |
| 12 | Better exports, versioned backups, recovery | Extend `export.js` | High |
| 13 | Minimal race interface / standalone client | Extend `battle.js`, needs server (14) | Low |
| 14 | Independent backend hosting | New infrastructure | Low (until 12/13 need it) |

## 1. Algorithm library

- **Reuse:** the case tables and images behind the training scrambles in `scramble/scramble_333_edit.js`. These cover PLL (21), OLL (57+), ZBLL, COLL/CMLL, ZBLS, VLS/WVLS, TTLL, EOLS and more. Each training type has `[names, probs, imgGen]` via `getExtra` and `scrMgr.reg(...)`. `cubeutil.getIdentData` and `identStep` map a cube state to a case index. `lib/tdconverter.js` shows the import-parsing pattern.
- **Add:** a store mapping case ID to `{name, subset, algs[], preferred}`, import from text/CSV/JSON, an editor UI, and validation. Validation would apply the inverse of an alg and check that it produces the case, using `mathlib.CubieCube` and `cubeutil`.
- **Limits:** this needs new IndexedDB records plus versioning and an export field. That is a schema decision, so design it with #12. Case numbering must match csTimer's tables.

## 2. Integrated virtual algorithm trainer

- **Reuse:** `timer/virtual.js`, which scrambles the virtual cube from the current scramble, records `rawMoves` and detects solved via `puzzleObj.isSolved(vrcMP)`. Training scramble types (`pll`, `oll`, `zbll`, …). The existing "last layer" training input (`input: 'l'`, `timer.js` `keyboardTimer`). Smart-cube training mode (`giiMode` `t`/`at`, partial solve checks).
- **Add:** an automatic setup from the case (inverse of the preferred alg, or the scramble generator), and repeat / next / reveal-solution controls. Completion rules per subset (e.g. OLL done = LL oriented, ignore AUF). `cubeutil.getProgress` already handles partial states.
- **Limits:** the keyboard key map is fixed (`help.getMappedCode`). New controls must not consume cube keys. Depends on #1 for solutions.
- **Status:** PLL and OLL versions exist: Tools > Reconstruction > PLL trainer / OLL trainer (`tools/algtrainer.js`, one shared trainer with a config per step). They drill on csTimer's `pll` / `oll` training scrambles in their own "PLL drill" / "OLL drill" sessions, with an optional random y and a built-in alg per case for the reveal. An OLL attempt ends once the last layer is oriented (any AUF or permutation; a full LL solve counts too).

## 3. Random AUF, orientation variation, equivalent-case scrambles

- **Exists:** training scrambles already add AUF suffixes (`aufsuff` in `scramble_333_edit.js`). Color neutrality comes from `scrNeut` (none, 1, 2 or 6 colors), and case probability from `scrEqPr` (actual / equal / "each case once in 2N").
- **Add:** pre-AUF on/off per type, whole-cube rotation for the virtual cube (`vrcOri` exists: UF/URF), and grouping of mirror/inverse cases.
- **Priority** is medium because most of this exists.

## 4. Searchable solve archive with tags and filters

- **Reuse:** `stats.js` time list, `getExtraInfo`/`regExtraInfo` (already parses comment-based metrics, e.g. `comment1..`, `commentmbld`), and `hugestat.js` for cross-session iteration.
- **Add:** a search UI (by date, time range, penalty, scramble type, has-reconstruction, comment text), plus tags. Store tags **in the existing comment field** (e.g. `#tag`) to keep the format compatible, or as a new keyed store (a schema change).
- **Limits:** tens of thousands of solves. Load per session and filter lazily, as `stats` already does.

## 5. Dashboards

- **Reuse:** `trend.js`, `distribution.js`, `dlystat.js`, `hugestat.js`, `stattool.js` and `timestat.js` (aoN, trimmed means, σ).
- **Add:** a combined view with rolling averages, consistency (σ, IQR), session-vs-session comparison and date ranges. Use canvas or SVG, as the existing tools do; don't add a chart framework.
- **Limits:** the tools panel holds up to 4 tools (`NTools`). A dashboard probably belongs in a dialog.

## 6. Bulk analysis of virtual-solve move histories

- **Reuse:** `stats/recons.js` already computes per-solve step splits from the recorded move history (`calcRecons`, extra infos `recons_cf4op`, `recons_roux`, `recons_cf3zb`, …). It offers the tools *Reconstruction > step / cases / scatter*.
- **Add:** batch runs over all sessions with progress and caching, CSV/JSON export of results, and TPS/pause metrics (move timestamps are in the record).
- **Limits:** computing is per solve and synchronous. Use a worker (`worker.js` pattern) for big histories. Only virtual and smart-cube solves have move data.

## 7. CFOP phase and OLL/PLL case identification

- **Exists:** `cubeutil.getStepNames`/`getProgress` (CFOP, CF4OP, CF4O2P2, Roux, CF3ZB), `identOLL`/`identPLL`/`identStep`, live multi-phase splitting (`vrcMP`), and the *cases* tool, which gives per-case stats with export to file.
- **Add:** show the identified phase and case in the solve detail dialog and time list, and make the method selectable per session.
- **Limits:** identification assumes a fixed orientation (`vrcOri`/`giiOri`).

## 8. Annotated replay with phases and pauses

- **Reuse:** `twisty/twistyreplay.js` (`popupReplay`, `goToStep`, timeline) and phase boundaries from `recons.js`.
- **Add:** phase markers on the timeline, detection of pauses above a threshold, and labels such as "cross 8 moves, 2.1 s".
- **Limits:** this is display-only and needs no new data.

## 9. Weak-case statistics and targeted practice

- **Reuse:** `stats/trainstat.js` (per-case N/best/mean for training scrambles, from `scramcase_<type>` extra info), the case stats in `recons.js`, and scramble case filters with probabilities (`scrFlt`, `scrEqPr`).
- **Add:** a "weakness" score (slow mean, high σ, DNF rate) and an action that sets the case filter or weights to drill the weakest N cases.
- **Limits:** the filter is stored per scramble type. Weighting would extend `probs`, not replace it.
- **Status:** done for PLL and OLL. The PLL stats and OLL stats tables have a `weak` column, score = (case mean − step mean) / step σ + 0.5 / √(N + 1), and a *drill weakest N* action that opens the step's trainer. Case filter values above 1 are now weights (`scrMgr.rndState`). OLL stats also show the edge orientation at the start of the OLL against chance, and a family filter.

## 10. Comparing alternative algorithms with my own results

- **New.** It needs #1 (multiple algs per case) and #2 or #6 (each attempt tied to the alg used).
- **Add:** a record of which alg was used, either by matching the executed moves against the library's algs or by an explicit choice in the trainer. Then compare times per alg.
- **Limits:** matching executed moves to algs is fuzzy (regrips, AUF, cancellations).

## 11. Verified alternative cross and F2L solutions

- **Reuse:** solvers in `tools/cross.js` (cross, xcross), `tools/gsolver.js` (Cross+F2L, Petrus, Roux, ZZ), and `tools/roux1.js`/`eoline.js`. All are verified by construction because they're search-based.
- **Add:** list several optimal or near-optimal solutions per color/orientation, and compare them with the solver's own cross from the reconstruction (#6).
- **Limits:** search cost. Run in the scramble worker.

## 12. Improved exports, versioned backups and recovery

- **Status:** chosen design (Turso + Cloudflare Worker + cube-move login) is in [BACKUP_PLAN.md](BACKUP_PLAN.md).

- **Reuse:** `export.js`: whole-data JSON, auto export every N solves (`atexpa`, `atexpi`), import confirmation, and slicing/compression for the server (`getLocalDataSliced`, LZString).
- **Add:** timestamped local backups (download, or the File System Access API where available), a pre-import automatic backup (import currently **replaces** all data), an import preview or merge, integrity checks (solve counts, hashes), and a version field. The version field would be additive, so csTimer ignores it.
- **Limits:** the biggest current risk is import overwriting data. Do this first.

## 13. Minimal race interface or standalone race client

- **Status:** a working terminal demo exists, `tools/battle-tui.mjs` (see DEVELOPMENT.md). It joins csTimer's live battle rooms directly.

- **Reuse:** `tools/battle.js`, a room protocol over `wss://cstimer.net/ws20230409`. The server is approximately `dist/wsServer.js`. `tools/syncseed.js` gives shared scrambles without a server.
- **Add:** a compact race view (opponents' times, current scramble) in the minimal layout, or a separate page reusing the built `cstimer.js`.
- **Limits:** this uses csTimer's server, which is not ours and not guaranteed. A reliable version needs #14.

## 14. Independent backend hosting

GitHub Pages is static, so every feature below needs separate hosting with TLS and a domain registered with the OAuth providers. After that, change the hard-coded URLs and client IDs in `export.js`, `onlinecomp.js` and `battle.js`.

| Feature | Existing server code | Database | Credentials | Config changes |
|---|---|---|---|---|
| Backup / sync | `dist/userdata2.php` (older `userdata.php`). Needs PHP + `mysqli`. | MySQL `export_data`, `export_data2` (schema not in repo; infer it from the queries). Log file path `CSTIMER_USERDATA_LOGFILE`. | DB user/password (the script uses `cstimer` with an empty password on localhost). | `https://cstimer.net/userdata2.php` URLs in `export.js`. CORS header. Review the string-concatenated SQL; it is guarded only by regex. |
| WCA login | `dist/oauthwca.php` + `dist/WcaOauth.php` | none | A WCA OAuth app (client ID + **secret**) and a `csTimerTokenSalt`. The repo has placeholders only. | `client_id` in `export.js:4`. The referer regex in `oauthwca.php:9` (currently cstimer.net only). The redirect URI. |
| Google Drive backup | none needed (browser-only implicit flow) | user's Drive `appDataFolder` | A Google Cloud OAuth client with authorized JS origin and redirect | `client_id` in `export.js:5`. The OAuth consent screen. |
| Online competitions | **none** (`comp.php` isn't in the repo) | new | none beyond hosting | `comp.php` URLs in `onlinecomp.js`. Needs a new server implementation. |
| Battle / race rooms | `dist/wsServer.js` (Node, `ws`, `log4js`, port 7999) | in-memory | none | `wss://` URL in `battle.js:27`. TLS reverse proxy. |

Also review privacy and abuse controls (rate limits, data retention) before hosting other people's data.
