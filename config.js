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
  appsScriptUrl: 'https://script.google.com/macros/s/TEMPEL_ID_DEPLOYMENT/exec',

  // 2) Firebase Console > Project settings > General > Your apps > SDK setup and configuration > Config
  //    Salin 6 nilai dari "const firebaseConfig = { ... }"
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  },

  // 3) Firebase Console > Project settings > Cloud Messaging > Web Push certificates > Key pair
  vapidKey: '',

  // Naikkan angka ini setiap kali mengubah file aplikasi, supaya HP mengambil versi baru.
  versi: '1.0.0'
};
