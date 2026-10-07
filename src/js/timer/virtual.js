execMain(function(timer) {
	var puzzleObj;
	var vrcType = '';
	var insTime = 0;
	var moveCnt = 0;
	var totPhases = 1;
	var rawMoves = [];
	var isApplyingScramble = false; // scramble moves are applied instantly; no move effects for them

	// live TPS: how fast turn inputs arrive (like WPM), not the animation speed. Counts turn inputs (not cube
	// rotations) during a timed solve over a short rolling window ("Live TPS window", default 0.5 s); shown above
	// the "solve" text when "Show live TPS" is on.
	var tpsInputs = [];
	var tpsDiv = $('<div class="jltps">').hide();
	var tpsTid = 0;

	function tpsValue(now) {
		var win = (parseFloat(kernel.getProp('vrcTpsWin', '0.5')) || 0.5) * 1000;
		while (tpsInputs.length > 2 && now - tpsInputs[1] > win) { // keep one input before the window as reference
			tpsInputs.shift();
		}
		var n = tpsInputs.length;
		if (n < 2 || now - tpsInputs[n - 1] > win) { // nothing pressed within the window: not turning
			return 0;
		}
		// turns in the window divided by the time they took, measured from the input just before the window
		var first = 0;
		while (first < n - 1 && now - tpsInputs[first + 1] > win) {
			first++;
		}
		var span = tpsInputs[n - 1] - tpsInputs[first];
		return span > 0 ? (n - 1 - first) * 1000 / span : 0;
	}

	function tpsTick() {
		if (!kernel.getProp('vrcLiveTps') || timer.status() < 1) {
			tpsDiv.hide();
			clearInterval(tpsTid);
			tpsTid = 0;
			return;
		}
		tpsDiv.text(tpsValue($.now()).toFixed(1) + ' TPS').show();
	}

	function tpsInput(now) {
		tpsInputs.push(now);
		if (kernel.getProp('vrcLiveTps') && !tpsTid) {
			tpsTid = setInterval(tpsTick, 100);
		}
		tpsTick();
	}

	//mstep: 0 move start, 1 move doing, 2 move finish
	function moveListener(move, mstep, ts) {
		if (mstep == 1) {
			return;
		}
		!isApplyingScramble && window.jlFx && jlFx.onMove(puzzleObj.move2str(move), move, mstep == 0 ? 'start' : 'end', timer.status() >= 1);
		var now = ts || $.now();
		if (timer.status() == -3 || timer.status() == -2) {
			if (puzzleObj.isRotation(move) && !/^(333ni|444bld|555bld)$/.exec(curScrType)) {
				if (mstep == 0) {
					rawMoves[0].push([puzzleObj.move2str(move), 0]);
					attemptMoves.push(puzzleObj.move2str(move));
				}
				return;
			} else {
				if (timer.checkUseIns()) {
					insTime = now - timer.startTime();
				} else {
					insTime = 0;
				}
				timer.startTime(now);
				if (readyTs && window.pllDrill && pllDrill.isActive()) {
					// PLL trainer: time from the moment the case is shown, so the recognition is part of the solve
					insTime = 0;
					timer.startTime(readyTs);
				}
				moveCnt = 0;
				tpsInputs = [];
				timer.curTime([insTime > 17000 ? -1 : (insTime > 15000 ? 2000 : 0)]);
				timer.status(curScrSize == 3 && curScrType != "r3" ? cubeutil.getStepCount(kernel.getProp('vrcMP', 'n')) : 1);
				var inspectionMoves = rawMoves[0];
				rawMoves = [];
				for (var i = 0; i < timer.status(); i++) {
					rawMoves[i] = [];
				}
				rawMoves[timer.status()] = inspectionMoves;
				totPhases = timer.status();
				timer.updateMulPhase(totPhases, puzzleObj.isSolved(kernel.getProp('vrcMP', 'n')), now);
				fixRelayCounter();
				timer.lcd.fixDisplay(false, true);
			}
		}
		if (timer.status() >= 1) {
			if (/^(333ni|444bld|555bld)$/.exec(curScrType) && !puzzleObj.isRotation(move)) {
				puzzleObj.toggleColorVisible(puzzleObj.isSolved(kernel.getProp('vrcMP', 'n')) == 0);
			}
			if (mstep == 0) {
				if (!puzzleObj.isRotation(move)) {
					tpsInput(now);
				}
				rawMoves[timer.status() - 1].push([puzzleObj.move2str(move), now - timer.startTime()]);
				attemptMoves.push(puzzleObj.move2str(move));
			}
			var curProgress;
			if (mstep == 2) {
				curProgress = puzzleObj.isSolved(kernel.getProp('vrcMP', 'n'));
				timer.updateMulPhase(totPhases, curProgress, now);
				fixRelayCounter();
			}
			if (mstep == 2 && curProgress == 0) {
				moveCnt += puzzleObj.moveCnt();
				if (/^r\d+$/.exec(curScrType) && curScramble.length != 0) {
					if (curScrType != "r3") {
						curScrSize++;
					}
					reset(true);
					scrambleIt();
					return;
				}
				timer.lcd.setStaticAppend('');
				timer.status(-1);
				$('#lcd').css({'visibility': 'unset'}); // disable dragging
				timer.lcd.fixDisplay(false, true);
				window.jlFx && jlFx.onSolve({ time: timer.curTime()[1], moves: moveCnt });
				rawMoves.reverse();
				kernel.pushSignal('time', ["", 0, timer.curTime(), 0, [$.map(rawMoves, cubeutil.moveSeq2str).filter($.trim).join(' '), curPuzzle, moveCnt]]);
			}
		}
	}

	function reset(temp) {
		if (isReseted && kernel.getProp('input') == vrcType || !isEnable) {
			return;
		}
		isReseted = true;
		vrcType = kernel.getProp('input');
		var size = curScrSize;
		if (!size) {
			size = 3;
		}
		var options = {
			puzzle: "cube" + size,
			allowDragging: true
		};
		if (/^udpoly$/.exec(curPuzzle)) {
			options.puzzle = curPuzzle;
			options.scramble = curScramble;
		} else if (puzzleFactory.twistyre.exec(curPuzzle)) {
			options.puzzle = curPuzzle;
		}
		options['style'] = kernel.getProp('input');
		puzzleFactory.init(options, moveListener, div, function(ret, isInit) {
			puzzleObj = ret;
			if (puzzleObj && window.jlFx) {
				jlFx.attach(puzzleObj, div);
			}
			if (!tpsDiv.parent().is('#multiphase')) {
				tpsDiv.prependTo('#multiphase'); // right above the "solve" text
			}
			if (isInit && !puzzleObj) {
				div.css('height', '');
				div.html('--:--');
			}
			if (!temp || isInit) {
				timer.lcd.setStaticAppend('');
				timer.lcd.fixDisplay(false, true);
				timer.lcd.renderUtil();
				setSize(kernel.getProp('timerSize'));
			}
		});
	}

	function fixRelayCounter() {
		if (/^r\d+$/.exec(curScrType)) {
			timer.lcd.setStaticAppend((curScramble.length + 1) + "/" + relayScrs.length);
			timer.lcd.renderUtil();
		}
	}

	function scrambleIt() {
		reset();
		var scramble = curScramble;
		if (/^r\d+$/.exec(curScrType)) {
			scramble = curScramble.shift().match(/\d+\) (.*)$/)[1];
			fixRelayCounter();
		}
		var setupRot = window.pllDrill && pllDrill.isActive() ? pllDrill.setupRotation() : '';
		scramble = puzzleObj.parseScramble(scramble + (setupRot ? ' ' + setupRot : ''), true);
		isReseted = false;

		isApplyingScramble = true;
		try {
			puzzleObj.applyMoves(scramble);
		} finally {
			isApplyingScramble = false;
		}
		puzzleObj.moveCnt(true);
		window.jlFx && jlFx.onScramble();
		rawMoves = [
			[]
		];
		attemptMoves = [];
	}

	function onkeydown(keyCode) {
		if (puzzleObj == undefined) {
			return;
		}
		var now = $.now();
		if (timer.status() == -1) { // idle
			if (keyCode == 32) {
				if (relayScrs) {
					curScramble = relayScrs.slice();
				}
				scrambleIt();
				readyTs = now;
				if (timer.checkUseIns()) {
					timer.startTime(now);
					timer.status(-3); //inspection
				} else {
					timer.lcd.val(0);
					timer.status(-2); //ready
				}
				$('#lcd').css({'visibility': 'hidden'}); // enable dragging
				timer.lcd.fixDisplay(false, true);
			}
		} else if (timer.status() == -3 || timer.status() == -2 || timer.status() >= 1) { // Scrambled or Running
			if (keyCode == 27 || keyCode == 28) { //ESC
				var recordDNF = timer.status() >= 1;
				timer.lcd.setStaticAppend('');
				timer.status(-1);
				reset();
				$('#lcd').css({'visibility': 'unset'}); // disable dragging
				timer.lcd.fixDisplay(false, true);
				if (recordDNF) {
					rawMoves.reverse();
					var dnf = ["", 0, [-1, now - timer.startTime()], 0, [$.map(rawMoves, cubeutil.moveSeq2str).filter($.trim).join(' '), curPuzzle, moveCnt]];
					var finish = function(isGesture) { // a cloud login/logout gesture is never recorded
						if (!isGesture && kernel.getProp('escDNF')) {
							kernel.pushSignal('time', dnf);
						} else {
							timer.cancelSolve();
						}
					};
					if (window.cloud && cloud.mightBeGesture(attemptMoves)) {
						cloud.onCancelledSolve(attemptMoves.slice()).then(finish, finish.bind(null, false));
					} else {
						finish(false);
					}
				}
			} else {
				var mappedCode = help.getMappedCode(keyCode);
				var a = {
					"keyCode": mappedCode
				};
				puzzleObj.keydown(a);
			}
		}
		if (keyCode == 27 || keyCode == 32) {
			kernel.clrKey();
		}
	}

	var readyTs = 0; // when the cube was scrambled for the current attempt
	var attemptMoves = []; // every move of the current attempt, for the cloud login gesture
	var curScramble;
	var relayScrs;
	var curScrType;
	var curScrSize;
	var curPuzzle;
	var types = ['', '', '222', '333', '444', '555', '666', '777', '888', '999', '101010', '111111'];
	var isReseted = false;

	function procSignal(signal, value) {
		if (signal == 'scramble' || signal == 'scrambleX') {
			curScrType = value[0];
			curScramble = value[1];
			var puzzle = tools.puzzleType(curScrType);
			var size = types.indexOf(puzzle);
			if (puzzle == 'cubennn') {
				size = value[2];
			}
			if ((size != -1 || puzzleFactory.twistyre.exec(puzzle)) && (curScrSize != size || curPuzzle != puzzle)) {
				curScrSize = size;
				curPuzzle = puzzle;
				isReseted = false;
				reset();
			}
			var m = /^r(\d)\d*$/.exec(curScrType);
			if (m) {
				relayScrs = curScramble.split('\n');
				if (curScrSize != ~~m[1]) {
					curScrSize = ~~m[1];
					isReseted = false;
					reset();
				}
			} else {
				relayScrs = null;
			}
		}
	}

	var div = $('<div />');
	var isEnable = false;

	function setEnable(enable) {
		isEnable = enable;
		if (enable) {
			div.show();
		} else {
			div.hide();
			isReseted = false;
		}
	}

	function setSize(value) {
		div.css('height', value * timer.getVrcScale() * $('#logo').width() / 9 + 'px');
		puzzleObj && puzzleObj.resize();
	}

	$(function() {
		kernel.regListener('timer', 'scramble', procSignal);
		kernel.regListener('timer', 'scrambleX', procSignal);
		div.appendTo("#container");
	});

	timer.virtual = {
		onkeydown: onkeydown,
		setEnable: setEnable,
		setSize: setSize,
		reset: reset
	};
}, [timer]);
