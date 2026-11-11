/* Piano Hero 0.2.0 — every party a key (most active in the middle), every quarter a bar, every month from 2026. Cedwyn Estate webapp. — Sion's Tab agent */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var app = $('ph'), stage = $('ph-stage'), scroll = $('ph-scroll'), grid = $('ph-grid'), par = $('ph-par'), kb = $('ph-kb'),
      lab = $('ph-label'), btnPlay = $('ph-play'), btnX2 = $('ph-x2'), nowEl = $('ph-now'), rot = $('ph-rotate');
  if (!app) return;
  var D, N = 0, Q = 0, K = [], keyEls = [], colEls = [], rowNotes = [], nextNoteRow = [];
  var rowH = 24, viewH = 300, padTop = 300, H = 0;
  var playing = false, dbl = false, pos = 0, lastP = null, boost = 1, raf = 0, lastT = 0, programmatic = false;
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
  function showLabel(i) {
    var k = K[i], inst = D.institutions[i];
    lab.innerHTML = ''; var b = document.createElement('b'); b.textContent = '#' + inst.n; lab.appendChild(b);
    lab.appendChild(document.createTextNode(inst.name));
    var sm = document.createElement('small'); sm.textContent = ' · ' + inst.events + ' active days · ' + noteName(k.m); sm.style.opacity = '.7'; lab.appendChild(sm);
    var gut = kb.getBoundingClientRect().left - app.getBoundingClientRect().left, kw = kb.clientWidth, cx = gut + kw * (k.kl + k.kr) / 200;
    var aw = app.clientWidth; lab.style.left = '0px'; lab.classList.add('on'); var lw = lab.offsetWidth;
    lab.style.left = Math.max(lw / 2 + 4, Math.min(aw - lw / 2 - 4, cx)) + 'px';
    clearTimeout(labTimer); labTimer = setTimeout(function () { lab.classList.remove('on'); }, 1500);
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
    N = D.institutions.length; Q = D.rows.length; var MF = D.monthly_from;
    var g = geometry(N); K = g.keys;
    $('ph-sub').textContent = N + ' parties · ' + D.counts.events + ' active days · quarters from ' + D.rows[0] + ', months from ' + (D.rows[MF] || '2026') + ' · tap a key';
    $('ph-size').textContent = N + ' keys, ' + MF + ' quarters + ' + (Q - MF) + ' months';
    var lo = D.left_out || [];
    var S = D.sources; $('ph-note').textContent = 'Sources: ' + [S.email, S.catalogue, S.erp, S.journal, S.wdtk, S.website, S.williams].join('; ') + '. One count is one party active on one day; the same day in two sources counts once. Keys are ordered by activity: the most active party sits on the middle key, the next ones alternate either side, the least active are at both ends; numbers run left to right. Rows are quarters to the end of 2025, then months from January 2026. ' +
      (lo.length ? lo.length + ' bodies with a single active day are not on the keys, because a piano has 88: ' + lo.join(', ') + '.' : '') + ' Data built ' + D.generated + '.';
    // keys
    var kf = 'calc(min(9px, ' + (100 / g.whites * 0.62).toFixed(3) + 'vw))';
    K.forEach(function (k, i) {
      var inst = D.institutions[i], b = el('button', 'ph-k ' + (k.w ? 'w' : 'b'), kb);
      b.type = 'button'; b.dataset.i = i; b.style.left = k.kl + '%'; b.style.width = (k.kr - k.kl) + '%'; b.style.setProperty('--kf', kf);
      b.setAttribute('aria-label', inst.n + ': ' + inst.name + ', ' + inst.events + ' active days (' + noteName(k.m) + ')');
      var s = el('span', '', b); s.textContent = inst.n; keyEls.push(b);
      var c = el('div', 'ph-col' + (k.w ? '' : ' b'), grid); c.style.left = k.cl + '%'; c.style.width = (k.cr - k.cl) + '%'; colEls.push(c);
    });
    // rows (1988-Q1 at the bottom, the latest at the top): quarters to 2025-Q4, then months from 2026-01
    for (var q = 0; q < Q; q++) {
      var lbl = D.rows[q], r = el('div', 'ph-row' + (/(Q1|-01)$/.test(lbl) ? ' q1' : '') + (q >= MF ? ' mo' : ''), grid);
      r.style.top = 'calc(var(--pad) + ' + (Q - 1 - q) + ' * var(--ph-row))';
      el('span', '', r).textContent = lbl; rowNotes.push([]);
    }
    if (MF > 0 && MF < Q) {
      var sw = el('div', 'ph-sw', grid); sw.style.top = 'calc(var(--pad) + ' + (Q - MF) + ' * var(--ph-row))';
      el('span', '', sw).textContent = 'monthly from January 2026 ↑ · quarterly below ↓';
    }
    var end = el('div', 'ph-end', grid); end.style.height = 'var(--pad)'; end.textContent = '— ' + D.rows[Q - 1] + ' —';
    D.notes.forEach(function (nt) {
      var q = nt[0], i = nt[1], n = nt[2], k = K[i], e = el('div', 'ph-n', grid);
      e.style.left = ((k.cl + k.cr) / 2) + '%'; e.style.top = 'calc(var(--pad) + ' + (Q - 1 - q + 0.5) + ' * var(--ph-row))';
      e.style.setProperty('--w', ((k.cr - k.cl) * 0.86).toFixed(3) + '%');
      var lvl = Math.min(1, Math.log(1 + n) / Math.log(9)); e.style.setProperty('--o', (0.55 + 0.45 * lvl).toFixed(2)); e.style.setProperty('--s', (0.78 + 0.32 * lvl).toFixed(2));
      el('i', '', e); rowNotes[q].push({ i: i, n: n, e: e });
    });
    rowNotes.forEach(function (a) { a.sort(function (x, y) { return x.i - y.i; }); });
    var nx = Q; for (q = Q - 1; q >= 0; q--) { if (rowNotes[q].length) nx = q; nextNoteRow[q] = nx; }
    layout(true);
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
    viewH = scroll.clientHeight; padTop = viewH; H = padTop + Q * rowH;
    grid.style.setProperty('--pad', padTop + 'px'); grid.style.height = H + 'px';
    par.style.height = H + 'px';
    setPos(H - viewH - keep * rowH);
    lastP = null; onScroll();
  }
  function rowsPassed() { var p = pos + viewH; return Math.max(0, Math.min(Q, (H - p) / rowH)); }
  function setPos(v) { pos = Math.max(0, Math.min(H - viewH, v)); programmatic = true; scroll.scrollTop = pos; }
  function onScroll() {
    if (!programmatic) pos = scroll.scrollTop; programmatic = false;
    var maxS = Math.max(1, H - viewH);
    par.style.transform = 'translateY(' + (0.4 * (pos - maxS)).toFixed(1) + 'px)';
    var k = Math.min(Q - 1, Math.floor(rowsPassed()));
    nowEl.textContent = 'at the keys: ' + D.rows[Math.max(0, k)];
  }

  /* ---------- playback: the table slides down onto the keys; each row plays as its notes reach the line ---------- */
  function fire(q) {
    var a = rowNotes[q]; if (!a || !a.length) return;
    var gap = Math.min(0.03, 0.45 / a.length), vol = 1 / Math.sqrt(Math.max(1, a.length / 3));
    a.forEach(function (o, j) {
      var vel = (0.45 + 0.55 * Math.min(1, Math.log(1 + o.n) / Math.log(9))) * vol;
      tone(K[o.i].m, vel, j * gap);
      (function (o, d) { setTimeout(function () { light(o.i, 300); o.e.classList.add('hit'); setTimeout(function () { o.e.classList.remove('hit'); }, 650); }, d); })(o, j * gap * 1000);
    });
    if (a.length === 1) showLabel(a[0].i);
  }
  function step(t) {
    if (!playing) return;
    var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
    var rp = rowsPassed(), cur = Math.min(Q - 1, Math.floor(rp)), nx = nextNoteRow[cur];
    var target = (nx - rp > 3.2) ? 6 : 1; boost += (target - boost) * Math.min(1, dt * 2.5);
    var speed = rowH * 1.0 * (dbl ? 2 : 1) * boost;
    var p0 = pos + viewH; setPos(pos - speed * dt); onScroll(); var p1 = pos + viewH;
    for (var q = 0; q < Q; q++) { var c = padTop + (Q - 1 - q + 0.5) * rowH; if (c < p0 && c >= p1) fire(q); }
    if (pos <= 0) { stop(); return; }
    raf = requestAnimationFrame(step);
  }
  function start() {
    audio(); if (pos <= 0) setPos(H - viewH); if (window.innerWidth > window.innerHeight) fitPage(true);
    playing = true; lastT = 0; boost = 1; btnPlay.setAttribute('aria-pressed', 'true'); btnPlay.setAttribute('aria-label', 'Pause'); btnX2.hidden = false;
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
    if (ev.key === ' ' && !(ev.target && ev.target.closest && ev.target.closest('.ph-k,.ph-play,.ph-x2,.ph-i,dialog'))) { ev.preventDefault(); playing ? stop() : start(); }
    else if ((ev.key === '2' || ev.key === 'x') && playing) btnX2.click();
  });

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

  var rz = 0; function relayout() { clearTimeout(rz); rz = setTimeout(function () { if (D) layout(false); }, 120); }
  window.addEventListener('resize', relayout); window.addEventListener('orientationchange', function () { autoScrolled = false; relayout(); });
  fetch('data/activity.json?v=0.2.0').then(function (r) { return r.json(); }).then(function (j) {
    D = j; build(); [300, 1000, 2500].forEach(function (ms) { setTimeout(function () { layout(false); }, ms); });
    window.PianoHero = { version: '0.2.0', press: press, play: start, pause: stop, data: D };
  }).catch(function () { $('ph-sub').textContent = 'The activity data did not load. Please reload the page.'; });
})();
