// Type declarations for the csTimer globals that the jlTimer modules use.
// Only for `npm run typecheck` (tsc --noEmit): never part of the build, and Closure Compiler never sees this file.
// The jlTimer modules themselves (algStat, collStat, jlThemes, jlFx, cloud, jlBgImages, ...) need no entry here:
// tsc infers their types from their own files, which are listed in tsconfig.json.
// Keep it honest: describe what csTimer actually does (see the file named next to each declaration), and stay loose
// (any) where precision would cost more than it catches.

// ---------- shared shapes ----------

/** a solve as csTimer stores it: [[penalty, time, ...split times], scramble, comment, unix seconds, [moves, puzzle]?] */
type Solve = [number[], string, string, number, ...any[]];

/** a property listener: callback(signal, value), see kernel.regListener */
type SignalCallback = (signal: string, value: any) => void;

/** src/js/lib/mathlib.js CubieCube (3x3 corner/edge permutation + orientation) */
declare class CubieCube {
	constructor();
	ca: number[];
	ea: number[];
	ori: number;
	tstamp?: number;
	init(ca: number[], ea: number[]): CubieCube;
	invFrom(cc: CubieCube): CubieCube;
	isEqual(c: CubieCube): boolean;
	hashCode(): number;
	toFaceCube(cFacelet?: any, eFacelet?: any, ctFacelet?: any, withOri?: boolean): string;
	fromFacelet(facelet: string, cFacelet?: any, eFacelet?: any): CubieCube | -1;
	selfMoveStr(moveStr: string, isInv?: boolean): number | undefined;
	selfConj(conj?: number): void;
	toPerm(cFacelet?: any, eFacelet?: any, ctFacelet?: any, withOri?: boolean): number[];
	edgeCycles(): number;
	verify(): number;
	prettyString(): string;
	static SOLVED: CubieCube;
	static CubeMult(a: CubieCube, b: CubieCube, prod: CubieCube): void;
	static CornMult(a: CubieCube, b: CubieCube, prod: CubieCube): void;
	static EdgeMult(a: CubieCube, b: CubieCube, prod: CubieCube): void;
	static CentMult(a: CubieCube, b: CubieCube, prod: CubieCube): void;
	static moveCube: CubieCube[];
	static rotCube: CubieCube[];
	static rotMult: number[][];
	static rotMulI: number[][];
	static rotMulM: number[][];
	static cFacelet: number[][];
	static eFacelet: number[][];
	static ctFacelet: number[];
	static faceMap: any;
}

/**
 * cubeutil.getIdentData(method): [ident(facelet) -> case index, genImg(case, canvas?), startIdx, endIdx, stageIdx].
 * genImg without a canvas returns image data (e.g. getOLLImage(i)[0] is the face string).
 */
type IdentData = [(facelet: string) => number, (cases: any, canvas?: any) => any, number, number, number];

/** recons.calcRecons step: [start, firstMove, end, moveCnt, stepTransCubie, stepMoves [[move, tstamp], ...], effMoves] */
type ReconsStep = [number, number, number, number, CubieCube, [string, number][], number[]];

/** recons.calcRecons result: data[0] is the last step of the method */
type Recons = { data: ReconsStep[]; rawMoves: any[] };

// ---------- src/js/kernel.js ----------

declare var kernel: {
	/** value of property key; def registers a default the first time it is given */
	getProp(key: string, def?: any): any;
	/** signalType defaults to 'modify' ('set', 'session', 'load' ... are also used) */
	setProp(key: string, value: any, signalType?: string): void;
	/**
	 * type: 0 bool, 1 select, 2 int (values [def, min, max]), 3 color, ~n / negative = hidden;
	 * values[0] is the default; sessionRelated: bit flags (2 = per-session)
	 * describe: a JQuery element for type 5 (internal row that only shows it)
	 */
	regProp(module: string, key: string, type: number, describe: string | JQuery, values: any[], sessionRelated?: number): void;
	/** filter is matched against value[0] (for 'property': the property key) */
	regListener(module: string, signal: string, callback: SignalCallback, filter?: RegExp): void;
	pushSignal(signal: string, value: any[]): void;
	/** values = [content, ok, cancel, gray, [extraText, extraFunc], ...]; undefined = no such button */
	showDialog(values: any[], diagclass: string, titlestr: string, callback?: () => void): void;
	hideDialog(): void;
	isDialogShown(diagclass: string): boolean;
	pretty(time: number, small?: boolean): string;
	round(time: number): number;
	pround(time: number): string;
	blur(): void;
	addWindow(module: string, button: any, div: JQuery, auto?: boolean, auto2?: boolean, weight?: number): void;
	addButton(module: string, button: any, callback: Function, weight?: number): void;
	getSProps(): any;
	setSProps(val: any): void;
	exportColor(): string;
	clrKey(): void;
	temp: JQuery;
	reprop(): void;
	loadProp(): void;
	TwoLvMenu: any;
	ui: {
		setWindowShown(module: string, shown: boolean): void;
		[k: string]: any;
	};
};

// ---------- other csTimer modules ----------

/** src/js/logohint.js */
declare var logohint: { push(msg: string): void };

