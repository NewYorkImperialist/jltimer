// Data shapes of the jlTimer modules, referenced by name from JSDoc in src/js (e.g. @param {BgEntry} e).
// Kept here rather than in @typedef comments because Closure Compiler also reads JSDoc: it accepts an
// unknown type name with type checking off (make check), but not TypeScript-only syntax such as
// tuples or import() types. So: TS-only shapes go here, sources use only plain names, Array<T>, {?} etc.

/** js/mybg.js: one of the user's pictures ('jlBgMeta'.list); stored in IndexedDB, so keys are quoted in the source */
interface BgEntry {
	id: string;
	name: string;
	/** stored picture size, px */
	w: number;
	h: number;
	bytes?: number;
	/** '#rgb' x 8: font, background, panels, buttons, links, logo, logo background, PBs */
	palette: string;
	/** k-means colors of the picture: [r, g, b, share 0..1] */
	clusters: Array<Array<number>>;
	fit: string; // 'cover' | 'contain' | 'tile'
	/** focal point, % */
	pos: Array<number>; // [x, y]
	/** px, 0..20 */
	blur: number;
	/** %, -60 (darker) .. 60 (lighter) */
	dim: number;
	/** ms timestamp */
	added: number;
}

/** js/tools/algtrainer.js: a drill (pllDrill / ollDrill), looked up by name in algstat.js */
type AlgDrill = typeof pllDrill;

/** js/stats/algstat.js: one step of the STEPS table (PLL, OLL); see the comment above STEPS */
interface AlgStepCfg {
	method: string;
	stage: number;
	ident: string;
	skip: number;
	leftProg: number;
	skipImg?: string;
	tool: string;
	title: string;
	prop: string;
	prev: string;
	drill: string;
	fam?: boolean;
	eo?: boolean;
	done?: (c: CubieCube) => boolean;
}

/** js/cloud.js: localStorage.devData.jlcloud (every field optional: setState merges updates) */
interface CloudState {
	/** session token of the backup API (null: signed out) */
	token?: string | null;
	/** login gesture fingerprint, PBKDF2 salt and iterations */
	fp?: string | null;
	salt?: string | null;
	iterations?: number;
	/** hash of the local data at the last backup or restore */
	syncedHash?: string;
	/** the data was just restored from the cloud (skip the next automatic backup) */
	justRestored?: boolean;
	/** ms timestamp of the last backup */
	lastBackup?: number;
	/** newest snapshot id this device has seen */
	lastSyncId?: number;
}

/** js/themes.js: an enhanced theme, from jlThemes.register() in js/themes/<id>.js (see the comment atop themes.js) */
interface JlTheme {
	id: string;
	name: string;
	/** '#rgb' x 7 or 8, same order as BgEntry.palette */
	palette: string;
	/** inline '<svg ...>' or any CSS background-image value */
	background?: string;
	/** extra CSS, every rule scoped with html.jlt-<id> */
	css?: string;
	/** col-timer value '#f00#0d0#dd0#080#f00' */
	timer?: string;
	/** living background: called when the theme's canvas starts; return null to skip */
	animate?: (env: JlThemeEnv) => JlThemeAnimation;
}

/** what js/themes.js hands a theme's animate(): the canvas and where the artwork sits on screen */
interface JlThemeEnv {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	/** viewport size in CSS px; the canvas has w*dpr x h*dpr pixels */
	w: number;
	h: number;
	/** devicePixelRatio, at most 2 */
	dpr: number;
	/** touch device or small screen: draw less (frames are capped at 30 fps there) */
	phone: boolean;
	/** CSS px per artwork unit (background-size: cover) */
	artScale: number;
	/** [width, height] of the artwork's viewBox */
	artBox: Array<number>;
	/** screen position of the artwork's (0, 0) */
	artX: number;
	artY: number;
	/** artwork coordinates to screen [x, y] in CSS px */
	art(x: number, y: number): Array<number>;
}

interface JlThemeAnimation {
	/** dt in seconds since the last frame (at most 0.1) */
	frame(dt: number, env: JlThemeEnv): void;
	/** the viewport (env.w, env.h, env.art...) changed; the canvas was resized and cleared */
	resize?(env: JlThemeEnv): void;
	/** the canvas is being removed */
	stop?(): void;
}

/** js/themes.js setImages(): how "Your images" (js/mybg.js) plugs into the theme gallery */
interface ThemeImages {
	/** extra [values, names] for the jlTheme property ('img-<id>') */
	options(): Array<Array<string>>;
	/** called for every jlTheme change; shows the picture for 'img-<id>', hides it otherwise */
	apply(id: string, signalType: string): void;
	/** the "Your images" block for the About page ('about') or Options ('opt') */
	section(where: string): JQuery;
}
