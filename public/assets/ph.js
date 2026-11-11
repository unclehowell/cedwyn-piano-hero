/* Piano Hero 0.3.1 — every party a key (each with an (i) info button along the top of the keyboard) (least active far left, most active far right), from a short count-in before the 1500s to this month; notes sound at the centre line, empty stretches pass on a steady beat. Cedwyn Estate webapp. — Sion's Tab agent */
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
  function tile(id, rec) {   // the record's picture, or a neutral placeholder tile carrying its catalogue ID
    var t = document.createElement('span'); t.className = 'ph-th';
    var ph = function () { t.innerHTML = ''; t.classList.add('ph-th0'); var s = document.createElement('span'); s.textContent = id || '—'; t.appendChild(s); };
    if (rec && rec.img) { var im = new Image(); im.alt = ''; im.decoding = 'async'; im.onerror = ph; im.src = rec.img; t.appendChild(im); } else ph();
    return t;
  }
  var KIND = { email: 'email', missing_record: 'missing record (not held)', media: 'press or media item', person: 'person record', artifact: 'artifact' };
  function card(o, rowLbl) {   // one event: picture (or placeholder tile), party, catalogue ID, record type, period, title when public
    var inst = D.institutions[o.i], ref = o.refs && o.refs[0], rec = ref ? (D.records || {})[ref] : null;
    var c = document.createElement('span'); c.className = 'ph-card'; c.appendChild(tile(ref, rec));
    var tx = document.createElement('span'); tx.className = 'ph-lt'; c.appendChild(tx);
    var t1 = document.createElement('span'), b = document.createElement('b'); b.textContent = '#' + inst.n; t1.appendChild(b);
    t1.appendChild(document.createTextNode(inst.name)); tx.appendChild(t1);
    var ty = rec ? (rec.k === 'evidence' ? rec.t : (KIND[rec.k] || rec.t)) : '';
    var sm = document.createElement('small');
    sm.textContent = [ref || 'no catalogue record', ty, rowLbl, o.n > 1 ? o.n + ' active days' : ''].filter(Boolean).join(' · '); tx.appendChild(sm);
    if (rec && rec.h) { var h = document.createElement('i'); h.textContent = rec.h; tx.appendChild(h); }
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
      var shown = notes.slice(0, stage.clientHeight < 330 ? 2 : 3);
      shown.forEach(function (o) { lab.appendChild(card(o, rowLbl)); });
      if (notes.length > shown.length) { var mo = document.createElement('small'); mo.className = 'ph-more'; mo.textContent = '+' + (notes.length - shown.length) + ' more in ' + rowLbl; lab.appendChild(mo); }
      lab.classList.add('thumb'); place(shown[0].i);
    } else {
      var k = K[i], inst = D.institutions[i];
      var b = document.createElement('b'); b.textContent = '#' + inst.n; lab.appendChild(b);
      lab.appendChild(document.createTextNode(inst.name));
      var sm = document.createElement('small'); sm.textContent = ' · ' + inst.events + ' active days · ' + noteName(k.m); sm.style.opacity = '.7'; lab.appendChild(sm);
      lab.classList.remove('thumb'); place(i);
    }
    clearTimeout(labTimer); labTimer = setTimeout(function () { lab.classList.remove('on'); }, notes ? 1800 : 1500);
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
    var S = D.sources; $('ph-note').textContent = 'Sources: ' + [S.email, S.catalogue, S.erp, S.journal, S.wdtk, S.website, S.williams].join('; ') + '. One count is one party active on one day; the same day in two sources counts once. Keys are ordered by activity: the least active party is on the far left, the most active on the far right, so the left half holds only the quietest parties. Rows: ' + (D.lead_in || 0) + ' blank years, the 1500s as one row, one row a year from 1600, quarters from 1988, months from January 2026. A note sounds when it reaches the centre line; an empty stretch between two notes takes at most two beats. Filter: ' +
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
  function preload(q) {   // fetch the pictures of the next few note rows before they reach the line
    for (var x = q + 1, seen = 0; x < Q && seen < 4; x++) { var a = playable(x); if (!a.length) continue; seen++;
      a.forEach(function (o) { var r = o.refs.length && D.records[o.refs[0]]; if (r && r.img && !pre[r.img]) { pre[r.img] = new Image(); pre[r.img].src = r.img; } }); }
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
    var pic = function (o) { var r = o.refs.length && D.records[o.refs[0]]; return r && r.img ? 1 : 0; };
    showLabel(-1, a.slice().sort(function (x, y) { return pic(y) - pic(x) || y.n - x.n || D.institutions[y.i].events - D.institutions[x.i].events; }), D.rows[q]);
  }
  function step(t) {
    if (!playing) return;
    var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
    clock += dt / BEAT * (dbl ? 2 : 1);
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
    raf = requestAnimationFrame(step);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); btnPlay.setAttribute('aria-pressed', 'false'); btnPlay.setAttribute('aria-label', 'Play'); btnX2.hidden = true; }
  btnPlay.addEventListener('click', function () { playing ? stop() : start(); });
  btnX2.addEventListener('click', function () { dbl = !dbl; btnX2.setAttribute('aria-pressed', String(dbl)); btnX2.setAttribute('aria-label', dbl ? 'Normal speed' : 'Double speed'); });
  scroll.addEventListener('scroll', onScroll, { passive: true });
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
    ipT.innerHTML = ''; var b = document.createElement('b'); b.textContent = '#' + inst.n + ' '; ipT.appendChild(b); ipT.appendChild(document.createTextNode(inst.name));
    ipB.innerHTML = '';
    var dl = el('dl', '', ipB);
    function row(t, v) { el('dt', '', dl).textContent = t; el('dd', '', dl).textContent = v; }
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
  fetch('data/activity.json?v=0.3.1').then(function (r) { return r.json(); }).then(function (j) {
    D = j; build(); [300, 1000, 2500].forEach(function (ms) { setTimeout(function () { layout(false); }, ms); });
    window.PianoHero = { version: '0.3.1', info: openInfo, closeInfo: closeInfo, press: press, play: start, pause: stop, data: D, filter: setFilter, segments: function () { return segs; }, beat: BEAT, cap: CAP, rowsPassed: rowsPassed, fire: fire };
  }).catch(function () { $('ph-sub').textContent = 'The activity data did not load. Please reload the page.'; });
})();
