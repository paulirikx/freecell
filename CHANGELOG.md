# Wijzigingen

Versienummer staat in `package.json` en wordt bij het bouwen overal ingevuld:
in de app (versionName/versionCode), op de landingspagina en in de naam van de
service-worker-cache.

## 1.4.0 — 5 september 2026

- Het logo van grAItt Studio staat onderaan de pagina en in het
  instellingenscherm.
- Op de downloadpagina staat hoeveel verschillende mensen de app al hebben
  opgehaald.

## 1.3.1 — 5 september 2026

- Het spel controleert bij het opstarten zelf of er een nieuwere versie op de
  site staat, ook als de browser nog oude bestanden bewaart.

## 1.3.0 — 5 september 2026

- Samen spelen: maak een club, deel de code of de uitnodigingslink, en iedereen
  die meedoet staat in dezelfde ranglijst — op tijd, op zetten of op score.
- Je ziet in die lijst ook wie er op dat moment aan het spelen is.
- Wie de code niet heeft, ziet jullie lijst niet; er komt geen account aan te
  pas en alleen je naam en je tijden gaan mee.
- Op de webpagina staat uitleg over samen spelen, met je eigen code erbij.

## 1.2.0 — 5 september 2026

- Mijn menu: tik linksboven op je naam voor je gegevens (naam, foto, een regel
  over jezelf) en de keuze tussen licht en donker.
- Licht of donker, of laat het spel de stand van je telefoon volgen.
- Grotere cijfers en duidelijkere symbolen op de kaarten.
- Het spel zegt het voortaan zelf als er een nieuwe versie klaarstaat.
- Een welkomstgroet bij de allereerste start.

## 1.1.0 — 5 september 2026

- Slepen met je vinger werkt nu zoals het hoort: de kaart volgt je vinger en
  wordt er net boven getekend, zodat je ziet wat je vasthebt.
- Je hebt nu een eigen profiel: bij de eerste start vraagt het spel je naam
  (later te wijzigen), met desgewenst een foto en een regel over jezelf. Je
  naam en avatar staan in de ranglijst en in de balk bovenin.

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
