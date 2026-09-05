/* Service worker: het spel moet ook zonder internet werken.
   Bij elke nieuwe versie hoort een nieuwe CACHE-naam, anders blijven mensen
   op de oude bestanden hangen. Het versienummer wordt bij het bouwen
   ingevuld vanuit package.json. */
var CACHE = 'freecell-1.4.1';
var BESTANDEN = [
  './',
  './index.html',
  './css/style.css',
  './js/deal.js',
  './js/engine.js',
  './js/store.js',
  './js/online.js',
  './js/ui.js',
  './manifest.webmanifest',
  './versie.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', function (e) {
  // Wel skipWaiting: anders blijft iemand met een oude versie in de cache daar
  // hangen tot hij alle tabbladen sluit -- en juist die oude versie kent de
  // melding "nieuwe versie" nog niet. De draaiende pagina merkt hier niets
  // van; die blijft op zijn eigen bestanden tot je vernieuwt.
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BESTANDEN); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'NU_VERNIEUWEN') self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Cache eerst (snel en offline), maar op de achtergrond verversen. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(e.request).then(function (res) {
      if (res && res.status === 200) {
        var kopie = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, kopie); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
