# Moving your data from cstimer.net to jlTimer

Browsers store site data **per origin** (scheme + host + port). Solves you recorded at `https://cstimer.net` are not visible to jlTimer on any other domain, such as `https://<user>.github.io/jltimer/` or `localhost`. Nothing transfers automatically, and opening jlTimer never reads or changes your cstimer.net data.

The supported path is csTimer's own **file export/import**. jlTimer kept that format unchanged.

## Steps

1. **On cstimer.net**: click **Export** (the second button in the button bar), then **Export to file**. This saves `cstimer_YYYYMMDD_hhmmss.txt`. Keep this file as your backup.
2. **On jlTimer** (optional, if you already timed something there): **Export → Export to file**. This saves `jltimer_….txt`, because the next step replaces jlTimer's data.
3. **On jlTimer**: **Export → Import from file**, then choose the cstimer.net file. A confirmation dialog shows how many sessions will change and how many solves will be added or removed. **Confirm**, and the page reloads with your data.
4. Check a few sessions: solve counts, a commented solve, a +2/DNF, and a virtual-cube solve's replay.

### Import replaces data; it doesn't merge

`loadData` (`src/js/export.js:63`) works like this:

- If the file contains `properties`, it **clears `localStorage`**. Login tokens (`wcaData`, `gglData`) and account IDs (`locData`, `devData`) are kept. Then it writes the file's `properties`.
- Then `storage.importAll` (`src/js/lib/storage.js:169`) **clears the IndexedDB `sessions` store** and writes the sessions from the file. This also removes an uploaded background image.

So import **replaces** jlTimer's settings and solves with the file's contents. To combine timers instead, use *Import session(s) from other timers*. It appends sessions and also accepts csTimer files (`src/js/lib/tdconverter.js:47`).

## What the file contains

The export is JSON (`src/js/export.js`, `updateExpString`):

```jsonc
{
  "session1": [ /* solves */ ],
  "session2": [ ... ],            // one key per non-empty session
  "properties": {                 // all non-default settings
    "sessionData": "{\"1\":{\"name\":...,\"opt\":{...},\"rank\":1,...}}", // names, per-session options (e.g. scramble type), order, stats cache
    "sessionN": 15,
    "...": "every other changed option"
  }
}
```

Each solve is stored as (`src/js/stats/stats.js`, `push`):

```
[ [penalty, time, split…],  scramble,  comment,  timestamp,  [moves, puzzle, moveCount]? ]
```

- `penalty`: `0` = OK, `2000` = +2, `-1` = DNF. `time` and the splits are in milliseconds.
- `timestamp`: Unix seconds.
- The optional last element is the **recorded move history** of a virtual-cube or smart-cube solve. It holds the timed move string, the puzzle, and the move count, and is used by replay and reconstruction statistics.

This preserves sessions, session names and per-session options, all settings, comments, penalties, dates, scrambles, multi-phase splits and move histories.

## Server and Google backups

csTimer's "Import from server (csTimer)" with your csTimer ID calls `https://cstimer.net/userdata2.php` cross-origin. It may work from jlTimer, but this is **not guaranteed**: cstimer.net controls it. WCA-account and Google Drive backups need a login, and that login is tied to cstimer.net's registered redirect URIs, so expect it to fail from jlTimer's domain. Use files. See [BACKEND.md](BACKEND.md).

## Going back to csTimer

jlTimer's export files have the same format and can be imported on cstimer.net with *Import from file*. Only the file name prefix changed (`jltimer_` instead of `cstimer_`), and import ignores the file name.

jlTimer adds a few settings to the same `properties` object: `jlLayout`, `vrcSize`, `uidesign: "jl"` and `font: "jl"`. When csTimer imports them:

- `jlLayout` and `vrcSize` are ignored, since csTimer never registers them.
- `uidesign: "jl"` renders as the Normal design. The option selector shows a blank value.
- `font: "jl"` becomes the browser's default font for the timer digits. Pick a font in csTimer's options to fix it.
- Colors are safe. jlTimer's default colors are csTimer's defaults, and choosing the "jlTimer dark" preset applies that palette and then stores `manual`. jlTimer never stores a color preset that csTimer lacks. (An unknown preset such as `"9"` would make csTimer's `useColorTemplate` throw during start-up.) Colors that differ from csTimer's defaults travel in the export as normal `col-*` values.

Minimal layout hides the time list and tools through their normal button states. On csTimer, click those buttons to show the panels again.

Colors from csTimer: jlTimer's default colors are csTimer's own defaults (style1), so whatever scheme you used imports unchanged.

## Notes

- Your IndexedDB database is still named `cstimer`, and the storage keys are unchanged. This is deliberate, for compatibility.
- Browsers may evict site data under storage pressure. jlTimer, like csTimer, asks for persistent storage (`navigator.storage.persist()`), but exporting regularly is still the only real backup.
