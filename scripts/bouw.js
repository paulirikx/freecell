/* Bouwt het spel uit dezelfde bron naar drie plekken:
 *
 *   www/                        -> in de Android-app (Capacitor pakt deze map)
 *   docs/                       -> de webversie: landingspagina + spel + APK
 *                                  (GitHub Pages serveert deze map)
 *   graitt-site (freecell/)    -> diezelfde webversie, klaar om te uploaden
 *
 * De webversie heeft altijd dezelfde vorm, waar hij ook staat:
 *
 *   index.html      de landingspagina (uitleg, plaatje, downloadknop)
 *   spelen/         het spel zelf
 *   FreeCell.apk    de gratis Android-app
 *
 * Er is geen bundelstap: bestanden worden gekopieerd en alleen het versie-
 * nummer wordt ingevuld, zodat dat maar op één plek staat (package.json) en
 * de service worker bij elke release zijn cache ververst.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wortel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versie = JSON.parse(fs.readFileSync(path.join(wortel, 'package.json'), 'utf8')).version;
const apkBron = path.join(wortel, 'apk', `FreeCell-${versie}.apk`);

const SPEL = ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js'];
const LANDING = ['icons'];
/* Alleen het plaatje van de landingspagina mee - assets/ bevat verder de
   bronafbeeldingen voor de app-iconen, die hoeven niet online. */
const FOTO = 'assets/agent-freecell.jpg';
const LOGO = 'assets/graitt-logo.png';

const leeg = (map) => { fs.rmSync(map, { recursive: true, force: true }); fs.mkdirSync(map, { recursive: true }); };

function kopieer(doel, namen, bronmap = wortel) {
  for (const naam of namen) {
    const bron = path.join(bronmap, naam);
    if (!fs.existsSync(bron)) continue;
    fs.cpSync(bron, path.join(doel, naam), { recursive: true });
  }
}

/* Versienummer invullen waar het staat. */
function stempel(map) {
  const store = path.join(map, 'js', 'store.js');
  if (fs.existsSync(store)) {
    fs.writeFileSync(store, fs.readFileSync(store, 'utf8')
      .replace(/var VERSION = '[^']*';/, `var VERSION = '${versie}';`));
  }
  const sw = path.join(map, 'sw.js');
  if (fs.existsSync(sw)) {
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8')
      .replace(/var CACHE = '[^']*';/, `var CACHE = 'freecell-${versie}';`));
  }
}

/* Wat is er nieuw: de bovenste kop uit CHANGELOG.md met zijn opsomming.
   Dat is precies wat de melding in het spel toont, dus het hoeft maar op één
   plek bijgehouden te worden. */
const SPLITS = new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10));
function versieInfo() {
  const nieuws = [];
  try {
    const md = fs.readFileSync(path.join(wortel, 'CHANGELOG.md'), 'utf8').split(SPLITS);
    let inBlok = false;
    for (const regel of md) {
      if (regel.startsWith('## ')) {
        if (inBlok) break;
        if (regel.indexOf(versie) !== -1) inBlok = true;
        continue;
      }
      if (!inBlok) continue;
      if (regel.startsWith('- ')) nieuws.push(regel.slice(2).trim());
      else if (nieuws.length && regel.startsWith('  ')) nieuws[nieuws.length - 1] += ' ' + regel.trim();
    }
  } catch (e) { /* changelog is niet verplicht */ }
  return { versie, nieuws, apk: 'FreeCell.apk' };
}

/* ---- de app (Capacitor) ---- */
const www = path.join(wortel, 'www');
leeg(www);
kopieer(www, ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest']);
stempel(www);
fs.writeFileSync(path.join(www, 'versie.json'), JSON.stringify(versieInfo(), null, 2));

/* ---- de webversie ---- */
function web(doel) {
  leeg(doel);
  kopieer(doel, LANDING);
  if (fs.existsSync(path.join(wortel, LOGO))) {
    fs.mkdirSync(path.join(doel, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(wortel, LOGO), path.join(doel, LOGO));
  }
  if (fs.existsSync(path.join(wortel, FOTO))) {
    fs.mkdirSync(path.join(doel, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(wortel, FOTO), path.join(doel, FOTO));
  }
  fs.writeFileSync(path.join(doel, 'index.html'),
    fs.readFileSync(path.join(wortel, 'uitleg.html'), 'utf8').replace(/\{\{versie\}\}/g, versie));

  const spel = path.join(doel, 'spelen');
  fs.mkdirSync(spel, { recursive: true });
  kopieer(spel, SPEL);
  stempel(spel);

  fs.writeFileSync(path.join(doel, '.nojekyll'), '');
  fs.writeFileSync(path.join(doel, 'versie.json'), JSON.stringify(versieInfo(), null, 2));
  fs.writeFileSync(path.join(doel, 'spelen', 'versie.json'), JSON.stringify(versieInfo(), null, 2));   // GitHub Pages: geen Jekyll
  fs.writeFileSync(path.join(doel, 'versie.txt'), versie + '\n');

  if (fs.existsSync(apkBron)) {
    fs.copyFileSync(apkBron, path.join(doel, 'FreeCell.apk'));
  } else {
    console.warn(`  ! apk/FreeCell-${versie}.apk ontbreekt — draai eerst: bun run apk:release`);
  }
}

const doelen = [path.join(wortel, 'docs')];
for (const site of ['D:/claude/graitt-site/deploy/freecell', 'D:/claude/graitt-site/freecell']) {
  if (fs.existsSync(path.dirname(site))) doelen.push(site);
}
doelen.forEach(web);

console.log(`FreeCell ${versie} gebouwd:`);
console.log('  www/   (Android-app)');
doelen.forEach((d) => console.log('  ' + path.relative(wortel, d).replace(/\\/g, '/')));
