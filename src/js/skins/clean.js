"use strict";

// jlTimer UI look (draft): Clean - crisp product UI in the spirit of Linear / Vercel / Raycast.
// Solid near-white (near-black on dark palettes) cards with 1px hairlines, 8-10px radius, a 4/8px grid,
// system sans with tabular numbers, a compact icon toolbar and a quiet data table. Every surface is
// derived from the inherited text color (oklch relative colors), so any theme or color scheme still tints it.
(function() {
	var H = 'html.jls-clean ';
	var P = 'html.jls-clean:not(.jlmin) '; // panel surfaces (the minimal layout keeps its frameless panels)
	var D = 'html.jls-clean:not(.m) '; // desktop geometry
	var M = 'html.jls-clean.m '; // phone / portrait geometry

	var SANS = '"Inter", "Inter var", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
	var MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace';

	// surfaces from currentColor: dark text -> near-white, light text -> near-black, keeping a faint hue tint
	function surf(alpha, lo, hi) {
		return 'oklch(from currentColor clamp(' + lo + ', (0.6 - l) * 100, ' + hi + ') calc(c * 0.14) h / ' + alpha + ')';
	}
	var PANEL = surf(0.9, 0.17, 0.985);
	var RAISED = surf(0.97, 0.2, 0.995);
	var FIELD = surf(0.94, 0.24, 1);
	var LINE = 'color-mix(in srgb, currentColor 13%, transparent)';
	var LINE2 = 'color-mix(in srgb, currentColor 8%, transparent)';
	var FILL = 'color-mix(in srgb, currentColor 6%, transparent)';
	var FILL2 = 'color-mix(in srgb, currentColor 10%, transparent)';
	var MUTED = 'color-mix(in srgb, currentColor 58%, transparent)';
	var SHADOW = '0 1px 2px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.06)';
	var SHADOW_LG = '0 2px 6px rgba(0,0,0,0.08), 0 20px 56px rgba(0,0,0,0.2)';
	var CHEVRON = 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 12%22%3E%3Cpath d=%22M3 4.5l3 3 3-3%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E")';

	// desktop sidebar: logo row on top, one toolbar row of six icons under it
	var LOGO_H = '3.25rem', TOOL_H = '2.5rem';
	var BAR_H = 'calc(' + LOGO_H + ' + ' + TOOL_H + ' + 16px)';
	var CELL_W = 'calc((100% - 12px) / 6)';
	var cells = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

	var css = [
		// ---------- type ----------
		H + '.mywindow,' + H + '#leftbar > div,' + H + '.dialog,' + H + '.popup,' + H + '.dialog .title,' + H + '.tab,' + H + '#avgstr{font-family:' + SANS + ' !important}',
		H + 'body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}',
		H + '#stats,' + H + '#toolsDiv,' + H + '.dialog,' + H + '.popup,' + H + '#avgstr,' + H + '#container,' + H + '#multiphase{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1,"cv11" 1}',

		// ---------- panels: solid cards, hairline border, soft shadow ----------
		P + '.mywindow:not(.fixed),' + P + '#leftbar{background-color:' + PANEL + ' !important;border:1px solid ' + LINE + ' !important;border-radius:10px !important;box-shadow:' + SHADOW + ' !important}',
		H + '.mywindow::before,' + H + '#leftbar::before{box-shadow:none !important;border-radius:10px !important}',
		H + '.mywindow:not(.fixed),' + H + '#leftbar{border-radius:10px !important}',
		H + '.mywindow:not(.fixed){padding:12px !important}',
		H + '.dialog,' + H + '.popup{background-color:' + RAISED + ' !important;border:1px solid ' + LINE + ' !important;border-radius:12px !important;box-shadow:' + SHADOW_LG + ' !important}',
		H + '.mywindow > .chide{width:10px;height:10px;top:0;left:0;border-radius:9px 0 10px 0;background-color:' + FILL2 + ';opacity:0.8}',
		H + '.mywindow > .chide:hover{background-color:color-mix(in srgb, currentColor 22%, transparent);opacity:1}',
		M + '.mywindow > .chide{width:1.4rem;height:1.4rem;border-radius:9px 0 1.4rem 0}',

		// ---------- desktop geometry (floating cards on an 8px grid) ----------
		D + '#leftbar{top:8px;left:8px;width:calc(17.2rem - 12px);height:' + BAR_H + '}',
		D + '#leftbar #logo{top:6px;left:6px;right:6px;width:auto;height:' + LOGO_H + '}',
		D + '#scrambleDiv{top:8px;left:calc(17.2rem + 4px);right:8px}',
		D + '#stats{top:calc(' + BAR_H + ' + 16px);left:8px;bottom:8px}',
		D + '#toolsDiv{right:8px;bottom:8px}'
	];
	cells.forEach(function(c, i) {
		css.push(D + '#leftbar > div.' + c + '{top:calc(' + LOGO_H + ' + 10px);bottom:auto;right:auto;height:' + TOOL_H + ';width:' + CELL_W + ';left:calc(6px + ' + CELL_W + ' * ' + i + ')}');
	});
	// phone: bottom toolbar keeps csTimer's 9 slots, cells inset by 3px
	var mslots = { c1: 0, c2: 1, c3: 2, c4: 6, c5: 7, c6: 8 };
	cells.forEach(function(c) {
		css.push(M + '#leftbar > div.' + c + '{top:4px;height:calc(100% - 8px);width:calc(11.1111% - 4px);left:calc(11.1111% * ' + mslots[c] + ' + 2px)}');
	});
	css = css.concat([
		M + '#leftbar #logo{top:4px;height:calc(100% - 8px);width:calc(33.3333% - 4px);left:calc(33.3333% + 2px)}',
		M + '#leftbar{border-left:0 !important;border-right:0 !important;border-bottom:0 !important;border-radius:12px 12px 0 0 !important}',

		// ---------- toolbar buttons ----------
		H + '#leftbar > div{border:0 !important;border-radius:8px !important;transition:background-color 0.12s}',
		H + '#leftbar > div.mybutton:not(#logo){color:' + MUTED + '}',
		H + '#leftbar > div.mybutton:not(#logo):hover{color:inherit}',
		'html.jls-clean:not(.m) #leftbar > div.mybutton:not(#logo):hover{background-color:' + FILL2 + ' !important}',
		H + '#leftbar > div.mybutton.enable:not(#logo){color:inherit;background-color:' + FILL + ' !important}',
		H + '#leftbar > div.mybutton:not(#logo):active{background-color:color-mix(in srgb, currentColor 14%, transparent) !important}',
		H + '#leftbar .mybutton .icon::before{width:1.3rem !important;height:1.3rem !important}',
		M + '#leftbar .mybutton .icon::before{width:1.5rem !important;height:1.5rem !important}',
		// hover: keep the icon, show the label as a small tooltip above the button
		D + '#leftbar div > div:hover > span.icon{display:flex !important}',
		D + '#leftbar > div.mybutton:not(#logo) > div > span:not(.icon){display:none !important}',
		D + '#leftbar > div.mybutton:not(#logo):hover > div > span:not(.icon){display:block !important;position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);padding:3px 8px;border-radius:6px;font:500 0.7rem/1.3 ' + SANS + ';letter-spacing:0.02em;white-space:nowrap;text-align:center;background-color:' + surf(0.96, 0.22, 0.99) + ';color:inherit;border:1px solid ' + LINE + ';box-shadow:0 2px 8px rgba(0,0,0,0.12);pointer-events:none;z-index:2}',

		// logo: the one block of brand color, inset as a rounded tile
		H + '#leftbar #logo{border-radius:8px !important;box-shadow:none !important;overflow:hidden}',
		H + '#leftbar #logo > div > span{font-family:' + SANS + ';font-weight:650;letter-spacing:-0.035em}',
		D + '#leftbar #logo{font-size:1.85rem !important}',
		M + '#leftbar #logo{font-size:1.9em !important}',
		H + '#leftbar #logo > div > span > span.msg{font-size:0.5em;font-weight:500;letter-spacing:0}',

		// ---------- controls ----------
		H + 'select,' + H + 'input[type="button"],' + H + 'input[type="text"]{font-family:' + SANS + ';font-weight:500;font-size:0.8125rem;line-height:1.25;color:inherit !important;background-color:' + FIELD + ' !important;border:1px solid ' + LINE + ' !important;border-radius:6px !important;padding:0.3rem 0.6rem !important;margin:0 2px !important;box-shadow:0 1px 1px rgba(0,0,0,0.04);vertical-align:middle;transition:border-color 0.12s, background-color 0.12s}',
		H + 'select{background-image:' + CHEVRON + ' !important;background-repeat:no-repeat !important;background-position:right 0.4rem center !important;background-size:0.75rem !important;padding-right:1.45rem !important}',
		H + 'select > option{color:#111;background:#fff}',
		H + 'select:hover,' + H + 'input[type="button"]:hover,' + H + 'input[type="text"]:hover{border-color:color-mix(in srgb, currentColor 26%, transparent) !important}',
		H + 'input[type="button"]:active{background-color:' + FILL2 + ' !important}',
		H + 'input:disabled{opacity:0.5;box-shadow:none}',
		H + 'input[type="checkbox"],' + H + 'input[type="radio"]{accent-color:currentColor;width:0.95em;height:0.95em;margin:0 0.45em 0 0;vertical-align:-0.1em}',
		H + 'textarea{border:1px solid ' + LINE + ' !important;border-radius:8px !important;background-color:' + FIELD + ' !important;padding:6px 8px}',
		H + 'input.buttonOK{font-size:0.875rem !important;padding:0.4rem 0.9rem !important;margin:0 4px !important}',
		// primary action (first dialog button): inverted, like a Vercel/Linear primary button
		H + '.dialog input.buttonOK:first-child{color:' + surf(1, 0.17, 1) + ' !important;background-color:oklch(from currentColor clamp(0.2, (0.6 - l) * 100, 0.97) calc(c * 0.5) h) !important;border-color:transparent !important}',

		// ---------- scramble ----------
		H + '#scrambleDiv > .title{margin-bottom:8px}',
		H + '#scrambleDiv > .title{font-size:0.8125rem;font-weight:500}',
		H + 'input[type="button"].icon{font-family:iconfont !important;font-size:0.95rem !important;font-weight:400;padding:0.3rem 0.45rem !important}',
		H + '#scrambleTxt{font-family:' + MONO + ';font-weight:500;letter-spacing:0.01em !important;word-spacing:0.15em;line-height:1.45;padding:2px 4px !important}',

		// ---------- timer: big and calm ----------
		H + '#lcd{letter-spacing:-0.01em}',
		H + '.jlfont #lcd{font-weight:600;letter-spacing:-0.04em}',
		H + '#timer .difflabel{font-family:' + SANS + ';font-size:0.11em;font-weight:500;margin-left:0.35em;vertical-align:0.2em;opacity:0.9}',
		M + '#timer .difflabel{margin-left:0;font-size:0.16em}',
		H + '#avgstr{color:' + MUTED + ';font-weight:500 !important;line-height:1.5 !important;letter-spacing:-0.01em}',
		H + '#container > #avgstr{font-size:0.105em !important;margin-top:0.4em}',
		H + '#multiphase > #avgstr{font-size:0.24em !important}',
		M + '#container > #avgstr{font-size:0.16em !important}',
		H + '#avgstr > span{padding:0 0.3em;border-radius:6px}',

		// ---------- stats: modern data table ----------
		H + '#stats{font-size:0.875rem}',
		H + '#stats > div:first-child{display:flex;align-items:center;gap:4px;margin-bottom:8px}',
		H + '#stats > div:first-child > span.click{color:' + MUTED + ';font-weight:500;font-size:0.8125rem;margin-right:4px}',
		H + '#stats > div:first-child > select{flex:1;max-width:none}',
		H + '#stats > div:first-child > input[type="button"]{width:auto;min-width:0;padding-left:0.55rem !important;padding-right:0.55rem !important}',
		H + '#stats .table,' + H + '#stats .table td,' + H + '#stats .table th{border:0 !important}',
		H + '#stats .table{border-collapse:collapse;width:100%}',
		H + '#stats .table td,' + H + '#stats .table th{padding:5px 8px !important;text-align:right;border-bottom:1px solid ' + LINE2 + ' !important;font-weight:400}',
		H + '#stats .table tr > :first-child{text-align:left}',
		// summary card (current / best)
		H + '#stats .statc{margin-top:0 !important;margin-bottom:8px}',
		H + '#stats table.sumtable{border:1px solid ' + LINE2 + ' !important;border-radius:8px;border-collapse:separate !important;border-spacing:0;background-color:' + FILL + ';overflow:hidden;box-sizing:border-box}',
		H + '#stats table.sumtable tr:last-child > *{border-bottom:0 !important}',
		H + '#stats table.sumtable tr:first-child > th{color:' + MUTED + ';font-size:0.6875rem;font-weight:500;text-transform:uppercase;letter-spacing:0.06em}',
		H + '#stats table.sumtable th{font-weight:500}',
		// solve list
		H + '#stats .stattl{margin-top:0 !important}',
		H + '#stats .stattl tr:first-child > th{font-size:0.8125rem !important;font-weight:600;text-align:left;line-height:1.45;padding:2px 8px 8px !important}',
		H + '#stats .stattl tr:first-child{font-size:1em !important}',
		H + '#stats .stattl tr:nth-child(2) > th{color:' + MUTED + ';font-size:0.6875rem;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid ' + LINE + ' !important;position:sticky;top:0;background-color:' + PANEL + ';z-index:1}',
		H + '#stats .stattl td:first-child{color:' + MUTED + ';font-size:0.8125rem}',
		H + '#stats .stattl td{transition:background-color 0.08s}',
		'html.jls-clean:not(.m) #stats .stattl tr:hover > td,' + 'html.jls-clean:not(.m) #stats .stattl tr:hover > td.times:hover{background-color:' + FILL + ' !important}',
		H + '#stats .times.pb{font-weight:600}',
		H + '#stats .stattl tr.click > th{text-align:center;color:' + MUTED + '}',
		H + '#stats .click,' + H + '#stats .times{border-radius:4px}',
		H + '.table,' + H + '.table td,' + H + '.table th{border-color:' + LINE + ' !important}',
		H + '#toolsDiv{font-size:0.875rem}',

		// ---------- dialogs ----------
		H + '.dialogoption{top:12%;bottom:12%}',
		H + '.dialog{padding:12px !important}',
		H + '.dialog .title{font-size:0.9375rem !important;font-weight:600;letter-spacing:0.01em;padding:2px 0 10px;margin-bottom:10px;border-bottom:1px solid ' + LINE2 + '}',
		H + '.dialog .title > .click{color:' + MUTED + ';border-radius:6px}',
		H + '.options{line-height:1.5}',
		H + '.options > tbody > tr > td:first-child{vertical-align:top}',
		H + '.dialog select{max-width:12em}',
		H + '.options .tab{border:0 !important;border-radius:6px !important;margin:1px 10px 1px 0 !important;padding:6px 10px !important;text-align:left;font-size:0.875rem;font-weight:500;color:' + MUTED + ';background-color:transparent !important;white-space:nowrap}',
		H + '.options .tab br{display:none}',
		'html.jls-clean:not(.m) .options .tab:hover{background-color:' + FILL + ' !important;color:inherit}',
		H + '.options .tab.enable{color:inherit;background-color:' + FILL2 + ' !important;font-weight:600}',
		H + '.tabValue{border:1px solid ' + LINE2 + ' !important;border-radius:8px !important;background-color:' + surf(0.6, 0.15, 1) + '}',
		H + 'table.opttable{margin:0;font-size:0.875rem}',
		H + 'table.opttable th{background-color:transparent !important;border-radius:0 !important;font-weight:600;text-align:left;padding:14px 12px 8px !important;border-bottom:1px solid ' + LINE + '}',
		H + 'table.opttable tr th:first-child{font-size:0.9375rem !important}',
		H + 'table.opttable th.sr{color:' + MUTED + ';font-size:0.75rem;font-weight:500;text-align:right}',
		H + 'table.opttable td{background:transparent !important;padding:7px 12px !important;border-bottom:1px solid ' + LINE2 + '}',
		H + 'table.opttable td.sr,' + H + '.opttable td.sr{border-left:0 !important}',
		H + 'table.opttable .opthelp,' + H + '.dialog .opthelp{color:' + MUTED + ';font-size:0.8em}',
		H + 'div.helptable h2,' + H + 'div.helptable h3{background-color:transparent !important;border-bottom:1px solid ' + LINE + ';font-weight:600;padding:12px 4px 6px !important}',
		H + 'div.helptable li:nth-child(odd){background:transparent !important}',
		H + '.sflt div.sgrp{background-color:' + FILL + ' !important;border-radius:6px}',
		H + '.cntbar{border-radius:4px;border-color:' + LINE + ' !important}',
		H + '.selected{background-color:' + FILL2 + ' !important}',
		M + '.options .tab{padding:6px !important;text-align:center}',

		// ---------- minimal layout: frameless, but the same type and controls ----------
		'html.jls-clean.jlmin #leftbar{border-color:transparent !important}'
	]);

	jlSkins.register({ id: 'clean', name: 'Clean', css: css.join('\n') });
})();
