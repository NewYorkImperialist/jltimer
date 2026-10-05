# jlTimer UI options

All jlTimer UI options live in the normal **Options** dialog (the first button in the button bar). They are saved like every other csTimer setting: as entries in `localStorage['properties']`, registered with `kernel.regProp`. **No new storage keys** were added. (`kernel.js` `cleanLocalStorage` deletes unknown `localStorage` keys anyway.) The options persist across reloads, travel in *Export to file*, and reset with *Options → Reset*.

| Option (Options section) | Values | jlTimer default | Stored as |
|---|---|---|---|
| UI design is (ui) | Normal, Material design, … , csTimer+, **jlTimer** | jlTimer | `uidesign: 'jl'` |
| select color theme (color) | manual, style1 … solarized light, **jlTimer** | manual, with the jlTimer palette as the default colors | `color: 'u'` plus `col-*` (choosing the jlTimer preset applies the palette and stores `u`, so exports stay readable by csTimer) |
| select timer's font (ui) | random, normal, digital1–5, Roboto, **jlTimer sans** | jlTimer sans | `font: 'jl'` |
| Layout (ui) | **Familiar**, **Minimal** | Familiar | `jlLayout: 'c' / 'm'` |
| Virtual cube size (virtual cube) | percentage | 100 | `vrcSize` |

Defaults changed only for UI design, the default manual colors and font. A value you already saved, or imported from csTimer, is kept.

## What each option does

- **jlTimer design** (`html.jlds`): the system interface font for panels and dialogs, roomier spacing, rounded panels and buttons, and visible keyboard focus rings (`:focus-visible`). Upstream's designs, including "csTimer+", are unchanged.
- **jlTimer color scheme**: a dark slate palette `#dde #223 #334 #445 #8bf #fff #46c #fb4` (text, background, panels, buttons, links, logo, logo background, PBs). It is built with the existing color-template system, so the *manual* color pickers and *import/export…* still work.
- **jlTimer sans**: your OS interface font with tabular (fixed-width) digits. The running time doesn't shift sideways.
- **Layout**
  - *Minimal* keeps the scramble and the timer (and the virtual cube, if you use one). Panel frames are removed, the time list and tools panels are hidden, and the button bar fades until you hover or focus it. Panels are hidden through their **normal button states**, so the list-times and tools buttons still open them at any time.
  - *Familiar* is the classic arrangement. Switching back shows the scramble and time list again.
  - Shortcut: **Alt+L**.
- **Virtual cube size**: scales the virtual cube, and the virtual view of a bluetooth cube, relative to the timer size. It doesn't change the size of the timer digits; *timer size* still controls those. Shortcuts: **Alt+=** larger, **Alt+-** smaller, **Alt+0** back to 100%.

The shortcuts work only while the timer is idle, with no dialog open and no focus in a text field. That way they never reach the cube or the timer mid-solve. They follow the existing *use keyboard shortcut* option.

## Keyboard access

The button bar buttons can be focused with Tab, and **Enter** or **Space** activates the focused button. Mouse and touch presses don't focus them, so after a click Space still starts the timer as before. To leave the button bar, press Esc or click the timer area. Tab no longer gets cancelled by the timer's blur-on-key behavior; the Tab key is still passed to the timer, so it still stops a running solve like any other key. Text inputs, selects and dialogs keep csTimer's existing rule: keys typed there never reach the timer or the virtual cube.

## Getting the classic csTimer look back

Set UI design to **Normal**, color theme to **style1**, font to **digital1**, and Layout to **Familiar**. These changes are saved like any other setting. The virtual cube size of 100% matches csTimer.
