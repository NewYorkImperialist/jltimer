"use strict";

// jlTimer UI look (draft) "Tonal": Material You / Material 3 inspired. Large rounded containers, tonal state
// layers mixed from the inherited (palette) colors, pill buttons, chips, a navigation-rail button bar and an
// M3 full dialog with a side rail for Options. Every color is derived from the kernel/theme palette.
(function() {
	var H = 'html.jls-tonal';
	var D = H + '.cspt:not(.m)'; // desktop geometry (csTimer+ / jlTimer designs)
	var M = H + '.m'; // phone / portrait layout
	var ROUND = '"SF Pro Rounded", ui-rounded, "Nunito", "Quicksand", "Varela Round", "Arial Rounded MT Bold", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
	var TEXT = 'ui-rounded, "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
	// tonal layers: currentColor (the palette font color) mixed into the theme's own surface
	function tone(p) {
		return 'linear-gradient(color-mix(in srgb, currentColor ' + p + '%, transparent), color-mix(in srgb, currentColor ' + p + '%, transparent))';
	}
	function line(p) {
		return 'color-mix(in srgb, currentColor ' + p + '%, transparent)';
	}
	var CHEVRON = 'linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)';

	jlSkins.register({ id: 'tonal', name: 'Tonal', css: [
		/* ---------- type ---------- */
		H + ' .mywindow, ' + H + ' #leftbar > div, ' + H + ' .dialog, ' + H + ' .popup { font-family: ' + TEXT + ' !important; font-weight: 500; }',
		H + ' #leftbar #logo, ' + H + ' .dialog .title, ' + H + ' .tab, ' + H + ' #avgstr, ' + H + ' select, ' + H + ' input[type="button"]:not(.icon),' +
			H + ' #leftbar > div:not(#logo) > div > span:not(.icon), ' + H + ' table.opttable th, ' + H + ' #stats th { font-family: ' + ROUND + ' !important; }',

		/* ---------- containers: big radius, soft M3 elevation, hairline outline ---------- */
		H + ' .mywindow:not(.fixed), ' + H + ' #leftbar { border-radius: 28px !important; }',
		H + ' .mywindow:not(.fixed)::before, ' + H + ' #leftbar::before { border-radius: 28px !important; }',
		H + ':not(.jlmin) .mywindow:not(.fixed), ' + H + ':not(.jlmin) #leftbar { border: 1px solid ' + line(10) + ' !important; background-image: ' + tone(3) + '; }',
		H + ':not(.jlmin) .mywindow:not(.fixed)::before, ' + H + ':not(.jlmin) #leftbar::before, ' + H + '.jlt-on:not(.jlmin) .mywindow::before, ' + H + '.jlt-on:not(.jlmin) #leftbar::before { box-shadow: 0 1px 2px rgba(0,0,0,.10), 0 4px 14px rgba(0,0,0,.08) !important; }',
		H + ' .mywindow > .chide { width: 14px; height: 14px; top: 10px; left: 10px; border-radius: 50%; background-color: ' + line(16) + ' !important; }',
		H + '.m .mywindow > .chide { width: 1.4rem; height: 1.4rem; }',

		/* ---------- desktop geometry: floating containers with 12px gutters ---------- */
		D + ' #leftbar { left: 12px; top: 12px; width: calc(17.2rem - 18px); height: calc(13.5rem - 12px); }',
		D + ' #scrambleDiv { left: calc(17.2rem + 6px); top: 12px; right: 12px; padding: 14px 20px 10px; }',
		D + ' #stats { left: 12px; top: calc(13.5rem + 12px); bottom: 12px; padding: 16px 14px 12px; }',
		D + ' #toolsDiv { right: 12px; bottom: 12px; padding: 14px 18px; }',

		/* ---------- navigation rail (left icon bar) ---------- */
		H + ' #leftbar > div.mybutton { border: 6px solid transparent !important; background-clip: padding-box; border-radius: 999px; box-shadow: none; transition: background-color .15s; }',
		H + ' #leftbar > div.mybutton:not(#logo) { background-color: transparent; }',
		H + ' #leftbar > div.mybutton.enable:not(#logo) { background-color: ' + line(12) + '; }',
		H + ' #leftbar > div.mybutton.enable:not(#logo) .icon::before { transform: scale(1.04); }',
		H + ':not(.m) #leftbar > div.mybutton:not(#logo):hover { background-color: ' + line(9) + ' !important; }',
		H + ':not(.m) #leftbar > div.mybutton.enable:not(#logo):hover { background-color: ' + line(17) + ' !important; }',
		H + ' #leftbar > div.mybutton:not(#logo):active { background-color: ' + line(20) + ' !important; }',
		H + '.jlds #leftbar .mybutton .icon::before { width: 1.75rem; height: 1.75rem; }',
		H + '.m.jlds #leftbar .mybutton .icon::before { width: 1.55rem; height: 1.55rem; }',
		H + ' #leftbar > div:not(#logo) > div > span:not(.icon) { font-size: 13px; font-weight: 700; letter-spacing: .02em; text-transform: capitalize; }',
		/* logo as an extended FAB in the palette's logo colors */
		H + ' #leftbar #logo { border: 0 !important; border-radius: 22px; font-weight: 700; letter-spacing: -.01em; box-shadow: 0 1px 3px rgba(0,0,0,.16), 0 4px 10px rgba(0,0,0,.10) !important; }',
		H + '.jlds #leftbar #logo { font-size: 2.55em; font-weight: 700; }',
		D + ' #leftbar #logo { left: 12px; width: calc(100% - 24px); top: calc(33.3333% + 4px); height: calc(33.3333% - 8px); }',
		H + ':not(.m) #leftbar #logo:hover { filter: brightness(1.06); }',

		/* ---------- buttons: pills, filled-tonal by default ---------- */
		H + ' input[type="button"] { border-radius: 999px !important; border: 0 !important; padding: 7px 16px; font-weight: 700; font-size: 0.92em; letter-spacing: .02em; background-image: ' + tone(10) + ' !important; cursor: pointer; }',
		H + ':not(.m) input[type="button"]:not(:disabled):hover { background-image: ' + tone(16) + ' !important; }',
		H + ' input[type="button"]:not(:disabled):active { background-image: ' + tone(22) + ' !important; }',
		H + ' input[type="button"].icon { padding: 7px 10px; font-size: 1em; }',
		H + ' #stats > div:first-child input[type="button"] { min-width: 34px; padding: 6px 12px; }',

		/* ---------- inputs and selects: M3 outlined fields; scramble selects as chips ---------- */
		H + ' input[type="text"], ' + H + ' select { border-radius: 12px !important; border: 1px solid ' + line(28) + ' !important; padding: 6px 12px; font-weight: 600; }',
		H + ' select { -webkit-appearance: none; appearance: none; padding-right: 30px !important; background-image: ' + CHEVRON + ' !important; background-repeat: no-repeat !important; background-size: 5px 5px, 5px 5px !important; background-position: calc(100% - 17px) 55%, calc(100% - 12px) 55% !important; cursor: pointer; }',
		H + ' select:hover { border-color: ' + line(55) + ' !important; }',
		H + ' input[type="text"]:focus, ' + H + ' select:focus { border-color: currentColor !important; outline: none; box-shadow: 0 0 0 1px currentColor; }',
		H + ' #scrambleDiv .title select { border-radius: 8px !important; height: 32px; padding: 0 30px 0 14px; font-size: 14px; font-weight: 700; letter-spacing: .01em; }',
		H + ' #scrambleDiv .title select.twolv1 { background-image: ' + CHEVRON + ', ' + tone(9) + ' !important; background-size: 5px 5px, 5px 5px, 100% 100% !important; background-position: calc(100% - 17px) 55%, calc(100% - 12px) 55%, 0 0 !important; border-color: transparent !important; }',
		H + ' #scrambleDiv .title { font-family: ' + ROUND + '; font-size: 14px; font-weight: 600; }',
		H + ' #scrambleDiv .title > nobr > span { padding: 3px 4px; border-radius: 8px; }',
		H + ' #scrambleDiv .title input.icon { height: 32px; padding: 0 10px; border-radius: 10px !important; }',
		H + ' #scrambleTxt { font-weight: 600; letter-spacing: .3rem; }',

		/* ---------- clickable text: rounded state layers ---------- */
		H + ' .click { border-radius: 8px; }',
		H + ':not(.m) .click:hover, ' + H + ':not(.m) .times:hover { background-color: ' + line(9) + ' !important; }',

		/* ---------- timer area ---------- */
		H + ' #avgstr { font-weight: 700; line-height: 1.6; }',
		H + ' #avgstr > span { padding: 0 .5em; margin: .06em 0; border-radius: 999px; }',
		H + ':not(.jlmin) #avgstr > span { background-image: ' + tone(5) + '; }',
		H + ':not(.jlmin) #container > #avgstr > span { background-image: ' + tone(4) + '; }',
		H + ':not(.m) #avgstr .click:hover { background-color: ' + line(10) + ' !important; }',

		/* ---------- statistics panel ---------- */
		H + ' #stats > div:first-child { display: flex; align-items: center; justify-content: center; gap: 4px; }',
		H + ' #stats > div:first-child > span.click { font-family: ' + ROUND + '; font-weight: 700; padding: 4px 8px; }',
		H + ' #stats > div:first-child select { max-width: 7.5em; }',
		H + ' .table, ' + H + ' .table td, ' + H + ' .table th { border-color: transparent !important; }',
		H + ' #stats .table { border-collapse: separate; border-spacing: 0; }',
		H + ' #stats .table td, ' + H + ' #stats .table th { padding: 7px 8px; }',
		H + ' #stats table.sumtable { border-radius: 18px; background-image: ' + tone(6) + '; padding: 4px 2px; }',
		H + ' #stats .stattl .table { border-radius: 18px; overflow: hidden; }',
		H + ' #stats .stattl .table tr + tr + tr td, ' + H + ' #stats .stattl .table tr + tr + tr th { border-top: 1px solid ' + line(8) + ' !important; }',
		H + ' #stats .stattl .table tr:nth-child(2) th { background-image: ' + tone(8) + '; font-weight: 700; border-radius: 0; }',
		H + ' #stats .stattl .table tr:nth-child(2) th:first-child { border-radius: 999px 0 0 999px; }',
		H + ' #stats .stattl .table tr:nth-child(2) th:last-child { border-radius: 0 999px 999px 0; }',
		H + ' #stats .stattl .table tr:first-child th { font-weight: 700; padding-bottom: 10px; }',
		H + ' #stats .times.pb { font-weight: 800; }',
		H + ' .statc { margin-top: 12px; }',
		H + ' .stattl { margin-top: 10px; }',

		/* ---------- dialogs and popups: M3 full dialog ---------- */
		H + ' .dialog, ' + H + ' .popup { border-radius: 28px !important; border: 0 !important; padding: 18px 20px 14px; box-shadow: 0 2px 6px rgba(0,0,0,.14), 0 12px 36px rgba(0,0,0,.18) !important; background-image: ' + tone(4) + '; }',
		H + ' .dialog .title { font-size: 24px; font-weight: 700; text-align: left; padding: 2px 8px 12px 44px; letter-spacing: -.01em; text-transform: capitalize; }',
		H + ' .dialog .title > .click { top: 14px; left: 18px !important; width: 30px; height: 30px; line-height: 30px; text-align: center; border-radius: 50%; font-size: 18px; }',
		H + ' .dialog .button { text-align: right; padding-top: 10px; }',
		H + ' .dialog .button input.buttonOK { min-width: 76px; margin: 0 0 0 8px; padding: 9px 20px; background-image: none !important; border: 1px solid ' + line(35) + ' !important; background-color: transparent !important; }',
		H + ':not(.m) .dialog .button input.buttonOK:hover { background-color: ' + line(8) + ' !important; }',
		H + ' .dialog .button input.buttonOK:first-child { border-color: transparent !important; background-color: ' + line(16) + ' !important; }',
		H + ':not(.m) .dialog .button input.buttonOK:first-child:hover { background-color: ' + line(24) + ' !important; }',
		H + ' #gray { background-color: rgba(0,0,0,.32) !important; }',

		/* options: side navigation rail + tonal cards */
		H + ' .dialog table.options > tbody > tr > td:first-child { padding: 8px 6px; vertical-align: top; border-radius: 22px; background-image: ' + tone(5) + '; }',
		H + ' .options .tab { display: block; margin: 0 0 6px; padding: 4px 4px 6px; border: 0 !important; border-radius: 16px; font-size: 12px; font-weight: 700; text-align: center; text-transform: capitalize; background-color: transparent !important; line-height: 1.2; white-space: normal; }',
		H + ':not(.m) .options .tab > .icon { display: block; width: 56px; height: 32px; line-height: 32px; margin: 0 auto 4px; border-radius: 999px; font-size: 18px !important; text-align: center; transition: background-color .15s; }',
		H + ':not(.m) .options .tab > span:not(.icon) { display: block; }',
		H + ':not(.m) .options .tab:not(.enable):hover > .icon { background-color: ' + line(9) + '; }',
		H + ':not(.m) .options .tab.enable > .icon { background-color: ' + line(16) + '; }',
		H + ':not(.m) .options .tab.enable > span:not(.icon) { font-weight: 800; }',
		H + '.m .options .tab.enable { background-color: ' + line(16) + ' !important; }',
		H + '.m .options .tab:not(.enable):hover { background-color: ' + line(8) + ' !important; }',
		H + ' .dialog td.tabValue { padding-left: 12px; border-color: transparent !important; }',
		H + ' table.opttable { border-collapse: separate; border-spacing: 0 3px; margin: 0; }',
		H + ' table.opttable td, ' + H + '.jlt-on table.opttable tr:nth-child(odd) td:first-child { padding: 10px 14px; border-color: transparent !important; background: ' + tone(4) + ' !important; }',
		H + ' table.opttable tr td:first-child { border-radius: 16px 0 0 16px; }',
		H + ' table.opttable tr td:last-child { border-radius: 0 16px 16px 0; }',
		H + ' table.opttable tr td:first-child:last-child { border-radius: 16px; }',
		H + ' table.opttable tr th, ' + H + '.jlt-on table.opttable tr th:first-child { padding: 18px 14px 8px !important; background: transparent !important; border-radius: 0 !important; font-size: 1.05em; font-weight: 700; text-align: left; }',
		H + ' table.opttable tr th.sr { text-align: right; font-size: 0.85em; font-weight: 600; opacity: .75; }',
		H + ' table.opttable tr:first-child th { padding-top: 6px !important; }',
		H + ' .opttable td.sr { border-left: 0 !important; }',
		H + ' .dialog input[type="checkbox"] { accent-color: currentColor; width: 18px; height: 18px; margin: 0 10px 0 0; vertical-align: -4px; }',
		H + ' .dialog .opthelp { opacity: .7; }',
		H + ' .dialog td.sr input[type="checkbox"] { margin: 0; }',
		H + ' .dialog label { cursor: pointer; }',

		/* ---------- phone / portrait: bottom navigation bar ---------- */
		M + ' #leftbar { border-radius: 28px 28px 0 0 !important; border-bottom: 0 !important; }',
		M + ' #leftbar::before { border-radius: 28px 28px 0 0 !important; }',
		M + ' #leftbar > div.mybutton { border-width: 0.9vw !important; }',
		M + ' #leftbar #logo { top: 1.4vw; height: calc(100% - 2.8vw); border-radius: 999px; }',
		M + '.jlds #leftbar #logo { font-size: 2.6em; }',
		M + ' #stats { border-radius: 28px 28px 0 0 !important; bottom: calc(11.8vw + 6px); padding: 12px 10px 6px; }',
		M + ' #stats::before { border-radius: 28px 28px 0 0 !important; }',
		M + ' #scrambleDiv { border-radius: 0 0 28px 28px !important; padding: 10px 14px 6px; }',
		M + ' #scrambleDiv::before { border-radius: 0 0 28px 28px !important; }',
		M + ' #stats table.sumtable, ' + M + ' #stats .stattl .table { border-radius: 14px; }',
		M + ' #stats .table td, ' + M + ' #stats .table th { padding: 5px 6px; }',
		M + ' .dialog { padding: 14px 8px 10px; }',
		M + ' table.opttable tr th, ' + M + '.jlt-on table.opttable tr th:first-child { padding: 14px 6px 6px 8px !important; }',
		M + ' table.opttable tr th:first-child { white-space: normal; overflow-wrap: anywhere; }',
		M + ' table.opttable tr th.sr { font-size: .75em; padding-left: 2px !important; }',
		M + ' .dialog table.options > tbody > tr > td:first-child { padding: 6px 3px; }',
		M + ' table.opttable td.sr { padding: 8px 6px 8px 2px !important; }',
		M + ' .options .tab { padding: 7px 3px; text-align: center; font-size: 13px; }',
		M + ' .dialog td.tabValue { padding-left: 2px; }',
		M + ' .dialog input[type="checkbox"] { margin-right: 6px; }',
		M + ' table.opttable td, ' + M + '.jlt-on table.opttable tr:nth-child(odd) td:first-child { padding: 8px 6px 8px 8px; }'
	].join('\n') });
})();
