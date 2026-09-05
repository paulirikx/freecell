# FreeCell

Een complete FreeCell-patience voor telefoon en desktop. Pure HTML/CSS/JS — geen build, geen server nodig,
geen account. Alles (ranglijst, statistieken, doelen, treden) staat lokaal in de browser.

## Waar het staat

| | |
|---|---|
| Spelen | https://paulirikx.github.io/freecell/spelen/ |
| Landingspagina + gratis APK | https://paulirikx.github.io/freecell/ |
| Op de site van grAItt Studio | appcard op `apps.html` wijst naar bovenstaande pagina |

## Ontwikkelen

Dubbelklik `index.html` (dat is het spel zelf), of serveer de map:

```bash
python -m http.server 5182 --directory D:/claude/freecell
```

## Uitgeven

```bash
bun run apk:release     # ondertekende APK -> apk/FreeCell-<versie>.apk
node scripts/bouw.js    # webversie -> docs/ (GitHub Pages) en graitt-site
git add -A && git commit -m "..." && git push
```

`scripts/bouw.js` zet dezelfde bron op drie plekken neer: `www/` voor de
Android-app, `docs/` voor GitHub Pages en `../graitt-site/**` voor het eigen
domein. De webversie heeft overal dezelfde vorm: `index.html` is de
landingspagina, `spelen/` het spel, `FreeCell.apk` de app.

Het versienummer staat alleen in `package.json` en wordt bij het bouwen
ingevuld in de app (versionName/versionCode), op de landingspagina en in de
naam van de service-worker-cache.

De foto op de landingspagina wordt gemaakt door `scripts/foto.py`: die
overschildert elke POLITIE-tekst met FREECELL, in het juiste perspectief.
De bronfoto blijft privé (staat in `.gitignore`).

## Spelen

* **Tikken op een kaart** → hij zoekt zelf de beste plek: aflegstapel > passende kolom > vrije cel.
* **Dubbeltikken** → direct naar de aflegstapel.
* **Slepen** → handmatig; geldige doelen lichten geel op. Reeksen (dalend, om en om rood/zwart)
  verplaatsen in één keer, zolang je genoeg vrije cellen en lege kolommen hebt.
* **Toetsen**: `N` nieuw · `U`/`Z` terug · `H` hint · `A`/spatie auto-afleggen · `L` ranglijst · `Esc` sluiten.

## Niveaus en oplopende moeilijkheid

Drie niveaus met elk een ladder van treden. Elke gewonnen partij zet je een trede hoger, een snelle winst
(binnen 60% van de streeftijd) twee, opgeven of vastlopen één omlaag. Hoe hoger de trede, hoe zwaarder de
deal en hoe minder hulp:

| Niveau | Treden | Deals | Cellen | Hints | Terugdraaien |
|---|---|---|---|---|---|
| Beginner | 8 | licht (3–42%) | 4 | onbeperkt | onbeperkt |
| Gevorderd | 10 | stevig (32–80%) | 4, vanaf trede 8 nog 3 | 4 → 1 | 15 → 4 |
| Pro | 12 | zwaar (62–99%) | 4, vanaf trede 5 nog 3 | 1 → 0 | 5 → 1 |

De zwaarte van een deal wordt geschat uit hoe diep de azen en lage kaarten begraven liggen en hoeveel
bruikbare paren er al klaarliggen. Bij elk nieuw spel worden ~140 deals bemonsterd en wordt degene gekozen
die op het gewenste percentiel ligt — de schaal ijkt zichzelf.

## Ranglijst

Sorteren op **tijd**, **zetten** of **score**, gefilterd op je niveau, alles, dit spelnummer of de dagpuzzel.
Terwijl je speelt staat je lopende potje er live tussen en zakt het elke seconde — de "x min geleden"-tijden
en je positie (`Nu #3 van 12`) lopen mee. De ranglijst is lokaal, dus per apparaat.

## Verder

* **Spelnummers** volgen de klassieke Microsoft-nummering: spel #1 is echt spel #1. Zo kun je iemand een
  nummer sturen en precies dezelfde deal spelen. Bekend onwinbare deals (o.a. #11982) worden overgeslagen.
* **Dagpuzzel**: elke dag hetzelfde nummer voor iedereen.
* **Doelen** (12 stuks), statistieken, geluid, 6 achtergronden, 5 kaartstijlen, linkshandige modus.
* Een onderbroken potje wordt automatisch hervat; de klok start pas bij je eerste eigen zet.

## Bestanden

| Bestand | Inhoud |
|---|---|
| `js/deal.js` | Microsoft-compatibele deals + moeilijkheidsinschatting |
| `js/engine.js` | Regels, zetten, veilig auto-afleggen, hint-heuristiek |
| `js/store.js` | Instellingen, niveaus/treden, ranglijst, statistiek, doelen |
| `js/ui.js` | Weergave, slepen/klikken, animaties, overlays |

Voor het testen zit er een haakje in de console: `FC.state()`, `FC.setState(s)`, `FC.nearWin()`.
