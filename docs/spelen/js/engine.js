/* ============================================================
   engine.js - FreeCell-regels, zetten, hints, auto-afleggen
   ============================================================ */
var Eng = (function () {

  function rank(c) { return (c % 13) + 1; }
  function suit(c) { return Math.floor(c / 13); }
  function isRed(c) { var s = suit(c); return s === 1 || s === 2; }
  function sameColor(a, b) { return isRed(a) === isRed(b); }

  function create(dealNo, cellCount) {
    var cols = Deal.msDeal(dealNo);
    var free = [];
    for (var i = 0; i < 4; i++) free.push(i < cellCount ? null : 'X'); // 'X' = geblokkeerde cel
    return {
      deal: dealNo,
      cells: cellCount,
      free: free,
      found: [[], [], [], []],
      cols: cols,
      moves: 0,
      score: 0,
      undos: 0,
      hints: 0
    };
  }

  function clone(st) {
    return {
      deal: st.deal, cells: st.cells,
      free: st.free.slice(),
      found: [st.found[0].slice(), st.found[1].slice(), st.found[2].slice(), st.found[3].slice()],
      cols: st.cols.map(function (c) { return c.slice(); }),
      moves: st.moves, score: st.score, undos: st.undos, hints: st.hints
    };
  }

  function freeCount(st) {
    var n = 0;
    for (var i = 0; i < 4; i++) if (st.free[i] === null) n++;
    return n;
  }
  function emptyCols(st) {
    var n = 0;
    for (var i = 0; i < 8; i++) if (st.cols[i].length === 0) n++;
    return n;
  }
  function maxMove(st, toEmpty) {
    var e = emptyCols(st) - (toEmpty ? 1 : 0);
    if (e < 0) e = 0;
    return (freeCount(st) + 1) * Math.pow(2, e);
  }

  /* Hoeveel kaarten vanaf index i in kolom c vormen een geldige reeks? */
  function runLength(st, col, idx) {
    var c = st.cols[col], n = c.length;
    if (idx < 0 || idx >= n) return 0;
    var len = 1;
    for (var k = idx; k < n - 1; k++) {
      if (rank(c[k]) === rank(c[k + 1]) + 1 && !sameColor(c[k], c[k + 1])) len++;
      else return 0; // geen aaneengesloten reeks tot onderaan -> niet verplaatsbaar
    }
    return len;
  }

  function cardsOf(st, src) {
    if (src.kind === 'free') return st.free[src.i] === null || st.free[src.i] === 'X' ? [] : [st.free[src.i]];
    if (src.kind === 'found') {
      var f = st.found[src.i];
      return f.length ? [f[f.length - 1]] : [];
    }
    return st.cols[src.i].slice(src.idx);
  }

  function canMove(st, src, dst) {
    var cards = cardsOf(st, src);
    if (!cards.length) return false;
    if (src.kind === 'col') {
      if (runLength(st, src.i, src.idx) !== cards.length) return false;
    }
    if (dst.kind === 'found') {
      if (cards.length !== 1) return false;
      var c = cards[0];
      return dst.i === suit(c) && st.found[dst.i].length === rank(c) - 1;
    }
    if (dst.kind === 'free') {
      return cards.length === 1 && st.free[dst.i] === null;
    }
    if (dst.kind === 'col') {
      if (src.kind === 'col' && src.i === dst.i) return false;
      var col = st.cols[dst.i];
      if (col.length === 0) return cards.length <= maxMove(st, true);
      var top = col[col.length - 1];
      return rank(top) === rank(cards[0]) + 1 && !sameColor(top, cards[0]) &&
             cards.length <= maxMove(st, false);
    }
    return false;
  }

  /* Voert de zet uit. Geeft het aantal verplaatste kaarten terug (0 = mislukt). */
  function apply(st, src, dst) {
    if (!canMove(st, src, dst)) return 0;
    var cards = cardsOf(st, src);
    // weghalen bij bron
    if (src.kind === 'free') st.free[src.i] = null;
    else if (src.kind === 'found') { st.found[src.i].pop(); st.score -= 10; }
    else st.cols[src.i].length = src.idx;
    // neerleggen bij doel
    if (dst.kind === 'free') st.free[dst.i] = cards[0];
    else if (dst.kind === 'found') { st.found[dst.i].push(cards[0]); st.score += 10; }
    else st.cols[dst.i] = st.cols[dst.i].concat(cards);
    st.moves++;
    return cards.length;
  }

  function won(st) {
    return st.found[0].length === 13 && st.found[1].length === 13 &&
           st.found[2].length === 13 && st.found[3].length === 13;
  }

  /* Veilig automatisch afleggen: alleen als de kaart niet meer nodig is
     om iets anders op te stapelen. */
  function isSafe(st, c) {
    var r = rank(c), s = suit(c);
    if (r <= 2) return true;
    var f = [st.found[0].length, st.found[1].length, st.found[2].length, st.found[3].length];
    var opp = isRed(c) ? [0, 3] : [1, 2];
    var mate = (s === 0) ? 3 : (s === 3) ? 0 : (s === 1) ? 2 : 1;
    return f[opp[0]] >= r - 1 && f[opp[1]] >= r - 1 && f[mate] >= r - 2;
  }

  function safeMoves(st) {
    var out = [], i;
    for (i = 0; i < 8; i++) {
      var col = st.cols[i];
      if (!col.length) continue;
      var c = col[col.length - 1];
      if (st.found[suit(c)].length === rank(c) - 1 && isSafe(st, c))
        out.push({ src: { kind: 'col', i: i, idx: col.length - 1 }, dst: { kind: 'found', i: suit(c) } });
    }
    for (i = 0; i < 4; i++) {
      var fc = st.free[i];
      if (fc === null || fc === 'X') continue;
      if (st.found[suit(fc)].length === rank(fc) - 1 && isSafe(st, fc))
        out.push({ src: { kind: 'free', i: i }, dst: { kind: 'found', i: suit(fc) } });
    }
    return out;
  }

  /* Kan het spel vanaf hier volledig automatisch worden uitgespeeld? */
  function canAutoFinish(st) {
    var t = clone(st), guard = 0;
    while (!won(t) && guard++ < 200) {
      var moved = false, i;
      for (i = 0; i < 8; i++) {
        var col = t.cols[i];
        if (!col.length) continue;
        var c = col[col.length - 1];
        if (t.found[suit(c)].length === rank(c) - 1) { t.found[suit(c)].push(col.pop()); moved = true; }
      }
      for (i = 0; i < 4; i++) {
        var fc = t.free[i];
        if (fc === null || fc === 'X') continue;
        if (t.found[suit(fc)].length === rank(fc) - 1) { t.found[suit(fc)].push(fc); t.free[i] = null; moved = true; }
      }
      if (!moved) break;
    }
    return won(t);
  }

  function anyFoundationMove(st) {
    var i;
    for (i = 0; i < 8; i++) {
      var col = st.cols[i];
      if (!col.length) continue;
      var c = col[col.length - 1];
      if (st.found[suit(c)].length === rank(c) - 1)
        return { src: { kind: 'col', i: i, idx: col.length - 1 }, dst: { kind: 'found', i: suit(c) } };
    }
    for (i = 0; i < 4; i++) {
      var fc = st.free[i];
      if (fc === null || fc === 'X') continue;
      if (st.found[suit(fc)].length === rank(fc) - 1)
        return { src: { kind: 'free', i: i }, dst: { kind: 'found', i: suit(fc) } };
    }
    return null;
  }

  /* Alle legale zetten (zonder zinloze cel-naar-cel zetten). */
  function allMoves(st) {
    var out = [], i, j;
    function push(src, dst) { if (canMove(st, src, dst)) out.push({ src: src, dst: dst }); }
    for (i = 0; i < 8; i++) {
      var col = st.cols[i];
      for (j = 0; j < col.length; j++) {
        if (runLength(st, i, j) === 0) continue;
        var src = { kind: 'col', i: i, idx: j };
        if (j === col.length - 1) {
          push(src, { kind: 'found', i: suit(col[j]) });
          for (var f = 0; f < 4; f++) if (st.free[f] === null) { push(src, { kind: 'free', i: f }); break; }
        }
        for (var d = 0; d < 8; d++) if (d !== i) push(src, { kind: 'col', i: d });
      }
    }
    for (i = 0; i < 4; i++) {
      if (st.free[i] === null || st.free[i] === 'X') continue;
      var s2 = { kind: 'free', i: i };
      push(s2, { kind: 'found', i: suit(st.free[i]) });
      for (var d2 = 0; d2 < 8; d2++) push(s2, { kind: 'col', i: d2 });
    }
    return out;
  }

  /* Wat is nu de slimste zet? (voor de hint-knop) */
  function bestMove(st, avoid) {
    var list = allMoves(st), best = null, bestScore = -1e9;
    for (var k = 0; k < list.length; k++) {
      var m = list[k], sc = 0;
      var cards = cardsOf(st, m.src);
      var c = cards[0];
      if (m.dst.kind === 'found') sc = isSafe(st, c) ? 120 : 80;
      else if (m.dst.kind === 'col') {
        var target = st.cols[m.dst.i];
        if (target.length === 0) {
          sc = 20 + cards.length * 2;
          if (m.src.kind === 'col' && st.cols[m.src.i].length === cards.length) sc = -20; // kolom verhuizen is zinloos
        } else {
          sc = 55 + cards.length * 3;
        }
        if (m.src.kind === 'free') sc += 25;
        if (m.src.kind === 'col') {
          var rest = st.cols[m.src.i].slice(0, m.src.idx);
          if (rest.length) {
            var under = rest[rest.length - 1];
            if (st.found[suit(under)].length === rank(under) - 1) sc += 45; // legt een aflegkaart bloot
          }
          sc += Math.max(0, 10 - m.src.idx);
        }
      } else if (m.dst.kind === 'free') {
        sc = 5;
        if (m.src.kind === 'col') {
          var r2 = st.cols[m.src.i];
          if (r2.length >= 2) {
            var u2 = r2[r2.length - 2];
            if (st.found[suit(u2)].length === rank(u2) - 1) sc = 40;
          }
        }
      }
      if (avoid && sameMove(m, avoid)) sc -= 200;
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return bestScore > 0 ? best : null;
  }

  function sameMove(a, b) {
    return a && b && a.src.kind === b.src.kind && a.src.i === b.src.i &&
           (a.src.idx === undefined || a.src.idx === b.src.idx) &&
           a.dst.kind === b.dst.kind && a.dst.i === b.dst.i;
  }

  function stuck(st) { return allMoves(st).length === 0; }

  /* Beste doel voor een klik: aflegstapel > kolom > vrije cel */
  function autoTarget(st, src) {
    var cards = cardsOf(st, src);
    if (!cards.length) return null;
    var c = cards[0], d;
    if (cards.length === 1) {
      d = { kind: 'found', i: suit(c) };
      if (canMove(st, src, d)) return d;
    }
    // kolom met passende kaart, liefst eentje die geen reeks kapotmaakt
    var best = null, bestScore = -1;
    for (var i = 0; i < 8; i++) {
      d = { kind: 'col', i: i };
      if (!canMove(st, src, d)) continue;
      var col = st.cols[i];
      var sc = col.length ? 100 : 30;
      if (src.kind === 'col' && st.cols[src.i].length === cards.length && !col.length) sc = -1; // kolom naar lege kolom
      if (sc > bestScore) { bestScore = sc; best = d; }
    }
    if (best) return best;
    if (cards.length === 1) {
      for (var f = 0; f < 4; f++) {
        d = { kind: 'free', i: f };
        if (canMove(st, src, d)) return d;
      }
    }
    return null;
  }

  return {
    rank: rank, suit: suit, isRed: isRed, create: create, clone: clone,
    canMove: canMove, apply: apply, won: won, runLength: runLength, cardsOf: cardsOf,
    freeCount: freeCount, emptyCols: emptyCols, maxMove: maxMove,
    safeMoves: safeMoves, canAutoFinish: canAutoFinish, anyFoundationMove: anyFoundationMove,
    bestMove: bestMove, stuck: stuck, autoTarget: autoTarget, isSafe: isSafe
  };
})();
