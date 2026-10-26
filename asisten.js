/*************************************************************
 * SHOECLIN APP — asisten.js (versi 1.2)
 * Asisten AI analis bisnis, khusus admin.
 *  - Paket data bisnis diambil dari Apps Script (Asisten.gs).
 *  - Pertanyaan dikirim langsung ke AI dan jawabannya tampil sambil
 *    diketik, jadi analisis panjang tidak terpotong batas waktu.
 *  - Mendukung Google Gemini (berbayar atau gratis) dan Claude (opsional).
 *  - Model, tingkat berpikir, dan harga diatur di Asisten.gs.
 * Tidak perlu diubah.
 *
 * 1.2: pesan yang jelas kalau saldo prabayar Gemini habis.
 *************************************************************/
(function () {
  'use strict';

  var URL_CLAUDE = 'https://api.anthropic.com/v1/messages';
  var URL_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var PERIODE = [
    ['bulan-ini', 'Bulan ini'], ['bulan-lalu', 'Bulan lalu'], ['3-bulan', '3 bulan terakhir'],
    ['6-bulan', '6 bulan terakhir'], ['tahun-ini', 'Tahun ini'], ['semua', 'Semua data']
  ];
  var MODE_AWAL = [['mendalam', 'Analisis mendalam'], ['cepat', 'Tanya cepat']];
  var SARAN = [
    'Bagaimana kesehatan bisnis di periode ini? Sebutkan 3 hal terpenting yang harus aku lakukan.',
    'Layanan mana yang paling menguntungkan, dan harga mana yang perlu dievaluasi?',
    'Perlukah biaya tambahan untuk sepatu ukuran besar? Hitung dampaknya ke laba.',
    'Mitra mana yang paling layak dikembangkan, dan bagaimana caranya?',
    'Buat strategi untuk mengaktifkan lagi pelanggan yang sudah lama tidak order.',
    'Susun rencana 30 hari untuk menaikkan laba bersih.',
    'Ada risiko atau kebocoran uang yang perlu aku waspadai?'
  ];
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var LS_MODE = 'shc_ai_mode';
  var IKON_KIRIM = '<svg viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12 3.5 13.9z"/></svg>';
  var IKON_STOP = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  var CFG = null;       // dari server, termasuk kunci API (hanya di memori)
  var AKTIF = null;     // percakapan yang sedang dibuka
  var KIRIM = null;     // { batal, ctrl, balas } saat asisten sedang menjawab
  var WAKE = null, DIBANGUN = false;
  var renderTimer = null, simpanTimer = null, detikTimer = null;

  /* ==================== UTILITAS ==================== */
  function $(id) { return document.getElementById(id); }
  function app() { return window.ShoeclinApp || {}; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function tglPendek(s) {
    var p = String(s || '').split('-');
    return p.length === 3 ? Number(p[2]) + ' ' + BLN[Number(p[1]) - 1] + ' ' + p[0] : String(s || '');
  }
  function angka(n) { return Math.round(Number(n) || 0).toLocaleString('id-ID'); }
  function uang(usd) {
    var kurs = (CFG && CFG.kurs) || 16500;
    return '$' + (Number(usd) || 0).toFixed(2).replace('.', ',') + ' (± Rp ' + angka((Number(usd) || 0) * kurs) + ')';
  }
  function durasi(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function labelDari(daftar, kode) { for (var i = 0; i < daftar.length; i++) if (daftar[i][0] === kode) return daftar[i][1]; return kode; }
  function labelMode(kode) { return (CFG && CFG.mode && CFG.mode[kode] && CFG.mode[kode].label) || labelDari(MODE_AWAL, kode); }
  /** Ada mode Gemini gratis (tanpa harga)? Dipakai untuk menampilkan catatan privasi. */
  function adaGratis() {
    if (!CFG || !CFG.mode) return false;
    return Object.keys(CFG.mode).some(function (k) {
      var M = CFG.mode[k];
      return (M.penyedia || 'gemini') === 'gemini' && !M.harga;
    });
  }
  function rentang(kode) {
    var n = new Date(), s, e = n;
    if (kode === 'bulan-lalu') { s = new Date(n.getFullYear(), n.getMonth() - 1, 1); e = new Date(n.getFullYear(), n.getMonth(), 0); }
    else if (kode === '3-bulan') s = new Date(n.getFullYear(), n.getMonth() - 2, 1);
    else if (kode === '6-bulan') s = new Date(n.getFullYear(), n.getMonth() - 5, 1);
    else if (kode === 'tahun-ini') s = new Date(n.getFullYear(), 0, 1);
    else if (kode === 'semua') s = new Date(2020, 0, 1);
    else s = new Date(n.getFullYear(), n.getMonth(), 1);
    return { start: iso(s), end: iso(e) };
  }
  function beritahu(judul, isi, buruk) { if (app().toast) app().toast(judul, isi || '', null, buruk); }

  /* ==================== PENYIMPANAN DI HP ==================== */
  var DB = null, DBJ = null;
  function db() {
    if (DBJ) return DBJ;
    DBJ = new Promise(function (res) {
      var beres = false;
      function jadi(v) { if (!beres) { beres = true; res(v); } }
      try {
        var rq = window.indexedDB.open('shoeclin_ai', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
        rq.onsuccess = function () { DB = rq.result; jadi(DB); };
        rq.onerror = function () { jadi(null); };
        rq.onblocked = function () { jadi(null); };
      } catch (e) { jadi(null); }
      setTimeout(function () { jadi(DB); }, 3000);
    });
    return DBJ;
  }
  function dbOp(mode, kerja) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (res) {
        try {
          var tx = d.transaction('kv', mode), hasil = null, rq = kerja(tx.objectStore('kv'));
          if (rq) rq.onsuccess = function () { hasil = rq.result; };
          tx.oncomplete = function () { res(hasil === undefined ? null : hasil); };
          tx.onerror = tx.onabort = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  }
  function dbGet(k) { return dbOp('readonly', function (s) { return s.get(k); }); }
  function dbPut(k, v) { return dbOp('readwrite', function (s) { return s.put(v, k); }); }
  function dbDel(k) { return dbOp('readwrite', function (s) { return s.delete(k); }); }

  function simpan(segera) {
    function kerja() {
      var c = AKTIF;
      if (!c) return;
      dbPut('c:' + c.id, c);
      dbPut('aktif', c.id);
      if (!c.pesan.length) return;
      dbGet('daftar').then(function (L) {
        L = (L || []).filter(function (x) { return x.id !== c.id; });
        var tanya = c.pesan.filter(function (m) { return m.role === 'user'; })[0];
        L.unshift({ id: c.id, judul: tanya ? tanya.teks.slice(0, 90) : 'Percakapan', dibuat: c.dibuat, periode: c.periodeLabel });
        L.slice(20).forEach(function (x) { dbDel('c:' + x.id); });
        dbPut('daftar', L.slice(0, 20));
      });
    }
    if (segera) { clearTimeout(simpanTimer); simpanTimer = null; kerja(); }
    else if (!simpanTimer) simpanTimer = setTimeout(function () { simpanTimer = null; kerja(); }, 3000);
  }
  function baru(kode) {
    var r = rentang(kode);
    AKTIF = { id: 'p' + Date.now().toString(36), dibuat: Date.now(), periodeKode: kode,
              periodeLabel: labelDari(PERIODE, kode), start: r.start, end: r.end,
              sistem: '', konteks: '', diambil: '', pesan: [] };
    simpan(true);
  }
  function muatAktif() {
    return dbGet('aktif').then(function (id) { return id ? dbGet('c:' + id) : null; }).then(function (c) {
      if (c && c.pesan) {
        c.pesan.forEach(function (m) {
          if (m.role === 'assistant' && /siap-data|berpikir|menulis/.test(m.status)) {
            m.status = 'terputus';
            m.galat = m.galat || 'Aplikasi tertutup sebelum jawaban selesai. Tekan Ulangi.';
          }
        });
        AKTIF = c;
      } else baru('bulan-ini');
    });
  }

  /* ==================== SERVER (Apps Script) ==================== */
  function panggil(tambahan, batas) {
    var A = app();
    if (!A.api) return Promise.reject(new Error('Aplikasi belum siap. Buka ulang aplikasi.'));
    var isi = { kunci: A.kunci(), nama: A.nama() };
    Object.keys(tambahan).forEach(function (k) { isi[k] = tambahan[k]; });
    return A.api('asistenSiapkan', isi, batas || 30000).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.pesan) || 'Server menolak permintaan asisten.');
      CFG = { kunci: res.kunci || (res.kunciAI ? { claude: res.kunciAI } : {}), versiApi: res.versiApi,
              mode: res.mode, modeAwal: res.modeAwal, maksRiwayat: res.maksRiwayat, kurs: res.kurs,
              bulanIni: res.bulanIni || (CFG && CFG.bulanIni) };
      isiMode(); infoAtas();
      if (AKTIF && !AKTIF.pesan.length) render();
      return res;
    });
  }
  function siapkanCfg() { return CFG ? Promise.resolve() : panggil({ tanpaData: true }); }
  /** Paket data diambil sekali per percakapan, supaya semua jawaban memakai data yang sama. */
  function siapkanData() {
    if (AKTIF.konteks) return siapkanCfg();
    var r = rentang(AKTIF.periodeKode);
    AKTIF.start = r.start; AKTIF.end = r.end;
    return panggil({ start: r.start, end: r.end }, 120000).then(function (res) {
      if (!res.konteks) throw new Error('Paket data dari server kosong.');
      AKTIF.sistem = res.sistem; AKTIF.konteks = res.konteks; AKTIF.diambil = res.diambil || '';
      simpan(true); infoAtas();
    });
  }
  function isiMode() {
    var sel = $('aiMode');
    if (!sel || !CFG || !CFG.mode) return;
    var nilai = sel.value;
    sel.innerHTML = Object.keys(CFG.mode).map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(CFG.mode[k].label || k) + '</option>';
    }).join('');
    sel.value = CFG.mode[nilai] ? nilai : (CFG.modeAwal || Object.keys(CFG.mode)[0]);
  }

  /* ==================== BERTANYA KE AI ==================== */
  function susunPesan() {
    var P = AKTIF.pesan, hasil = [];
    for (var i = 0; i < P.length - 2; i++) {        // dua terakhir: pertanyaan baru + jawaban yang sedang dibuat
      var q = P[i], a = P[i + 1];
      if (q.role === 'user' && a && a.role === 'assistant' && a.teks && /selesai|terpotong/.test(a.status)) {
        hasil.push({ role: 'user', content: q.teks }, { role: 'assistant', content: a.teks });
        i++;
      }
    }
    var maks = ((CFG && CFG.maksRiwayat) || 12) * 2;
    if (hasil.length > maks) hasil = hasil.slice(hasil.length - maks);
    hasil.push({ role: 'user', content: P[P.length - 2].teks });
    return hasil;
  }
  function dataSSE(blok) {
    var data = '';
    blok.split('\n').forEach(function (l) { if (l.indexOf('data:') === 0) data += l.slice(5).replace(/^ /, ''); });
    return data;
  }
  function bacaSSE(res, olah, balas) {
    var rd = res.body.getReader(), dec = new TextDecoder(), sisa = '';
    function baca() {
      return rd.read().then(function (r) {
        if (r.done) { if (sisa.trim()) olah(sisa, balas); return; }
        sisa = (sisa + dec.decode(r.value, { stream: true })).replace(/\r\n/g, '\n');
        var bag = sisa.split('\n\n');
        sisa = bag.pop();
        for (var i = 0; i < bag.length; i++) olah(bag[i], balas);
        jadwalRender();
        return baca();
      });
    }
    return baca();
  }

  // ---------- Gemini ----------
  function olahGemini(blok, balas) {
    var data = dataSSE(blok);
    if (!data || data === '[DONE]') return;
    var ev;
    try { ev = JSON.parse(data); } catch (e) { return; }
    if (ev.error) throw { http: ev.error.code || 500, penyedia: 'gemini', teks: JSON.stringify(ev) };
    if (ev.promptFeedback && ev.promptFeedback.blockReason) balas.stop = 'refusal';
    var c = ev.candidates && ev.candidates[0];
    if (c) {
      ((c.content && c.content.parts) || []).forEach(function (p) {
        if (typeof p.text !== 'string') return;
        if (p.thought) balas.pikir += p.text;
        else {
          balas.teks += p.text;
          if (balas.status === 'berpikir') balas.status = 'menulis';
        }
      });
      if (c.finishReason) {
        var f = c.finishReason;
        balas.stop = f === 'STOP' ? 'end_turn' : (f === 'MAX_TOKENS' ? 'max_tokens' : 'refusal');
      }
    }
    if (ev.usageMetadata) {
      var u = ev.usageMetadata;
      balas.usage = { input_tokens: u.promptTokenCount || 0, cache_read_input_tokens: u.cachedContentTokenCount || 0,
                      cache_creation_input_tokens: 0,
                      output_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
    }
  }
  function alirkanGemini(M, balas, model) {
    var ctrl = new AbortController();
    KIRIM.ctrl = ctrl;
    var body = {
      systemInstruction: { parts: [{ text: AKTIF.sistem + '\n\n' + AKTIF.konteks }] },
      contents: susunPesan().map(function (m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      }),
      generationConfig: {
        maxOutputTokens: M.maxTokens,
        thinkingConfig: { thinkingLevel: M.tingkat || 'high', includeThoughts: true }
      }
    };
    return fetch(URL_GEMINI + encodeURIComponent(model) + ':streamGenerateContent?alt=sse', {
      method: 'POST', signal: ctrl.signal, body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': CFG.kunci.gemini }
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw { http: res.status, penyedia: 'gemini', teks: t }; });
      return bacaSSE(res, olahGemini, balas);
    });
  }

  // ---------- Claude (opsional) ----------
  function gabungUsage(balas, u) {
    if (!u) return;
    balas.usage = balas.usage || {};
    ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'].forEach(function (k) {
      if (typeof u[k] === 'number') balas.usage[k] = Math.max(balas.usage[k] || 0, u[k]);
    });
  }
  function olahClaude(blok, balas) {
    var data = dataSSE(blok);
    if (!data) return;
    var ev;
    try { ev = JSON.parse(data); } catch (e) { return; }
    if (ev.type === 'message_start' && ev.message) gabungUsage(balas, ev.message.usage);
    else if (ev.type === 'content_block_start' && ev.content_block) {
      if (ev.content_block.type === 'text' && balas.teks) balas.teks += '\n\n';
    } else if (ev.type === 'content_block_delta' && ev.delta) {
      if (ev.delta.type === 'text_delta') {
        balas.teks += ev.delta.text || '';
        if (balas.status === 'berpikir') balas.status = 'menulis';
      } else if (ev.delta.type === 'thinking_delta') balas.pikir += ev.delta.thinking || '';
    } else if (ev.type === 'message_delta') {
      if (ev.delta && ev.delta.stop_reason) balas.stop = ev.delta.stop_reason;
      gabungUsage(balas, ev.usage);
    } else if (ev.type === 'error') {
      throw { api: true, jenis: ev.error && ev.error.type, pesan: (ev.error && ev.error.message) || 'Kesalahan dari server Claude.' };
    }
  }
  function alirkanClaude(M, balas, model) {
    var ctrl = new AbortController();
    KIRIM.ctrl = ctrl;
    var body = {
      model: model, max_tokens: M.maxTokens, stream: true,
      output_config: { effort: M.tingkat || M.effort || 'high' },
      thinking: { type: 'adaptive', display: 'summarized' },
      system: [
        { type: 'text', text: AKTIF.sistem },
        { type: 'text', text: AKTIF.konteks, cache_control: { type: 'ephemeral' } }
      ],
      messages: susunPesan()
    };
    return fetch(URL_CLAUDE, {
      method: 'POST', signal: ctrl.signal, body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        'x-api-key': CFG.kunci.claude,
        'anthropic-version': CFG.versiApi || '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw { http: res.status, penyedia: 'claude', teks: t }; });
      balas.usage = {};
      return bacaSSE(res, olahClaude, balas);
    });
  }

  function alirkan(M, balas, model) {
    return M.penyedia === 'claude' ? alirkanClaude(M, balas, model) : alirkanGemini(M, balas, model);
  }
  function saldoHabis(err) {
    return !!err && (err.http === 402 || /prepay|credits are depleted/i.test(String(err.teks || '')));
  }
  /** Kalau model utama sedang penuh atau sibuk, coba sekali lagi dengan model cadangan. */
  function jalankan(M, balas) {
    return alirkan(M, balas, M.model).catch(function (err) {
      var bisa = M.cadangan && !(KIRIM && KIRIM.batal) && !balas.teks && err && !saldoHabis(err) &&
                 (err.http === 429 || err.http === 500 || err.http === 503);
      if (!bisa) throw err;
      balas.model = M.cadangan; balas.pikir = '';
      balas.catatan = M.model + ' sedang penuh, dijawab oleh ' + M.cadangan + '.';
      renderBalas(balas);
      return alirkan(M, balas, M.cadangan);
    });
  }
  function hitungBiaya(u, h) {
    if (!h) return 0;
    return ((u.input_tokens || 0) * (h.masuk || 0) + (u.cache_creation_input_tokens || 0) * (h.tulisCache || 0) +
            (u.cache_read_input_tokens || 0) * (h.bacaCache || 0) + (u.output_tokens || 0) * (h.keluar || 0)) / 1e6;
  }
  function pesanGalat(e) {
    if (!e) return 'Terjadi kesalahan.';
    if (e.http) {
      var info = '';
      try { var j = JSON.parse(e.teks); info = (j.error && j.error.message) || ''; } catch (x) {}
      var kecil = info.toLowerCase();
      if (e.penyedia === 'gemini') {
        if (saldoHabis(e)) return 'Saldo prabayar Gemini habis. Isi saldo di aistudio.google.com bagian Billing, lalu tekan Ulangi.';
        if (e.http === 429) return 'Batas pemakaian Gemini tercapai (per menit atau per hari). Tunggu sebentar lalu tekan Ulangi, atau pakai mode Tanya cepat.';
        if (kecil.indexOf('api key') > -1 || e.http === 401) return 'Kunci API Gemini ditolak. Periksa GEMINI_API_KEY di Script Properties.';
        if (e.http === 404) return 'Model Gemini tidak ditemukan (' + info + '). Ubah model di Asisten.gs, lalu deploy versi baru.';
        if (e.http === 400 && kecil.indexOf('thinking') > -1) return 'Model ini tidak menerima pengaturan tingkat berpikir. Ubah "tingkat" di Asisten.gs. ' + info;
        if (kecil.indexOf('location') > -1) return 'Gemini API belum tersedia di lokasi ini. ' + info;
        if (e.http === 403) return 'Akses Gemini ditolak. Model ini mungkin hanya untuk kunci berbayar. ' + info;
        if (e.http >= 500) return 'Server Gemini sedang sibuk. Coba lagi beberapa menit lagi.';
        return 'Gemini menolak permintaan (' + e.http + '). ' + info;
      }
      if (e.http === 401) return 'Kunci API Claude ditolak. Periksa ANTHROPIC_API_KEY di Script Properties.';
      if (kecil.indexOf('credit') > -1 || kecil.indexOf('balance') > -1) return 'Saldo API Claude habis. Isi saldo di platform.claude.com bagian Billing.';
      if (e.http === 404 || (e.http === 400 && kecil.indexOf('model') > -1))
        return 'Model tidak tersedia untuk akunmu (' + info + '). Ubah model di Asisten.gs.';
      if (e.http === 429) return 'Batas pemakaian Claude tercapai. Tunggu sebentar. ' + info;
      if (e.http >= 500) return 'Server Claude sedang sibuk. Coba lagi beberapa menit lagi.';
      return 'Claude menolak permintaan (' + e.http + '). ' + info;
    }
    if (e.api) return e.jenis === 'overloaded_error' ? 'Server AI sedang sibuk. Coba lagi beberapa menit lagi.' : 'AI: ' + e.pesan;
    if (e.name === 'TypeError' || e.name === 'AbortError')
      return navigator.onLine === false ? 'Sinyal terputus.' : 'Koneksi ke server AI terputus. Biarkan aplikasi tetap terbuka selama asisten berpikir.';
    return e.message || e.pesan || String(e);
  }

  function kirim(teks) {
    teks = String(teks || '').trim();
    if (!teks || KIRIM || !AKTIF) return;
    if (navigator.onLine === false) return beritahu('Tidak ada sinyal', 'Coba lagi saat sinyal kembali.', true);
    $('aiTeks').value = ''; aturTinggi();
    var modeKode = $('aiMode').value || 'mendalam';
    AKTIF.pesan.push({ role: 'user', teks: teks, waktu: Date.now() });
    var balas = { role: 'assistant', teks: '', pikir: '', waktu: Date.now(), mode: modeKode, status: 'siap-data' };
    AKTIF.pesan.push(balas);
    KIRIM = { batal: false, ctrl: null, balas: balas };
    render(); gulirBawah(true); simpan(true); aturTombol();

    siapkanData().then(function () {
      if (KIRIM.batal) throw { batal: true };
      var M = CFG.mode && (CFG.mode[modeKode] || CFG.mode[CFG.modeAwal]);
      if (!M) throw new Error('Pengaturan mode asisten tidak ditemukan di Asisten.gs.');
      if (!CFG.kunci || !CFG.kunci[M.penyedia || 'gemini']) throw new Error('Kunci API untuk mode ini belum disimpan di Script Properties.');
      balas.mode = CFG.mode[modeKode] ? modeKode : CFG.modeAwal;
      balas.model = M.model; balas.modeLabel = M.label;
      balas.status = 'berpikir'; balas.mulai = Date.now();
      renderBalas(balas); mulaiDetik(); kunciLayar();
      return jalankan(M, balas);
    }).then(function () {
      if (balas.stop === 'refusal') {
        balas.status = 'ditolak'; balas.galat = 'AI tidak melanjutkan jawaban ini (filter keamanan). Coba ubah cara bertanya.';
      } else if (balas.stop === 'max_tokens') {
        balas.status = 'terpotong'; balas.galat = 'Jawaban mencapai batas panjang. Ketik "lanjutkan" untuk meminta sisanya.';
      } else if (!balas.teks) {
        balas.status = 'gagal'; balas.galat = 'AI tidak mengirim jawaban. Tekan Ulangi.';
      } else balas.status = 'selesai';
    }, function (err) {
      var batal = (KIRIM && KIRIM.batal) || (err && err.batal);
      balas.status = batal ? 'dihentikan' : 'gagal';
      if (!batal) balas.galat = pesanGalat(err);
    }).then(function () { selesai(balas, teks); });
  }
  function hentikan() {
    if (!KIRIM) return;
    KIRIM.batal = true;
    if (KIRIM.ctrl) KIRIM.ctrl.abort();
  }
  function selesai(balas, tanya) {
    clearInterval(detikTimer); lepasLayar();
    KIRIM = null;
    balas.selesai = Date.now();
    var M = CFG && CFG.mode && CFG.mode[balas.mode];
    if (balas.usage && M) balas.biaya = hitungBiaya(balas.usage, M.harga);
    renderBalas(balas); aturTombol(); simpan(true);
    if (balas.status === 'selesai' && document.hidden) kabarSelesai();
    var u = balas.usage || {};
    if (u.output_tokens || u.input_tokens) {
      var A = app();
      A.api('asistenCatat', {
        kunci: A.kunci(), nama: A.nama(), mode: balas.modeLabel || balas.mode, model: balas.model || '',
        periode: AKTIF.periodeLabel + ' (' + AKTIF.start + ' s/d ' + AKTIF.end + ')',
        tanya: tanya, jawab: balas.teks, usage: u, biaya: balas.biaya || 0, status: balas.status
      }, 30000).then(function (res) {
        if (res && res.ok && res.bulanIni && CFG) { CFG.bulanIni = res.bulanIni; infoAtas(); }
      }).catch(function () {});
    }
  }
  function kabarSelesai() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
      navigator.serviceWorker.ready.then(function (reg) {
        reg.showNotification('Analisis selesai', { body: 'Jawaban asisten AI sudah siap dibaca.', icon: 'icon-192.png', tag: 'ai-selesai' });
      });
    } catch (e) {}
  }
  function kunciLayar() {
    try {
      if (navigator.wakeLock && !WAKE) navigator.wakeLock.request('screen').then(function (w) {
        WAKE = w; w.addEventListener('release', function () { WAKE = null; });
      }).catch(function () {});
    } catch (e) {}
  }
  function lepasLayar() { try { if (WAKE) WAKE.release(); } catch (e) {} WAKE = null; }

  /* ==================== TAMPILAN ==================== */
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=$|[\s).,!?:;])/g, '$1<i>$2</i>');
  }
  function pemisah(r) { return /-/.test(r) && !r.replace(/[\s|:\-]/g, ''); }
  function sel(r) { return r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  function tabel(rows) {
    var adaKepala = rows.length > 1 && pemisah(rows[1]);
    var isi = rows.filter(function (r) { return !pemisah(r); });
    var html = '<div class="ai-tbl"><table>';
    isi.forEach(function (r, i) {
      var tag = adaKepala && i === 0 ? 'th' : 'td';
      html += '<tr>' + sel(r).map(function (c) { return '<' + tag + '>' + inline(c) + '</' + tag + '>'; }).join('') + '</tr>';
    });
    return html + '</table></div>';
  }
  function md(teks) {
    var B = String(teks || '').replace(/\r/g, '').split('\n'), out = [], i = 0, m;
    var awalBlok = /^(#{1,6}\s|```|\s*\|.*\|\s*$|\s*[-*•]\s+|\s*\d+[.)]\s+|\s*>\s?|\s*(-{3,}|\*{3,})\s*$)/;
    while (i < B.length) {
      var b = B[i];
      if (/^```/.test(b)) {
        var kode = []; i++;
        while (i < B.length && !/^```/.test(B[i])) kode.push(B[i++]);
        i++; out.push('<pre>' + esc(kode.join('\n')) + '</pre>'); continue;
      }
      if ((m = b.match(/^(#{1,6})\s+(.*)$/))) {
        var h = m[1].length <= 2 ? 'h3' : 'h4';
        out.push('<' + h + '>' + inline(m[2]) + '</' + h + '>'); i++; continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(b)) { out.push('<hr>'); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(b)) {
        var rows = [];
        while (i < B.length && /^\s*\|.*\|\s*$/.test(B[i])) rows.push(B[i++]);
        out.push(tabel(rows)); continue;
      }
      if (/^\s*[-*•]\s+/.test(b)) {
        var ul = [];
        while (i < B.length && /^\s*[-*•]\s+/.test(B[i])) ul.push('<li>' + inline(B[i++].replace(/^\s*[-*•]\s+/, '')) + '</li>');
        out.push('<ul>' + ul.join('') + '</ul>'); continue;
      }
      if ((m = b.match(/^\s*(\d+)[.)]\s+/))) {
        var mulai = Number(m[1]), ol = [];
        while (i < B.length && /^\s*\d+[.)]\s+/.test(B[i])) ol.push('<li>' + inline(B[i++].replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
        out.push('<ol start="' + mulai + '">' + ol.join('') + '</ol>'); continue;
      }
      if (/^\s*>\s?/.test(b)) {
        var q = [];
        while (i < B.length && /^\s*>\s?/.test(B[i])) q.push(inline(B[i++].replace(/^\s*>\s?/, '')));
        out.push('<blockquote>' + q.join('<br>') + '</blockquote>'); continue;
      }
      if (!b.trim()) { i++; continue; }
      var p = [];
      while (i < B.length && B[i].trim() && !awalBlok.test(B[i])) p.push(inline(B[i++]));
      if (!p.length) p.push(inline(B[i++]));
      out.push('<p>' + p.join('<br>') + '</p>');
    }
    return out.join('');
  }

  function statusHtml(m) {
    var spin = '<i class="spin"></i>', jalan = durasi(Date.now() - (m.mulai || Date.now()));
    switch (m.status) {
      case 'siap-data': return '<span class="ai-st">' + spin + 'Mengambil data bisnis...</span>';
      case 'berpikir': return '<span class="ai-st">' + spin + 'Sedang berpikir · <b id="aiDetik">' + jalan + '</b></span>';
      case 'menulis': return '<span class="ai-st">' + spin + 'Menulis jawaban · <b id="aiDetik">' + jalan + '</b></span>';
      case 'selesai': return '<span class="ai-st">Selesai' + (m.mulai && m.selesai ? ' · ' + durasi(m.selesai - m.mulai) : '') + '</span>';
      case 'dihentikan': return '<span class="ai-st bad">Dihentikan</span>';
      case 'terpotong': return '<span class="ai-st bad">Terpotong</span>';
      case 'ditolak': return '<span class="ai-st bad">Tidak dijawab</span>';
      case 'terputus': return '<span class="ai-st bad">Terputus</span>';
      default: return '<span class="ai-st bad">Gagal</span>';
    }
  }
  function infoPakai(m) {
    var u = m.usage || {};
    if (!u.output_tokens && !u.input_tokens) return '';
    var token = angka(u.output_tokens) + ' token keluar';
    return m.biaya ? token + ' · ' + uang(m.biaya) : 'Gratis · ' + token;
  }
  function isiBalas(m, i) {
    var jalan = /siap-data|berpikir|menulis/.test(m.status);
    var h = '<div class="ai-a-head"><span class="ai-badge">' + esc(m.modeLabel || labelMode(m.mode)) + '</span>' + statusHtml(m) + '</div>';
    if (m.catatan) h += '<div class="ai-kecil" style="font-size:11.5px;color:var(--muted);margin:-2px 0 6px">' + esc(m.catatan) + '</div>';
    if (m.pikir) h += '<details class="ai-pikir"' + (m.bukaPikir ? ' open' : '') + '><summary>Proses berpikir</summary><div>' + md(m.pikir) + '</div></details>';
    if (m.teks) h += '<div class="ai-md">' + md(m.teks) + '</div>';
    if (m.galat) h += '<div class="ai-galat">' + esc(m.galat) + '</div>';
    if (!jalan) {
      h += '<div class="ai-a-foot"><span>' + esc(infoPakai(m)) + '</span>' +
        '<span class="ai-aksi">' + (m.teks ? '<button type="button" data-salin="' + i + '">Salin</button>' : '') +
        (/gagal|dihentikan|terputus|ditolak|terpotong/.test(m.status) ? '<button type="button" data-ulang="' + i + '">Ulangi</button>' : '') +
        '</span></div>';
    }
    return h;
  }
  function htmlPesan(m, i) {
    if (m.role === 'user') return '<div class="ai-q">' + esc(m.teks).replace(/\n/g, '<br>') + '</div>';
    return '<div class="ai-a" id="aiA' + i + '" data-i="' + i + '">' + isiBalas(m, i) + '</div>';
  }
  function htmlSambutan() {
    return '<div class="ai-hai"><div class="ai-hai-ikon">✦</div><h3>Asisten analis bisnis</h3>' +
      '<p>Asisten membaca data <b>' + esc(AKTIF.periodeLabel.toLowerCase()) + '</b> beserta tren semua bulan, ' +
      'lalu membantu menganalisis dan menimbang keputusan.</p>' +
      '<div class="ai-saran">' + SARAN.map(function (s, i) {
        return '<button type="button" data-saran="' + i + '">' + esc(s) + '</button>';
      }).join('') + '</div>' +
      '<p class="ai-kecil"><b>Analisis mendalam</b> memakai tingkat berpikir tertinggi, jadi jawabannya butuh waktu lebih lama. ' +
      'Pakai <b>Tanya cepat</b> untuk pertanyaan ringan. Biarkan aplikasi tetap terbuka selama asisten berpikir.</p>' +
      (adaGratis() ? '<p class="ai-kecil">Versi gratis punya batas pemakaian per menit dan per hari. Google dapat memakai isi ' +
        'percakapan versi gratis untuk meningkatkan produknya, karena itu nama pelanggan disamarkan otomatis.</p>' : '') +
      '<p class="ai-kecil">Jawaban AI bisa keliru, jadi cek angka penting sebelum mengambil keputusan besar. ' +
      'Tulis target, kapasitas, atau info pesaing di sheet Asisten_Catatan supaya sarannya lebih tepat.</p></div>';
  }
  function infoAtas() {
    var el = $('aiInfo');
    if (!el || !AKTIF) return;
    var r = AKTIF.konteks ? { start: AKTIF.start, end: AKTIF.end } : rentang(AKTIF.periodeKode);
    var teks = AKTIF.periodeLabel + ' · ' + tglPendek(r.start) + ' – ' + tglPendek(r.end) +
      (AKTIF.diambil ? ' · data per ' + AKTIF.diambil : '');
    if (CFG && CFG.bulanIni) {
      teks += ' · ' + CFG.bulanIni.kali + ' pertanyaan bulan ini';
      if (CFG.bulanIni.usd > 0) teks += ' (' + uang(CFG.bulanIni.usd) + ')';
    }
    el.textContent = teks;
  }
  function render() {
    var list = $('aiList');
    if (!list || !AKTIF) return;
    list.innerHTML = AKTIF.pesan.length ? AKTIF.pesan.map(htmlPesan).join('') : htmlSambutan();
    infoAtas();
  }
  function renderBalas(balas) {
    if (!AKTIF) return;
    var i = AKTIF.pesan.indexOf(balas), el = $('aiA' + i);
    if (!el) { render(); return; }
    var L = $('aiList'), dekat = L.scrollHeight - L.scrollTop - L.clientHeight < 160;
    el.innerHTML = isiBalas(balas, i);
    if (dekat) L.scrollTop = L.scrollHeight;
  }
  function jadwalRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () {
      renderTimer = null;
      if (KIRIM && KIRIM.balas) { renderBalas(KIRIM.balas); simpan(); }
    }, 150);
  }
  function mulaiDetik() {
    clearInterval(detikTimer);
    detikTimer = setInterval(function () {
      var el = $('aiDetik');
      if (el && KIRIM && KIRIM.balas.mulai) el.textContent = durasi(Date.now() - KIRIM.balas.mulai);
    }, 1000);
  }
  function gulirBawah(paksa) {
    var L = $('aiList');
    if (L && (paksa || L.scrollHeight - L.scrollTop - L.clientHeight < 160)) L.scrollTop = L.scrollHeight;
  }
  function aturTinggi() {
    var t = $('aiTeks');
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(140, t.scrollHeight) + 'px';
  }
  function aturTombol() {
    var b = $('aiKirim');
    if (!b) return;
    b.classList.toggle('stop', !!KIRIM);
    b.setAttribute('aria-label', KIRIM ? 'Hentikan' : 'Kirim');
    b.innerHTML = KIRIM ? IKON_STOP : IKON_KIRIM;
    $('aiPeriode').disabled = !!KIRIM;
  }

  /* ==================== RIWAYAT & PERIODE ==================== */
  function gantiPeriode() {
    var kode = this.value;
    if (KIRIM || !AKTIF) { this.value = AKTIF ? AKTIF.periodeKode : kode; return; }
    if (!AKTIF.pesan.length) { dbDel('c:' + AKTIF.id); baru(kode); render(); return; }
    if (!window.confirm('Ganti periode akan memulai percakapan baru. Percakapan sekarang tetap ada di Riwayat. Lanjut?')) {
      this.value = AKTIF.periodeKode; return;
    }
    simpan(true); baru(kode); render();
  }
  function bukaRiwayat() {
    dbGet('daftar').then(function (L) {
      L = L || [];
      var box = $('aiRiwayatList');
      box.innerHTML = L.length ? L.map(function (x) {
        var d = new Date(x.dibuat);
        return '<button type="button" class="ai-rw' + (AKTIF && x.id === AKTIF.id ? ' on' : '') + '" data-id="' + esc(x.id) + '">' +
          '<b>' + esc(x.judul) + '</b><span>' + esc(x.periode) + ' · ' + d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear() + '</span></button>';
      }).join('') : '<p class="hint">Belum ada percakapan tersimpan.</p>';
      box.querySelectorAll('[data-id]').forEach(function (b) {
        b.onclick = function () {
          if (KIRIM) return beritahu('Tunggu sebentar', 'Asisten masih menjawab.', true);
          dbGet('c:' + b.getAttribute('data-id')).then(function (c) {
            if (!c) return;
            if (AKTIF && !AKTIF.pesan.length) dbDel('c:' + AKTIF.id);
            AKTIF = c; dbPut('aktif', c.id);
            $('aiPeriode').value = c.periodeKode;
            $('aiRiwayat').classList.add('hide');
            render(); gulirBawah(true);
          });
        };
      });
      $('aiRiwayat').classList.remove('hide');
    });
  }
  function hapusRiwayat() {
    if (KIRIM) return;
    if (!window.confirm('Hapus semua riwayat percakapan di HP ini? Catatan di sheet Asisten_Log tetap ada.')) return;
    dbGet('daftar').then(function (L) {
      (L || []).forEach(function (x) { dbDel('c:' + x.id); });
      if (AKTIF) dbDel('c:' + AKTIF.id);
      dbPut('daftar', []);
      baru($('aiPeriode').value || 'bulan-ini'); render();
      $('aiRiwayat').classList.add('hide');
    });
  }
  function klikDaftar(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || !AKTIF) return;
    if (b.hasAttribute('data-saran')) { kirim(SARAN[Number(b.getAttribute('data-saran'))]); return; }
    if (b.hasAttribute('data-salin')) {
      var m = AKTIF.pesan[Number(b.getAttribute('data-salin'))];
      if (m && navigator.clipboard) navigator.clipboard.writeText(m.teks).then(function () {
        beritahu('Tersalin', 'Jawaban disalin, siap ditempel di catatan atau WhatsApp.');
      }, function () {});
      return;
    }
    if (b.hasAttribute('data-ulang')) {
      if (KIRIM) return;
      var i = Number(b.getAttribute('data-ulang')), tanya = AKTIF.pesan[i - 1];
      if (!tanya || tanya.role !== 'user') return;
      AKTIF.pesan.splice(i - 1, 2);
      kirim(tanya.teks);
    }
  }

  /* ==================== BANGUN & BUKA ==================== */
  function bangun() {
    if (DIBANGUN) return;
    DIBANGUN = true;
    $('ai').innerHTML =
      '<div class="ai-head">' +
        '<select id="aiPeriode" aria-label="Periode data">' + PERIODE.map(function (p) {
          return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select>' +
        '<select id="aiMode" aria-label="Mode asisten">' + MODE_AWAL.map(function (p) {
          return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="ai-ibtn" id="aiBaru" aria-label="Percakapan baru"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' +
        '<button type="button" class="ai-ibtn" id="aiRiwayatBtn" aria-label="Riwayat"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>' +
      '</div>' +
      '<div class="ai-info" id="aiInfo"></div>' +
      '<div class="ai-list" id="aiList"></div>' +
      '<div class="ai-bawah">' +
        '<textarea id="aiTeks" rows="1" placeholder="Tanyakan tentang bisnismu..."></textarea>' +
        '<button type="button" class="ai-kirim" id="aiKirim" aria-label="Kirim">' + IKON_KIRIM + '</button>' +
      '</div>' +
      '<div class="ai-riwayat hide" id="aiRiwayat"><div class="ai-riwayat-in">' +
        '<h3>Riwayat percakapan</h3><div id="aiRiwayatList"></div>' +
        '<button type="button" class="ai-tutup bahaya" id="aiRiwayatHapus">Hapus semua riwayat</button>' +
        '<button type="button" class="ai-tutup" id="aiRiwayatTutup">Tutup</button>' +
      '</div></div>';

    var mode = '';
    try { mode = localStorage.getItem(LS_MODE) || ''; } catch (e) {}
    $('aiMode').value = mode === 'cepat' ? 'cepat' : 'mendalam';
    $('aiMode').onchange = function () { try { localStorage.setItem(LS_MODE, this.value); } catch (e) {} };
    $('aiPeriode').onchange = gantiPeriode;
    $('aiBaru').onclick = function () {
      if (KIRIM || !AKTIF || !AKTIF.pesan.length) return;
      simpan(true); baru($('aiPeriode').value); render();
    };
    $('aiRiwayatBtn').onclick = bukaRiwayat;
    $('aiRiwayatTutup').onclick = function () { $('aiRiwayat').classList.add('hide'); };
    $('aiRiwayatHapus').onclick = hapusRiwayat;
    $('aiRiwayat').onclick = function (e) { if (e.target === this) this.classList.add('hide'); };
    $('aiKirim').onclick = function () { if (KIRIM) hentikan(); else kirim($('aiTeks').value); };
    $('aiTeks').oninput = aturTinggi;
    $('aiTeks').onkeydown = function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); kirim(this.value); }
    };
    var list = $('aiList');
    list.addEventListener('click', klikDaftar);
    list.addEventListener('toggle', function (e) {
      var d = e.target;
      if (!d || d.tagName !== 'DETAILS' || !AKTIF) return;
      var kartu = d.closest('.ai-a');
      var m = kartu ? AKTIF.pesan[Number(kartu.getAttribute('data-i'))] : null;
      if (m) m.bukaPikir = d.open;
    }, true);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && KIRIM) kunciLayar(); });
  }
  function buka() {
    bangun();
    (AKTIF ? Promise.resolve() : muatAktif()).then(function () {
      $('aiPeriode').value = AKTIF.periodeKode;
      render(); aturTombol(); gulirBawah(true);
      if (!CFG) siapkanCfg().catch(function () {});   // mengisi info pemakaian; galat ditampilkan saat bertanya
    });
  }

  window.ShoeclinAI = { buka: buka };
})();
