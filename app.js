/*************************************************************
 * SHOECLIN APP — app.js (versi 1.1)
 * Cangkang aplikasi HP: memilih peran, membuka halaman Apps Script,
 * dan mengurus notifikasi. Alamat & Firebase diisi di config.js.
 * Tidak perlu diubah.
 *
 * Perubahan 1.1 (lebih cepat):
 *  - Halaman Apps Script dibuka paling dulu; library notifikasi
 *    baru dimuat setelah halaman tampil.
 *  - Admin: mode yang satunya disiapkan di belakang layar,
 *    jadi pindah Kurir/Admin langsung tampil.
 *************************************************************/
(function () {
  'use strict';

  var C = window.SHOECLIN || {};
  var $ = function (id) { return document.getElementById(id); };
  var tunjuk = function (id, ya) { var el = $(id); if (el) el.classList.toggle('hide', !ya); };
  var APP_URL = new URL('./', location.href).href;
  var HARI = 86400000;
  var FB_URL = 'https://www.gstatic.com/firebasejs/10.12.2/';

  var LS = {
    get: function (k) { try { return localStorage.getItem('shc_app_' + k) || ''; } catch (e) { return ''; } },
    set: function (k, v) { try { localStorage.setItem('shc_app_' + k, String(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('shc_app_' + k); } catch (e) {} }
  };

  var S = { peran: LS.get('peran'), nama: LS.get('nama'), kunci: LS.get('kunci'), mode: '', pilih: 'kurir' };
  var FRAME = { kurir: null, admin: null };
  var swReg = null, messaging = null, installEvt = null, toastTimer = null, kunciDicek = false;
  var fbJanji = null, sudahMuat = false, antreMuat = [];

  var IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var STANDALONE = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                   window.navigator.standalone === true;

  /* ==================== SERVER ==================== */
  function configBenar() {
    var u = String(C.appsScriptUrl || '');
    return /^https:\/\/script\.google\.com\/.+\/exec$/.test(u) && u.indexOf('TEMPEL') === -1;
  }
  function firebaseDiisi() {
    var f = C.firebase || {};
    return !!(f.apiKey && f.projectId && f.messagingSenderId && f.appId && C.vapidKey);
  }
  function api(aksi, data) {
    var isi = { aksi: aksi };
    Object.keys(data || {}).forEach(function (k) { isi[k] = data[k]; });
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    return fetch(C.appsScriptUrl, { method: 'POST', body: JSON.stringify(isi), redirect: 'follow',
                                    signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.text(); })
      .then(function (teks) {
        clearTimeout(t);
        try { return JSON.parse(teks); }
        catch (e) { throw new Error('Server menjawab, tapi belum mengenal aplikasi ini. Pastikan Notifikasi.gs sudah ditempel lalu Deploy > Manage deployments > New version.'); }
      }, function () {
        clearTimeout(t);
        throw new Error(navigator.onLine === false ? 'HP sedang offline.'
          : 'Tidak bisa menghubungi server. Cek sinyal, alamat di config.js, dan akses Web App harus "Anyone".');
      });
  }

  /* ==================== PENGATURAN AWAL ==================== */
  function tampilSetup(pesan) {
    tunjuk('app', false); tunjuk('setup', true);
    $('inNama').value = S.nama || '';
    $('inKunci').value = '';
    pilihPeran(S.peran || 'kurir');
    setupPesan(pesan || '');
    tunjuk('btnBatalSetup', !!(S.peran && S.nama && configBenar() && (S.peran !== 'admin' || S.kunci)));
    aturPasangUI();
  }
  function pilihPeran(p) {
    S.pilih = p;
    $('rKurir').classList.toggle('on', p === 'kurir');
    $('rAdmin').classList.toggle('on', p === 'admin');
    tunjuk('wKunci', p === 'admin');
  }
  function setupPesan(teks, baik) {
    var el = $('setupMsg');
    el.textContent = teks || '';
    el.className = 'msg' + (baik ? ' ok' : '') + (teks ? '' : ' hide');
  }
  function kirimSetup() {
    var nama = $('inNama').value.trim().replace(/\s+/g, ' ');
    if (!configBenar()) return setupPesan('config.js belum diisi dengan benar: appsScriptUrl harus URL Web App yang berakhiran /exec.');
    if (!nama) return setupPesan('Isi nama kamu dulu. Nama ini dipakai sebagai nama petugas di order.');
    if (S.pilih !== 'admin') return selesaiSetup(nama, 'kurir', '');
    var kunci = $('inKunci').value.trim();
    if (!kunci) return setupPesan('Isi kunci admin.');
    var b = $('btnMulai');
    b.disabled = true; b.textContent = 'Memeriksa kunci...';
    api('cekAdmin', { kunci: kunci }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.pesan) || 'Kunci admin salah.');
      selesaiSetup(nama, 'admin', kunci);
    }).catch(function (e) { setupPesan(e.message); })
      .then(function () { b.disabled = false; b.textContent = 'Mulai'; });
  }
  function selesaiSetup(nama, peran, kunci) {
    S.nama = nama; S.peran = peran; S.kunci = kunci;
    LS.set('nama', nama); LS.set('peran', peran); LS.set('mode', peran);
    if (kunci) LS.set('kunci', kunci); else LS.del('kunci');
    kunciDicek = true;
    hapusFrame('kurir'); hapusFrame('admin');
    sudahMuat = false;
    bukaApp();
  }

  /* ==================== HALAMAN APPS SCRIPT ==================== */
  /** Pekerjaan tambahan ditunda sampai halaman utama tampil, supaya tidak berebut sinyal. */
  function setelahMuat(fn) { if (sudahMuat) setTimeout(fn, 300); else antreMuat.push(fn); }
  function tandaiMuat() {
    if (sudahMuat) return;
    sudahMuat = true;
    antreMuat.splice(0).forEach(function (fn) { setTimeout(fn, 300); });
  }
  function bukaApp() {
    tunjuk('setup', false); tunjuk('app', true);
    var admin = S.peran === 'admin';
    $('bar').classList.toggle('admin', admin);
    tunjuk('seg', admin);
    gantiMode(admin ? (LS.get('mode') || 'admin') : 'kurir');
    perbaruiNotifUI();
    setelahMuat(segarkanTokenDiam);
    if (admin) {
      if (!kunciDicek) setelahMuat(cekKunciLatar);
      setelahMuat(function () { setTimeout(siapkanModeLain, 2500); });
    }
    setTimeout(tandaiMuat, 9000);   // cadangan kalau halaman lama sekali
  }
  /** Admin: siapkan mode yang tidak sedang dibuka, supaya pindah mode langsung tampil. */
  function siapkanModeLain() {
    if (S.peran !== 'admin' || navigator.onLine === false) return;
    var lain = S.mode === 'admin' ? 'kurir' : 'admin';
    if (!FRAME[lain]) buatFrame(lain);
  }
  /** Kalau ADMIN_MODE diganti di server, HP ini diminta kunci baru. */
  function cekKunciLatar() {
    kunciDicek = true;
    if (navigator.onLine === false) return;
    api('cekAdmin', { kunci: S.kunci }).then(function (res) {
      if (res && res.salah) {
        S.kunci = ''; LS.del('kunci'); hapusFrame('admin');
        tampilSetup('Kunci admin sudah diganti. Masukkan kunci yang baru.');
      }
    }).catch(function () {});
  }
  function gantiMode(m) {
    if (m !== 'admin' || S.peran !== 'admin') m = 'kurir';
    S.mode = m; LS.set('mode', m);
    $('segKurir').classList.toggle('on', m === 'kurir');
    $('segAdmin').classList.toggle('on', m === 'admin');
    $('lblMode').textContent = m === 'admin' ? 'Mode admin' : 'Mode kurir';
    ['kurir', 'admin'].forEach(function (k) { if (FRAME[k]) FRAME[k].el.classList.toggle('hide', k !== m); });
    if (FRAME[m]) aturMuat(FRAME[m]); else buatFrame(m);
  }
  function urlFrame(m) {
    var u = C.appsScriptUrl, sambung = u.indexOf('?') > -1 ? '&' : '?';
    return u + sambung + (m === 'admin' ? 'mode=' + encodeURIComponent(S.kunci)
                                        : 'kurir=' + encodeURIComponent(S.nama));
  }
  function buatFrame(m) {
    var f = document.createElement('iframe');
    f.title = 'Shoeclin ' + m;
    f.setAttribute('allow', 'camera; clipboard-write; fullscreen');
    if (m !== S.mode) f.classList.add('hide');
    var rec = { el: f, mode: m, siap: false, lama: false, teks: '', timer: null, timerTeks: null };
    f.addEventListener('load', function () {
      if (!f.getAttribute('src')) return;
      rec.siap = true; rec.lama = false; rec.teks = '';
      clearTimeout(rec.timer); clearTimeout(rec.timerTeks);
      aturMuat(rec);
      if (rec.mode === S.mode) tandaiMuat();
    });
    FRAME[m] = rec;
    muatFrame(rec);
    $('stage').appendChild(f);
  }
  function muatFrame(rec) {
    clearTimeout(rec.timer); clearTimeout(rec.timerTeks);
    rec.siap = false; rec.lama = false; rec.teks = '';
    if (navigator.onLine === false) { aturMuat(rec); return; }
    rec.timerTeks = setTimeout(function () {
      rec.teks = 'Server Google sedang menyiapkan halaman...'; aturMuat(rec);
    }, 6000);
    rec.timer = setTimeout(function () { rec.lama = true; aturMuat(rec); }, 25000);
    rec.el.src = urlFrame(rec.mode) + '&_=' + Date.now();
    aturMuat(rec);
  }
  function aturMuat(rec) {
    if (!rec || rec.mode !== S.mode) return;
    var offline = navigator.onLine === false && !rec.siap;
    tunjuk('offline', offline);
    tunjuk('muat', !rec.siap && !offline);
    tunjuk('muatLama', rec.lama && !rec.siap);
    $('muatTeks').textContent = rec.teks ||
      (rec.mode === 'admin' ? 'Membuka dashboard admin...' : 'Membuka portal kurir...');
  }
  function muatUlang() { var r = FRAME[S.mode]; if (r) muatFrame(r); else buatFrame(S.mode); }
  function hapusFrame(m) {
    var r = FRAME[m]; if (!r) return;
    clearTimeout(r.timer); clearTimeout(r.timerTeks); r.el.remove(); FRAME[m] = null;
  }

  /* ==================== NOTIFIKASI ==================== */
  function statusNotif() {
    if (!firebaseDiisi()) return 'belum-diatur';
    if (IOS && !STANDALONE) return 'ios-pasang';
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) return 'tidak-didukung';
    if (Notification.permission === 'denied') return 'diblokir';
    if (LS.get('notifMati') !== '1' && Notification.permission === 'granted' && LS.get('token') &&
        LS.get('tokenPeran') === S.peran + '|' + S.nama) return 'aktif';
    return 'mati';
  }
  function teksNotif(st) {
    switch (st) {
      case 'aktif': return ['Notifikasi aktif', S.peran === 'admin'
        ? 'HP ini dapat kabar order baru, pembatalan, perubahan order, pembayaran, dan ringkasan pagi.'
        : 'HP ini dapat pengingat setiap pagi untuk order yang telat atau jatuh tempo.'];
      case 'belum-diatur': return ['Notifikasi belum diatur', 'Data Firebase di config.js masih kosong.'];
      case 'ios-pasang': return ['Pasang dulu ke Layar Utama', 'Di iPhone, notifikasi hanya jalan dari aplikasi yang sudah dipasang. Buka link ini di Safari, ketuk Bagikan, pilih Tambahkan ke Layar Utama, lalu buka Shoeclin dari ikonnya.'];
      case 'tidak-didukung': return ['Belum didukung', 'Pakai Chrome di Android, atau Safari di iPhone dengan iOS 16.4 ke atas.'];
      case 'diblokir': return ['Notifikasi diblokir', 'Izinkan lagi lewat Pengaturan HP > Aplikasi > Shoeclin (atau Chrome) > Notifikasi, lalu buka ulang aplikasi.'];
      default: return ['Notifikasi belum aktif', 'Ketuk tombol di bawah, lalu pilih Izinkan.'];
    }
  }
  function perbaruiNotifUI() {
    var st = statusNotif(), t = teksNotif(st);
    var warna = st === 'aktif' ? 'on' : (st === 'diblokir' ? 'bad' : (st === 'mati' || st === 'ios-pasang' ? 'warn' : ''));
    $('dot').className = 'dot ' + warna;
    $('dot2').className = 'dot ' + warna;
    $('nJudul').textContent = t[0];
    $('nIsi').textContent = t[1];
    var b = $('btnNotif');
    b.textContent = st === 'aktif' ? 'Kirim notifikasi tes' : 'Aktifkan notifikasi';
    b.className = st === 'aktif' ? 'btn ghost' : 'btn';
    tunjuk('btnNotif', st === 'aktif' || st === 'mati');
    tunjuk('btnMatikan', st === 'aktif');
    aturBanner();
  }
  function aturBanner() {
    var st = statusNotif();
    var tampil = (st === 'mati' || st === 'ios-pasang') && LS.get('notifMati') !== '1' &&
                 Date.now() - Number(LS.get('nbarTutup') || 0) > 3 * HARI;
    $('nbarTeks').textContent = st === 'ios-pasang'
      ? 'Pasang ke Layar Utama dulu supaya iPhone bisa dapat notifikasi.'
      : (S.peran === 'admin' ? 'Nyalakan notifikasi supaya tahu setiap ada order masuk.'
                             : 'Nyalakan notifikasi untuk pengingat order setiap pagi.');
    $('nbarYa').textContent = st === 'ios-pasang' ? 'Caranya' : 'Aktifkan';
    tunjuk('nbar', tampil && !$('app').classList.contains('hide'));
  }
  function pesanError(e) {
    var kode = String((e && e.code) || ''), teks = String((e && e.message) || e || '');
    if (kode.indexOf('permission-blocked') > -1) return 'Izin notifikasi diblokir di HP ini.';
    if (kode.indexOf('token-subscribe-failed') > -1 || kode.indexOf('invalid-vapid') > -1)
      return 'Firebase menolak pendaftaran. Cek isi firebase dan vapidKey di config.js.';
    return teks || 'Terjadi kesalahan.';
  }
  function swSiap() {
    if (!('serviceWorker' in navigator)) return Promise.reject(new Error('Browser ini tidak mendukung service worker.'));
    return navigator.serviceWorker.register('sw.js')
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (r) { swReg = r; return r; });
  }
  function muatSkrip(src) {
    return new Promise(function (ok, gagal) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { ok(); };
      s.onerror = function () { s.remove(); gagal(new Error('Library notifikasi gagal dimuat. Cek sinyal lalu coba lagi.')); };
      document.head.appendChild(s);
    });
  }
  /** Library Firebase baru diunduh saat dibutuhkan, bukan saat aplikasi dibuka. */
  function muatFirebase() {
    if (window.firebase && window.firebase.messaging) return Promise.resolve();
    if (!fbJanji) {
      var langkah = window.firebase ? Promise.resolve() : muatSkrip(FB_URL + 'firebase-app-compat.js');
      fbJanji = langkah.then(function () { return muatSkrip(FB_URL + 'firebase-messaging-compat.js'); });
      fbJanji.catch(function () { fbJanji = null; });
    }
    return fbJanji;
  }
  function initMessaging() {
    if (messaging) return Promise.resolve(messaging);
    return muatFirebase().then(function () {
      return firebase.messaging.isSupported ? firebase.messaging.isSupported() : true;
    }).then(function (ok) {
      if (!ok) throw new Error('HP atau browser ini belum mendukung notifikasi web.');
      if (!firebase.apps.length) firebase.initializeApp(C.firebase);
      if (!messaging) { messaging = firebase.messaging(); messaging.onMessage(pesanDepan); }
      return messaging;
    });
  }
  function ambilToken() {
    return swSiap().then(function (reg) {
      return initMessaging().then(function (m) {
        return m.getToken({ vapidKey: C.vapidKey, serviceWorkerRegistration: reg });
      });
    }).then(function (t) { if (!t) throw new Error('Token notifikasi kosong. Coba lagi.'); return t; });
  }
  function namaPerangkat() {
    var ua = navigator.userAgent;
    var jenis = IOS ? 'iPhone/iPad' : (/android/i.test(ua) ? 'Android' : 'Komputer');
    return jenis + (STANDALONE ? ' \u00B7 aplikasi' : ' \u00B7 browser');
  }
  function daftarkanToken(token) {
    var lama = LS.get('token');
    return api('daftarPerangkat', {
      token: token, tokenLama: lama && lama !== token ? lama : '',
      peran: S.peran, nama: S.nama, kunci: S.peran === 'admin' ? S.kunci : '',
      appUrl: APP_URL, perangkat: namaPerangkat()
    }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.pesan) || 'Server menolak pendaftaran HP ini.');
      LS.set('token', token); LS.set('tokenWaktu', Date.now()); LS.set('tokenPeran', S.peran + '|' + S.nama);
    });
  }
  /** Harus dipanggil dari ketukan tombol (syarat iPhone). */
  function aktifkanNotif() {
    var st = statusNotif();
    if (st === 'aktif') return tesNotif();
    if (st !== 'mati') return bukaSheet();
    var izin;
    try { izin = Notification.requestPermission(); } catch (e) { izin = Notification.permission; }
    $('btnNotif').disabled = true;
    toast('Menyiapkan notifikasi...', 'Pilih Izinkan kalau HP bertanya.');
    Promise.resolve(izin).then(function (hasil) {
      if (hasil !== 'granted') throw new Error(hasil === 'denied'
        ? 'Izin ditolak. Buka Pengaturan HP > Aplikasi > Shoeclin (atau Chrome) > Notifikasi, lalu izinkan.'
        : 'Izin belum diberikan. Ketuk Aktifkan lagi lalu pilih Izinkan.');
      return ambilToken();
    }).then(daftarkanToken).then(function () {
      LS.del('notifMati');
      toast('Notifikasi aktif', S.peran === 'admin' ? 'HP ini akan dapat kabar setiap ada order masuk.'
                                                    : 'HP ini akan dapat pengingat order setiap pagi.');
    }).catch(function (e) {
      toast('Notifikasi belum aktif', pesanError(e), null, true);
    }).then(function () { $('btnNotif').disabled = false; perbaruiNotifUI(); });
  }
  /** Setiap aplikasi dibuka: pastikan token masih sama dan terdaftar. */
  function segarkanTokenDiam() {
    if (!firebaseDiisi() || LS.get('notifMati') === '1') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (IOS && !STANDALONE) return;
    ambilToken().then(function (t) {
      var basi = Date.now() - Number(LS.get('tokenWaktu') || 0) > 3 * HARI;
      if (t !== LS.get('token') || basi || LS.get('tokenPeran') !== S.peran + '|' + S.nama) return daftarkanToken(t);
    }).catch(function () {}).then(perbaruiNotifUI);
  }
  function tesNotif() {
    var token = LS.get('token'); if (!token) return;
    toast('Mengirim tes...', 'Tunggu beberapa detik.');
    api('tesNotif', { token: token }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.pesan) || 'Gagal mengirim tes.');
      toast('Tes terkirim', 'Notifikasi akan muncul sebentar lagi.');
    }).catch(function (e) { toast('Tes gagal', pesanError(e), null, true); });
  }
  function matikanNotif() {
    var token = LS.get('token'), b = $('btnMatikan');
    b.disabled = true;
    (token ? api('hapusPerangkat', { token: token }).catch(function () {}) : Promise.resolve())
      .then(function () { if (messaging) return messaging.deleteToken().catch(function () {}); })
      .then(function () {
        LS.del('token'); LS.del('tokenPeran'); LS.del('tokenWaktu'); LS.set('notifMati', '1');
        b.disabled = false; perbaruiNotifUI();
        toast('Notifikasi dimatikan', 'HP ini tidak menerima kabar lagi. Bisa diaktifkan kapan saja.');
      });
  }
  /** Notifikasi yang datang saat aplikasi sedang dibuka. */
  function pesanDepan(p) {
    var n = (p && p.notification) || {}, d = (p && p.data) || {};
    var judul = d.judul || n.title || 'Shoeclin', isi = d.isi || n.body || '';
    var keAdmin = d.buka === 'admin' && S.peran === 'admin';
    toast(judul, isi, keAdmin ? { label: 'Lihat', aksi: function () { gantiMode('admin'); muatUlang(); } } : null);
    if (d.tes === '1' && swReg && swReg.showNotification)
      swReg.showNotification(judul, { body: isi, icon: APP_URL + 'icon-192.png', tag: 'tes' });
    try { if (navigator.vibrate) navigator.vibrate([80, 60, 80]); } catch (e) {}
  }

  /* ==================== PASANG APLIKASI ==================== */
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; aturPasangUI(); });
  window.addEventListener('appinstalled', function () { installEvt = null; aturPasangUI(); });
  function pasang() {
    if (!installEvt) return;
    var ev = installEvt;
    ev.prompt();
    Promise.resolve(ev.userChoice).then(function () { installEvt = null; aturPasangUI(); });
  }
  function aturPasangUI() {
    var bisa = !!installEvt && !STANDALONE;
    tunjuk('wPasang', !STANDALONE);
    tunjuk('btnPasang', bisa); tunjuk('btnPasang2', bisa);
    var hint = '';
    if (!STANDALONE && !bisa) hint = IOS
      ? 'Cara memasang di iPhone: buka link ini di Safari, ketuk ikon Bagikan (kotak dengan panah ke atas), lalu pilih Tambahkan ke Layar Utama.'
      : 'Cara memasang: buka menu titik tiga di Chrome, lalu pilih Instal aplikasi atau Tambahkan ke layar utama. Kalau link dibuka dari WhatsApp, pilih Buka di Chrome dulu.';
    ['pasangHint', 'pasangHint2'].forEach(function (id) { $(id).textContent = hint; tunjuk(id, !!hint); });
  }

  /* ==================== MENU & TOAST ==================== */
  function bukaSheet() {
    $('iNama').textContent = S.nama || '-';
    $('iPeran').textContent = S.peran === 'admin' ? 'Admin (bisa mode kurir)' : 'Kurir';
    perbaruiNotifUI(); aturPasangUI();
    tunjuk('sheet', true);
  }
  function tutupSheet() { tunjuk('sheet', false); }
  function toast(judul, isi, aksi, buruk) {
    $('tJudul').textContent = judul;
    $('tIsi').textContent = isi || '';
    var b = $('tAksi');
    if (aksi) b.textContent = aksi.label;
    b.onclick = function (e) { e.stopPropagation(); tutupToast(); if (aksi) aksi.aksi(); };
    tunjuk('tAksi', !!aksi);
    $('toast').className = 'toast' + (buruk ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(tutupToast, aksi ? 10000 : (buruk ? 9000 : 5000));
  }
  function tutupToast() { tunjuk('toast', false); }

  /* ==================== MULAI ==================== */
  function ikatTombol() {
    $('rKurir').onclick = function () { pilihPeran('kurir'); };
    $('rAdmin').onclick = function () { pilihPeran('admin'); };
    $('btnMulai').onclick = kirimSetup;
    $('inKunci').onkeydown = function (e) { if (e.key === 'Enter') kirimSetup(); };
    $('btnBatalSetup').onclick = bukaApp;
    $('btnPasang').onclick = pasang;
    $('btnPasang2').onclick = pasang;
    $('segKurir').onclick = function () { gantiMode('kurir'); };
    $('segAdmin').onclick = function () { gantiMode('admin'); };
    $('btnBell').onclick = function () { if (statusNotif() === 'mati') aktifkanNotif(); else bukaSheet(); };
    $('btnMenu').onclick = bukaSheet;
    $('nbarYa').onclick = function () { if (statusNotif() === 'mati') aktifkanNotif(); else bukaSheet(); };
    $('nbarX').onclick = function () { LS.set('nbarTutup', Date.now()); tunjuk('nbar', false); };
    $('btnCoba').onclick = muatUlang;
    $('btnCoba2').onclick = muatUlang;
    $('btnNotif').onclick = aktifkanNotif;
    $('btnMatikan').onclick = matikanNotif;
    $('btnReload').onclick = function () { tutupSheet(); muatUlang(); };
    $('btnGanti').onclick = function () { tutupSheet(); tampilSetup(); };
    $('btnTutup').onclick = tutupSheet;
    $('sheet').onclick = function (e) { if (e.target === this) tutupSheet(); };
    $('toast').onclick = function () { tutupToast(); };
  }
  function mulai() {
    ikatTombol();
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; }).catch(function () {});
    $('ver').textContent = 'Shoeclin app versi ' + (C.versi || '1') + (STANDALONE ? ' \u00B7 terpasang' : ' \u00B7 browser');

    var buka = new URLSearchParams(location.search).get('buka');   // dari klik notifikasi
    if (buka) {
      if (buka === 'admin' || buka === 'kurir') LS.set('mode', buka);
      history.replaceState(null, '', location.pathname);
    }
    window.addEventListener('online', function () { var r = FRAME[S.mode]; if (r && !r.siap) muatFrame(r); });
    window.addEventListener('offline', function () { var r = FRAME[S.mode]; if (r) aturMuat(r); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) perbaruiNotifUI(); });

    if (!configBenar())
      return tampilSetup('config.js belum diisi: tempel URL Web App Apps Script (berakhiran /exec) di appsScriptUrl.');
    if (!S.peran || !S.nama || (S.peran === 'admin' && !S.kunci)) return tampilSetup();
    bukaApp();
  }
  mulai();
})();