/** src/js/lib/cubeutil.js */
declare var cubeutil: {
	getIdentData(method: string): IdentData;
	getProgress(facelet: any, method: string): number;
	getStepCount(method: string): number;
	getStepNames(method: string): string[];
	[k: string]: any;
};

/** src/js/lib/mathlib.js */
declare var mathlib: {
	CubieCube: typeof CubieCube;
	valuedArray<T>(len: number, val: T): T[];
	rndEl<T>(x: T[]): T;
	time2str(unix: number, format?: string): string;
	[k: string]: any;
};

/** src/js/scramble/scramble.js */
declare var scrMgr: { reg(type: string | string[], callback: (...args: any[]) => string, filter?: any): void; [k: string]: any };

/** src/js/stats/timestat.js */
declare class TimeStat {
	constructor(avgSizes: number[], timesLen: number, timeAt: (idx: number) => number, timeSort?: (a: number, b: number) => number);
	avgSizes: number[];
	timesLen: number;
	reset(timesLen?: number): void;
	genStats(): void;
	getAllStats(): any;
	[k: string]: any;
}

/** src/js/stats/stats.js */
declare var stats: {
	getTimesStatsTable(): TimeStat;
	getTimesStatsList(): TimeStat;
	getSessionManager(): {
		rank2idx(rank: number): number;
		createNamedSession(name: string, opt?: any): any;
		[k: string]: any;
	};
	timesAt(idx: number): Solve;
	timeAt(idx: number): number;
	regUtil(name: string, callback: Function): void;
	/** genFunc(solve, idx), cached per solve; metricInfo = [name, prettySingle, prettyAverage] */
	regExtraInfo(key: string, genFunc: (times: Solve, idx: number) => any, metricInfo?: any[]): void;
	getExtraInfo(key: string, idx: number): any;
	/** getExtraInfo(key, idx) is cached (returns without computing) */
	hasExtraInfo(key: string, idx: number): boolean;
	[k: string]: any;
};

/** src/js/lib/storage.js (IndexedDB, falls back to localStorage) */
declare var storage: {
	/** the solves of session idx */
	get(idx: number): Promise<Solve[]>;
	setKey(key: string, value: any): Promise<boolean>;
	getKey(key: string): Promise<any>;
	delKey(key: string): Promise<boolean>;
	[k: string]: any;
};

/** src/js/tools/tools.js */
declare var tools: {
	/** str: 'Group>Name'; execFunc(fdiv, signal): fdiv undefined = the tool is hidden */
	regTool(name: string, str: string, execFunc: (fdiv?: JQuery, signal?: string) => void): void;
	[k: string]: any;
};

/** src/js/timer.js */
declare var timer: { getCurTime(now?: number): number; [k: string]: any };

/** src/js/export.js */
declare var exportFunc: {
	getExportString(): Promise<string>;
	loadData(data: any, skipConfirm?: boolean, onDone?: () => void): void;
	addSection(elem: JQuery): void;
	[k: string]: any;
};

/** src/js/twisty/twistyreplay.js */
declare var replay: { popupReplay(scramble: string, recons: string, puzzle?: string, info?: any): void; [k: string]: any };

/** src/js/stats/recons.js */
declare var recons: {
	calcRecons(times: Solve, method: string): Recons | undefined;
	[k: string]: any;
};

/** src/js/scramble/scramble_333_edit.js */
declare var scramble_333: { getOLLImage(cases: number, canvas?: any): any; [k: string]: any };

/** src/js/tools/image.js */
declare var image: { llImage: { drawImage(pieces: string, arrows: any[], img?: any): any; [k: string]: any }; [k: string]: any };

/** src/js/lib/utillib.js: execMain(func, args) runs func(...args) once and returns its result */
declare function execMain<T>(func: (...args: any[]) => T, args?: any[]): T;

/** false in release builds (Closure --define) */
declare var DEBUG: boolean;

// language strings (src/lang/*.js): add the ones a checked module uses
declare var TOOLS_RECONS: string;
declare var LGHINT_SSBEST: string;

// ---------- jQuery 1.8 plus csTimer's additions (src/js/lib/utillib.js) ----------

interface JQueryStatic {
	/** alert() that falls back to logohint when the browser blocks dialogs */
	alert(msg: string): void;
	confirm(msg: string): boolean;
	/** a URL query parameter (src/js/lib/utillib.js), null when absent */
	urlParam(name: string): string | null;
	/** debounce: runs func after timeout ms, replacing a pending call with the same key */
	delayExec(key: string, func: () => void, timeout: number): void;
	/** '#rgb' / '#rrggbb' nudged toward ref; longFormat for '#rrggbb' output */
	nearColor(color: string, ref?: number, longFormat?: boolean): string;
	/** an input event's own timeStamp (performance clock, floored), or $.now() when it has none / is unusable */
	eventTime(e?: any): number;
	waitUser: { reg(func: () => void): void; call(): void };
	ppost(url: string, data: any, dataType?: string): Promise<any>;
	sha256(s: string): string;
	/** jQuery accepts document as the container */
	contains(container: Document | Element, contained: Element): boolean;
}

// ---------- browser extras ----------

interface Window {
	webkitIndexedDB?: IDBFactory;
}
