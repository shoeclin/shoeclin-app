/*************************************************************
 * SHOECLIN APP — sw.js
 * Pekerja latar: menampilkan notifikasi dari Firebase dan menyimpan
 * tampilan aplikasi supaya tetap terbuka saat sinyal putus.
 * Tidak perlu diubah.
 *************************************************************/
importScripts('config.js');

var C = self.SHOECLIN || {};
var CACHE = 'shoeclin-' + (C.versi || '1');
var ASET = ['./', 'index.html', 'app.js', 'config.js', 'manifest.webmanifest', 'icon.svg',
            'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

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

// Ambil versi terbaru dari internet; kalau gagal, pakai simpanan.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && !url.search) {
      var salin = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, salin); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || caches.match('index.html');
    });
  }));
});

// Klik notifikasi yang bukan dari Firebase (misalnya notifikasi tes).
self.addEventListener('notificationclick', function (e) {
  var d = (e.notification && e.notification.data) || {};
  if (d.FCM_MSG) return;   // ditangani Firebase
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    return self.clients.openWindow('./');
  }));
});
