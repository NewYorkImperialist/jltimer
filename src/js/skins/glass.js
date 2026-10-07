"use strict";
// "Glass" UI look (draft): frosted floating panels in the style of macOS Sonoma / visionOS.
// Panels keep the theme's (or kernel palette's) translucent fill and get a light sheen, a hairline light
// border, a generous radius and soft layered shadows; neutral tints are mixed from currentColor so light
// and dark palettes both work.
(function() {
	var H = 'html.jls-glass';
	var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
	// reusable values
	var HAIR = 'rgba(255,255,255,0.42)'; // hairline light border
	var SHEEN = 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05) 40%, rgba(255,255,255,0) 100%)';
	var SHADOW = 'inset 0 1px 0 rgba(255,255,255,0.45), 0 0 0 0.5px rgba(0,0,0,0.06), 0 0.15rem 0.45rem rgba(0,0,0,0.06), 0 0.8rem 2.4rem rgba(0,0,0,0.12)';
	var SHADOW_BIG = 'inset 0 1px 0 rgba(255,255,255,0.5), 0 0 0 0.5px rgba(0,0,0,0.08), 0 0.3rem 0.8rem rgba(0,0,0,0.08), 0 1.6rem 4.5rem rgba(0,0,0,0.22)';
	var TINT = function(p) { return 'color-mix(in srgb, currentColor ' + p + '%, transparent)'; };
	var GAP = '0.75rem';
	var R = '1.25rem'; // panel radius (~20px at 100% zoom)

	var css = [
		// ---------- type ----------
		H + ', ' + H + ' body { font-family: ' + FONT + '; -webkit-font-smoothing: antialiased; }',
		H + ' #leftbar > div, ' + H + ' .tab, ' + H + ' .dialog .title, ' + H + ' #timer .difflabel, ' + H + ' #rtimer .difflabel { font-family: ' + FONT + ' !important; }',
		H + ' input[type="checkbox"], ' + H + ' input[type="radio"] { accent-color: currentColor; }',

		// ---------- shared glass surface ----------
		H + ' #leftbar, ' + H + ':not(.jlmin) .mywindow:not(.fixed), ' + H + ' .dialog, ' + H + ' .popup {' +
			' border: 1px solid ' + HAIR + ' !important; background-image: ' + SHEEN + ';' +
			' box-shadow: ' + SHADOW + ' !important; }',
		H + '.jlt-on #leftbar, ' + H + '.jlt-on:not(.jlmin) .mywindow:not(.fixed) {' +
			' -webkit-backdrop-filter: blur(22px) saturate(1.5); backdrop-filter: blur(22px) saturate(1.5); }',
		// the old shadow layers would draw square corners behind the rounded panels
		H + ' #leftbar::before, ' + H + ' .mywindow::before { border-radius: inherit !important; box-shadow: none !important; margin: -1px !important; }',

		// ---------- left bar: floating rounded card ----------
		H + ':not(.m) #leftbar { left: ' + GAP + '; top: ' + GAP + '; width: 15.7rem; height: 12rem; border-radius: ' + R + ' !important; padding: 0; }',
		H + ' #leftbar > div.mybutton { border: 0.3rem solid transparent !important; background-clip: padding-box !important; border-radius: 1rem !important; transition: background-color 0.15s; }',
		H + ' #leftbar > div.mybutton.enable { box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 0 0 1px ' + TINT(6) + '; }',
		H + ':not(.m) #leftbar > div.mybutton:hover { background-color: ' + TINT(9) + ' !important; }',
		H + ' #leftbar .mybutton .icon::before { width: 2rem !important; height: 2rem !important; opacity: 0.88; }',
		H + ' #leftbar > div:not(#logo) > div > span:not(.icon) { font-size: 0.82rem; font-weight: 600; letter-spacing: 0.04em; }',
		H + ' #leftbar > #logo.mybutton { border-width: 0.3rem 0.55rem !important; background-clip: padding-box !important; border-radius: 1.05rem !important; font-size: 2.35rem;' +
			' font-weight: 700; letter-spacing: -0.03em; box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.08) !important;' +
			' background-image: linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0) 60%); }',
		H + ' #leftbar > #logo.mybutton > div > span { font-family: ' + FONT + ' !important; }',

		// ---------- floating panels ----------
		H + ' .mywindow:not(.fixed) { border-radius: ' + R + ' !important; }',
		H + ':not(.m) #scrambleDiv { top: ' + GAP + '; right: ' + GAP + '; left: 17.2rem; padding: 0.9rem 1.1rem 0.8rem; }',
		H + ':not(.m) #stats { left: ' + GAP + '; top: 13.5rem; bottom: ' + GAP + '; padding: 0.9rem 0.85rem; }',
		H + ':not(.m) #toolsDiv { right: ' + GAP + '; bottom: ' + GAP + '; }',
		H + ' .mywindow > .chide { width: 0.7rem; height: 0.7rem; top: 0.55rem; left: 0.55rem; border-radius: 50% !important; background-color: ' + TINT(20) + ' !important; z-index: 2; }',
		H + ' .mywindow > .chide:hover { background-color: ' + TINT(40) + ' !important; }',
		H + '.m .mywindow > .chide { width: 1rem; height: 1rem; }',

		// ---------- scramble ----------
		H + ' #scrambleDiv > .title { margin-bottom: 0.35em; }',
		H + ' #scrambleTxt { letter-spacing: 0.22rem; font-weight: 500; line-height: 1.35; }',

		// ---------- controls: pills ----------
		H + ' select, ' + H + ' input[type="button"], ' + H + ' input[type="text"] { border-radius: 999px !important; border: 0 !important;' +
			' box-shadow: inset 0 0 0 1px ' + TINT(12) + ', 0 1px 2px rgba(0,0,0,0.06); padding: 0.32rem 0.85rem; }',
		H + ' select, ' + H + ' input[type="button"]:not(.icon), ' + H + ' input[type="text"] { font-family: ' + FONT + '; }',
		H + ' input[type="button"] { font-weight: 600; cursor: pointer; transition: filter 0.15s; }',
		H + ' input[type="button"]:hover { filter: brightness(1.04) saturate(1.1); box-shadow: inset 0 0 0 1px ' + TINT(22) + ', 0 2px 6px rgba(0,0,0,0.1); }',
		H + ' input.icon[type="button"] { padding: 0.32rem 0.6rem; }',
		H + ' textarea { border-radius: 0.8rem !important; }',

		// ---------- stats ----------
		H + ' #stats > div:first-child { margin-bottom: 0.15rem; }',
		H + ' #stats .table, ' + H + ' #stats .table td, ' + H + ' #stats .table th { border: 0 !important; }',
		H + ' #stats table.table { border-collapse: separate; border-spacing: 0; padding: 0 !important; }',
		H + ' #stats .table td, ' + H + ' #stats .table th { border-bottom: 1px solid ' + TINT(9) + ' !important; padding: 0.42rem 0.55rem; font-variant-numeric: tabular-nums; }',
		H + ' #stats .table td, ' + H + ' #stats .table th { border-radius: 0 !important; }',
		H + ' #stats .table tr:last-child td { border-bottom: 0 !important; }',
		H + ' #stats .table th { font-weight: 600; font-size: 0.86em; letter-spacing: 0.02em; }',
		H + ' #stats .stattl table.table { width: 100%; }',
		H + ' #stats table.sumtable td, ' + H + ' #stats table.sumtable th { padding: 0.4rem 0.45rem; }',
		H + ' #stats table.sumtable { background-color: ' + TINT(5) + '; border-radius: 0.9rem; overflow: hidden; box-shadow: inset 0 0 0 1px ' + TINT(7) + '; }',
		H + ' #stats .stattl table.table { background-color: ' + TINT(3) + '; border-radius: 0.9rem; overflow: hidden; box-shadow: inset 0 0 0 1px ' + TINT(7) + '; }',
		H + ' .times { border-radius: 0.4rem; }',
		H + ' .statc { margin-top: 0.7rem; }',

		// ---------- timer area ----------
		H + ' #avgstr { font-variant-numeric: tabular-nums; font-weight: 500; }',
		H + ' #container > #avgstr > span, ' + H + ' #multiphase > #avgstr > span { padding: 0 0.55em; border-radius: 999px; }',
		H + ' #timer .difflabel, ' + H + ' #rtimer .difflabel { font-weight: 600; }',

		// ---------- dialogs and popups ----------
		H + ' .dialog, ' + H + ' .popup { border-radius: 1.5rem !important; box-shadow: ' + SHADOW_BIG + ' !important; padding: 0.9rem 1rem; }',
		H + '.jlt-on .dialog, ' + H + '.jlt-on .popup { -webkit-backdrop-filter: blur(28px) saturate(1.6); backdrop-filter: blur(28px) saturate(1.6); }',
		H + ' .dialog .title { font-size: 1.15em; font-weight: 700; letter-spacing: 0.01em; padding: 0.15em 0 0.55em; }',
		H + ' .dialog .title > .click { border-radius: 0.5rem; }',
		H + ' .dialog .button input[type="button"] { margin: 0 0.25rem; padding: 0.42rem 1.2rem; }',
		H + ' .dialog .button input.buttonOK { font-size: 1em; }',
		H + ' #gray { -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }',

		// options: segmented-control tab column
		H + ' .options > tbody > tr > td:first-child { padding: 0.3rem; background-color: ' + TINT(6) + '; border-radius: 1.1rem; vertical-align: top; border-right: 0.5rem solid transparent; background-clip: padding-box;' +
			' box-shadow: inset 0 0 0 1px ' + TINT(6) + '; }',
		H + ' .tab { border: 0 !important; border-radius: 0.8rem !important; margin: 0.12rem 0 !important; padding: 0.42rem 0.8rem !important; font-size: 0.95em; font-weight: 500;' +
			' transition: background-color 0.15s; }',
		H + ' .tab.enable { font-weight: 650; box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 3px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.05); }',
		H + ':not(.m) .tab:not(.enable):hover { background-color: ' + TINT(7) + ' !important; }',
		H + ' .options td.tabValue { border: 0 !important; border-radius: 1.1rem !important; background-color: ' + TINT(3) + '; box-shadow: inset 0 0 0 1px ' + TINT(8) + '; }',
		H + ' .options > tbody > tr > td.tabValue { padding: 0; }',
		H + ' .options th:first-child { border-radius: 0.8rem !important; padding: 0.5em 0.8em; font-size: 1.1em; font-weight: 700; }',
		H + ' table.opttable { border-collapse: separate; border-spacing: 0; margin: 0; }',
		H + ':not(.m) table.opttable { padding: 0.35rem; }',
		H + ' table.opttable td { padding: 0.6rem 0.75rem !important; border-bottom: 1px solid ' + TINT(7) + '; }',
		H + ' table.opttable tr:last-child td { border-bottom: 0; }',
		H + ' table.opttable tr:nth-child(odd) td:first-child { background-color: transparent; background-image: none; }',
		H + '.jlt-on table.opttable tr:nth-child(odd) td:first-child { background: transparent !important; }',
		H + ' .opttable td.sr { border-left: 1px solid ' + TINT(8) + ' !important; }',
		H + ' table.opttable th.sr { font-weight: 500; opacity: 0.8; }',
		H + ' table.opttable label { cursor: pointer; }',
		H + ' table.opttable input[type="checkbox"] { margin-right: 0.45em; vertical-align: -0.1em; }',
		H + ' div.helptable h2, ' + H + ' div.helptable h3 { border-radius: 0.8rem; padding: 0.35em 0.7em; }',

		// ---------- phone / portrait (.m): floating bottom dock ----------
		H + '.m #leftbar { left: 2.5vw; right: 2.5vw; bottom: calc(2.5vw + env(safe-area-inset-bottom, 0px)); height: 13vw; border-radius: 4.5vw !important; }',
		H + '.m #leftbar > div.mybutton { border-width: 1.1vw !important; border-radius: 3.2vw !important; }',
		H + '.m #leftbar > #logo.mybutton { border-width: 1.1vw 0.8vw !important; border-radius: 3.2vw !important; font-size: 7vw; }',
		H + '.m #leftbar .mybutton .icon::before { width: 1.7rem !important; height: 1.7rem !important; }',
		H + '.m #scrambleDiv { left: 2.5vw; width: 95vw; top: 2.5vw; padding: 0.7rem 0.8rem; }',
		H + '.m:not(.toolf):not(.toolt) #stats { left: 2.5vw; max-width: 95vw; bottom: calc(18vw + env(safe-area-inset-bottom, 0px)); padding: 0.6rem; }',
		H + '.m:not(.toolf):not(.toolt) #toolsDiv { right: 2.5vw; bottom: calc(18vw + env(safe-area-inset-bottom, 0px)); }',
		H + '.m .dialog, ' + H + '.m .popup { border-radius: 1.2rem !important; }',
		H + '.m .options > tbody > tr > td:first-child { padding: 0.2rem; }',
		H + '.m .tab { padding: 0.45rem 0.5rem !important; }',
		H + '.m table.opttable td { padding: 0.45rem 0.4rem !important; }',
		H + '.m table.opttable td.sr { padding-right: 0.7rem !important; }',

		// ---------- minimal layout: keep panels quiet ----------
		H + '.jlmin #leftbar { box-shadow: none !important; border-color: transparent !important; background-image: none; }',
		H + '.jlmin #leftbar > div.mybutton.enable { box-shadow: none; }'
	];

	jlSkins.register({ id: 'glass', name: 'Glass', css: css.join('\n') });
})();
