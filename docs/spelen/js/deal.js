/* ============================================================
   deal.js - deals genereren + moeilijkheid inschatten
   Kaart-id: 0..51  -> kleur = id/13 (0 schoppen, 1 harten, 2 ruiten, 3 klaveren)
                       waarde = id%13 + 1 (1 = aas ... 13 = heer)
   ============================================================ */
var Deal = (function () {

  /* Microsoft-compatibele deal, zodat spelnummers overeenkomen met
     de klassieke FreeCell-nummering (spel #1 is echt spel #1). */
  function msDeal(num) {
    var seed = num >>> 0;
    function rnd() {
      seed = (seed * 214013 + 2531011) >>> 0;
      return (seed >>> 16) & 0x7fff;
    }
    var deck = [], i;
    for (i = 0; i < 52; i++) deck.push(i);
    var cols = [[], [], [], [], [], [], [], []];
    var left = 52;
    var msSuitToMine = [3, 2, 1, 0]; // klaver, ruiten, harten, schoppen
    for (i = 0; i < 52; i++) {
      var j = rnd() % left;
      var c = deck[j];
      deck[j] = deck[--left];
      var rank = Math.floor(c / 4) + 1;
      var suit = msSuitToMine[c % 4];
      cols[i % 8].push(suit * 13 + (rank - 1));
    }
    return cols;
  }

  /* Bekend onwinbare klassieke deals - die willen we nooit serveren. */
  var IMPOSSIBLE = { 11982: 1, 146692: 1, 186216: 1, 455889: 1, 495505: 1,
                     512118: 1, 517776: 1, 781948: 1 };

  /* ---- moeilijkheidsheuristiek -------------------------------------
     Geen solver, maar een verrassend betrouwbare inschatting op basis van
     hoe diep de azen/lage kaarten begraven liggen en hoeveel bruikbare
     paren er al klaarliggen. Hoger = lastiger. */
  function rank(c) { return (c % 13) + 1; }
  function suit(c) { return Math.floor(c / 13); }
  function isRed(c) { var s = suit(c); return s === 1 || s === 2; }

  function difficulty(cols) {
    var score = 0, i, j;
    for (i = 0; i < 8; i++) {
      var col = cols[i];
      for (j = 0; j < col.length; j++) {
        var c = col[j], r = rank(c);
        var buried = col.length - 1 - j;      // aantal kaarten erbovenop
        if (r === 1) score += buried * 3.2;   // begraven aas = pijn
        else if (r === 2) score += buried * 1.8;
        else if (r === 3) score += buried * 0.9;
        else if (r >= 11) score += (col.length - buried) * 0.35; // hoge kaart bovenin is juist lastig
        // al kloppende paren maken het makkelijker
        if (j > 0) {
          var p = col[j - 1];
          if (rank(p) === r + 1 && isRed(p) !== isRed(c)) score -= 4.5;
          if (suit(p) === suit(c) && rank(p) === r + 1) score -= 1.0;
        }
      }
      // heer helemaal onderin is prima, heer halverwege blokkeert
      for (j = 0; j < col.length; j++) {
        if (rank(col[j]) === 13 && j > 0 && j < col.length - 1) score += 2.2;
      }
    }
    return score;
  }

  /* Kies een deal waarvan de moeilijkheid rond percentiel p (0..1) ligt.
     Zelfkalibrerend: we bemonsteren wat deals, sorteren en pakken de juiste. */
  function pickByPercentile(p, sampleSize) {
    var n = sampleSize || 140;
    var list = [], i;
    for (i = 0; i < n; i++) {
      var num = 1 + Math.floor(Math.random() * 999999);
      if (IMPOSSIBLE[num]) continue;
      list.push({ num: num, d: difficulty(msDeal(num)) });
    }
    list.sort(function (a, b) { return a.d - b.d; });
    var idx = Math.round(p * (list.length - 1));
    idx = Math.max(0, Math.min(list.length - 1, idx));
    return list[idx].num;
  }

  function dailyNumber(date) {
    var d = date || new Date();
    var key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var s = key >>> 0;
    s = (s * 1103515245 + 12345) >>> 0;
    s = (s ^ (s >>> 13)) >>> 0;
    var n = (s % 999999) + 1;
    return IMPOSSIBLE[n] ? n + 1 : n;
  }

  /* 0..100 schaal voor weergave, geijkt op ~40 willekeurige deals */
  var calib = null;
  function difficultyPercent(cols) {
    if (!calib) {
      var arr = [];
      for (var i = 0; i < 60; i++) arr.push(difficulty(msDeal(1 + Math.floor(Math.random() * 999999))));
      arr.sort(function (a, b) { return a - b; });
      calib = arr;
    }
    var d = difficulty(cols), lo = 0;
    while (lo < calib.length && calib[lo] < d) lo++;
    return Math.max(1, Math.min(99, Math.round((lo / calib.length) * 100)));
  }

  return {
    msDeal: msDeal,
    difficulty: difficulty,
    difficultyPercent: difficultyPercent,
    pickByPercentile: pickByPercentile,
    dailyNumber: dailyNumber,
    impossible: IMPOSSIBLE
  };
})();
