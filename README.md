# jlTimer

A personal speedcubing timer, modified from csTimer.

jlTimer is a modified fork of **[csTimer](https://github.com/cs0x7f/cstimer)** by Shuang Chen ([cs0x7f](https://github.com/cs0x7f)). Yue Zhang designed csTimer's original UI. Like csTimer, jlTimer is free software under the **GNU GPLv3** (see [LICENSE](LICENSE)). jlTimer is not affiliated with csTimer and does not operate csTimer's services.

jlTimer keeps csTimer's timing, scrambles, statistics, smart-cube and stackmat support, keyboard-controlled virtual cube, replay and data format. It adds:

- **jlTimer UI design** (default): csTimer's csTimer+ look with jlTimer's own outline icons, csTimer's first color scheme and LCD digits.
- **jlTimer dark** color preset and **jlTimer sans** timer font (fixed-width digits) as options.
- Visible keyboard focus rings.
- **Layout switch** (Familiar / Minimal, shortcut Alt+L). Minimal emphasizes the timer and the virtual cube.
- **Virtual cube size** setting (shortcuts Alt+= / Alt+- / Alt+0). It is independent of the timer size.
- Keyboard-focusable button bar.

All of the original designs, color schemes and fonts are still available. See [docs/UI.md](docs/UI.md).

## Quick start

```sh
# prerequisites: Java 11+, PHP 8 CLI, GNU make  (macOS: brew install php)
php -S localhost:8000 -t src      # development page with unminified sources
make check                        # Closure Compiler checks
make local                        # static site in dist/local (what GitHub Pages serves)
```

For details, subpath testing and deployment, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Data storage

Your data is stored in your browser for the site's origin. Settings go to `localStorage`. Solves go to IndexedDB (database name `cstimer`, kept for compatibility), or to `localStorage` if IndexedDB is unavailable. **Clearing site data deletes your solves.** Use *Export → Export to file* regularly.

jlTimer export files use the same format as csTimer's. Only the filename prefix differs (`jltimer_…txt`). To move your history from cstimer.net, see [docs/MIGRATION.md](docs/MIGRATION.md).

## Online services

Server backup, WCA and Google login, online competitions and battle rooms are **csTimer's services hosted at cstimer.net**. The UI still labels them "(csTimer)". These services might not work from jlTimer's domain, and their availability is not guaranteed. On static hosting, WCA login cannot work. See [docs/BACKEND.md](docs/BACKEND.md).

## Documentation

- [docs/UI.md](docs/UI.md): jlTimer UI options
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): local development, static build, GitHub Pages
- [docs/MIGRATION.md](docs/MIGRATION.md): moving data from cstimer.net
- [docs/BACKEND.md](docs/BACKEND.md): service dependency audit
- [docs/ROADMAP.md](docs/ROADMAP.md): future plans (not implemented)
- [docs/BACKUP_PLAN.md](docs/BACKUP_PLAN.md): planned cloud backup (Turso, Cloudflare Worker, cube-move login)

## Upstream csTimer

These belong to upstream csTimer, not jlTimer:

- csTimer versions: [cstimer.net](https://cstimer.net/) (released branch), [cstimer.net/new](https://cstimer.net/new/) and [cstimer.net/src](https://cstimer.net/src/) (master branch).
- Translations: [Crowdin project](https://crowdin.com/project/cstimer). jlTimer's language files come from upstream.
- The npm package [cstimer_module](https://www.npmjs.com/package/cstimer_module), built by `make module`.
- Issues with csTimer itself: <https://github.com/cs0x7f/cstimer/issues>.
