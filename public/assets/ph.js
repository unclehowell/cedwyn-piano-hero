/* Piano Hero 0.4.0 — every party a key (each with an (i) info button along the top of the keyboard): the quietest parties on the left half, the busiest from just above middle C (F4) outwards to the top; each label sums up the event on its date with the record's picture, the party's badge and #hashtag; a backing loop (mallets, guitar, voices) keeps the metronome. Cedwyn Estate webapp. — Sion's Tab agent */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var app = $('ph'), stage = $('ph-stage'), scroll = $('ph-scroll'), grid = $('ph-grid'), par = $('ph-par'), kb = $('ph-kb'),
      lab = $('ph-label'), btnPlay = $('ph-play'), btnX2 = $('ph-x2'), nowEl = $('ph-now'), rot = $('ph-rotate'), sel = $('ph-filter');
  if (!app) return;
  var D, N = 0, Q = 0, K = [], keyEls = [], colEls = [], rowNotes = [], nextNoteRow = [];
  var ir = $('ph-ir'), ip = $('ph-ip'), ipT = $('ph-ip-t'), ipB = $('ph-ip-b'), ipX = $('ph-ip-x'), irEls = [], kinfo = [], ipOpen = -1;
  var rowH = 24, viewH = 300, padTop = 300, padBot = 150, H = 0;
  var playing = false, dbl = false, pos = 0, lastP = null, raf = 0, lastT = 0, programmatic = false;
  /* 0.3.0 tempo: one beat per note row; an empty stretch between two note rows takes at most CAP beats however many rows it spans */
  var BEAT = 0.6, CAP = 2, FILTER = 'all', segs = [], clock = 0, lastR = 0, allNotes = [];
  var NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  function isW(m) { var x = m % 12; return x === 0 || x === 2 || x === 4 || x === 5 || x === 7 || x === 9 || x === 11; }
  function noteName(m) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }

  /* Keyboard geometry: N consecutive keys of a real piano (A0..C8), first and last white, centred near middle C.
     Columns follow the top edge of the keys, so a black key's column is exactly as wide as the black key. */
  function startNote(n) {
    var best = null, s;
    for (s = 21; s + n - 1 <= 108; s++) if (isW(s) && isW(s + n - 1)) { var c = Math.abs(s + (n - 1) / 2 - 62); if (!best || c < best.c) best = { s: s, c: c }; }
    if (best) return best.s;
    for (s = Math.max(21, 62 - Math.floor(n / 2)); s > 21; s--) if (isW(s)) return s;
    return 21;
  }
  function geometry(n) {
    var s = startNote(n), B = 0.6, ks = [], w = 0, i;
    for (i = 0; i < n; i++) { var m = s + i; if (isW(m)) { ks.push({ m: m, w: true, wi: w }); w++; } else ks.push({ m: m, w: false, x: w }); }
    var total = w + (ks[n - 1].w ? 0 : B / 2);
    ks.forEach(function (k, i) {
      if (k.w) { var pb = i > 0 && !ks[i - 1].w, nb = i < n - 1 && !ks[i + 1].w; k.kl = k.wi; k.kr = k.wi + 1; k.cl = k.wi + (pb ? B / 2 : 0); k.cr = k.wi + 1 - (nb ? B / 2 : 0); }
      else { k.kl = k.x - B / 2; k.kr = k.x + B / 2; k.cl = k.kl; k.cr = k.kr; }
      ['kl', 'kr', 'cl', 'cr'].forEach(function (p) { k[p] = k[p] / total * 100; });
    });
    return { keys: ks, whites: w };
  }

  /* ---------- sound: a small WebAudio piano (no samples) ---------- */
  var AC = null, master = null, voices = [];
  function audio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    AC = new C(); var comp = AC.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master = AC.createGain(); master.gain.value = 0.55; master.connect(comp); comp.connect(AC.destination);
    return AC;
  }
  function tone(m, vel, when) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime + (when || 0), f = 440 * Math.pow(2, (m - 69) / 12);
    var dur = Math.max(0.7, Math.min(3.6, 4.2 - (m - 21) * 0.045)), v = (vel || 0.7);
    var out = ac.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(Math.min(16000, f * (6 + 6 * v)), t); lp.frequency.exponentialRampToValueAtTime(Math.min(12000, f * 2.2), t + dur * 0.6);
    lp.connect(out); out.connect(master);
    var parts = [[1, 1, 'triangle'], [2, 0.42, 'sine'], [3, 0.18, 'sine'], [4, 0.07, 'sine']], oscs = [];
    parts.forEach(function (p) {
      if (f * p[0] > 18000) return;
      var o = ac.createOscillator(), g = ac.createGain(); o.type = p[2]; o.frequency.value = f * p[0]; o.detune.value = (p[0] - 1) * 1.5;
      g.gain.value = p[1]; o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 0.05); oscs.push(o);
    });
    // hammer: a 25 ms burst of filtered noise
    var len = Math.floor(ac.sampleRate * 0.025), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var ns = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain(); ns.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 3); bp.Q.value = 1.2;
    ng.gain.value = 0.12 * v; ns.connect(bp); bp.connect(ng); ng.connect(out); ns.start(t);
    voices.push({ out: out, oscs: oscs, end: t + dur });
    var nowT = ac.currentTime; voices = voices.filter(function (x) { return x.end > nowT; });
    while (voices.length > 36) { var old = voices.shift(); try { old.out.gain.cancelScheduledValues(nowT); old.out.gain.setTargetAtTime(0.0001, nowT, 0.03); } catch (e) {} }
  }

  /* ---------- label and lights ---------- */
  var labTimer = 0;
  var TH = {};   /* 0.4.0: catalogue pictures as small same-site thumbnails (data/thumbs.json), keyed by catalogue ID */
  var ICON = {   /* the catalogue's own placeholder for a record with no picture: an icon for its kind, and its ID */
    email: '<path d="M3 6h18v12H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    press: '<path d="M4 5h13v14H4z M17 8h3v9a2 2 0 0 1-2 2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 8h7M7 11h7M7 14h4" stroke="currentColor" stroke-width="1.6"/>',
    missing: '<path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2"/><path d="M10.5 10a2 2 0 1 1 2.6 1.9c-.7.3-1.1.8-1.1 1.6M12 16.5v.5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    person: '<circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    doc: '<path d="M6 3h9l4 4v14H6z M15 3v4h4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 11h7M9 14h7M9 17h4" stroke="currentColor" stroke-width="1.6"/>',
    none: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.8"/>'
  };
  function iconOf(rec) {
    if (!rec) return 'none'; var t = String(rec.t || '').toLowerCase();
    if (rec.k === 'missing_record') return 'missing'; if (rec.k === 'person') return 'person';
    if (/e-?mail/.test(t)) return 'email'; if (rec.k === 'media' || /press|news|cutting|article/.test(t)) return 'press';
    return 'doc';
  }
  function tile(id, rec) {   // the record's picture from the catalogue, else the catalogue's placeholder: kind icon + catalogue ID
    var t = document.createElement('span'); t.className = 'ph-th';
    var ph = function () {
      t.innerHTML = ''; t.classList.add('ph-th0'); t.dataset.kind = iconOf(rec);
      t.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[iconOf(rec)] + '</svg>');
      var s = document.createElement('span'); s.textContent = id || 'no ID'; t.appendChild(s);
    };
    var src = (id && TH[id]) || (rec && rec.img) || '';
    if (src) {
      var im = new Image(); im.alt = (id ? id + ': ' : '') + 'catalogue picture'; im.decoding = 'async'; im.onerror = ph; im.src = src; t.appendChild(im); t.classList.add('pic');
      if (rec && rec.rc) { var rb = document.createElement('em'); rb.textContent = 'reconstruction'; t.appendChild(rb); }
    } else ph();
    return t;
  }
  var KIND = { email: 'email', missing_record: 'missing record (not held)', media: 'press or media item', person: 'person record', artifact: 'artifact' };
  /* a party's badge (initials on a colour of its own; no outside logos) and its name as a #hashtag */
  var STOP = { of: 1, the: 1, and: 1, for: 1, '&': 1, 'a': 1, 'an': 1, 'to': 1, 'in': 1, 'on': 1, 'y': 1, 'yr': 1, 'ac': 1 };
  function initials(name) {
    var w = String(name).replace(/\(.*?\)/g, ' ').split(/[\s\/–—-]+/).filter(function (x) { return x && !STOP[x.toLowerCase()] && /[A-Za-zÀ-ÿŵŷŴŶ0-9]/.test(x); });
    if (w.length && /^[A-Z][A-Z0-9]{1,6}$/.test(w[0])) return w[0].slice(0, 4);
    var s = w.map(function (x) { return x.charAt(0).toUpperCase(); }).join('');
    return (s || '?').slice(0, 3);
  }
  function hashtag(name) {
    return '#' + String(name).replace(/[’'.]/g, '').split(/[^A-Za-z0-9À-ÿŵŷŴŶ]+/).filter(Boolean).map(function (x) { return /^[A-Z0-9]+$/.test(x) ? x : x.charAt(0).toUpperCase() + x.slice(1); }).join('');
  }
  function hue(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; }
  function badge(inst) {
    var w = document.createElement('span'); w.className = 'ph-tag';
    var lg = document.createElement('span'); lg.className = 'ph-logo'; lg.setAttribute('aria-hidden', 'true'); lg.style.setProperty('--hue', hue(inst.id || inst.name)); lg.textContent = initials(inst.name);
    var ht = document.createElement('span'); ht.className = 'ph-ht'; ht.textContent = hashtag(inst.name);
    w.appendChild(lg); w.appendChild(ht); return w;
  }
  function card(o, rowLbl) {   // one event: picture, then the event summed up (date first), then the party's badge and #hashtag
    var inst = D.institutions[o.i], ref = o.refs && o.refs[0], rec = ref ? (D.records || {})[ref] : null;
    var c = document.createElement('span'); c.className = 'ph-card'; c.appendChild(tile(ref, rec));
    var tx = document.createElement('span'); tx.className = 'ph-lt'; c.appendChild(tx);
    var ev = document.createElement('span'); ev.className = 'ph-ev';
    var dt = document.createElement('b'); dt.textContent = (rec && rec.d) || rowLbl; ev.appendChild(dt);
    ev.appendChild(document.createTextNode((rec && rec.s) || (o.n > 1 ? o.n + ' days of recorded activity' : 'Recorded activity')));
    tx.appendChild(ev);
    var tg = badge(inst); tx.appendChild(tg);
    var sm = document.createElement('small');
    sm.textContent = [ref || '', o.n > 1 ? o.n + ' active days in ' + rowLbl : ''].filter(Boolean).join(' · '); if (sm.textContent) tg.appendChild(sm);
    return c;
  }
  function place(i) {
    var k = K[i], gut = kb.getBoundingClientRect().left - app.getBoundingClientRect().left, kw = kb.clientWidth, cx = gut + kw * (k.kl + k.kr) / 200;
    var aw = app.clientWidth; lab.style.left = '0px'; lab.classList.add('on'); var lw = lab.offsetWidth;
    lab.style.left = Math.max(lw / 2 + 4, Math.min(aw - lw / 2 - 4, cx)) + 'px';
  }
  function showLabel(i, notes, rowLbl) {
    lab.innerHTML = '';
    if (notes && notes.length) {
      var shown = notes.slice(0, stage.clientHeight < 330 ? 1 : stage.clientHeight < 460 ? 2 : 3);
      shown.forEach(function (o) { lab.appendChild(card(o, rowLbl)); });
      if (notes.length > shown.length) { var mo = document.createElement('small'); mo.className = 'ph-more'; mo.textContent = '+' + (notes.length - shown.length) + ' more in ' + rowLbl; lab.appendChild(mo); }
      lab.classList.add('thumb'); lab.classList.toggle('one', shown.length === 1); place(shown[0].i);
      // keep the label clear of the play controls: drop the last card while it would cover them
      var ctl = app.querySelector('.ph-ctl'), cards = lab.querySelectorAll('.ph-card'), cut = 0;
      if (ctl) { var lim = ctl.getBoundingClientRect().top - 6; for (var c = cards.length - 1; c > 0 && lab.getBoundingClientRect().bottom > lim; c--) { lab.removeChild(cards[c]); cut++; } }
      if (cut) { var mo2 = lab.querySelector('.ph-more'); if (!mo2) { mo2 = document.createElement('small'); mo2.className = 'ph-more'; lab.appendChild(mo2); }
        mo2.textContent = '+' + (notes.length - shown.length + cut) + ' more in ' + rowLbl; lab.classList.toggle('one', cards.length - cut === 1); }
    } else {
      var k = K[i], inst = D.institutions[i];
      var b = document.createElement('b'); b.textContent = 'Key ' + inst.n + ' · ' + noteName(k.m); lab.appendChild(b);
      lab.appendChild(badge(inst));
      var sm = document.createElement('small'); sm.textContent = inst.events + ' active days'; sm.style.opacity = '.75'; lab.appendChild(sm);
      lab.classList.remove('thumb'); lab.classList.remove('one'); place(i);
    }
    clearTimeout(labTimer); labTimer = setTimeout(function () { lab.classList.remove('on'); }, notes ? 2400 : 1500);
  }
  function light(i, ms) {
    var e = keyEls[i], c = colEls[i]; if (!e) return;
    e.classList.add('lit'); c.classList.add('lit');
    clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('lit'); c.classList.remove('lit'); }, ms || 260);
  }
  function press(i, vel) { tone(K[i].m, vel || 0.8, 0); light(i, 320); showLabel(i); }

  /* ---------- build ---------- */
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function build() {
    N = D.institutions.length; Q = D.rows.length; var MF = D.monthly_from, YT = D.yearly_to || 0;
    var g = geometry(N); K = g.keys;
    var FC = D.filter_counts || {};
    $('ph-sub').textContent = N + ' parties · ' + D.counts.events + ' active days · from ' + D.rows[(D.lead_in || 0)] + ' (after ' + (D.lead_in || 0) + ' blank years) to ' + D.rows[Q - 1] + ' · tap a key';
    $('ph-size').textContent = N + ' keys, ' + YT + ' year rows + ' + (MF - YT) + ' quarters + ' + (Q - MF) + ' months';
    var lo = D.left_out || [];
    var S = D.sources; $('ph-note').textContent = 'Sources: ' + [S.email, S.catalogue, S.erp, S.journal, S.wdtk, S.website, S.williams].join('; ') + '. One count is one party active on one day; the same day in two sources counts once. Keys are ordered by activity: the left half holds the quietest parties (the least active on the far left, rising towards middle C); the right half starts with the most active party just above middle C and grows quieter towards the top, so the busiest parties play the middle of the keyboard. Rows: ' + (D.lead_in || 0) + ' blank years, the 1500s as one row, one row a year from 1600, quarters from 1988, months from January 2026. A note sounds when it reaches the centre line; an empty stretch between two notes takes at most two beats. Each label sums up the event on its date from the catalogue record, with the record’s picture where the catalogue holds one (else the catalogue’s placeholder for its kind), and the party’s badge and #hashtag. The backing loop (mallets, guitar and voices, synthesised in the page) keeps the same beat. Filter: ' +
      (FC.p || 0) + ' notes are press coverage, later citation or interpretation; ' + (FC.v || 0) + ' are verbatim source records or transcripts; ' + (FC.unclassified || 0) + ' are not classified and show under All only. ' +
      (lo.length ? lo.length + ' bodies with a single active day are not on the keys, because a piano has 88: ' + lo.join(', ') + '.' : '') + ' Data built ' + D.generated + '.';
    // keys
    var kf = 'calc(min(9px, ' + (100 / g.whites * 0.62).toFixed(3) + 'vw))', iif = 'calc(min(7px, ' + (100 / g.whites * 0.5).toFixed(3) + 'vw))';
    K.forEach(function (k, i) {
      var inst = D.institutions[i], b = el('button', 'ph-k ' + (k.w ? 'w' : 'b'), kb);
      b.type = 'button'; b.dataset.i = i; b.style.left = k.kl + '%'; b.style.width = (k.kr - k.kl) + '%'; b.style.setProperty('--kf', kf);
      b.setAttribute('aria-label', inst.n + ': ' + inst.name + ', ' + inst.events + ' active days (' + noteName(k.m) + ')');
      var s = el('span', '', b); s.textContent = inst.n; keyEls.push(b);
      if (ir) {   // the key's (i) button along the top of the keyboard (white keys on the lower tier, black keys above)
        var ib = el('button', 'ph-ii ' + (k.w ? 'w' : 'b'), ir); ib.type = 'button'; ib.dataset.i = i;
        ib.style.left = k.kl + '%'; ib.style.width = (k.kr - k.kl) + '%'; ib.style.setProperty('--iif', iif);
        ib.setAttribute('aria-label', 'About key ' + inst.n + ': ' + inst.name); ib.setAttribute('aria-haspopup', 'dialog');
        ib.setAttribute('aria-controls', 'ph-ip'); ib.setAttribute('aria-expanded', 'false');
        el('span', '', ib).textContent = 'i'; irEls.push(ib);
      }
      kinfo.push({ q0: -1, q1: -1, ids: {} });
      var c = el('div', 'ph-col' + (k.w ? '' : ' b'), grid); c.style.left = k.cl + '%'; c.style.width = (k.cr - k.cl) + '%'; colEls.push(c);
    });
    // rows (the count-in at the bottom, the latest month at the top)
    for (var q = 0; q < Q; q++) {
      var lbl = D.rows[q], big = /^(\d{3}0|1500s|\d{4}-Q1|\d{4}-01)$/.test(lbl) && !(q < (D.lead_in || 0));
      var r = el('div', 'ph-row' + (big ? ' q1' : '') + (q >= MF ? ' mo' : '') + (q < (D.lead_in || 0) ? ' lead' : ''), grid);
      r.style.top = 'calc(var(--pad) + ' + (Q - 1 - q) + ' * var(--ph-row))';
      el('span', '', r).textContent = lbl; rowNotes.push([]);
    }
    function marker(at, text) { var sw = el('div', 'ph-sw', grid); sw.style.top = 'calc(var(--pad) + ' + (Q - at) + ' * var(--ph-row))'; el('span', '', sw).textContent = text; }
    if (MF > 0 && MF < Q) marker(MF, 'monthly from January 2026 ↑ · quarterly below ↓');
    if (YT > 0 && YT < MF) marker(YT, 'quarterly from 1988 ↑ · one row a year below ↓');
    var end = el('div', 'ph-end', grid); end.style.height = 'var(--pad)'; end.textContent = '— ' + D.rows[Q - 1] + ' —';
    D.notes.forEach(function (nt) {
      var q = nt[0], i = nt[1], n = nt[2], k = K[i], e = el('div', 'ph-n', grid);
      e.style.left = ((k.cl + k.cr) / 2) + '%'; e.style.top = 'calc(var(--pad) + ' + (Q - 1 - q + 0.5) + ' * var(--ph-row))';
      e.style.setProperty('--w', ((k.cr - k.cl) * 0.86).toFixed(3) + '%');
      var lvl = Math.min(1, Math.log(1 + n) / Math.log(9)); e.style.setProperty('--o', (0.55 + 0.45 * lvl).toFixed(2)); e.style.setProperty('--s', (0.78 + 0.32 * lvl).toFixed(2));
      el('i', '', e); var o = { i: i, n: n, v: nt[3] || 0, p: nt[4] || 0, refs: nt[5] || [], e: e, q: q };
      rowNotes[q].push(o); allNotes.push(o);
      var ki = kinfo[i]; if (ki) { if (ki.q0 < 0 || q < ki.q0) ki.q0 = q; if (q > ki.q1) ki.q1 = q; o.refs.forEach(function (r) { ki.ids[r] = 1; }); }
    });
    rowNotes.forEach(function (a) { a.sort(function (x, y) { return x.i - y.i; }); });
    // filter control
    if (sel) {
      sel.innerHTML = '';
      (D.filters || [{ id: 'all', label: 'All' }]).forEach(function (f) {
        var op = document.createElement('option'); op.value = f.id; op.textContent = f.label + ' (' + (f.id === 'all' ? FC.all : FC[f.id]) + ')'; sel.appendChild(op);
      });
      sel.value = FILTER;
      sel.addEventListener('change', function () { setFilter(sel.value); });
    }
    setFilter(FILTER, true);
    layout(true);
  }
  function inFilter(o) { return FILTER === 'all' || (FILTER === 'v' ? o.v > 0 : FILTER === 'p' ? o.p > 0 : true); }
  function playable(q) { var a = rowNotes[q]; if (!a) return []; return a.filter(inFilter); }
  /* the beat timeline: anchors at the centre of every row that has a note in the current filter */
  function buildSegs() {
    var pts = [[0, 0]], t = 0, lastRow = 0, first = true;
    for (var q = 0; q < Q; q++) {
      if (!playable(q).length) continue;
      var r = q + 0.5, dr = r - lastRow;
      t += first ? dr : Math.min(dr, CAP);   // the count-in plays one blank year per beat; later gaps are capped
      pts.push([r, t]); lastRow = r; first = false;
    }
    if (Q > lastRow) { t += Math.min(Q - lastRow, CAP); pts.push([Q, t]); }
    segs = pts;
  }
  function ease(u, dr) { if (dr <= CAP + 0.01) return u; return u * u * (3 - 2 * u); }
  function rAt(tb) {   // beats -> rows passed at the line
    if (tb <= 0) return 0;
    for (var j = 1; j < segs.length; j++) {
      var a = segs[j - 1], b = segs[j];
      if (tb <= b[1]) { var u = (b[1] > a[1]) ? (tb - a[1]) / (b[1] - a[1]) : 1; return a[0] + (b[0] - a[0]) * ease(u, b[0] - a[0]); }
    }
    return Q;
  }
  function tAt(r) {     // rows passed -> beats (inverse of rAt)
    for (var j = 1; j < segs.length; j++) {
      var a = segs[j - 1], b = segs[j];
      if (r <= b[0]) {
        var dr = b[0] - a[0], lo = 0, hi = 1, f = dr > 0 ? (r - a[0]) / dr : 1;
        for (var it = 0; it < 30; it++) { var m = (lo + hi) / 2; if (ease(m, dr) < f) lo = m; else hi = m; }
        return a[1] + (b[1] - a[1]) * (lo + hi) / 2;
      }
    }
    return segs.length ? segs[segs.length - 1][1] : 0;
  }
  function setFilter(f, quiet) {
    FILTER = f; var shown = 0;
    allNotes.forEach(function (o) { var on = inFilter(o); o.e.classList.toggle('off', !on); if (on) shown++; });
    app.dataset.filter = f; app.dataset.notes = String(shown);
    buildSegs(); if (playing) clock = tAt(rowsPassed());
    if (!quiet) { nowEl.dataset.count = shown; }
  }
  function headerOffset() { var r = app.getBoundingClientRect(); return r.top + (window.scrollY || window.pageYOffset || 0); }
  var autoScrolled = false;
  function fitPage(force) {   // landscape: the app takes the whole screen, keys on the screen's bottom edge (the shared header is one swipe up)
    var top = headerOffset(), ih = window.innerHeight, land = window.innerWidth > ih;
    var h = land ? ih : Math.max(240, ih - top); if (!land && h < 380) h = ih;
    app.style.setProperty('--ph-h', h + 'px');
    if (land && (force || !autoScrolled) && Math.abs((window.scrollY || 0) - top) > 2) { autoScrolled = true; window.scrollTo(0, top); }
  }
  function layout(first) {
    var keep = first ? 0 : rowsPassed();
    fitPage(false);
    rowH = parseFloat(getComputedStyle(app).getPropertyValue('--ph-row')) || 24;
    viewH = scroll.clientHeight; padTop = viewH; padBot = Math.round(viewH / 2); H = padTop + Q * rowH + padBot;
    grid.style.setProperty('--pad', padTop + 'px'); grid.style.setProperty('--padb', padBot + 'px'); grid.style.height = H + 'px';
    par.style.height = H + 'px';
    setR(keep);
    lastP = null; onScroll();
  }
  /* rows passed at the centre line (the hit line sits at half the stage height) */
  function lineY() { return pos + viewH / 2; }
  function rowsPassed() { return Math.max(0, Math.min(Q, (padTop + Q * rowH - lineY()) / rowH)); }
  function setR(r) { setPos(padTop + Q * rowH - r * rowH - viewH / 2); }
  function setPos(v) { pos = Math.max(0, Math.min(H - viewH, v)); programmatic = true; scroll.scrollTop = pos; }
  function onScroll() {
    if (!programmatic) pos = scroll.scrollTop; programmatic = false;
    var maxS = Math.max(1, H - viewH);
    par.style.transform = 'translateY(' + (0.4 * (pos - maxS)).toFixed(1) + 'px)';
    var k = Math.min(Q - 1, Math.floor(rowsPassed()));
    nowEl.textContent = D.rows[Math.max(0, k)];
  }

  /* ---------- playback: the table slides down; each note sounds as it reaches the centre line, on a steady beat ---------- */
  var tick = function (when) {   // a soft wood-block tick for the count-in beats
    var ac = audio(); if (!ac) return; var t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = 1760; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
  };
  var pre = {};

  /* ---------- 0.4.0 backing loop: mallets (xylophone), a plucked guitar and soft female "ooh/aah" voices, all synthesised here
     (no samples, nothing fetched), on the same beat as the notes (one beat = 0.6 s, twice as fast at ×2). Key of F major:
     F – Dm – B♭ – C, one chord a bar of four beats; the mallets keep to the F major pentatonic so they sit under any piano note. ---------- */
  var BK = { on: true, vol: 0.4, bus: null, rev: null, timer: 0, nextB: null, ksCache: {}, voices: [], beats: 0, sync: null };
  try { var sv = localStorage.getItem('ph-bk'); if (sv) { sv = JSON.parse(sv); BK.on = sv.on !== false; if (typeof sv.vol === 'number') BK.vol = Math.max(0, Math.min(1, sv.vol)); } } catch (e) {}
  var BAR = [[53, 57, 60, 65, 69], [50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [48, 55, 60, 64, 67]];   /* F, Dm, B♭, C (MIDI) */
  var PENTA = [65, 67, 69, 72, 74, 77, 79, 81, 84];                                                   /* F G A C D, F4..C6 */
  var ARP = [[0, 2, 4, 3, 5, 4, 2, 3], [1, 2, 4, 2, 5, 4, 3, 1], [0, 1, 3, 4, 6, 4, 3, 2], [1, 3, 4, 5, 7, 5, 4, 3]];
  var VOX = [[69, 72], [69, 74], [70, 74], [67, 72]];                                                 /* the voices' two notes per bar */
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function bkLevel() { return BK.on ? 0.0001 + BK.vol * BK.vol * 1.2 : 0.0001; }
  function bkBus() {
    var ac = audio(); if (!ac) return null; if (BK.bus) return BK.bus;
    BK.bus = ac.createGain(); BK.bus.gain.value = bkLevel();
    var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; BK.bus.connect(hp);
    // a small room: two feedback delays, mixed low
    var wet = ac.createGain(); wet.gain.value = 0.22;
    [0.113, 0.171].forEach(function (dt) { var d = ac.createDelay(1); d.delayTime.value = dt; var fb = ac.createGain(); fb.gain.value = 0.38; var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      hp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); });
    hp.connect(ac.destination); wet.connect(ac.destination);
    return BK.bus;
  }
  function mallet(m, t, v) {   // xylophone: a bright struck bar, partials at 1, 3.93 and 9.2, fast decay
    var ac = AC, f = hz(m), g = ac.createGain(), dur = 0.55;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0003, t + dur); g.connect(BK.bus);
    [[1, 1, 1], [3.93, 0.32, 0.35], [9.2, 0.1, 0.15]].forEach(function (p) {
      var o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f * p[0];
      og.gain.setValueAtTime(p[1], t); og.gain.exponentialRampToValueAtTime(0.0005, t + dur * p[2]); o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.02);
    });
  }
  function ksBuf(m) {   // Karplus–Strong plucked string, rendered once per pitch and kept
    if (BK.ksCache[m]) return BK.ksCache[m];
    var sr = AC.sampleRate, len = Math.floor(sr * 1.6), buf = AC.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var p = Math.max(2, Math.round(sr / hz(m))), ring = new Float32Array(p), i, last = 0;
    for (i = 0; i < p; i++) ring[i] = (Math.random() * 2 - 1) * 0.6;
    var damp = 0.996 - Math.max(0, (m - 52)) * 0.0004;
    for (i = 0; i < len; i++) { var j = i % p, nx = ring[(j + 1) % p], y = damp * 0.5 * (ring[j] + nx); y = 0.7 * y + 0.3 * last; last = y; ring[j] = y; d[i] = y; }
    BK.ksCache[m] = buf; return buf;
  }
  function pluck(m, t, v) {
    var s = AC.createBufferSource(), g = AC.createGain(), lp = AC.createBiquadFilter(); s.buffer = ksBuf(m);
    lp.type = 'lowpass'; lp.frequency.value = 3200; g.gain.setValueAtTime(0.5 * v, t); g.gain.setTargetAtTime(0.0001, t + 1.1, 0.12);
    s.connect(lp); lp.connect(g); g.connect(BK.bus); s.start(t); s.stop(t + 1.6);
  }
  function strum(ch, t, v, down) {   // the chord's notes 14 ms apart, low to high on a down-stroke
    var ns = down ? ch : ch.slice().reverse();
    ns.forEach(function (m, j) { pluck(m >= 52 ? m - 12 : m, t + j * 0.014, v * (down ? 1 : 0.7)); });
  }
  var FORM = { a: [[800, 1], [1150, 0.5], [2900, 0.18]], o: [[400, 1], [800, 0.35], [2600, 0.08]] };   /* female "aah" and "ooh" */
  function voice(m, t, dur, vowel) {
    var ac = AC, f = hz(m), g = ac.createGain(), out = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.055, t + Math.min(0.5, dur * 0.3)); g.gain.setValueAtTime(0.055, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    out.connect(g); g.connect(BK.bus);
    var vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.6); vib.connect(vg);
    [-6, 6].forEach(function (cents) {
      var o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents; vg.connect(o.frequency);
      FORM[vowel].forEach(function (fm) { var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm[0]; bp.Q.value = 9; var bg = ac.createGain(); bg.gain.value = fm[1]; o.connect(bp); bp.connect(bg); bg.connect(out); });
      o.start(t); o.stop(t + dur + 0.05);
    });
    vib.start(t); vib.stop(t + dur + 0.05);
  }
  function bkBeat(b, t, spb) {   // beat number b (from the start of the loop) at audio time t; spb = seconds per beat
    var bar = Math.floor(b / 4) % 4, bt = b % 4, ch = BAR[bar];
    // mallets: two eighth notes a beat
    for (var e = 0; e < 2; e++) { var n = PENTA[ARP[bar][(bt * 2 + e) % 8]]; mallet(n, t + e * spb / 2, e ? 0.55 : 0.8); }
    // guitar: down on 1 and 3, up on the "and" of 2 and 4
    if (bt === 0 || bt === 2) strum(ch, t, bt ? 0.75 : 0.9, true);
    if (bt === 1 || bt === 3) strum(ch.slice(1), t + spb / 2, 0.5, false);
    // voices: a held two-note "ooh" or "aah" for the whole bar
    if (bt === 0) { var vw = (Math.floor(b / 4) % 2) ? 'a' : 'o'; VOX[bar].forEach(function (m) { voice(m, t + 0.02, spb * 4 - 0.05, vw); }); }
    BK.beats++;
  }
  /* the loop rides the same beat clock as the notes: beat b of the loop falls when clock = b + 0.5 (every note lands on x.5) */
  function bkSched() {
    if (!playing || !AC || !BK.bus) return; if (!BK.on) { BK.nextB = null; return; }
    var rate = dbl ? 2 : 1, spb = BEAT / rate, now = AC.currentTime;
    var cl = BK.sync ? BK.sync.c + (now - BK.sync.t) / spb : clock;
    if (BK.nextB === null || BK.nextB < cl - 0.25) BK.nextB = Math.ceil(cl - 0.5) + 0.5;
    while (BK.nextB < cl + 0.3 / spb) {
      var at = now + (BK.nextB - cl) * spb; if (at >= now - 0.01) bkBeat(Math.round(BK.nextB - 0.5), Math.max(now, at), spb);
      BK.nextB += 1;
    }
  }
  function bkStart() {
    if (!audio() || !bkBus()) return; BK.nextB = null; BK.sync = null;
    BK.bus.gain.cancelScheduledValues(AC.currentTime); BK.bus.gain.setTargetAtTime(bkLevel(), AC.currentTime, 0.05);
    clearInterval(BK.timer); BK.timer = setInterval(bkSched, 25); bkSched();
  }
  function bkStop() { clearInterval(BK.timer); BK.timer = 0; BK.nextB = null; if (BK.bus && AC) { BK.bus.gain.cancelScheduledValues(AC.currentTime); BK.bus.gain.setTargetAtTime(0.0001, AC.currentTime, 0.08); } }
  function bkSet(on, vol) {
    if (typeof on === 'boolean') BK.on = on; if (typeof vol === 'number') BK.vol = Math.max(0, Math.min(1, vol));
    try { localStorage.setItem('ph-bk', JSON.stringify({ on: BK.on, vol: BK.vol })); } catch (e) {}
    if (BK.bus && AC && BK.timer) BK.bus.gain.setTargetAtTime(bkLevel(), AC.currentTime, 0.05);
    var bb = $('ph-bk'), bs = $('ph-bkv');
    if (bb) { bb.setAttribute('aria-pressed', String(BK.on)); bb.setAttribute('aria-label', BK.on ? 'Mute the backing loop' : 'Play the backing loop'); }
    if (bs) bs.value = String(Math.round(BK.vol * 100));
  }
  function preload(q) {   // fetch the pictures of the next few note rows before they reach the line
    for (var x = q + 1, seen = 0; x < Q && seen < 4; x++) { var a = playable(x); if (!a.length) continue; seen++;
      a.forEach(function (o) { var id = o.refs[0], r = o.refs.length && D.records[id], s = (id && TH[id]) || (r && r.img); if (s && !pre[s]) { pre[s] = new Image(); pre[s].src = s; } }); }
  }
  function fire(q) {
    preload(q);
    if (q < (D.lead_in || 0)) { tick(0); return; }
    var a = playable(q); if (!a.length) return;
    var gap = Math.min(0.03, 0.45 / a.length), vol = 1 / Math.sqrt(Math.max(1, a.length / 3));
    a.forEach(function (o, j) {
      var vel = (0.45 + 0.55 * Math.min(1, Math.log(1 + o.n) / Math.log(9))) * vol;
      tone(K[o.i].m, vel, j * gap);
      (function (o, d) { setTimeout(function () { light(o.i, 300); o.e.classList.add('hit'); setTimeout(function () { o.e.classList.remove('hit'); }, 650); }, d); })(o, j * gap * 1000);
    });
    var pic = function (o) { var id = o.refs[0], r = o.refs.length && D.records[id]; return (id && TH[id]) || (r && r.img) ? 1 : 0; };
    showLabel(-1, a.slice().sort(function (x, y) { return pic(y) - pic(x) || y.n - x.n || D.institutions[y.i].events - D.institutions[x.i].events; }), D.rows[q]);
  }
  function step(t) {
    if (!playing) return;
    var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
    clock += dt / BEAT * (dbl ? 2 : 1); if (AC) BK.sync = { c: clock, t: AC.currentTime };
    var r0 = lastR, r1 = rAt(clock);
    setR(r1); onScroll(); lastR = r1;
    for (var q = Math.max(0, Math.floor(r0 - 0.5)); q < Q && q + 0.5 <= r1 + 1e-6; q++) { if (q + 0.5 > r0 + 1e-6) fire(q); }
    if (r1 >= Q - 1e-6) { stop(); return; }
    raf = requestAnimationFrame(step);
  }
  function start() {
    audio(); var r = rowsPassed(); if (r >= Q - 0.01) { r = 0; } if (window.innerWidth > window.innerHeight) fitPage(true);
    clock = tAt(r); lastR = rAt(clock); setR(lastR);
    playing = true; lastT = 0; btnPlay.setAttribute('aria-pressed', 'true'); btnPlay.setAttribute('aria-label', 'Pause'); btnX2.hidden = false;
    try { if (screen.orientation && screen.orientation.lock && document.fullscreenElement) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
    raf = requestAnimationFrame(step); bkStart();
  }
  function stop() { playing = false; cancelAnimationFrame(raf); bkStop(); btnPlay.setAttribute('aria-pressed', 'false'); btnPlay.setAttribute('aria-label', 'Play'); btnX2.hidden = true; }
  btnPlay.addEventListener('click', function () { playing ? stop() : start(); });
  btnX2.addEventListener('click', function () { dbl = !dbl; BK.sync = null; BK.nextB = null; btnX2.setAttribute('aria-pressed', String(dbl)); btnX2.setAttribute('aria-label', dbl ? 'Normal speed' : 'Double speed'); });
  scroll.addEventListener('scroll', onScroll, { passive: true });
  (function () { var bb = $('ph-bk'), bs = $('ph-bkv'); if (!bb || !bs) return; bkSet();
    bb.addEventListener('click', function () { bkSet(!BK.on); if (BK.on && playing && !BK.timer) bkStart(); });
    bs.addEventListener('input', function () { var v = (+bs.value || 0) / 100; bkSet(v > 0 ? true : BK.on, v); }); })();
  ['wheel', 'touchstart'].forEach(function (ev) { scroll.addEventListener(ev, function () { if (playing) stop(); }, { passive: true }); });

  /* ---------- keys: pointer, touch (glide across keys) and keyboard ---------- */
  var down = null;
  function keyAt(x, y) { var e = document.elementFromPoint(x, y); e = e && e.closest ? e.closest('.ph-k') : null; return e && kb.contains(e) ? +e.dataset.i : -1; }
  kb.addEventListener('pointerdown', function (ev) { var i = keyAt(ev.clientX, ev.clientY); if (i < 0) return; ev.preventDefault(); down = i; keyEls[i].classList.add('on'); press(i, 0.85); try { kb.setPointerCapture(ev.pointerId); } catch (e) {} });
  kb.addEventListener('pointermove', function (ev) { if (down === null) return; var i = keyAt(ev.clientX, ev.clientY); if (i >= 0 && i !== down) { keyEls[down].classList.remove('on'); down = i; keyEls[i].classList.add('on'); press(i, 0.7); } });
  function up() { if (down !== null && keyEls[down]) keyEls[down].classList.remove('on'); down = null; }
  kb.addEventListener('pointerup', up); kb.addEventListener('pointercancel', up); kb.addEventListener('lostpointercapture', up);
  kb.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('.ph-k'); if (b && ev.detail === 0) press(+b.dataset.i, 0.8); });
  kb.addEventListener('keydown', function (ev) {
    var b = ev.target.closest && ev.target.closest('.ph-k'); if (!b) return; var i = +b.dataset.i;
    if (ev.key === 'ArrowRight' && i < N - 1) { keyEls[i + 1].focus(); press(i + 1, 0.7); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft' && i > 0) { keyEls[i - 1].focus(); press(i - 1, 0.7); ev.preventDefault(); }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    if (ev.key === ' ' && !(ev.target && ev.target.closest && ev.target.closest('.ph-k,.ph-play,.ph-x2,.ph-i,.ph-ii,.ph-ip,dialog'))) { ev.preventDefault(); playing ? stop() : start(); }
    else if ((ev.key === '2' || ev.key === 'x') && playing) btnX2.click();
  });

  /* ---------- (i) per key: name, events, first and last year, catalogue IDs (no links) ---------- */
  function yearOf(l) { return l === '1500s' ? 'the 1500s' : String(l).slice(0, 4); }
  function idSort(a, b) { var pa = a.replace(/[^A-Z].*$/, ''), pb = b.replace(/[^A-Z].*$/, ''); return pa < pb ? -1 : pa > pb ? 1 : (a < b ? -1 : a > b ? 1 : 0); }
  function placeInfo(i) {
    var k = K[i], gut = kb.getBoundingClientRect().left - app.getBoundingClientRect().left, cx = gut + kb.clientWidth * (k.kl + k.kr) / 200;
    var aw = app.clientWidth, w = ip.offsetWidth; ip.style.left = Math.max(6, Math.min(aw - w - 6, cx - w / 2)) + 'px';
    ip.style.maxHeight = Math.max(140, stage.clientHeight - 10) + 'px';
  }
  function openInfo(i) {
    if (!ip || !D.institutions[i]) return;
    if (ipOpen >= 0 && irEls[ipOpen]) irEls[ipOpen].setAttribute('aria-expanded', 'false');
    var inst = D.institutions[i], ki = kinfo[i] || { q0: -1, q1: -1, ids: {} }, ids = Object.keys(ki.ids).sort(idSort);
    ipT.innerHTML = ''; var b = document.createElement('b'); b.textContent = 'Key ' + inst.n + ' '; ipT.appendChild(b); ipT.appendChild(document.createTextNode(inst.name));
    ipB.innerHTML = '';
    var dl = el('dl', '', ipB);
    function row(t, v) { el('dt', '', dl).textContent = t; el('dd', '', dl).textContent = v; }
    ipB.appendChild(badge(inst));
    row('Events', inst.events + ' active day' + (inst.events === 1 ? '' : 's'));
    row('First', ki.q0 >= 0 ? yearOf(D.rows[ki.q0]) : '–');
    row('Last', ki.q1 >= 0 ? yearOf(D.rows[ki.q1]) : '–');
    var h = el('p', 'ph-ip-s', ipB);
    if (ids.length) {
      h.textContent = 'Catalogue IDs (' + ids.length + ')';
      var ul = el('ul', '', ipB); ul.setAttribute('aria-label', 'Catalogue IDs');
      ids.forEach(function (r) { el('li', '', ul).textContent = r; });
    } else h.textContent = 'No catalogue ID on this key’s notes (they come from emails received or website changes).';
    ip.hidden = false; ip.dataset.i = i; ipOpen = i; ipB.scrollTop = 0;
    if (irEls[i]) irEls[i].setAttribute('aria-expanded', 'true');
    placeInfo(i); light(i, 700);
    try { ipX.focus({ preventScroll: true }); } catch (e) { ipX.focus(); }
  }
  function closeInfo(back) {
    if (!ip || ipOpen < 0) return; var i = ipOpen; ip.hidden = true; ipOpen = -1; delete ip.dataset.i;
    if (irEls[i]) { irEls[i].setAttribute('aria-expanded', 'false'); if (back) { try { irEls[i].focus({ preventScroll: true }); } catch (e) { irEls[i].focus(); } } }
  }
  if (ir && ip) {
    ir.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('.ph-ii'); if (!b) return; var i = +b.dataset.i; if (ipOpen === i) closeInfo(true); else openInfo(i); });
    ir.addEventListener('keydown', function (ev) {
      var b = ev.target.closest && ev.target.closest('.ph-ii'); if (!b) return; var i = +b.dataset.i;
      if (ev.key === 'ArrowRight' && i < N - 1) { irEls[i + 1].focus(); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft' && i > 0) { irEls[i - 1].focus(); ev.preventDefault(); }
    });
    ipX.addEventListener('click', function () { closeInfo(true); });
    document.addEventListener('keydown', function (ev) { if ((ev.key === 'Escape' || ev.key === 'Esc') && ipOpen >= 0) { ev.preventDefault(); closeInfo(true); } });
    document.addEventListener('pointerdown', function (ev) { if (ipOpen < 0) return; var t = ev.target; if (ip.contains(t) || (t.closest && t.closest('.ph-ii'))) return; closeInfo(false); }, true);
  }

  /* ---------- landscape first ---------- */
  var mq = window.matchMedia('(orientation: portrait)');
  function orient() { var ok = false; try { ok = sessionStorage.getItem('ph-upright') === '1'; } catch (e) {} rot.hidden = !(mq.matches && !ok); }
  $('ph-rot-ok').addEventListener('click', function () { try { sessionStorage.setItem('ph-upright', '1'); } catch (e) {} rot.hidden = true; });
  if (mq.addEventListener) mq.addEventListener('change', orient); else if (mq.addListener) mq.addListener(orient);
  orient();

  /* ---------- version table ---------- */
  var dlg = $('ph-log');
  $('ph-i').addEventListener('click', function () { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); });
  $('ph-log-x').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); $('ph-i').focus(); });
  dlg.addEventListener('close', function () { $('ph-i').focus(); });

  var rz = 0; function relayout() { clearTimeout(rz); rz = setTimeout(function () { if (D) { layout(false); if (ipOpen >= 0) placeInfo(ipOpen); } }, 120); }
  window.addEventListener('resize', relayout); window.addEventListener('orientationchange', function () { autoScrolled = false; relayout(); });
  fetch('data/activity.json?v=0.4.0').then(function (r) { return r.json(); }).then(function (j) {
    D = j; build(); [300, 1000, 2500].forEach(function (ms) { setTimeout(function () { layout(false); }, ms); });
    fetch('data/thumbs.json?v=0.4.0').then(function (r) { return r.ok ? r.json() : {}; }).then(function (t) { TH = (t && t.thumbs) || {}; window.PianoHero.thumbs = Object.keys(TH).length; }).catch(function () {});
    window.PianoHero = { version: '0.4.0', info: openInfo, closeInfo: closeInfo, press: press, play: start, pause: stop, data: D, filter: setFilter, segments: function () { return segs; }, beat: BEAT, cap: CAP, rowsPassed: rowsPassed, fire: fire,
      backing: function () { return { on: BK.on, vol: BK.vol, level: BK.bus ? BK.bus.gain.value : null, running: !!BK.timer, beats: BK.beats, ctx: AC ? AC.state : 'none', sampleRate: AC ? AC.sampleRate : 0, cachedStrings: Object.keys(BK.ksCache).length }; },
      setBacking: bkSet, hashtag: hashtag, initials: initials, seek: function (r) { setR(r); onScroll(); } };
  }).catch(function () { $('ph-sub').textContent = 'The activity data did not load. Please reload the page.'; });
})();
