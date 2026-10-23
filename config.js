/*
 * SHOECLIN APP — config.js
 * Satu-satunya file yang perlu diisi. Paling mudah diisi langsung di GitHub
 * (buka file ini di repository > ikon pensil > ubah > Commit changes).
 *
 * Isinya boleh terlihat publik: kunci rahasia Firebase (file JSON service account)
 * TIDAK ditaruh di sini, tapi di Script Properties Apps Script.
 */
var SHOECLIN = {
  // 1) URL Web App Apps Script
  //    Apps Script > Deploy > Manage deployments > salin "Web app URL" (berakhiran /exec)
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxKaVxF0EeQ1BLqLxMPNIL9AWtS5N-bq_Etbi4_rbgJAT7asUURW8sVybT2k5kVGTJi/exec',

  // 2) Firebase Console > Project settings > General > Your apps > SDK setup and configuration > Config
  //    Salin 6 nilai dari "const firebaseConfig = { ... }"
  firebase: {
    apiKey: 'AIzaSyDWNfaqS0vMMeRUtOaaERdAs0znuhT1-24',
    authDomain: 'shoeclin354.firebaseapp.com',
    projectId: 'shoeclin354',
    storageBucket: 'shoeclin354.firebasestorage.app',
    messagingSenderId: '498374574113',
    appId: '1:498374574113:web:5075ee6c893b7ae6f26360'
  },

  // 3) Firebase Console > Project settings > Cloud Messaging > Web Push certificates > Key pair
  vapidKey: 'BJK2wphkF6nCZnAh3Y4O8UNd1cY5W-N-L8-Qq1oQkDodyuj3b3n50A6ukDdtZGvwFHAaWJFnrRRjW-d5dAcuFw0',

  // Naikkan angka ini setiap kali mengubah file aplikasi, supaya HP mengambil versi baru.
  versi: '1.0.0'
};
