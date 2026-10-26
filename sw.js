/*************************************************************
 * SHOECLIN APP — sw.js (versi 1.2)
 * Pekerja latar: menampilkan notifikasi dari Firebase dan menyimpan
 * tampilan aplikasi di HP. Tidak perlu diubah.
 *
 * 1.1: tampilan diambil dari memori HP (instan), versi baru diunduh diam-diam.
 * 1.2: ikut menyimpan file asisten AI.
 *************************************************************/
importScripts('config.js');

var C = self.SHOECLIN || {};
var CACHE = 'shoeclin-' + (C.versi || '1');
var ASET = ['./', 'index.html', 'app.js', 'asisten.js', 'asisten.css', 'config.js', 'manifest.webmanifest',
            'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

if (C.firebase && C.firebase.apiKey) {
  try {
    importScripts(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(C.firebase);
    firebase.messaging();   // notifikasi dari server ditampilkan otomatis
  } catch (e) { /* tanpa Firebase aplikasi tetap jalan, hanya tanpa notifikasi */ }
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASET.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('shoeclin-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Pakai simpanan di HP dulu (instan), sambil mengambil versi baru di belakang.
// Permintaan ke server lain (Apps Script, Gemini, Claude, Firebase) tidak disentuh.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var simpanBaru = null;
  var segar = fetch(req).then(function (res) {
    if (res && res.ok && !url.search) {
      var salin = res.clone();
      simpanBaru = caches.open(CACHE).then(function (c) { return c.put(req, salin); });
    }
    return res;
  });
  e.waitUntil(segar.then(function () { return simpanBaru; }).catch(function () {}));
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (simpan) {
    return simpan || segar.catch(function () { return caches.match('index.html'); });
  }));
});

// Klik notifikasi yang bukan dari Firebase (notifikasi tes, "Analisis selesai").
self.addEventListener('notificationclick', function (e) {
  var d = (e.notification && e.notification.data) || {};
  if (d.FCM_MSG) return;   // ditangani Firebase
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    return self.clients.openWindow('./');
  }));
});
