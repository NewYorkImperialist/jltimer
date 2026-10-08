# Moving your data from cstimer.net to jlTimer

Browsers store site data **per origin** (scheme + host + port). Solves you recorded at `https://cstimer.net` are not visible to jlTimer on any other domain, such as jlTimer's `https://timer.jaydenlin.net` or `localhost`. Use one address for your real data: `https://timer.jaydenlin.net`. Nothing transfers automatically, and opening jlTimer never reads or changes your cstimer.net data.

The supported path is csTimer's own **file export/import**. jlTimer kept that format unchanged.

## Steps

1. **On cstimer.net**: click **Export** (the second button in the button bar), then **Export to file**. This saves `cstimer_YYYYMMDD_hhmmss.txt`. Keep this file as your backup.
2. **On jlTimer**: **Export → Import from file**, then choose the cstimer.net file. An **import preview** lists each session (name, puzzle, solve count, date range) as it is now and as it is in the file, with totals and warnings. Choose **Replace all**, **Merge** or **Cancel** (see below). The page reloads with your data.
3. Check a few sessions: solve counts, a commented solve, a +2/DNF, and a virtual-cube solve's replay.

### Replace all, Merge, and the safety net

Before anything changes, jlTimer downloads your current data as `jltimer_backup_before_import_YYYYMMDD_HHMMSS.txt`, in the normal export format (skipped when you have no solves yet). It also keeps a copy for **Undo import** until you reload the page.

- **Replace all** is csTimer's import. `loadData` (`src/js/export.js`) clears `localStorage`, keeping the login and account keys (`wcaData`, `gglData`, `locData`, `devData`), and writes the file's `properties`. Then `storage.importAll` (`src/js/lib/storage.js`) clears the IndexedDB `sessions` store and writes the file's sessions. jlTimer keeps an uploaded background image across the import; csTimer drops it.
- **Merge** keeps everything you have and adds the file's solves. File session N goes into your session N when both exist and have the **same name**. Otherwise it is added as a new session after your last one, with its own name and options. In a matched session, a file solve is skipped when a solve with the same timestamp, raw time and scramble already exists, so a solve whose penalty or comment you changed is not duplicated, and your copy wins. Added solves are sorted into the session by timestamp. Your settings and session options stay; only fields your session entry lacks are taken from the file. csTimer has no fixed session limit (`sessionN` just grows), so merge adds one new session per unmatched non-empty file session and no more.
- After the reload, an **integrity check** recounts the solves per session in storage and compares them with what the import meant to write. It shows a one-line result, and if anything differs it offers Undo import.

Imports from the csTimer or Google servers show the same preview. *Import session(s) from other timers* still appends sessions without a preview. jlTimer cloud restore and sync don't use the preview: they call `loadData` directly, as before.

The import still reloads the page. The undo copy is kept in IndexedDB only across that reload and then in memory, so a later reload or closing the tab drops it. The downloaded backup file stays.

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
