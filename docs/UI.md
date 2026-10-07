# jlTimer UI options

All jlTimer UI options live in the normal **Options** dialog (the first button in the button bar). They are saved like every other csTimer setting: as entries in `localStorage['properties']`, registered with `kernel.regProp`. **No new storage keys** were added. (`kernel.js` `cleanLocalStorage` deletes unknown `localStorage` keys anyway.) The options persist across reloads, travel in *Export to file*, and reset with *Options → Reset*.

| Option (Options section) | Values | jlTimer default | Stored as |
|---|---|---|---|
| UI design is (ui) | Normal, Material design, … , csTimer+, **jlTimer** | jlTimer | `uidesign: 'jl'` |
| select color theme (color) | manual, style1 … solarized light, **jlTimer dark** | style1, the first scheme in About → Color schemes (same as csTimer) | `color: '1'` plus `col-*` (choosing the jlTimer dark preset applies its palette and stores `u`, so exports stay readable by csTimer) |
| select timer's font (ui) | random, normal, digital1–5, Roboto, **jlTimer sans** | digital1 (csTimer's LCD font) | `font: 'lcd'` / `'jl'` |
| Layout (ui) | **Familiar**, **Minimal** | Familiar | `jlLayout: 'c' / 'm'` |
| Virtual cube size (virtual cube) | percentage | 100 | `vrcSize` |

The defaults reproduce the csTimer+ design with csTimer's first color scheme and LCD digits. Colors and fonts use csTimer's own defaults, so an imported csTimer setup looks the same as on cstimer.net. A value you already saved, or imported from csTimer, is kept.

## Timer defaults

jlTimer also changes these csTimer defaults:

| Option | csTimer default | jlTimer default | Stored as |
|---|---|---|---|
| entering in times with | timer | **virtual** | `input: 'v'` |
| timer update is | 0.1s | **none** | `timeU: 'n'` |
| use WCA inspection | Never | Never (unchanged) | `useIns: 'n'` |
| VRC base speed (tps) | 10 | **20** | `vrcSpeed: 50` |
| multi-phase (virtual cube) | None | **CFOP** | `vrcMP: 'cfop'` |
| Show phase splits while solving (new, timer section) | always shown | **off**: splits appear when the solve ends | `mpLive: false` |
| Record DNF when a solve is cancelled with Esc (new, timer section) | always records a DNF | **off**: Esc mid-solve discards the attempt, shows the previous result and loads the next scramble | `escDNF: false` |

As with the other defaults, anything you have saved, or imported from csTimer, overrides these. Settings equal to jlTimer's defaults aren't stored, so if you export to csTimer, those settings fall back to csTimer's defaults there.

## What each option does

- **jlTimer design** (`html.cspt.jlds`): csTimer's built-in csTimer+ design (borderless panels, system font, spaced scramble, wide button bar) plus jlTimer's own outline icons for the button bar and the scramble-options gear. jlTimer-specific styling goes in the `.jlds` rules in `src/css/style.css`, so upstream's csTimer+ CSS stays untouched. Choosing "csTimer+" gives the upstream design with the filled icon font.
- **Colors**: the default is csTimer's style1 `#000 #efc #fdd #fbb #00f #ff0 #000` (text, background, panels, buttons, links, logo, logo background), the first scheme in About → Color schemes. The **jlTimer dark** preset applies a dark slate palette `#dde #223 #334 #445 #8bf #fff #46c #fb4`. Both use the existing color-template system, so the *manual* color pickers, *import/export…* and the About color list still work.
- **jlTimer sans** (optional timer font): your OS interface font with tabular (fixed-width) digits. The running time doesn't shift sideways.
- **Layout**
  - *Minimal* keeps the scramble and the timer (and the virtual cube, if you use one). Panel frames are removed, the time list and tools panels are hidden, and the button bar fades until you hover or focus it. Panels are hidden through their **normal button states**, so the list-times and tools buttons still open them at any time.
  - *Familiar* is the classic arrangement. Switching back shows the scramble and time list again.
  - Shortcut: **Alt+L**.
- **Virtual cube size**: scales the virtual cube, and the virtual view of a bluetooth cube, relative to the timer size. It doesn't change the size of the timer digits; *timer size* still controls those. Shortcuts: **Alt+=** larger, **Alt+-** smaller, **Alt+0** back to 100%.

The shortcuts work only while the timer is idle, with no dialog open and no focus in a text field. That way they never reach the cube or the timer mid-solve. They follow the existing *use keyboard shortcut* option.

## Editing the virtual cube keys

About (click the logo) → **Virtual cube key map** tab. Click a key in the table and choose the move it should do from the menu that appears in that key. Several keys can do the same move. **none** turns a key off, and **default** restores its original move. Changed keys are underlined. **Reset keys** restores every key. The layout picker (qwerty, dvorak, colemak or a custom layout string) still decides which physical key sits in each position.

