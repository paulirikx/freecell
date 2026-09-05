/* ============================================================
   online.js - de gedeelde ranglijst en "wie speelt er nu"

   Alles loopt via een paar databasefuncties met de clubcode als sleutel.
   Zonder code kom je nergens: de tabellen zelf staan dicht. De sleutel
   hieronder is de publieke sleutel van het project; die hoort in de app
   te staan en geeft alleen toegang tot precies deze functies.

   Werkt het niet (geen internet, server plat)? Dan gaat het spel gewoon
   door: elke aanroep faalt stil en de eigen ranglijst blijft werken.
   ============================================================ */
var Online = (function () {

  var URL = 'https://uiiydsfkwanrtkaxpnei.supabase.co';
  var KEY = 'sb_publishable_u3jqsU62TJdQ27RY3KM6ZQ_s9npAlrl';

  function rpc(naam, body) {
    return fetch(URL + '/rest/v1/rpc/' + naam, {
      method: 'POST',
      headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (d) {
        if (!r.ok) throw new Error((d && d.message) || ('fout ' + r.status));
        return d;
      });
    });
  }

  return {
    /* Nieuwe club: geeft {code, naam} terug. */
    maakClub: function (naam) {
      return rpc('club_maak', { p_naam: naam }).then(function (r) {
        var c = r && r[0];
        return c ? { code: c.uit_code, naam: c.uit_naam } : null;
      });
    },

    /* Bestaat deze code? Geeft {code, naam, leden} of null. */
    zoekClub: function (code) {
      return rpc('club_zoek', { p_code: code }).then(function (r) {
        var c = r && r[0];
        return c ? { code: c.uit_code, naam: c.uit_naam, leden: c.leden } : null;
      });
    },

    stuurScore: function (club, e) {
      return rpc('score_stuur', {
        p_code: club, p_speler_id: e.speler_id, p_naam: e.naam, p_tekst: e.tekst || '',
        p_tijd_ms: e.ms, p_zetten: e.moves, p_score: e.score, p_spel: e.deal,
        p_niveau: e.level, p_trede: e.rung, p_cellen: e.cells,
        p_hints: e.hints || 0, p_undos: e.undos || 0, p_dagpuzzel: !!e.daily
      });
    },

    /* sortering: 'tijd' | 'zetten' | 'score' */
    top: function (club, sortering, niveau, spel) {
      return rpc('scores_top', {
        p_code: club, p_sortering: sortering || 'tijd',
        p_niveau: niveau || null, p_spel: spel || null, p_limiet: 60
      });
    },

    ping: function (club, speler_id, naam, bezig, spel) {
      return rpc('aanwezig_ping', {
        p_code: club, p_speler_id: speler_id, p_naam: naam,
        p_bezig: !!bezig, p_spel: spel || null
      });
    },

    wieNu: function (club) { return rpc('aanwezig_nu', { p_code: club }); }
  };
})();
