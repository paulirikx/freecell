/* ============================================================
   store.js - instellingen, niveaus/treden, ranglijst, statistiek, doelen
   ============================================================ */
var Store = (function () {

  var VERSION = '1.0.0';

  function load(key, def) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return def;
      var v = JSON.parse(raw);
      return (v && typeof v === 'object') ? Object.assign({}, def, v) : v;
    } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var settings = load('fc.settings', {
    name: '', bg: 'felt', deck: 'classic', letters: 'jqk',
    autoplay: true, sound: true, anim: true, lefty: false,
    level: 'beginner'
  });

  var ladder = load('fc.ladder', { beginner: 1, gevorderd: 1, pro: 1 });
  var stats = load('fc.stats', {
    played: 0, won: 0, streak: 0, bestStreak: 0, bestMs: null, bestMoves: null, totalMs: 0
  });
  var scores = [];
  try { scores = JSON.parse(localStorage.getItem('fc.scores') || '[]') || []; } catch (e) { scores = []; }
  var goals = load('fc.goals', {});

  /* Het profiel: naam is verplicht (bij de eerste start gevraagd), foto en
     tekst zijn optioneel. De id is alvast een vast kenmerk van deze speler,
     handig als er ooit een gedeelde ranglijst komt. */
  var profiel = load('fc.profiel', { id: '', naam: '', foto: '', tekst: '' });
  if (!profiel.id) profiel.id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  if (!profiel.naam && settings.name) profiel.naam = settings.name;   // oude instelling overnemen
  save('fc.profiel', profiel);

  /* ---------- niveaus ---------- */
  var LEVELS = {
    beginner: {
      key: 'beginner', name: 'Beginner', icon: '🌱',
      blurb: 'Rustige deals, 4 cellen, onbeperkt hints',
      rungs: 8, pct: [0.03, 0.42], base: 600
    },
    gevorderd: {
      key: 'gevorderd', name: 'Gevorderd', icon: '⚔️',
      blurb: 'Pittiger deals, beperkt hints en terugdraaien',
      rungs: 10, pct: [0.32, 0.80], base: 480
    },
    pro: {
      key: 'pro', name: 'Pro', icon: '🔥',
      blurb: 'Zware deals, minder cellen, nauwelijks hulp',
      rungs: 12, pct: [0.62, 0.99], base: 420
    }
  };

  /* Instellingen van een trede binnen een niveau. */
  function rungConfig(levelKey, rung) {
    var L = LEVELS[levelKey] || LEVELS.beginner;
    var r = Math.max(1, Math.min(L.rungs, rung));
    var t = (L.rungs === 1) ? 0 : (r - 1) / (L.rungs - 1);
    var pct = L.pct[0] + (L.pct[1] - L.pct[0]) * t;
    var cells = 4, hints = 99, undos = 99;
    if (levelKey === 'gevorderd') {
      hints = Math.max(1, 4 - Math.floor((r - 1) / 3));
      undos = Math.max(4, 15 - (r - 1));
      if (r >= 8) cells = 3;
    } else if (levelKey === 'pro') {
      hints = r <= 3 ? 1 : 0;
      undos = Math.max(1, 5 - Math.floor((r - 1) / 3));
      cells = r >= 5 ? 3 : 4;
    }
    return {
      level: levelKey, levelName: L.name, rung: r, rungs: L.rungs,
      pct: pct, cells: cells, hints: hints, undos: undos,
      target: Math.round(L.base * (1 - 0.035 * (r - 1)))
    };
  }

  function currentConfig() { return rungConfig(settings.level, ladder[settings.level] || 1); }

  /* Trede aanpassen na een potje. Geeft de verandering terug (-1, 0, +1, +2). */
  function bumpLadder(levelKey, result, fastWin) {
    var L = LEVELS[levelKey];
    var cur = ladder[levelKey] || 1, next = cur;
    if (result === 'win') next = cur + (fastWin ? 2 : 1);
    else if (result === 'loss') next = cur - 1;
    next = Math.max(1, Math.min(L.rungs, next));
    ladder[levelKey] = next;
    save('fc.ladder', ladder);
    return next - cur;
  }

  /* ---------- ranglijst ---------- */
  function addScore(entry) {
    scores.push(entry);
    scores.sort(function (a, b) { return a.ms - b.ms; });
    if (scores.length > 300) scores.length = 300;
    save('fc.scores', scores);
  }

  function filtered(scope, ctx) {
    return scores.filter(function (s) {
      if (scope === 'level') return s.level === ctx.level;
      if (scope === 'deal') return s.deal === ctx.deal;
      if (scope === 'daily') return !!s.daily;
      return true;
    });
  }

  function sortBy(list, key) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      if (key === 'score') return b.score - a.score;
      if (key === 'moves') return a.moves - b.moves || a.ms - b.ms;
      return a.ms - b.ms;
    });
    return copy;
  }

  /* ---------- statistiek ---------- */
  function recordStart() { stats.played++; save('fc.stats', stats); }
  function recordWin(ms, moves) {
    stats.won++; stats.streak++; stats.totalMs += ms;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
    if (stats.bestMs === null || ms < stats.bestMs) stats.bestMs = ms;
    if (stats.bestMoves === null || moves < stats.bestMoves) stats.bestMoves = moves;
    save('fc.stats', stats);
  }
  function recordLoss() { stats.streak = 0; save('fc.stats', stats); }

  /* ---------- doelen ---------- */
  var GOALS = [
    { id: 'first', ico: '🏁', t: 'Eerste winst', d: 'Speel je eerste potje uit' },
    { id: 'm5', ico: '⏱️', t: 'Onder de 5 minuten', d: 'Win binnen 5:00' },
    { id: 'm3', ico: '🚀', t: 'Onder de 3 minuten', d: 'Win binnen 3:00' },
    { id: 'lean', ico: '🪶', t: 'Zuinig', d: 'Win met maximaal 120 zetten' },
    { id: 'clean', ico: '🧼', t: 'Zonder hulp', d: 'Win zonder hint en zonder terugdraaien' },
    { id: 'streak3', ico: '🔥', t: 'Hattrick', d: '3 keer op rij winnen' },
    { id: 'daily', ico: '📅', t: 'Dagpuzzel', d: 'Win de puzzel van vandaag' },
    { id: 'cells3', ico: '🧱', t: 'Krap behuisd', d: 'Win met 3 vrije cellen of minder' },
    { id: 'pro5', ico: '⚔️', t: 'Pro trede 5', d: 'Bereik trede 5 op Pro' },
    { id: 'top', ico: '👑', t: 'Bovenaan', d: 'Sta nummer 1 op de tijdlijst van je niveau' },
    { id: 'ten', ico: '🏆', t: 'Tien op de teller', d: 'Win 10 potjes' },
    { id: 'summit', ico: '🏔️', t: 'Top bereikt', d: 'Haal de hoogste trede van een niveau' }
  ];
  function unlock(id) {
    if (goals[id]) return false;
    goals[id] = Date.now();
    save('fc.goals', goals);
    return true;
  }

  function resetAll() {
    scores = []; save('fc.scores', scores);
    stats = { played: 0, won: 0, streak: 0, bestStreak: 0, bestMs: null, bestMoves: null, totalMs: 0 };
    save('fc.stats', stats);
    for (var k in goals) delete goals[k];   // hetzelfde object leegmaken: de export wijst ernaar
    save('fc.goals', goals);
    ladder = { beginner: 1, gevorderd: 1, pro: 1 }; save('fc.ladder', ladder);
  }

  return {
    VERSION: VERSION, LEVELS: LEVELS, GOALS: GOALS,
    settings: settings, ladder: ladder, goals: goals,
    get stats() { return stats; },
    get scores() { return scores; },
    profiel: profiel,
    saveSettings: function () { save('fc.settings', settings); },
    saveProfiel: function () { settings.name = profiel.naam; save('fc.settings', settings); save('fc.profiel', profiel); },
    rungConfig: rungConfig, currentConfig: currentConfig, bumpLadder: bumpLadder,
    addScore: addScore, filtered: filtered, sortBy: sortBy,
    recordStart: recordStart, recordWin: recordWin, recordLoss: recordLoss,
    unlock: unlock, resetAll: resetAll
  };
})();