jlTimer's default key map differs from csTimer's in one key: **`,` does M** (csTimer: Uw). The choices are stored in the `vrcKeyMove` setting (`{physicalKeyCode: qwertyKeyCodeOfMove}`, with `-1` for "none", inside `properties`). They apply to every virtual puzzle, because all of them read keys through `help.getMappedCode`. The move names in the table are the 3x3 moves; on other puzzles a key does whatever that key position does there.

## Live TPS

Options → virtual cube → **Show live TPS** (off by default) shows how fast you are turning during a timed virtual solve, like WPM for typing: turn inputs (not cube rotations) per second over a short rolling window (**Live TPS window**: 0.25, 0.5 (default), 1 or 2 s), measured from when each key is pressed, not from the turn animation. It appears small, right above the "solve" text, while the timer runs and drops to 0 when nothing was pressed within the window. The solve's average TPS is still shown with the result as before.

## PLL stats

Tools → **Reconstruct → PLL stats** (next to *cases*) shows how fast each PLL is midsolve. Every finished 3x3 solve with a move record (virtual cube or smart cube, DNFs excluded) is split into CFOP steps by csTimer's reconstruction (`recons.calcRecons`, `cf4op`) and its PLL case is identified (`cubeutil` case tables, any AUF). Nothing extra is stored: it is computed from the saved solves each time. The tools panel shows a short table (case, N, mean, TPS) and **full table** opens a dialog with every column: N, share, mean, recognition (pause from the last OLL turn to the first PLL turn), execution (first to last PLL turn, AUFs included), execution TPS, turns, best and the mean of the last 5/12/25/50 solves of the case. Click a header to sort. The scope is this session or all sessions. The 3 slowest cases by mean are tagged #1-#3. A PLL skip (also one that needed only an AUF, which then stays in the OLL step) is its own row, counted in N and share but not in the times. **CSV** downloads one row per solve. Code: `js/stats/algstat.js`; its `STEPS` table is where OLL/COLL/ZBLL can be added.

## Move effects

Options → virtual cube → **Move effect** adds an arcade-style flourish whenever a layer of the virtual cube turns (default **None**). There are 12: Arcade Combo, Comet Orbit, Fever Mode, RGB Glitch, Ink Splash, Lightning, Neon Trail, Zen Ripple, Crystal Shards, Shockwave, Blade Slash and Spark Burst. Each also has a finale when a timed solve ends. They draw on a transparent canvas over the cube that ignores the mouse, they stay on the face edges or outside the cube so stickers remain readable, and they shrink to a short outline flash when the system asks for reduced motion. The moves of a scramble don't trigger them.

The layer highlights draw on the layer that turned instead of around the cube, chess.com style: the layer's stickers get a glowing rim and a trail slides along the layer in the turn direction. There are 7: Teal Glow (chess.com style), Squiggle Trail, Tron Lightcycle, Synthwave Sweep, Motion Streaks, 8-Bit Trail and Neon Pulse. Fills over stickers stay faint and fade within about 250 ms so colours stay readable. A v1 and a v2 effect can run together. v2 effects use `api.layer(ev)` (the turning slab's strips, cap and belt path) and register with `v2: true`.

All styles are in one list, **Move effect** (Column Glow first, then the layer highlights, then the original effects; older separate v2/v3 choices are carried over). Column Glow: the whole visible part of the turning layer glows see-through blue while it turns (driven by the turn's live progress). **Column Glow hold** keeps it lit after the layer lands (turn only, 200 ms fade, 400 ms fade or until the next move) and **Column Glow strength** picks normal, strong or bright. The hold times are real time.

**Effect duration** (1x, 1.5x default, 2x, 3x) slows every v1 and v2 effect evenly so they stay visible at fast turn speeds; effects read time through `jlFx.now()` and the `t`/`dt` passed to `api.add`.

The framework is `src/js/fx.js` (API documented at the top of that file). Each effect is one file in `src/js/fx/`, concatenated into the separate async bundle `js/jlfx.js`.

## Keyboard access

The button bar buttons can be focused with Tab, and **Enter** or **Space** activates the focused button. Mouse and touch presses don't focus them, so after a click Space still starts the timer as before. To leave the button bar, press Esc or click the timer area. Tab no longer gets cancelled by the timer's blur-on-key behavior; the Tab key is still passed to the timer, so it still stops a running solve like any other key. Text inputs, selects and dialogs keep csTimer's existing rule: keys typed there never reach the timer or the virtual cube.

## Getting the classic csTimer look back

For the classic (pre-csTimer+) look, set UI design to **Normal** and Layout to **Familiar**. These changes are saved like any other setting. The virtual cube size of 100% matches csTimer.
