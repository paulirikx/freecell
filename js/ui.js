/* ============================================================
   ui.js - weergave, slepen/klikken, ranglijst, overlays
   ============================================================ */
(function () {
  'use strict';

  var S = Store.settings;
  var SUITS = ['♠', '♥', '♦', '♣'];
  var LAB_JQK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var LAB_BVH = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'V', 'H'];
  var PIPS = {
    1: [[1, 3]],
    2: [[1, 0], [1, 6]],
    3: [[1, 0], [1, 3], [1, 6]],
    4: [[0, 0], [2, 0], [0, 6], [2, 6]],
    5: [[0, 0], [2, 0], [1, 3], [0, 6], [2, 6]],
    6: [[0, 0], [2, 0], [0, 3], [2, 3], [0, 6], [2, 6]],
    7: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [0, 6], [2, 6]],
    8: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [1, 4.5], [0, 6], [2, 6]],
    9: [[0, 0], [2, 0], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4], [0, 6], [2, 6]],
    10: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [0, 4], [2, 4], [1, 5], [0, 6], [2, 6]]
  };

  var $ = function (id) { return document.getElementById(id); };
  var topzone = $('topzone'), tableau = $('tableau'), dragLayer = $('drag');

  /* ---------------- spelstatus ---------------- */
  var st = null, cfg = null, history = [], busy = false;
  var timer = { acc: 0, start: 0, running: false };
  var used = { hints: 0, undos: 0 };
  var isDaily = false, lastHint = null, finished = false, humanMoved = false;
  var lastWin = { ms: 0, moves: 0 };

  /* ---------------- hulpjes ---------------- */
  function labels() { return S.letters === 'bvh' ? LAB_BVH : LAB_JQK; }
  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function elapsed() { return timer.acc + (timer.running ? Date.now() - timer.start : 0); }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* ---------------- profiel ---------------- */
  var P = Store.profiel;
  function naam() { return P.naam || 'Speler'; }
  function initialen(n) {
    var d = String(n || '?').trim().split(/\s+/);
    return ((d[0] || '?')[0] + (d.length > 1 ? d[d.length - 1][0] : '')).toUpperCase();
  }
  function kleurVan(n) {
    var h = 0, i;
    for (i = 0; i < String(n).length; i++) h = (h * 31 + String(n).charCodeAt(i)) % 360;
    return 'hsl(' + h + ',52%,38%)';
  }
  /* Zet een avatar in een element: eigen foto als die er is, anders initialen. */
  function zetAvatar(el, n, foto, eigen) {
    if (!el) return;
    var f = foto || (eigen && P.foto) || '';
    if (f) {
      el.style.backgroundImage = 'url(' + f + ')';
      el.textContent = '';
      el.classList.add('heeft');
    } else {
      el.style.backgroundImage = '';
      el.style.background = P.naam ? kleurVan(n) : 'rgba(255,255,255,.10)';
      el.textContent = P.naam ? initialen(n) : '♠';   // nog geen naam: neutraal
      el.classList.remove('heeft');
    }
  }
  /* Foto kiezen: verkleinen tot een vierkantje van 200px, zodat het in de
     opslag van de browser past (een telefoonfoto is zo 4 MB). */
  function kiesFoto(klaar) {
    var inp = $('foto-input');
    inp.value = '';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var lezer = new FileReader();
      lezer.onload = function () {
        var img = new Image();
        img.onload = function () {
          var z = Math.min(img.width, img.height), c = document.createElement('canvas');
          c.width = c.height = 200;
          c.getContext('2d').drawImage(img, (img.width - z) / 2, (img.height - z) / 2, z, z, 0, 0, 200, 200);
          P.foto = c.toDataURL('image/jpeg', 0.82);
          Store.saveProfiel();
          klaar();
        };
        img.onerror = function () { toast('Die foto kan ik niet lezen'); };
        img.src = lezer.result;
      };
      lezer.readAsDataURL(f);
    };
    inp.click();
  }

  /* ---------------- geluid ---------------- */
  var actx = null;
  function beep(freq, dur, type, vol) {
    if (!S.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq;
      g.gain.value = vol || 0.05;
      o.connect(g); g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.08));
      o.stop(actx.currentTime + (dur || 0.08));
    } catch (e) {}
  }
  var sfx = {
    move: function () { beep(320, 0.05, 'triangle', 0.04); },
    place: function () { beep(660, 0.07, 'sine', 0.05); },
    bad: function () { beep(130, 0.12, 'sawtooth', 0.03); },
    undo: function () { beep(240, 0.06, 'square', 0.03); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { beep(f, 0.18, 'sine', 0.06); }, i * 130); }); }
  };

  /* ---------------- kaartweergave ---------------- */
  function face(c) {
    var r = Eng.rank(c), s = Eng.suit(c), sym = SUITS[s], lab = labels()[r - 1];
    var h = '<div class="idx">' + lab + '<span class="s">' + sym + '</span></div>';
    h += '<div class="big">' + sym + '</div>';
    if (r >= 11) {
      h += '<div class="court"><b>' + lab + '</b>' + sym + '</div>';
    } else if (r === 1) {
      h += '<div class="pip" style="left:55%;top:56%;font-size:calc(var(--cw)*.5)">' + sym + '</div>';
    } else {
      var p = PIPS[r] || [];
      for (var i = 0; i < p.length; i++) {
        var left = [31, 55, 79][p[i][0]], top = 13 + p[i][1] * 12.4;
        h += '<div class="pip' + (p[i][1] > 3 ? ' rev' : '') + '" style="left:' + left + '%;top:' + top + '%">' + sym + '</div>';
      }
    }
    return h;
  }
  function cardEl(c) {
    var el = document.createElement('div');
    el.className = 'card ' + (Eng.isRed(c) ? 'red' : 'black') + ' s' + Eng.suit(c);
    el.dataset.card = c;
    el.innerHTML = face(c);
    return el;
  }

  /* ---------------- afmetingen ---------------- */
  function sizeBoard() {
    var board = $('board');
    var gap = window.innerWidth < 420 ? 4 : 6;
    var w = board.clientWidth - 12;
    var cw = Math.floor((w - gap * 7) / 8);
    var ch = Math.round(cw * 1.42);
    document.documentElement.style.setProperty('--gap', gap + 'px');
    document.documentElement.style.setProperty('--cw', cw + 'px');
    document.documentElement.style.setProperty('--ch', ch + 'px');
    document.body.classList.toggle('narrow', cw < 62); // te smal voor echte kaartbeelden
    return { cw: cw, ch: ch };
  }
  function setFan() {
    var ch = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch'));
    var maxLen = 1;
    for (var i = 0; i < 8; i++) maxLen = Math.max(maxLen, st.cols[i].length);
    var avail = tableau.clientHeight - ch - 4;
    var fan = Math.min(ch * 0.62, maxLen > 1 ? avail / (maxLen - 1) : ch);
    fan = Math.max(fan, ch * 0.13);
    document.documentElement.style.setProperty('--fan', fan + 'px');
    return fan;
  }

  /* ---------------- render + FLIP-animatie ---------------- */
  function snap() {
    var m = {};
    var els = document.querySelectorAll('#board .card');
    for (var i = 0; i < els.length; i++) m[els[i].dataset.card] = els[i].getBoundingClientRect();
    return m;
  }
  function flip(prev) {
    if (!S.anim) return;
    var els = document.querySelectorAll('#board .card');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], p = prev[el.dataset.card];
      if (!p) continue;
      var n = el.getBoundingClientRect();
      var dx = p.left - n.left, dy = p.top - n.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.classList.add('moving');
      var a = el.animate(
        [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
        { duration: 190, easing: 'cubic-bezier(.2,.7,.3,1)' }
      );
      (function (e) { a.onfinish = function () { e.classList.remove('moving'); }; })(el);
    }
  }

  function render(animate) {
    var prev = animate ? snap() : null;
    var fan = setFan();
    topzone.innerHTML = '';
    var i, j, pile, el;

    for (i = 0; i < 4; i++) {
      pile = document.createElement('div');
      pile.className = 'pile cell' + (st.free[i] === 'X' ? ' locked' : '');
      pile.dataset.pile = 'free:' + i;
      if (st.free[i] !== null && st.free[i] !== 'X') {
        el = cardEl(st.free[i]); el.dataset.idx = 0; pile.appendChild(el);
      }
      topzone.appendChild(pile);
    }
    for (i = 0; i < 4; i++) {
      pile = document.createElement('div');
      pile.className = 'pile foundation';
      pile.dataset.pile = 'found:' + i;
      var f = st.found[i];
      if (f.length) { el = cardEl(f[f.length - 1]); el.dataset.idx = 0; pile.appendChild(el); }
      else pile.innerHTML = '<span class="ph">' + SUITS[i] + '</span>';
      topzone.appendChild(pile);
    }

    tableau.innerHTML = '';
    for (i = 0; i < 8; i++) {
      pile = document.createElement('div');
      pile.className = 'pile col';
      pile.dataset.pile = 'col:' + i;
      for (j = 0; j < st.cols[i].length; j++) {
        el = cardEl(st.cols[i][j]);
        el.dataset.idx = j;
        el.style.top = (j * fan) + 'px';
        el.style.zIndex = j + 1;
        pile.appendChild(el);
      }
      tableau.appendChild(pile);
    }
    if (prev) flip(prev);
    updateHUD();
  }

  /* ---------------- HUD ---------------- */
  function updateHUD() {
    $('stat-score').textContent = st.score;
    $('stat-moves').textContent = st.moves;
    $('stat-time').textContent = fmt(elapsed());
    var pb = personalBest();
    $('stat-time').classList.toggle('warn', !!(pb && elapsed() > pb && !finished));
    $('btn-undo').disabled = !history.length || used.undos >= cfg.undos || finished;
    $('btn-hint').disabled = used.hints >= cfg.hints || finished;
    $('undo-badge').textContent = cfg.undos >= 99 ? '' : Math.max(0, cfg.undos - used.undos);
    $('hint-badge').textContent = cfg.hints >= 99 ? '' : Math.max(0, cfg.hints - used.hints);
    $('pill-level').textContent = Store.LEVELS[cfg.level].icon + ' ' + cfg.levelName + ' · trede ' + cfg.rung + '/' + cfg.rungs;
    $('pill-deal').textContent = (isDaily ? '📅 #' : '#') + st.deal + ' · ' + cfg.cells + ' cel';
    $('pill-pb').textContent = pb ? 'Jouw record hier: ' + fmt(pb) : '';
    $('pill-pb').style.display = pb ? '' : 'none';
  }

  function personalBest() {
    var best = null;
    Store.scores.forEach(function (s) { if (s.deal === st.deal && (best === null || s.ms < best)) best = s.ms; });
    return best;
  }

  function tick() {
    if (!finished) $('stat-time').textContent = fmt(elapsed());
  }
  setInterval(tick, 250);
  setInterval(function () { if (!finished) updateLiveRankPill(); }, 10000);

  function updateLiveRankPill() {
    if (!st || !timer.running) { return; }
    var list = Store.sortBy(Store.filtered('level', { level: cfg.level, deal: st.deal }), 'ms');
    var ms = elapsed(), pos = 1;
    for (var i = 0; i < list.length; i++) if (list[i].ms < ms) pos++;
    var p = $('pill-rank');
    var was = p.dataset.pos;
    p.textContent = 'Nu #' + pos + ' van ' + (list.length + 1);
    p.classList.toggle('up', pos === 1);
    if (was && +was !== pos && +was > pos) toast('Je klimt naar plek ' + pos);
    p.dataset.pos = pos;
  }

  /* ---------------- zetten ---------------- */
  function startTimerIfNeeded() {
    if (!timer.running && !finished && humanMoved) { timer.start = Date.now(); timer.running = true; }
  }
  function pauseTimer() {
    if (timer.running) { timer.acc += Date.now() - timer.start; timer.running = false; }
  }

  function doMove(src, dst, silent) {
    if (busy || finished) return false;
    var before = Eng.clone(st);
    var n = Eng.apply(st, src, dst);
    if (!n) return false;
    history.push(before);
    if (history.length > 400) history.shift();
    humanMoved = true;
    startTimerIfNeeded();
    if (!silent) (dst.kind === 'found' ? sfx.place : sfx.move)();
    clearHint();
    render(true);
    saveGame();
    setTimeout(afterMove, 60);
    return true;
  }

  function afterMove() {
    if (Eng.won(st)) { onWin(); return; }
    if (S.autoplay) {
      var m = Eng.safeMoves(st);
      if (m.length) {
        busy = true;
        Eng.apply(st, m[0].src, m[0].dst);
        sfx.place(); render(true); saveGame();
        setTimeout(function () { busy = false; afterMove(); }, 130);
        return;
      }
    }
    updateHUD();
    updateLiveRankPill();
    $('btn-auto').disabled = !Eng.anyFoundationMove(st);
    if (Eng.stuck(st)) { pauseTimer(); open('ov-lose'); }
  }

  function autoFinish() {
    if (busy || finished) return;
    var m = Eng.anyFoundationMove(st);
    if (!m) { sfx.bad(); toast('Niets om af te leggen'); return; }
    busy = true;
    (function step() {
      var mv = Eng.anyFoundationMove(st);
      if (!mv) { busy = false; updateHUD(); if (Eng.won(st)) onWin(); return; }
      history.push(Eng.clone(st));
      Eng.apply(st, mv.src, mv.dst);
      sfx.place(); render(true); startTimerIfNeeded();
      setTimeout(step, 110);
    })();
  }

  function undo() {
    if (!history.length || busy || finished) return;
    if (used.undos >= cfg.undos) { sfx.bad(); toast('Geen terugdraaien meer op deze trede'); return; }
    var prev = snap();
    st = history.pop();
    used.undos++; st.undos = used.undos;
    sfx.undo(); clearHint();
    render(false); flip(prev);
    saveGame(); updateHUD();
    $('btn-auto').disabled = !Eng.anyFoundationMove(st);
  }

  function hint() {
    if (busy || finished) return;
    if (used.hints >= cfg.hints) { sfx.bad(); toast('Geen hints op deze trede — zelf denken!'); return; }
    var m = Eng.bestMove(st, null);
    if (!m) { sfx.bad(); toast('Geen zet gevonden'); return; }
    used.hints++; st.hints = used.hints;
    showHint(m); updateHUD();
  }
  function showHint(m) {
    clearHint();
    lastHint = m;
    var cards = Eng.cardsOf(st, m.src);
    var el = document.querySelector('#board .card[data-card="' + cards[0] + '"]');
    if (el) el.classList.add('hintFrom');
    var pile = document.querySelector('[data-pile="' + m.dst.kind + ':' + m.dst.i + '"]');
    if (pile) pile.classList.add('hintTo');
    setTimeout(clearHint, 3200);
  }
  function clearHint() {
    var a = document.querySelectorAll('.hintFrom,.hintTo');
    for (var i = 0; i < a.length; i++) a[i].classList.remove('hintFrom', 'hintTo');
  }

  /* ---------------- klikken en slepen ---------------- */
  var drag = null, tapInfo = { t: 0, card: -1 };

  function pileOf(el) {
    var p = el.closest('[data-pile]');
    if (!p) return null;
    var parts = p.dataset.pile.split(':');
    return { kind: parts[0], i: +parts[1], el: p };
  }

  function onDown(e) {
    if (busy || finished) return;
    var cardEl2 = e.target.closest('.card');
    if (!cardEl2) return;
    var p = pileOf(cardEl2);
    if (!p) return;
    var idx = +cardEl2.dataset.idx;
    var src = { kind: p.kind, i: p.i, idx: idx };
    if (p.kind === 'col' && Eng.runLength(st, p.i, idx) === 0) {
      cardEl2.classList.add('nomove');
      setTimeout(function () { cardEl2.classList.remove('nomove'); }, 320);
      sfx.bad();
      return;
    }
    drag = {
      src: src, startX: e.clientX, startY: e.clientY, moved: false,
      cards: Eng.cardsOf(st, src), els: [], offX: 0, offY: 0,
      rect: cardEl2.getBoundingClientRect()
    };
    drag.offX = e.clientX - drag.rect.left;
    drag.offY = e.clientY - drag.rect.top;
    // met een vinger zit de kaart onder je hand: teken hem iets hoger
    drag.lift = (e.pointerType === 'touch') ? Math.round(drag.rect.height * 0.55) : 0;
    try { cardEl2.setPointerCapture(e.pointerId); } catch (err) {}
    drag.pointerId = e.pointerId;
    e.preventDefault();
  }

  function beginDrag() {
    var fan = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fan'));
    dragLayer.innerHTML = '';
    drag.cards.forEach(function (c, k) {
      var el = cardEl(c);
      el.style.top = (k * fan) + 'px';
      el.style.zIndex = k;
      dragLayer.appendChild(el);
      var orig = document.querySelector('#board .card[data-card="' + c + '"]');
      if (orig) { orig.classList.add('dragging'); drag.els.push(orig); }
    });
    // markeer geldige doelen
    var piles = document.querySelectorAll('[data-pile]');
    for (var i = 0; i < piles.length; i++) {
      var parts = piles[i].dataset.pile.split(':');
      if (Eng.canMove(st, drag.src, { kind: parts[0], i: +parts[1] })) piles[i].classList.add('droppable');
    }
  }

  function onMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    if (!drag.moved) { drag.moved = true; beginDrag(); }
    dragLayer.style.transform = 'translate(' + (e.clientX - drag.offX) + 'px,' +
      (e.clientY - drag.offY - drag.lift) + 'px)';
    e.preventDefault();
  }

  function onUp(e) {
    if (!drag) return;
    var d = drag; drag = null;
    var els = document.querySelectorAll('.droppable');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('droppable');
    d.els.forEach(function (el) { el.classList.remove('dragging'); });
    dragLayer.innerHTML = ''; dragLayer.style.transform = '';

    if (d.moved) {
      var mikY = e.clientY - d.lift + (d.lift ? 10 : 0);
      var target = document.elementFromPoint(e.clientX, mikY);
      var p = target && target.closest ? target.closest('[data-pile]') : null;
      if (p) {
        var parts = p.dataset.pile.split(':');
        if (doMove(d.src, { kind: parts[0], i: +parts[1] })) return;
      }
      sfx.bad();
      render(true);
      return;
    }

    // gewone tik: dubbeltik = direct naar aflegstapel
    var now = Date.now(), c0 = d.cards[0];
    if (d.src.kind === 'found') return; // afgelegde kaart alleen met slepen terughalen
    if (now - tapInfo.t < 320 && tapInfo.card === c0) {
      tapInfo.t = 0;
      if (doMove(d.src, { kind: 'found', i: Eng.suit(c0) })) return;
    }
    tapInfo = { t: now, card: c0 };
    var dst = Eng.autoTarget(st, d.src);
    if (dst) doMove(d.src, dst);
    else {
      sfx.bad();
      var el2 = document.querySelector('#board .card[data-card="' + c0 + '"]');
      if (el2) { el2.classList.add('nomove'); setTimeout(function () { el2.classList.remove('nomove'); }, 320); }
    }
  }

  $('board').addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', function () {
    if (!drag) return;
    drag.els.forEach(function (el) { el.classList.remove('dragging'); });
    dragLayer.innerHTML = ''; drag = null;
    var els = document.querySelectorAll('.droppable');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('droppable');
  });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest('#board')) e.preventDefault(); });

  /* ---------------- nieuw spel / einde ---------------- */
  function newGame(dealNo, daily) {
    cfg = Store.currentConfig();
    isDaily = !!daily;
    if (dealNo == null) dealNo = Deal.pickByPercentile(cfg.pct);
    st = Eng.create(dealNo, cfg.cells);
    history = []; used = { hints: 0, undos: 0 };
    timer = { acc: 0, start: 0, running: false };
    finished = false; busy = false;
    Store.recordStart();
    render(false);
    $('btn-auto').disabled = true;
    $('pill-rank').textContent = 'Nu #–';
    delete $('pill-rank').dataset.pos;
    var moeilijk = Deal.difficultyPercent(st.cols);
    if (S.autoplay) {           // azen die al bovenop liggen: gratis, telt niet als zet
      for (var g = 0; g < 12; g++) {
        var sm = Eng.safeMoves(st);
        if (!sm.length) break;
        Eng.apply(st, sm[0].src, sm[0].dst);
      }
      st.moves = 0;
      render(false);
    }
    humanMoved = false;
    saveGame();
    toast(cfg.levelName + ' · trede ' + cfg.rung + '/' + cfg.rungs + ' · zwaarte ' + moeilijk + '%');
  }

  function giveUpIfBusy() {
    if (st && !finished && st.moves >= 12) {
      Store.recordLoss();
      var d = Store.bumpLadder(cfg.level, 'loss', false);
      if (d < 0) toast('Trede omlaag naar ' + Store.ladder[cfg.level]);
    }
  }

  function onWin() {
    if (finished) return;
    finished = true; busy = false;
    pauseTimer();
    var ms = elapsed(), sec = Math.round(ms / 1000);
    lastWin = { ms: ms, moves: st.moves };
    var mult = cfg.level === 'pro' ? 1.8 : cfg.level === 'gevorderd' ? 1.35 : 1;
    mult *= (1 + 0.05 * (cfg.rung - 1));
    var total = Math.round((130 + Math.max(0, 600 - sec) * 2 + Math.max(0, 200 - st.moves) * 5) * mult);
    st.score = total;
    Store.recordWin(ms, st.moves);

    var entry = {
      name: naam().slice(0, 14), ms: ms, moves: st.moves, score: total,
      deal: st.deal, level: cfg.level, rung: cfg.rung, cells: cfg.cells,
      daily: isDaily, hints: used.hints, undos: used.undos, ts: Date.now()
    };
    Store.addScore(entry);
    stuurScoreOnline(entry);

    var fast = sec <= cfg.target * 0.6;
    var delta = Store.bumpLadder(cfg.level, 'win', fast);

    // doelen
    var newly = [];
    if (Store.unlock('first')) newly.push('first');
    if (sec <= 300 && Store.unlock('m5')) newly.push('m5');
    if (sec <= 180 && Store.unlock('m3')) newly.push('m3');
    if (st.moves <= 120 && Store.unlock('lean')) newly.push('lean');
    if (used.hints === 0 && used.undos === 0 && Store.unlock('clean')) newly.push('clean');
    if (Store.stats.streak >= 3 && Store.unlock('streak3')) newly.push('streak3');
    if (isDaily && Store.unlock('daily')) newly.push('daily');
    if (cfg.cells <= 3 && Store.unlock('cells3')) newly.push('cells3');
    if (Store.ladder.pro >= 5 && Store.unlock('pro5')) newly.push('pro5');
    if (Store.stats.won >= 10 && Store.unlock('ten')) newly.push('ten');
    if (Store.ladder[cfg.level] >= cfg.rungs && Store.unlock('summit')) newly.push('summit');

    var lvlList = Store.sortBy(Store.filtered('level', { level: cfg.level }), 'ms');
    var pos = lvlList.indexOf(entry) + 1;
    if (pos === 1 && Store.unlock('top')) newly.push('top');

    $('win-time').textContent = fmt(ms);
    $('win-moves').textContent = st.moves;
    $('win-score').textContent = total;
    $('win-rank').textContent = 'Plek ' + pos + ' van ' + lvlList.length + ' op ' + cfg.levelName;
    var lad = delta > 0
      ? 'Trede ' + (delta > 1 ? 'dubbel ' : '') + 'omhoog → ' + Store.ladder[cfg.level] + '/' + cfg.rungs +
        (delta > 1 ? ' (snelle winst!)' : '')
      : 'Hoogste trede van ' + cfg.levelName + ' bereikt';
    if (newly.length) lad += ' · ' + (newly.length > 1 ? newly.length + ' nieuwe doelen' : '1 nieuw doel') + ' behaald';
    $('win-ladder').textContent = lad;
    $('win-namerow').style.display = 'none';
    localStorage.removeItem('fc.game');
    sfx.win(); confetti();
    open('ov-win');
    updateHUD();
  }

  /* ---------------- opslaan/hervatten ---------------- */
  function saveGame() {
    if (finished) return;
    try {
      localStorage.setItem('fc.game', JSON.stringify({
        st: st, cfg: cfg, used: used, daily: isDaily, ms: elapsed(),
        hist: history.slice(-30)
      }));
    } catch (e) {}
  }
  function resumeGame() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('fc.game') || 'null'); } catch (e) {}
    if (!raw || !raw.st) return false;
    st = raw.st; cfg = raw.cfg; used = raw.used || { hints: 0, undos: 0 };
    isDaily = raw.daily; history = raw.hist || [];
    timer = { acc: raw.ms || 0, start: 0, running: false };
    finished = false; humanMoved = st.moves > 0;
    render(false);
    $('btn-auto').disabled = !Eng.anyFoundationMove(st);
    toast('Vorig spel hervat — de klok loopt bij je eerste zet');
    return true;
  }

  /* ---------------- delen ---------------- */
  function shareUrl(deal) {
    var base = location.origin + location.pathname;
    if (base.indexOf('http') !== 0) base = 'https://graittstudio.com/freecell/spelen/';
    return base + '?spel=' + deal;
  }
  function share(text, deal) {
    var url = shareUrl(deal);
    if (navigator.share) {
      navigator.share({ title: 'FreeCell', text: text, url: url }).catch(function () {});
      return;
    }
    var full = text + ' ' + url;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(full).then(function () { toast('Uitdaging gekopieerd — plak hem in een appje'); },
        function () { prompt('Kopieer deze uitdaging:', full); });
    } else prompt('Kopieer deze uitdaging:', full);
  }
  function shareDeal() {
    share('Speel jij FreeCell #' + st.deal + ' sneller dan ik?', st.deal);
  }
  function shareWin(ms, moves) {
    share('FreeCell #' + st.deal + ' uitgespeeld in ' + fmt(ms) + ' met ' + moves + ' zetten. Haal jij dat?', st.deal);
  }
  function dealFromUrl() {
    var m = /[?&#]spel=(\d{1,7})/.exec(location.search + location.hash);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return (n >= 1 && n <= 1000000) ? n : null;
  }

  /* ---------------- club: samen spelen ---------------- */
  var online = { lijst: [], geladen: 0, bezig: false, fout: '' };

  function heeftClub() { return !!S.club; }

  function toonClub() {
    var aan = heeftClub();
    $('club-uit').style.display = aan ? 'none' : '';
    $('club-aan').style.display = aan ? '' : 'none';
    if (aan) {
      $('club-toon').textContent = S.club;
      $('club-naam').textContent = S.clubNaam || '';
      $('club-delen').checked = S.clubDelen !== false;
    }
  }

  $('club-maak').onclick = function () {
    var knop = this; knop.disabled = true; knop.textContent = 'Bezig…';
    Online.maakClub((P.naam ? P.naam + 's club' : 'Onze club')).then(function (c) {
      knop.disabled = false; knop.textContent = 'Club maken';
      if (!c) { toast('Dat lukte niet'); return; }
      S.club = c.code; S.clubNaam = c.naam; S.clubDelen = true;
      Store.saveSettings(); toonClub(); pingNu();
      toast('Club ' + c.code + ' is klaar — deel de uitnodiging');
    }).catch(function () {
      knop.disabled = false; knop.textContent = 'Club maken';
      toast('Geen verbinding — probeer het zo nog eens');
    });
  };

  function doeMee(code, stil) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) { if (!stil) toast('Een code bestaat uit 6 tekens'); return; }
    Online.zoekClub(code).then(function (c) {
      if (!c) { if (!stil) toast('Die code ken ik niet'); return; }
      S.club = c.code; S.clubNaam = c.naam; S.clubDelen = true;
      Store.saveSettings(); toonClub(); pingNu();
      toast('Je speelt nu mee met ' + (c.naam || c.code));
    }).catch(function () { if (!stil) toast('Geen verbinding'); });
  }
  $('club-mee').onclick = function () { doeMee($('club-code').value); };
  $('club-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') doeMee(this.value); });

  $('club-weg').onclick = function () {
    S.club = ''; S.clubNaam = ''; Store.saveSettings(); toonClub();
    toast('Je doet niet meer mee aan de clubranglijst');
  };
  $('club-delen').addEventListener('change', function () {
    S.clubDelen = this.checked; Store.saveSettings();
  });
  $('club-deel').onclick = function () {
    var url = shareUrl(st.deal) + '&club=' + S.club;
    var tekst = 'Doe mee met FreeCell! Onze code is ' + S.club + '.';
    if (navigator.share) navigator.share({ title: 'FreeCell', text: tekst, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(tekst + ' ' + url)
      .then(function () { toast('Uitnodiging gekopieerd'); });
    else prompt('Deel deze uitnodiging:', tekst + ' ' + url);
  };

  /* Laat de club weten dat je er bent (en of je aan het spelen bent). */
  function pingNu() {
    if (!heeftClub() || document.hidden) return Promise.resolve();
    return Online.ping(S.club, P.id, naam(), timer.running, st ? st.deal : null).catch(function () {});
  }
  setInterval(pingNu, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pingNu(); });

  function stuurScoreOnline(entry) {
    if (!heeftClub() || S.clubDelen === false) return;
    Online.stuurScore(S.club, {
      speler_id: P.id, naam: entry.name, tekst: P.tekst || '', ms: entry.ms, moves: entry.moves,
      score: entry.score, deal: entry.deal, level: entry.level, rung: entry.rung,
      cells: entry.cells, hints: entry.hints, undos: entry.undos, daily: entry.daily
    }).catch(function () { /* stil: het staat lokaal al opgeslagen */ });
  }

  /* ---------------- confetti ---------------- */
  function confetti() {
    var cv = $('confetti'), ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight; cv.classList.add('on');
    var parts = [], colors = ['#ffd54a', '#57e194', '#7ce0ff', '#ff7aa2', '#fff'];
    for (var i = 0; i < 140; i++) parts.push({
      x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
      vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3.5,
      s: 4 + Math.random() * 6, r: Math.random() * 6.28,
      c: colors[(Math.random() * colors.length) | 0]
    });
    var end = Date.now() + 3200;
    (function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.r += 0.1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      });
      if (Date.now() < end) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, cv.width, cv.height); cv.classList.remove('on'); }
    })();
  }

  /* ---------------- overlays ---------------- */
  var lbTimer = null;
  function open(id) {
    document.querySelectorAll('.overlay.on').forEach(function (o) { o.classList.remove('on'); });
    $(id).classList.add('on');
    if (id !== 'ov-win') pauseTimer();
    if (id === 'ov-board') {
      if (heeftClub() && !$('lb-scope').dataset.gekozen) {
        lbScope = 'club';
        $('lb-scope').querySelectorAll('.tab').forEach(function (t) {
          t.classList.toggle('on', t.dataset.scope === 'club');
        });
      }
      if (lbScope === 'club') pingNu().then(function () { laadClub(true); });
      renderBoardList();
      lbTimer = setInterval(renderBoardList, 1000);
    }
  }
  function close() {
    if (!P.naam && $('ov-hallo').classList.contains('on')) { $('hallo-naam').focus(); return; }
    document.querySelectorAll('.overlay.on').forEach(function (o) { o.classList.remove('on'); });
    clearInterval(lbTimer); lbTimer = null;
    if (!finished && st && st.moves > 0) startTimerIfNeeded();
  }
  document.addEventListener('click', function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute('data-close')) close();
    if (e.target.classList && e.target.classList.contains('overlay')) close();
  });

  /* ---- ranglijst ---- */
  var lbSort = 'ms', lbScope = 'level';
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'zojuist';
    if (m < 60) return m + ' min geleden';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' uur geleden';
    var d = Math.floor(h / 24);
    return d === 1 ? 'gisteren' : d + ' dagen geleden';
  }
  /* De clublijst komt van de server; niet elke seconde opnieuw ophalen. */
  function laadClub(force) {
    if (!heeftClub()) return;
    var nu = Date.now();
    if (!force && nu - online.geladen < 15000) return;
    online.geladen = nu; online.bezig = true; online.fout = '';
    Promise.all([Online.top(S.club, lbSort), Online.wieNu(S.club)])
      .then(function (r) {
        online.lijst = r[0] || [];
        online.aanwezig = (r[1] || []).filter(function (w) { return w.speler_id !== P.id; });
        online.bezig = false; renderBoardList();
      })
      .catch(function (e) {
        online.bezig = false; online.fout = 'Geen verbinding met de club.';
        renderBoardList();
      });
  }

  function renderClubLijst() {
    var tb = $('lb-body'), regel = $('lb-online');
    if (!heeftClub()) {
      regel.textContent = '';
      tb.innerHTML = '<tr><td class="empty" colspan="6">Je zit nog niet in een club.<br>' +
        'Maak er een in <b>Mijn menu</b> en deel de code — dan spelen jullie in dezelfde lijst.</td></tr>';
      $('lb-note').textContent = 'Alleen wie jullie code heeft, ziet deze lijst.';
      return;
    }
    var wie = online.aanwezig || [];
    if (wie.length) {
      var spelend = wie.filter(function (w) { return w.bezig; }).length;
      regel.innerHTML = '<span class="stip"></span>Nu online: <b>' +
        wie.map(function (w) { return esc(w.naam); }).join(', ') + '</b>' +
        (spelend ? ' — ' + spelend + ' aan het spelen' : '');
    } else {
      regel.textContent = online.bezig ? 'Even kijken wie er zijn…' : 'Nu niemand anders online.';
    }
    var lijst = online.lijst || [];
    if (online.fout) {
      tb.innerHTML = '<tr><td class="empty" colspan="6">' + online.fout + '<br>Je eigen tijden staan er nog gewoon.</td></tr>';
    } else if (!lijst.length) {
      tb.innerHTML = '<tr><td class="empty" colspan="6">' + (online.bezig ? 'Bezig met ophalen…' :
        'Nog geen tijden in deze club. Win een potje en jij staat als eerste.') + '</td></tr>';
    } else {
      var html = '<tr class="head"><td class="pos">#</td><td class="av"></td><td class="nm">Speler</td>' +
        '<td class="num">Tijd</td><td class="num">Zetten</td><td class="num">Score</td></tr>';
      lijst.slice(0, 60).forEach(function (r, i) {
        var ik = r.speler_id === P.id;
        var av = (ik && P.foto)
          ? '<span class="avatar rij heeft" style="background-image:url(' + P.foto + ')"></span>'
          : '<span class="avatar rij" style="background:' + kleurVan(r.naam) + '">' + esc(initialen(r.naam)) + '</span>';
        var sub = (Store.LEVELS[r.niveau] ? Store.LEVELS[r.niveau].icon : '') + ' trede ' + (r.trede || 1) +
          ' · #' + r.spel + ' · ' + ago(new Date(r.gemaakt_op).getTime());
        html += '<tr class="' + (i === 0 ? 'top1 ' : '') + (ik ? 'me' : '') + '">' +
          '<td class="pos">' + (i + 1) + '</td><td class="av">' + av + '</td>' +
          '<td class="nm">' + esc(r.naam) + '<i>' + sub + '</i></td>' +
          '<td class="num">' + fmt(r.tijd_ms) + '</td>' +
          '<td class="num">' + r.zetten + '</td>' +
          '<td class="num">' + r.score + '</td></tr>';
      });
      tb.innerHTML = html;
    }
    $('lb-note').textContent = 'Club ' + S.club + (S.clubNaam ? ' · ' + S.clubNaam : '') +
      ' · alleen wie de code heeft ziet deze lijst.';
  }

  function renderBoardList() {
    if (lbScope === 'club') { laadClub(false); renderClubLijst(); return; }
    $('lb-online').textContent = '';
    var ctx = { level: cfg.level, deal: st.deal };
    var list = Store.filtered(lbScope, ctx).slice();
    var live = null;
    if (!finished && st.moves > 0) {
      live = { name: naam() + ' (bezig)', ms: elapsed(), moves: st.moves,
               score: st.score, deal: st.deal, level: cfg.level, rung: cfg.rung,
               daily: isDaily, ts: Date.now(), _live: true };
      if (lbScope === 'all' || (lbScope === 'level' && live.level === ctx.level) ||
          (lbScope === 'deal' && live.deal === ctx.deal) || (lbScope === 'daily' && isDaily)) list.push(live);
    }
    list = Store.sortBy(list, lbSort);
    var tb = $('lb-body');
    var head = '<tr class="head"><td class="pos">#</td><td class="av"></td><td class="nm">Speler</td>' +
               '<td class="num">Tijd</td><td class="num">Zetten</td><td class="num">Score</td></tr>';
    if (!list.length) { tb.innerHTML = '<tr><td class="empty" colspan="6">Nog geen tijden — win een potje en je staat hier.</td></tr>'; }
    else {
      var html = head;
      list.slice(0, 60).forEach(function (s, i) {
        var cls = (s._live ? 'live ' : '') + (i === 0 ? 'top1 ' : '') + (!s._live && s.name === naam() ? 'me' : '');
        var sub = (Store.LEVELS[s.level] ? Store.LEVELS[s.level].icon : '') + ' trede ' + (s.rung || 1) +
                  ' · #' + s.deal + (s._live ? '' : ' · ' + ago(s.ts));
        var eigen = s._live || s.name === naam();
        var av = (eigen && P.foto)
          ? '<span class="avatar rij heeft" style="background-image:url(' + P.foto + ')"></span>'
          : '<span class="avatar rij" style="background:' + kleurVan(s.name) + '">' + esc(initialen(s.name)) + '</span>';
        html += '<tr class="' + cls + '"><td class="pos">' + (i + 1) + '</td>' +
          '<td class="av">' + av + '</td>' +
          '<td class="nm">' + esc(s.name) + '<i>' + sub + '</i></td>' +
          '<td class="num">' + fmt(s.ms) + '</td>' +
          '<td class="num">' + s.moves + '</td>' +
          '<td class="num">' + s.score + '</td></tr>';
      });
      tb.innerHTML = html;
    }
    $('lb-note').textContent = live
      ? 'Je huidige potje staat live in de lijst en zakt elke seconde — speel sneller om te stijgen.'
      : 'Gesorteerd op ' + (lbSort === 'ms' ? 'tijd' : lbSort === 'moves' ? 'zetten' : 'score') + '.';
  }
  function esc(s) { return String(s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  $('lb-sort').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    lbSort = b.dataset.sort;
    this.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t === b); });
    if (lbScope === 'club') laadClub(true);
    renderBoardList();
  });
  $('lb-scope').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    lbScope = b.dataset.scope;
    this.dataset.gekozen = '1';
    this.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t === b); });
    if (lbScope === 'club') laadClub(true);
    renderBoardList();
  });

  /* ---- doelen ---- */
  function renderGoals() {
    var html = '';
    Store.GOALS.forEach(function (g) {
      var done = !!Store.goals[g.id];
      html += '<div class="goal' + (done ? ' done' : '') + '"><span class="g-ico">' + g.ico + '</span>' +
        '<span><b>' + g.t + '</b><small>' + g.d + '</small></span></div>';
    });
    $('goals-list').innerHTML = html;
  }

  /* ---- instellingen ---- */
  var BGS = [['felt', 'Vilt', '#0d6438'], ['night', 'Nacht', '#16233d'], ['wood', 'Hout', '#3d2211'],
             ['wine', 'Bordeaux', '#5b1226'], ['sunset', 'Zonsondergang', '#e0577f'], ['mono', 'Grijs', '#22262b']];
  var DECKS = [['classic', 'Klassiek'], ['pips', 'Volledige kaarten *'], ['four', 'Vier kleuren'],
               ['big', 'Groot & simpel'], ['night', 'Donker']];

  var THEMAS = [['auto', 'Volg mijn telefoon'], ['licht', 'Licht'], ['donker', 'Donker']];
  function renderIk() {
    $('set-name').value = P.naam || '';
    $('set-tekst').value = P.tekst || '';
    zetAvatar($('set-avatar'), naam(), P.foto, true);
    toonClub();
    $('set-thema').innerHTML = THEMAS.map(function (t) {
      return '<button class="chip' + ((S.thema || 'auto') === t[0] ? ' on' : '') + '" data-thema="' + t[0] + '">' +
        t[1] + '</button>';
    }).join('');
  }
  $('set-thema').addEventListener('click', function (e) {
    var b = e.target.closest('[data-thema]'); if (!b) return;
    S.thema = b.dataset.thema; Store.saveSettings(); applyLook(); renderIk(); render(false);
  });
  $('ik-ranglijst').onclick = function () { open('ov-board'); };
  $('ik-doelen').onclick = function () { renderGoals(); open('ov-goals'); };
  $('ik-instellingen').onclick = function () { renderSettings(); open('ov-settings'); };
  $('btn-naar-ik').onclick = function () { renderIk(); open('ov-ik'); };

  function renderSettings() {
    $('set-bg').innerHTML = BGS.map(function (b) {
      return '<button class="chip' + (S.bg === b[0] ? ' on' : '') + '" data-bg="' + b[0] + '">' +
             '<span class="sw" style="background:' + b[2] + '"></span>' + b[1] + '</button>';
    }).join('');
    $('set-deck').innerHTML = DECKS.map(function (d) {
      return '<button class="chip' + (S.deck === d[0] ? ' on' : '') + '" data-deck="' + d[0] + '">' + d[1] + '</button>';
    }).join('');
    $('set-letters').innerHTML =
      '<button class="chip' + (S.letters === 'jqk' ? ' on' : '') + '" data-let="jqk">A J Q K</button>' +
      '<button class="chip' + (S.letters === 'bvh' ? ' on' : '') + '" data-let="bvh">A B V H</button>';
    $('set-autoplay').checked = S.autoplay;
    $('set-sound').checked = S.sound;
    $('set-anim').checked = S.anim;
    $('set-lefty').checked = S.lefty;
    var t = Store.stats;
    $('stats-box').innerHTML =
      '<span>Gespeeld</span><b>' + t.played + '</b>' +
      '<span>Gewonnen</span><b>' + t.won + ' (' + (t.played ? Math.round(t.won / t.played * 100) : 0) + '%)</b>' +
      '<span>Reeks nu</span><b>' + t.streak + '</b>' +
      '<span>Beste reeks</span><b>' + t.bestStreak + '</b>' +
      '<span>Snelste</span><b>' + (t.bestMs ? fmt(t.bestMs) : '–') + '</b>' +
      '<span>Minste zetten</span><b>' + (t.bestMoves || '–') + '</b>';
    $('ver').textContent = Store.VERSION;
    updateInstallBox();
  }
  function themaLicht() {
    if (S.thema === 'licht') return true;
    if (S.thema === 'donker') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }
  function applyLook() {
    document.body.className = 'bg-' + S.bg + ' deck-' + S.deck +
      (S.lefty ? ' lefty' : '') + (themaLicht() ? ' licht' : '');
    var mt = document.querySelector('meta[name=theme-color]');
    if (mt) mt.setAttribute('content', themaLicht() ? '#5cbb86' : '#0b5c34');
    sizeBoard();
  }
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (!S.thema || S.thema === 'auto') applyLook();
      });
    } catch (e) {}
  }

  $('set-bg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-bg]'); if (!b) return;
    S.bg = b.dataset.bg; Store.saveSettings(); applyLook(); renderSettings();
  });
  $('set-deck').addEventListener('click', function (e) {
    var b = e.target.closest('[data-deck]'); if (!b) return;
    S.deck = b.dataset.deck; Store.saveSettings(); applyLook(); renderSettings(); render(false);
  });
  $('set-letters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-let]'); if (!b) return;
    S.letters = b.dataset.let; Store.saveSettings(); renderSettings(); render(false);
  });
  function profielGewijzigd() {
    Store.saveProfiel();
    $('pill-ik').style.display = P.naam ? '' : 'none';
    zetAvatar($('set-avatar'), naam(), P.foto, true);
    zetAvatar($('ik-avatar'), naam(), P.foto, true);
    $('ik-naam').textContent = naam();
  }
  $('set-name').addEventListener('input', function () {
    P.naam = this.value.trim().slice(0, 14); profielGewijzigd();
  });
  $('set-tekst').addEventListener('input', function () {
    P.tekst = this.value.trim().slice(0, 34); profielGewijzigd();
  });
  $('set-avatar').onclick = function () { kiesFoto(profielGewijzigd); };
  $('btn-foto').onclick = function () { kiesFoto(profielGewijzigd); };
  $('btn-foto-weg').onclick = function () { P.foto = ''; profielGewijzigd(); toast('Foto weggehaald'); };
  $('pill-ik').onclick = function () { renderIk(); open('ov-ik'); };
  ['autoplay', 'sound', 'anim', 'lefty'].forEach(function (k) {
    $('set-' + k).addEventListener('change', function () {
      S[k] = this.checked; Store.saveSettings(); applyLook();
      if (k === 'autoplay' && this.checked) afterMove();
    });
  });
  $('btn-reset-stats').addEventListener('click', function () {
    if (confirm('Alle statistieken, ranglijst en treden wissen?')) {
      Store.resetAll(); renderSettings(); toast('Alles gewist'); renderLadderUI();
    }
  });

  /* ---- nieuw-spel scherm ---- */
  function renderLadderUI() {
    var keys = ['beginner', 'gevorderd', 'pro'];
    $('set-level').innerHTML = keys.map(function (k) {
      var L = Store.LEVELS[k];
      return '<button class="lvl' + (S.level === k ? ' on' : '') + '" data-lvl="' + k + '">' +
        '<b>' + L.icon + ' ' + L.name + '</b><small>' + L.blurb + '</small></button>';
    }).join('');
    var c = Store.currentConfig();
    $('ladder-title').textContent = 'Trede ' + c.rung + ' van ' + c.rungs;
    $('ladder-sub').textContent = 'zwaarte ' + Math.round(c.pct * 100) + '%';
    $('ladder-fill').style.width = (c.rung / c.rungs * 100) + '%';
    $('ladder-desc').textContent =
      c.cells + ' vrije cellen · ' + (c.hints >= 99 ? 'onbeperkt hints' : c.hints + ' hint' + (c.hints === 1 ? '' : 's')) +
      ' · ' + (c.undos >= 99 ? 'onbeperkt terugdraaien' : c.undos + 'x terugdraaien') +
      ' · streeftijd ' + fmt(c.target * 1000) +
      '. Win en je gaat een trede omhoog; binnen ' + fmt(c.target * 600) + ' zelfs twee. Opgeven kost een trede.';
  }
  $('set-level').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lvl]'); if (!b) return;
    S.level = b.dataset.lvl; Store.saveSettings(); renderLadderUI();
  });

  /* ---------------- knoppen ---------------- */
  $('btn-settings').onclick = function () { renderSettings(); open('ov-settings'); };
  $('btn-goals').onclick = function () { renderGoals(); open('ov-goals'); };
  $('pill-level').onclick = function () { renderLadderUI(); open('ov-new'); };
  $('pill-deal').onclick = function () { renderLadderUI(); open('ov-new'); };
  $('pill-rank').onclick = function () { open('ov-board'); };
  $('btn-new').onclick = function () { renderLadderUI(); open('ov-new'); };
  $('btn-board').onclick = function () { open('ov-board'); };
  $('btn-hint').onclick = hint;
  $('btn-auto').onclick = autoFinish;
  $('btn-undo').onclick = undo;

  $('btn-start-ladder').onclick = function () { giveUpIfBusy(); close(); newGame(null, false); };
  $('btn-start-daily').onclick = function () { giveUpIfBusy(); close(); newGame(Deal.dailyNumber(), true); };
  $('btn-start-again').onclick = function () { var d = st.deal, dd = isDaily; close(); newGame(d, dd); };
  $('btn-start-number').onclick = function () {
    var n = parseInt($('deal-input').value, 10);
    if (!n || n < 1 || n > 1000000) { toast('Kies een nummer tussen 1 en 1.000.000'); return; }
    giveUpIfBusy(); close(); newGame(n, false);
  };
  $('btn-win-next').onclick = function () {
    close(); newGame(null, false);
  };
  $('btn-win-board').onclick = function () {
    open('ov-board');
  };
  $('btn-share-deal').onclick = shareDeal;
  $('btn-win-share').onclick = function () { shareWin(lastWin.ms, lastWin.moves); };
  $('btn-lose-undo').onclick = function () { close(); undo(); };
  $('btn-lose-new').onclick = function () { giveUpIfBusy(); close(); newGame(null, false); };

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    var k = e.key.toLowerCase();
    if (k === 'escape') close();
    else if (k === 'u' || k === 'z') undo();
    else if (k === 'h') hint();
    else if (k === 'a' || k === ' ') { e.preventDefault(); autoFinish(); }
    else if (k === 'n') { renderLadderUI(); open('ov-new'); }
    else if (k === 'l') open('ov-board');
  });

  window.addEventListener('resize', function () { sizeBoard(); render(false); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { pauseTimer(); saveGame(); }
    else if (st && !finished && st.moves > 0 && !document.querySelector('.overlay.on')) startTimerIfNeeded();
  });
  window.addEventListener('beforeunload', saveGame);

  /* Kleine testhaak (handig om zetten/eindscherm te controleren vanuit de console). */
  window.FC = {
    state: function () { return st; },
    setState: function (o) { st = o; history = []; render(false); afterMove(); },
    nearWin: function () {
      var s2 = Eng.create(st.deal, cfg.cells), i, r;
      s2.cols = [[], [], [], [], [], [], [], []];
      for (i = 0; i < 4; i++) { s2.found[i] = []; for (r = 1; r <= 11; r++) s2.found[i].push(i * 13 + r - 1); }
      s2.cols[0] = [11, 24]; s2.cols[1] = [37, 50]; s2.cols[2] = [12, 25]; s2.cols[3] = [38, 51];
      s2.score = 44 * 10;
      window.FC.setState(s2);
    }
  };

  /* ---------------- installeren / service worker ---------------- */
  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installPrompt = e; updateInstallBox();
  });
  function inApp() {
    return !!window.Capacitor || window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }
  function updateInstallBox() {
    var box = $('install-box');
    if (!box) return;
    if (window.Capacitor) {                       // draait al als Android-app
      box.innerHTML = '<p class="fineprint">Je speelt de Android-app, versie ' + Store.VERSION + '.</p>';
      return;
    }
    var apk = $('btn-apk'), inst = $('btn-install');
    if (inApp()) {
      inst.style.display = 'none';
      $('install-note').innerHTML = 'Staat al op je startscherm. De Android-app (gratis APK) kan ook.';
    } else if (installPrompt) {
      inst.style.display = '';
      $('install-note').textContent = 'De APK is gratis; "Aan startscherm" werkt zonder installeren.';
    } else {
      inst.style.display = 'none';
      $('install-note').innerHTML = 'De Android-app is gratis. Liever niets installeren? Kies in het menu van ' +
        'je browser <b>Toevoegen aan startscherm</b> — dan speelt het ook offline.';
    }
    if (apk) apk.style.display = /Android/i.test(navigator.userAgent) || !/Mobi/i.test(navigator.userAgent) ? '' : 'none';
  }
  document.addEventListener('click', function (e) {
    if (e.target.id !== 'btn-install' || !installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then(function () { installPrompt = null; updateInstallBox(); });
  });
  /* ---------------- nieuwe versie melden ---------------- */
  var svgReg = null, vernieuwt = false;

  function toonUpdate(versie, nieuws, apkUrl) {
    $('up-versie').textContent = versie ? 'v' + versie : '';
    $('up-nieuws').innerHTML = (nieuws || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');
    var knop = $('up-nu');
    if (apkUrl) {
      $('up-uitleg').textContent = 'Er staat een nieuwere app klaar om te downloaden.';
      knop.textContent = 'Nieuwe app ophalen';
      knop.onclick = function () { window.open(apkUrl, '_blank'); close(); };
    } else {
      $('up-uitleg').textContent = 'De nieuwe versie staat klaar. Even vernieuwen en je speelt bij.';
      knop.textContent = 'Nu vernieuwen';
      knop.onclick = function () {
        vernieuwt = true;
        if (svgReg && svgReg.waiting) svgReg.waiting.postMessage({ type: 'NU_VERNIEUWEN' });
        else location.reload();
      };
    }
    if (document.querySelector('.overlay.on')) return;   // niet over een ander venster heen
    open('ov-update');
  }

  function haalNieuws(klaar) {
    fetch('versie.json?t=' + Date.now()).then(function (r) { return r.json(); })
      .then(function (v) { klaar(v.versie, v.nieuws); })
      .catch(function () { klaar('', []); });
  }

  if ('serviceWorker' in navigator && !window.Capacitor && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        svgReg = reg;
        function bekijk(w) {
          if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) haalNieuws(toonUpdate);
          });
        }
        if (reg.waiting && navigator.serviceWorker.controller) haalNieuws(toonUpdate);
        bekijk(reg.installing);
        reg.addEventListener('updatefound', function () { bekijk(reg.installing); });
        setInterval(function () { reg.update().catch(function () {}); }, 20 * 60 * 1000);
      }).catch(function () {});
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (vernieuwt) location.reload();
      });
    });
  }

  /* Ook zonder service-worker-signaal kijken we bij het opstarten of de
     bestanden op de server nieuwer zijn dan de code die nu draait. Dat vangt
     het geval waarin iemand nog een oude versie uit zijn cache draait. */
  if (!window.Capacitor && location.protocol.indexOf('http') === 0) {
    setTimeout(function () {
      fetch('versie.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); })
        .then(function (v) { if (v && v.versie && v.versie !== Store.VERSION) toonUpdate(v.versie, v.nieuws); })
        .catch(function () {});
    }, 2500);
  }

  /* In de Android-app kan de app zichzelf niet vernieuwen; daar kijken we of er
     een nieuwere APK op de site staat. Zonder internet gebeurt er niets. */
  if (window.Capacitor) {
    setTimeout(function () {
      var basis = 'https://paulirikx.github.io/freecell/';
      fetch(basis + 'versie.json?t=' + Date.now()).then(function (r) { return r.json(); })
        .then(function (v) {
          if (!v || !v.versie || v.versie === Store.VERSION) return;
          var a = v.versie.split('.').map(Number), b = Store.VERSION.split('.').map(Number);
          var nieuwer = a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
          if (nieuwer) toonUpdate(v.versie, v.nieuws, basis + (v.apk || 'FreeCell.apk'));
        }).catch(function () {});
    }, 3000);
  }

  /* Android-terugknop: eerst een open venster sluiten, pas daarna de app. */
  (function () {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.App) return;
    try {
      window.Capacitor.Plugins.App.addListener('backButton', function () {
        if (document.querySelector('.overlay.on')) { close(); return; }
        window.Capacitor.Plugins.App.exitApp();
      });
    } catch (e) {}
  })();

  /* ---------------- eerste start: wie ben jij? ---------------- */
  function toonWelkom() {
    zetAvatar($('hallo-avatar'), naam(), P.foto, true);
    $('hallo-naam').value = P.naam || '';
    $('hallo-tekst').value = P.tekst || '';
    $('hallo-start').disabled = !$('hallo-naam').value.trim();
    open('ov-hallo');
    setTimeout(function () { $('hallo-naam').focus(); }, 250);
  }
  $('hallo-naam').addEventListener('input', function () {
    $('hallo-start').disabled = !this.value.trim();
  });
  $('hallo-naam').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && this.value.trim()) $('hallo-start').click();
  });
  $('hallo-avatar').onclick = function () {
    kiesFoto(function () { zetAvatar($('hallo-avatar'), naam(), P.foto, true); });
  };
  $('hallo-foto').onclick = $('hallo-avatar').onclick;
  $('hallo-start').onclick = function () {
    var n = $('hallo-naam').value.trim().slice(0, 14);
    if (!n) return;
    P.naam = n;
    P.tekst = $('hallo-tekst').value.trim().slice(0, 34);
    Store.saveProfiel();
    toonIk();
    close();
    toast('Veel plezier, ' + P.naam + '!');
  };
  function toonIk() {
    $('pill-ik').style.display = P.naam ? '' : 'none';
    zetAvatar($('ik-avatar'), naam(), P.foto, true);
    $('ik-naam').textContent = naam();
  }

  /* ---------------- start ---------------- */
  applyLook();
  sizeBoard();
  toonIk();
  cfg = Store.currentConfig();
  var clubUitUrl = (/[?&#]club=([A-Za-z0-9]{6})/.exec(location.search + location.hash) || [])[1];
  if (clubUitUrl && !S.club) setTimeout(function () { doeMee(clubUitUrl, true); }, 1200);
  var uitdaging = dealFromUrl();
  if (uitdaging) {
    newGame(uitdaging, false);
    setTimeout(function () { toast('Uitdaging geopend: spel #' + uitdaging); }, 2400);
  } else if (!resumeGame()) newGame(null, false);
  renderLadderUI();
  if (!P.naam) toonWelkom();
})();
