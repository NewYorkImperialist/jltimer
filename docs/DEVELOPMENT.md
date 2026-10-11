# Development and deployment

## Prerequisites

| Tool | Used for |
|---|---|
| Java 11+ | `lib/compiler.jar` (Closure Compiler): `make check`, minified builds |
| PHP 8 CLI | dev server, and rendering `timer.php` into static HTML in `make local` |
| GNU make | `Makefile` (macOS ships GNU make 3.81, which also works) |
| `md5sum` | cache-busting hashes (on macOS 15+ it's in `/sbin`. Otherwise use coreutils.) |
| Node.js + npm (optional) | `npm run typecheck` (TypeScript checker over the jlTimer modules; not needed to build) |

macOS: `brew install php`.

## Development page (unminified sources)

```sh
php -S localhost:8000 -t src
# open http://localhost:8000/
```

`src/index.php` loads each source file in `src/js/` directly, so a reload picks up edits without a build. Add `?debug=1` for console logging and hidden debug options. The language comes from `?lang=xx-xx`, the `lang` cookie or `Accept-Language`.

## Builds

```sh
make check   # Closure Compiler checks only (expect 0 errors; 2 upstream warnings)
make         # dist/js/cstimer.js, dist/js/twisty.js, dist/css, dist/lang, dist/sw.js, dist/cache.manifest
make local   # make + a static site in dist/local/
```

`dist/` is a PHP deployment, the layout cstimer.net uses: `dist/timer.php` with `dist/lang/*`. `dist/local/` is a fully static site:

```
dist/local/index.html            timer.php rendered by PHP at build time
dist/local/js/{jquery.min,cstimer,twisty}.js
dist/local/css/style.css
dist/local/jltimer.webmanifest   PWA manifest
dist/local/jltimer512x512.png    icon
dist/local/sw.js                 service worker
```

Notes:

- The built script is still named `js/cstimer.js`. The scramble worker loads it by that name (`src/js/worker.js`), so the file was not renamed.
- The build version label (`$version`, shown in the About heading) comes from `git describe --tags --always`. The workflow checks out with `fetch-depth: 0` so tags are available and CI produces the same label as a local build (e.g. `2025.08.18-33-g2547d82`).
- **The static build includes only one language.** When `make local` runs PHP from the CLI, there is no `Accept-Language` header, so `langDet.php` picks `en-us` and inlines it. `?lang=` switching needs the PHP server (`dist/` or the dev page).

### Makefile changes made for jlTimer

- **Portability:** `sed -i` became `sed -i.bak … && rm -f ….bak`, and `echo -n` became `printf`. The original commands fail on macOS: BSD `sed -i` requires a suffix argument, and `/bin/sh` prints `-n` literally. The new forms work with both GNU and BSD tools, so CI is unaffected.
- **Static build / PWA:**
  - The old `sed "s/.*manifest.*//g"` deleted the entire `<html …>` line *and* the `<link rel="manifest">` line. Now it strips only the obsolete AppCache attribute (`manifest="cache.manifest"`).
  - The web manifest, the icon and `sw.js` are copied into `dist/local`.
  - The static `sw.js` drops `timer.php` from its pre-cache list. That file doesn't exist on static hosting, and `cache.addAll` fails if any URL fails.
- The service worker cache is named `jltimer_cache_<md5>`. Branding only: the worker deletes every other cache name when it activates.

The service worker is **cache-first**. After a deploy, the first load serves the cached version and fetches the new worker. The new version appears on the next load.

## Type checking (jlTimer modules)

The jlTimer modules are checked with TypeScript's checker. Nothing is converted: they stay plain JS, the build is still the Makefile and Closure Compiler, and `tsc` only reads (`noEmit`).

```sh
npm install          # once: typescript and @types/jquery (v1) into node_modules/ (gitignored)
npm run typecheck    # or: make typecheck   (expect no output)
```

What is checked:

- The files listed in `tsconfig.json` (`files` plus `src/js/fx/*.js`). `checkJs` is off globally; each of these files starts with `// @ts-check`. Currently: `stats/algstat.js`, `stats/collstat.js`, `stats/dashboard.js`, `tools/algtrainer.js`, `cloud.js`, `mybg.js`, `themes.js`, `fx.js` and every `fx/*.js`. csTimer's own files (kernel, stats.js, export.js, twisty...) are not checked.
- `strict` is off (no null checks, implicit `any` allowed). It still catches wrong argument counts and types against the declared csTimer APIs, typos in property names of typed objects, arithmetic on non-numbers and mismatches between modules (e.g. what `mybg.js` passes to `jlThemes.setImages`).

The declarations:

- `types/globals.d.ts`: the csTimer globals the modules use (`kernel`, `stats`, `storage`, `cubeutil`, `mathlib`, `recons`, `tools`, `exportFunc`, `logohint`, `$` additions such as `$.alert` / `$.delayExec`, language strings such as `TOOLS_RECONS`, `DEBUG`, `execMain`) and shared shapes (`Solve`, `ReconsStep`, `Recons`, `CubieCube`). The most-used kernel APIs (`getProp`, `setProp`, `regProp`, `regListener`, `showDialog` ...) have exact signatures; the rest is loose (`[k: string]: any`). jQuery comes from `@types/jquery` v1.
- `types/jltimer.d.ts`: data shapes of the jlTimer modules, referenced from JSDoc by name: `BgEntry` (mybg.js pictures), `JlTheme` / `ThemeImages` (themes.js), `AlgStepCfg` / `AlgDrill` (algstat.js), `CloudState` (cloud.js).
- The jlTimer modules' own globals (`algStat`, `jlThemes`, `jlFx`, `cloud`, `pllDrill`, ...) need no declaration: `tsc` infers them from the files.

**JSDoc and Closure.** Closure Compiler reads JSDoc too (`make check` runs with type checking off). Rules that keep both happy:

- Use types both understand: `{string}`, `{Array<number>}`, `{Object<string, T>}`, `{function(number): string}`, record types `{{a: number}}`, `{*}` for anything. Casts: `/** @type {HTMLCanvasElement} */ (expr)` (parentheses required).
- Don't use TS-only syntax in a source file Closure compiles (tuples `[a, b]`, `import()`, `keyof`, unions with literal types...): put the shape in `types/jltimer.d.ts` and reference it by name. Closure accepts an unknown type name with checks off. `fx/*.js` is not compiled by Closure (concatenated into `js/jlfx.js`), so TS-only JSDoc is fine there.
- Don't use `{?}` for "any": TypeScript 7 rejects it. Use `{*}`.
- Afterwards run `make check` (still `0 error(s), 2 warning(s)`).

**Adding a module:** put `// @ts-check` on its first line (above `"use strict"`), add the path to `files` in `tsconfig.json`, run `npm run typecheck`, and add to `types/globals.d.ts` any csTimer global or language string it reports as missing (`Cannot find name ...`). For a false positive, prefer a JSDoc type or cast; if that is not possible, use `// @ts-ignore` on the line above with the reason.

## Testing under a repository subpath

GitHub Pages serves project sites from `/<repo>/`. Every asset path in the build is relative, so test it the same way:

```sh
make local
mkdir -p /tmp/site && ln -sfn "$(pwd)/dist/local" /tmp/site/jltimer
python3 -m http.server -d /tmp/site 8080
# open http://localhost:8080/jltimer/
```

Check that the page loads without 404s in the network tab. It should load `js/*`, `css/style.css`, `jltimer.webmanifest`, `jltimer512x512.png` and `sw.js`. The tab title should read "jlTimer - …". Service workers need a secure context, and `localhost` counts.

## GitHub Pages deployment

`.github/workflows/pages.yml` runs on every push to `master` and on manual dispatch. It sets up Java 11 and PHP 8.0, runs `make local`, uploads `dist/local` and deploys it with `actions/deploy-pages`.

Pages is enabled with **Source: GitHub Actions** and the custom domain **https://timer.jaydenlin.net/** (a `CNAME` record `timer → newyorkimperialist.github.io` at the domain's DNS provider, Spaceship). Without the custom domain it would serve under the user site's domain at `/jltimer/`; both work, since all paths are relative. Pushing to `master` deploys.

**Pushing to `master` deploys.** Push or dispatch only when you mean to publish. Nothing has been deployed as part of this work.

Things that don't work on GitHub Pages (static hosting): the PHP endpoints (`oauthwca.php`, `userdata*.php`), so WCA login can't complete. See [BACKEND.md](BACKEND.md).

## Battle TUI (terminal race client)

`tools/battle-tui.mjs` is a minimal terminal client for csTimer's battle rooms (`wss://cstimer.net/ws20230409`), the same rooms jlTimer's and csTimer's Battle tool join. It needs Node 22+ and the scrambler module:

```sh
make module                                   # builds npm_export/cstimer_module.js (git-ignored)
node tools/battle-tui.mjs <username> <roomId>   # both optional; it asks if missing
```

It shows the room, the current scramble, players with ELO, status and time (like the web tool), and the last few rounds. Type a time (`12.34`, `1:02.50`, `1234`, `12.34+`, `DNF`), or press Enter on an empty line to start and stop a built-in timer. `/i` inspect, `/r` ready, `/q` leave. The scramble it proposes for the next round comes from csTimer's random-state 3x3 scrambler.

The rooms belong to csTimer's server, which jlTimer doesn't operate. The server's "wins" counter never increments (its win check compares against an initial value that is never updated), so wins aren't shown, which matches the web tool.
