# Wijzigingen

Versienummer staat in `package.json` en wordt bij het bouwen overal ingevuld:
in de app (versionName/versionCode), op de landingspagina en in de naam van de
service-worker-cache.

## 1.1.0 — 5 september 2026

- Slepen met de vinger werkte niet op de telefoon: de browser pakte de
  veegbeweging af. `touch-action: none` op het speelveld lost dat op, en een
  gesleepte stapel wordt nu iets boven je vinger getekend zodat je ziet wat je
  vasthebt.
- Spelersprofiel: bij de eerste start vraagt het spel je naam (verplicht, later
  te wijzigen), met optioneel een foto en een regel over jezelf. Je naam en
  avatar staan in de ranglijst en in de balk bovenin.

## 1.0.0 — 5 september 2026

Eerste versie.

- FreeCell met alle regels: 8 kolommen, 4 vrije cellen, 4 aflegstapels,
  reeksen verplaatsen op basis van vrije cellen en lege kolommen.
- Aanklikken verplaatst een kaart zelf, dubbelklikken legt af, slepen kan ook.
- Niveaus Beginner / Gevorderd / Pro, elk met treden die vanzelf zwaarder
  worden: moeilijkere deals, minder hints, minder terugdraaien, minder cellen.
- Ranglijst op tijd, zetten of score, met je lopende potje er live tussen.
- Klassieke Microsoft-spelnummers, dagpuzzel en uitdaaglinks (`?spel=39911`).
- Doelen, statistieken, hint, auto-afleggen, onbeperkt terugdraaien op Beginner.
- Zes achtergronden, vijf kaartstijlen, A-J-Q-K of A-B-V-H, linkshandige stand.
- Werkt offline (service worker), te installeren als webapp of als Android-app.
