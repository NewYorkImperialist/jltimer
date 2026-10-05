# Branding audit: remaining "cstimer" occurrences

Search: case-insensitive `cstimer` across tracked files, excluding `.git`, vendored
jQuery/three.js, and build outputs (`dist/js/*.js`, `dist/local/`, `dist/lang/*`).
jlTimer is a fork of csTimer, so many occurrences are kept on purpose. This file
lists each kept occurrence and the reason for keeping it.

## Summary

| Category | Approx. count | Action |
|---|---|---|
| 1. Already rebranded to jlTimer | titles (36), logo, About h1 (35), JS strings (69), manifest, icon, export filenames, workflow step | done |
| 2. Upstream attribution / credits / license | ~30 | kept |
| 3. Upstream services, endpoints, OAuth IDs, service labels | ~45 | kept |
| 4. Compatibility and internal identifiers | ~60 (+ npm module) | kept |
| 5. Translated About-page prose (34 non-English pages) | ~1,650 | kept (only h1, fork notice and link targets changed) |
| 6. Missed user-facing branding | 1 fixed, 1 reported | see below |

## 6. Missed branding

- **Fixed:** `.github/workflows/pages.yml:36`: step name `Build cstimer` changed to `Build jlTimer`.
- **Fixed afterwards:** `src/sw.js:41`, the dev-only placeholder cache name, is now `jltimer_cache_…`.

## 2. Upstream attribution, credits, license (kept)

- `src/lang/fork.php:2-3`: fork notice. Links to csTimer, credits Shuang Chen (cs0x7f), GPLv3, and states that jlTimer is not affiliated with csTimer.
- `src/lang/en-us.php:5,16-18`: "built on csTimer", "modified version of csTimer", upstream issues link, and the "csTimer written by" and "csTimer UI designed by" credits.
- `src/lang/en-us.php:70`: "Familiar is the classic csTimer arrangement" (describes where the layout comes from).
- `src/lang/en-us.php:162-170`: Links section. Points to upstream csTimer, its beta and source builds, archived csTimer versions, and the csTimer source code.
- `src/lang/en-us.php:176`: "jlTimer (like csTimer) also supports…".
- `src/lang/en-us.php:179-189`: upstream author's donation and recommended-products section. The Amazon `tag=cstimer-20` links are upstream's affiliate tag. The heading reads "Donate to csTimer (upstream)".
- `src/lang/langDet.php:144`: meta description, "modified from csTimer (github link)".
- `src/jltimer.webmanifest:4`, `dist/jltimer.webmanifest:4`: description, "modified from csTimer".
- `src/lang/langDet.php` keywords (36 lines): `jltimer` added at the front, `cstimer` kept as a search keyword for the fork.
- `README.md` (whole file): owned by the docs agent, which is rewriting it.
- `npm_export/README.md`, `npm_export/package.json`, `npm_export/cstimer_module.d.ts`, `npm_export/testbench/test.js`: upstream's published npm package `cstimer_module`. Kept as-is because the package name is an npm registry identifier.
- `experiment/bleHack2.js:9`: developer comment about csTimer's move encoding.
- `src/css/style.css:1342`: `/* cstimer plus */` comment for upstream's existing `cspt` design.
- `src/js/kernel.js:818`: the upstream UI design option label `csTimer+` (value `cspt`). It names an existing upstream design accurately.

## 3. Upstream services: URLs, endpoints, OAuth, service labels (kept)

- `src/js/export.js:12,13,24,25`: `' (csTimer)'` labels on the Import/Export-to-server links. These name csTimer's backup server accurately.
- `src/js/export.js:179,198,262,309,336`: `https://cstimer.net/userdata2.php` (csTimer backup server).
- `src/js/export.js:4-5` (no "cstimer" text): WCA and Google OAuth client IDs registered to csTimer. Redirects to them only work from cstimer.net.
- `src/js/tools/onlinecomp.js:65,106,244,270,356`: `https://cstimer.net/comp.php` (online competitions).
- `src/js/tools/battle.js:27`: `wss://cstimer.net/ws20230409` (battle/race WebSocket).
- `src/oauthwca.php`, `dist/oauthwca.php:7,9,31`: server-side WCA OAuth. Its referrer whitelist is `cstimer.net`, and it holds `$csTimerTokenSalt`.
- `dist/userdata.php`, `dist/userdata2.php`: upstream server scripts. MySQL user/db `cstimer` and `CSTIMER_USERDATA_LOGFILE`. These aren't used by the static GitHub Pages build.
- `dist/timer.php:2-9`: upstream's commented-out cstimer.net redirect.
- `dist/timer.php:31`: comment saying upstream's Baidu analytics is disabled.
- `src/js/kernel.js:378-379`, `src/lang/lang.php:36`: Crowdin translation project `crowdin.com/project/cstimer`. Translations are upstream's. The prompt names csTimer as the upstream project.
- `src/lang/*.js` `PROPERTY_AUTOEXP_OPT` (35 files, e.g. `en-us.js:580`): "With csTimer ID" refers to the account on csTimer's server.

## 4. Compatibility and internal identifiers (kept, never rename)

- `src/js/lib/storage.js:41`: IndexedDB name `"cstimer"`. Renaming it would orphan all stored solves.
- `src/js/export.js:128,598,636`, `src/js/tools/onlinecomp.js:147,239,352`, `src/js/tools/battle.js:186,338`: `cstimer_token`, a key inside the `wcaData` localStorage object.
- `src/js/export.js:354,420`: Google Drive appData file name `cstimer.txt`. Existing Google backups are stored under this name.
- `src/js/tools/onlinecomp.js:285`: `cstimer_public_salt_`, a hashing salt shared with upstream's competition server.
- `src/js/lib/tdconverter.js:47,100`: import-format keys `csTimer` and `csTimerCSV`. They identify csTimer export formats.
- `src/js/lib/utillib.js:7,42,65,73,76,306`, `src/js/scramble/scramble.js:193,347-371`, `src/js/tools/cross.js:453`, `src/js/tools/image.js:1058`, `src/js/tools/tools.js:108`, `src/js/worker.js:3,67`, `experiment/checkwrap.js:3`, `src/lang/langDet.php:146`: compile-time and internal names (`ISCSTIMER`, `CSTIMER_VERSION`, `csTimerWorker`). They are shared with the npm module build (`--define='ISCSTIMER=false'`).
- `src/js/worker.js:7`, `Makefile:100,153,180,189,191`, `dist/timer.php:30`, `dist/cache.manifest:3`, `dist/sw.js:4`: built bundle path `js/cstimer.js`. The worker loads itself from this path, so renaming it would touch the build, the service worker and the page.
- `Makefile:155,164,197,199`: npm module target `cstimer_module`.
- `dist/sw.js`: the generated cache name is now `jltimer_cache_<md5>` (rewritten by every build).
- `.gitignore:3`: `cstimer.iml` (IDE project file).

## 5. Translated About-page prose (kept)

The 34 non-English About pages (`src/lang/<lang>.php`, excluding `en-us.php`) still contain about 47–51 occurrences each, roughly 1,650 in total. Changes made to these pages:

- the `<h1>` app name became jlTimer
- `fork.php` is included right after the language selector, so every language shows the English fork notice
- relative upstream links (`/new/`, `/src/`, archived versions) now point to absolute `https://cstimer.net/...` URLs

The rest is upstream translation: feature descriptions, credits, csTimer server references, links and the donation section. Many of those mentions name csTimer services or credits, which are accurate as written. Rewriting the app-name mentions safely in 34 languages needs per-language review, so they are left as translated upstream text.
