# Development and deployment

## Prerequisites

| Tool | Used for |
|---|---|
| Java 11+ | `lib/compiler.jar` (Closure Compiler): `make check`, minified builds |
| PHP 8 CLI | dev server, and rendering `timer.php` into static HTML in `make local` |
| GNU make | `Makefile` (macOS ships GNU make 3.81, which also works) |
| `md5sum` | cache-busting hashes (on macOS 15+ it's in `/sbin`. Otherwise use coreutils.) |

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

To use it, set **Settings → Pages → Build and deployment → Source: GitHub Actions** in the GitHub repo. With the current remote (`NewYorkImperialist/jltimer`), the site would be at `https://newyorkimperialist.github.io/jltimer/`.

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
