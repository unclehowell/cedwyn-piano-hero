/* Piano Hero 0.6.0 — institutions as keys; events move right-to-left along a horizontal chronological score. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var app = $('ph'), keyList = $('ph-keys'), ruler = $('ph-ruler-inner'),
      timeInner = $('ph-time-inner'), columns = $('ph-time-columns'),
      bands = $('ph-lane-bands'), markers = $('ph-markers'), svg = $('ph-connectors'),
      laneScroll = $('ph-lane-scroll'), scoreViewport = $('ph-score-viewport'),
      nowEl = $('ph-now'), progress = $('ph-progress'), progressLabel = $('ph-progress-label'),
      filterEl = $('ph-filter'), playBtn = $('ph-play'), playLabel = $('ph-play-label'),
      x2Btn = $('ph-x2'), backingBtn = $('ph-backing'), backingVol = $('ph-volume'),
      eventLabel = $('ph-event-label'), detailDlg = $('ph-detail'),
      detailTitle = $('ph-detail-title'), detailSub = $('ph-detail-sub'),
      detailSide = $('ph-detail-side'), detailSummary = $('ph-detail-summary'),
      detailFrame = $('ph-detail-frame'), detailOpen = $('ph-detail-open');
  if (!app) return;

  var D = null, F = null, TH = {}, N = 0, Q = 0, ROW_H = 42, RULER_H = 56,
      PLAYHEAD_X = 136, X = [], W = [], TOTAL_W = 0, K = [],
      notes = [], rows = [], keyEls = [], eventEls = [],
      reportNodes = [], eventRefs = {}, reportNodesById = {},
      FILTER = 'all', BEAT = 0.6, CAP = 2, segs = [],
      playing = false, dbl = false, clock = 0, lastR = 0, lastT = 0, raf = 0,
      progressR = 0, labTimer = 0, labUntil = 0, labRemaining = 0, labPaused = false,
      AC = null, master = null, BK = { on: true, vol: 0.3, beat: 0 },
      focusBack = null, currentReport = null, currentInstitution = null, lastReportContext = null,
      drag = null, built = false;

  function hue(id) {
    var h = 0, s = String(id || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }
  function laneColor(inst) { return 'hsl(' + hue(inst.id || inst.name) + ',68%,49%)'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function isWhite(m) {
    var x = m % 12;
    return x === 0 || x === 2 || x === 4 || x === 5 || x === 7 || x === 9 || x === 11;
  }
  var NOTE_NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  function noteName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }
  function startNote(n) {
    var best = null;
    for (var s = 21; s + n - 1 <= 108; s++) {
      if (isWhite(s) && isWhite(s + n - 1)) {
        var c = Math.abs(s + (n - 1) / 2 - 62);
        if (!best || c < best.c) best = { s:s, c:c };
      }
    }
    if (best) return best.s;
    for (var p = Math.max(21, 62 - Math.floor(n / 2)); p > 21; p--) if (isWhite(p)) return p;
    return 21;
  }
  function geometry(n) {
    var start = startNote(n), blackW = 0.6, keys = [], whiteCount = 0;
    for (var i = 0; i < n; i++) {
      var m = start + i;
      if (isWhite(m)) { keys.push({m:m,w:true,wi:whiteCount++}); }
      else keys.push({m:m,w:false,x:whiteCount});
    }
    var total = whiteCount + (keys[n - 1].w ? 0 : blackW / 2);
    keys.forEach(function (k, i) {
      if (k.w) {
        var prevBlack = i > 0 && !keys[i - 1].w, nextBlack = i < n - 1 && !keys[i + 1].w;
        k.kl = k.wi; k.kr = k.wi + 1;
        k.cl = k.wi + (prevBlack ? blackW / 2 : 0);
        k.cr = k.wi + 1 - (nextBlack ? blackW / 2 : 0);
      } else {
        k.kl = k.x - blackW / 2; k.kr = k.x + blackW / 2; k.cl = k.kl; k.cr = k.kr;
      }
      ['kl','kr','cl','cr'].forEach(function (p) { k[p] = k[p] / total * 100; });
    });
    return { keys:keys, whites:whiteCount };
  }
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function makeButton(label, cls, parent) {
    var b = el('button', cls || '', parent);
    b.type = 'button';
    b.textContent = label;
    return b;
  }
  function rowLabel(q) { return D.rows[q] || ''; }
  function xForRow(q) { return X[Math.max(0, Math.min(Q - 1, q))] || 0; }
  function xAt(r) {
    if (!Q) return 0;
    if (r <= 0) return Math.max(0, X[0] - W[0] / 2);
    if (r >= Q) return X[Q - 1] + W[Q - 1] / 2;
    var q = Math.max(0, Math.min(Q - 1, Math.floor(r)));
    var u = r - q;
    var left = q === 0 ? X[0] - W[0] / 2 : X[q - 1] * 0.5 + X[q] * 0.5;
    var right = q === Q - 1 ? X[q] + W[q] / 2 : (X[q] + X[q + 1]) / 2;
    return left + (right - left) * u;
  }
  function rowAtX(x) {
    if (!Q) return 0;
    if (x <= X[0]) return 0;
    if (x >= X[Q - 1]) return Q;
    var lo = 0, hi = Q - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (X[mid] < x) lo = mid; else hi = mid;
    }
    var q = X[hi] === X[lo] ? lo : (x - X[lo]) / (X[hi] - X[lo]) < 0.5 ? lo : hi;
    var left = q === 0 ? X[0] - W[0] / 2 : (X[q - 1] + X[q]) / 2;
    var right = q === Q - 1 ? X[q] + W[q] / 2 : (X[q] + X[q + 1]) / 2;
    return q + Math.max(0, Math.min(1, (x - left) / Math.max(1, right - left)));
  }
  function columnWidth(label, q) {
    if (q < (D.lead_in || 0)) return 34;
    if (label === '1500s') return 68;
    if (/^\d{4}-Q\d$/.test(label)) return 44;
    if (/^\d{4}-\d\d$/.test(label)) return 50;
    return 42;
  }
  function buildColumns() {
    X = []; W = []; var x = 0;
    for (var q = 0; q < Q; q++) {
      var w = columnWidth(D.rows[q], q);
      W.push(w); X.push(x + w / 2); x += w;
    }
    TOTAL_W = x;
    ruler.style.width = TOTAL_W + 'px';
    timeInner.style.width = TOTAL_W + 'px';
    timeInner.style.height = (N * ROW_H) + 'px';
    svg.setAttribute('width', TOTAL_W); svg.setAttribute('height', N * ROW_H);
    svg.setAttribute('viewBox', '0 0 ' + TOTAL_W + ' ' + (N * ROW_H));
  }
  function titleFor(inst) { return inst.name + ' · ' + inst.events + ' active days'; }
  function buildKeys() {
    keyList.innerHTML = '';
    K.forEach(function (k, i) {
      var inst = D.institutions[i], rel = (F.institution_reports || {})[inst.id] || [];
      var b = makeButton('', 'ph-inst-key ' + (k.w ? 'white' : 'black'), keyList);
      b.dataset.index = i;
      b.style.setProperty('--lane', laneColor(inst));
      b.title = titleFor(inst);
      b.setAttribute('aria-label', 'Institution key: ' + inst.name + '. ' + rel.length + ' mapped forensic reports. Open details.');
      var nn = el('span', 'ph-key-note', b); nn.textContent = noteName(k.m);
      var name = el('span', 'ph-key-name', b); name.textContent = inst.name;
      var meta = el('span', 'ph-key-meta', b);
      if (rel.length) { var badge = el('span', 'ph-key-report', meta); badge.textContent = 'FA ' + rel.length; }
      var count = el('span', 'ph-key-count', meta); count.textContent = inst.events;
      keyEls.push(b);
      var mark = el('div', 'ph-lane-band', bands);
      mark.style.top = (i * ROW_H) + 'px';
      mark.style.setProperty('--lane', laneColor(inst));
      mark.dataset.index = i;
    });
  }
  function buildRulerAndGrid() {
    ruler.innerHTML = '';
    columns.innerHTML = '';
    for (var q = 0; q < Q; q++) {
      var label = D.rows[q], w = W[q], left = X[q] - w / 2;
      var y = el('div', 'ph-year', ruler);
      y.style.left = left + 'px'; y.style.width = w + 'px';
      if (/^(1500s|\d{4}0|\d{4}-Q1|\d{4}-01)$/.test(label)) y.classList.add('big');
      if (/^\d{4}-Q/.test(label)) y.classList.add('quarter');
      if (/^\d{4}-\d{2}$/.test(label)) y.classList.add('month');
      y.textContent = label;
      var col = el('div', 'ph-time-col', columns);
      col.style.left = left + 'px'; col.style.width = w + 'px';
      if (/^(\d{4}0|1500s)$/.test(label)) col.classList.add('decade');
    }
    bands.style.height = (N * ROW_H) + 'px';
    for (var i = 0; i < N; i++) {
      var line = el('div', 'ph-lane-band', bands);
      line.style.top = (i * ROW_H) + 'px';
      line.style.setProperty('--lane', laneColor(D.institutions[i]));
    }
  }
  function noteTitle(o) {
    var first = o.refs.length ? D.records[o.refs[0]] : null;
    return first && first.s ? first.s : (o.n > 1 ? o.n + ' days of recorded activity' : 'Recorded activity');
  }
  function bestRef(o) {
    for (var i = 0; i < o.refs.length; i++) if (D.records[o.refs[i]]) return o.refs[i];
    return o.refs[0] || '';
  }
  function makePreview(o, ref, cls) {
    var b = makeButton('', cls || 'ph-label-image');
    b.setAttribute('aria-label', ref ? 'Open catalogue record ' + ref : 'Open event details');
    b.dataset.recordId = ref || '';
    if (ref && TH[ref]) {
      var im = el('img', '', b); im.src = TH[ref]; im.alt = 'Preview image for ' + ref; im.loading = 'lazy';
    } else {
      var txt = el('span', '', b); txt.textContent = ref || 'EVENT';
    }
    b.addEventListener('click', function () {
      if (ref) showRecord(ref, o, b);
      else showEvent(o, b);
    });
    return b;
  }
  function buildMarkers() {
    markers.innerHTML = '';
    notes = []; rows = Array.from({length:Q}, function () { return []; });
    eventRefs = {}; eventEls = [];
    D.notes.forEach(function (nt, index) {
      var q = +nt[0], i = +nt[1], refs = nt[5] || [];
      var o = { index:index, q:q, i:i, n:+nt[2], v:+nt[3] || 0, p:+nt[4] || 0, refs:refs.slice() };
      rows[q].push(o); notes.push(o);
      o.primary = bestRef(o);
      if (o.primary) (eventRefs[o.primary] || (eventRefs[o.primary] = [])).push(o);
      var inst = D.institutions[i];
      var b = makeButton('', 'ph-event-marker', markers);
      b.dataset.eventIndex = index;
      b.style.left = xForRow(q) + 'px';
      b.style.top = (i * ROW_H + ROW_H / 2) + 'px';
      b.style.setProperty('--lane', laneColor(inst));
      b.title = rowLabel(q) + ' · ' + inst.name + ' · ' + noteTitle(o);
      if (o.primary && TH[o.primary]) {
        var im = el('img', '', b); im.src = TH[o.primary]; im.alt = 'Select preview: ' + o.primary; im.loading = 'lazy';
      } else {
        var mark = el('span', 'marker-empty', b);
      }
      o.el = b; eventEls.push(b);
    });
  }
  function reportX(report) {
    var date = String(report.published || '2026-11-01');
    var m = date.match(/(\d{4})(?:-(\d{2}))?/);
    if (!m) return X[Q - 1];
    var year = +m[1], month = +(m[2] || 1);
    var exact = D.rows.indexOf(String(year));
    if (exact >= 0) return X[exact];
    if (year < 1500) return X[Math.max(0, D.rows.indexOf('1496'))];
    if (year < 1600) return X[Math.max(0, D.rows.indexOf('1500s'))];
    if (year <= (D.yearly_to || 1987)) return X[Math.max(0, D.rows.indexOf(String(year)))];
    if (year <= 2025) {
      var quarter = Math.floor((month - 1) / 3) + 1;
      var qi = D.rows.indexOf(year + '-Q' + quarter);
      return X[qi >= 0 ? qi : Q - 1];
    }
    var mi = D.rows.indexOf(year + '-' + String(month).padStart(2,'0'));
    return X[mi >= 0 ? mi : Q - 1];
  }
  function buildReportMarkersAndLines() {
    reportNodes = []; reportNodesById = {};
    var svgNS = 'http://www.w3.org/2000/svg';
    svg.innerHTML = '';
    markers.querySelectorAll('.ph-report-marker').forEach(function (x) { x.remove(); });
    var rels = F.institution_reports || {};
    var perInst = {};
    D.institutions.forEach(function (inst, i) {
      (rels[inst.id] || []).forEach(function (report, ri) {
        var b = makeButton('FA', 'ph-report-marker ' + (report.relationship === 'related' ? 'related' : 'direct'), markers);
        var y = i * ROW_H + 8 + (ri % 2) * 17;
        var x = reportX(report);
        b.dataset.reportId = report.id; b.dataset.institutionIndex = i;
        b.style.left = x + 'px'; b.style.top = y + 'px';
        b.style.setProperty('--lane', laneColor(inst));
        b.title = report.id + ' · ' + report.name + ' · ' + (report.relationship === 'direct' ? 'direct match' : 'related body');
        b.setAttribute('aria-label', 'Open ' + report.id + ', ' + report.name + ', ' + report.relationship + ' report');
        var node = { report:report, i:i, x:x, y:y + 9, inst:inst };
        reportNodes.push(node);
        (reportNodesById[report.id] || (reportNodesById[report.id] = [])).push(node);
        if (!perInst[i]) perInst[i] = [];
        perInst[i].push(node);
      });
    });
    function path(x1,y1,x2,y2,cls,color) {
      var p = document.createElementNS(svgNS,'path');
      var mid = x1 + (x2 - x1) * 0.5;
      p.setAttribute('d','M '+x1+' '+y1+' C '+mid+' '+y1+', '+mid+' '+y2+', '+x2+' '+y2);
      p.setAttribute('class',cls); p.setAttribute('stroke',color); svg.appendChild(p);
    }
    notes.forEach(function (o) {
      var targets = perInst[o.i] || [];
      if (!targets.length || !inFilter(o)) return;
      var inst = D.institutions[o.i], x1 = X[o.q], y1 = o.i * ROW_H + ROW_H / 2;
      targets.forEach(function (node) {
        path(x1,y1,node.x,node.y,'event-report',laneColor(inst));
        if (node.report.relationship === 'related') {
          var last = svg.lastChild; last.setAttribute('class','related-report');
        }
      });
    });
    reportNodes.forEach(function (node) {
      (node.report.citation_ids || []).forEach(function (id) {
        (eventRefs[id] || []).forEach(function (o) {
          if (!inFilter(o)) return;
          var x2 = X[o.q], y2 = o.i * ROW_H + ROW_H / 2;
          path(node.x,node.y,x2,y2,'report-citation',laneColor(node.inst));
        });
      });
    });
  }
  function inFilter(o) {
    return FILTER === 'all' || (FILTER === 'v' ? o.v > 0 : FILTER === 'p' ? o.p > 0 : true);
  }
  function buildSegs() {
    var pts = [[0,0]], t = 0, last = 0, first = true;
    for (var q = 0; q < Q; q++) {
      var any = rows[q].some(inFilter);
      if (!any) continue;
      var r = q + 0.5, dr = r - last;
      t += first ? dr : Math.min(dr, CAP);
      pts.push([r,t]); last = r; first = false;
    }
    if (Q > last) { t += Math.min(Q - last,CAP); pts.push([Q,t]); }
    segs = pts;
  }
  function ease(u, dr) { return dr <= CAP + 0.01 ? u : u*u*(3-2*u); }
  function rAt(tb) {
    if (tb <= 0) return 0;
    for (var j = 1; j < segs.length; j++) {
      var a = segs[j-1], b = segs[j];
      if (tb <= b[1]) {
        var u = (tb-a[1])/(b[1]-a[1]);
        return a[0] + (b[0]-a[0]) * ease(u,b[0]-a[0]);
      }
    }
    return Q;
  }
  function tAt(r) {
    for (var j = 1; j < segs.length; j++) {
      var a = segs[j-1], b = segs[j];
      if (r <= b[0]) {
        var dr=b[0]-a[0], lo=0, hi=1, target=dr>0?(r-a[0])/dr:1;
        for (var it=0;it<28;it++) { var mid=(lo+hi)/2; if(ease(mid,dr)<target) lo=mid; else hi=mid; }
        return a[1] + (b[1]-a[1]) * (lo+hi)/2;
      }
    }
    return segs.length ? segs[segs.length-1][1] : 0;
  }
  function progressLabel(r) {
    var q = Math.max(0,Math.min(Q-1,Math.floor(r)));
    return (r >= Q ? D.rows[Q-1] + ' · end' : D.rows[q]);
  }
  function positionAt(r) {
    progressR = Math.max(0,Math.min(Q,r));
    var tx = PLAYHEAD_X - xAt(progressR);
    var transform = 'translate3d(' + tx.toFixed(1) + 'px,0,0)';
    ruler.style.transform = transform;
    timeInner.style.transform = transform;
    var q = Math.max(0,Math.min(Q-1,Math.floor(Math.max(0,progressR))));
    nowEl.textContent = progressLabel(progressR);
    progress.value = String(progressR);
    progressLabelEl.textContent = progressR <= 0 ? 'Beginning · ' + D.rows[0] : progressLabel(progressR);
  }
  function clearLabTimer() {
    if (labTimer) clearTimeout(labTimer);
    labTimer = 0; labUntil = 0;
  }
  function scheduleLabHide(ms) {
    clearLabTimer(); labRemaining = Math.max(0,ms||0);
    if (!labRemaining || labPaused) return;
    labUntil = Date.now()+labRemaining;
    labTimer = setTimeout(function(){labTimer=0;labUntil=0;labRemaining=0;if(!labPaused)eventLabel.classList.remove('visible');},labRemaining);
  }
  function holdLabel() {
    if (labPaused) return;
    if (labTimer) labRemaining = Math.max(0,labUntil-Date.now());
    clearLabTimer(); labPaused = true;
  }
  function resumeLabel() {
    if (!labPaused) return;
    labPaused = false;
    if (eventLabel.classList.contains('visible') && labRemaining>0) scheduleLabHide(labRemaining);
    else labRemaining=0;
  }
  function recordData(id) { return id && D.records ? D.records[id] : null; }
  function renderLabel(notesAtQ, row) {
    eventLabel.innerHTML = '';
    if (!notesAtQ.length) {
      var empty = el('div','ph-label-empty',eventLabel);
      empty.textContent = 'No event at the sounding line.';
      return;
    }
    var shown = notesAtQ.slice().sort(function(a,b){
      var ta = TH[a.primary] ? 1 : 0, tb = TH[b.primary] ? 1 : 0;
      return tb-ta || b.n-a.n;
    }).slice(0,4);
    shown.forEach(function(o){
      var inst = D.institutions[o.i], rec = recordData(o.primary);
      var card = el('article','ph-label-card',eventLabel);
      card.style.setProperty('--lane',laneColor(inst));
      card.appendChild(makePreview(o,o.primary,'ph-label-image'));
      var txt = el('div','ph-label-text',card);
      var date=el('div','ph-label-date',txt);date.textContent=(rec&&rec.d)||D.rows[o.q];
      var title=el('div','ph-label-title',txt);title.textContent=(rec&&rec.title)||noteTitle(o);
      var sub=el('div','ph-label-sub',txt);sub.textContent=inst.name+' · '+(o.refs.length?o.refs.join(', '):o.n+' active day(s)')+' · '+(o.n>1?o.n+' days':'event');
    });
    eventLabel.classList.add('visible');
    scheduleLabHide(3000);
  }
  function fire(q) {
    var arr = rows[q] ? rows[q].filter(inFilter) : [];
    if (!arr.length) { tick(0); return; }
    arr.forEach(function(o,j){
      var vel=(0.45+0.55*Math.min(1,Math.log(1+o.n)/Math.log(9)))/Math.sqrt(Math.max(1,arr.length/3));
      tone(K[o.i].m,vel,j*Math.min(0.03,0.4/arr.length));
      var im=o.el; im.classList.add('hit');
      setTimeout(function(){im.classList.remove('hit');},520);
    });
    renderLabel(arr,q);
    BK.beat++;
    if (BK.on && BK.beat % 4 === 0) backingChord();
  }
  function audio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
    var C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    AC=new C();var comp=AC.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=4;
    master=AC.createGain();master.gain.value=0.5;master.connect(comp);comp.connect(AC.destination);
    return AC;
  }
  function tone(m,vel,when) {
    var ac=audio();if(!ac)return;
    var t=ac.currentTime+(when||0),f=440*Math.pow(2,(m-69)/12);
    var dur=Math.max(0.8,Math.min(2.6,3.2-(m-21)*0.025)),v=vel||0.7;
    var out=ac.createGain();out.gain.setValueAtTime(0.0001,t);out.gain.exponentialRampToValueAtTime(0.25*v,t+0.006);
    out.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    var lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(Math.min(15000,f*7),t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(11000,f*2.2),t+dur*0.6);lp.connect(out);out.connect(master);
    [[1,1,'triangle'],[2,0.28,'sine'],[3,0.1,'sine']].forEach(function(p){
      if(f*p[0]>18000)return;
      var o=ac.createOscillator(),g=ac.createGain();o.type=p[2];o.frequency.value=f*p[0];g.gain.value=p[1];
      o.connect(g);g.connect(lp);o.start(t);o.stop(t+dur+0.03);
    });
  }
  function backingChord() {
    if(!audio())return;
    var chord=[[53,57,60],[50,53,57],[46,50,53],[48,52,55]][Math.floor(BK.beat/4)%4];
    chord.forEach(function(m){tone(m,0.12,0);});
  }
  function tick() { if(!audio())return;var t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.value=1250;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.025,t+0.002);g.gain.exponentialRampToValueAtTime(0.0001,t+0.04);o.connect(g);g.connect(master);o.start(t);o.stop(t+0.05); }

  function openDetail() { if(detailDlg.showModal)detailDlg.showModal();else detailDlg.setAttribute('open',''); }
  function setFrame(url,title) {
    detailFrame.hidden=!url;
    if(url)detailFrame.src=url;else detailFrame.removeAttribute('src');
    detailOpen.hidden=!url;
    detailOpen.dataset.url=url||'';
    if(url)detailFrame.title=title||'Selected detail page';
  }
  function resetDetail(title,sub) {
    detailTitle.textContent=title||'Details';detailSub.textContent=sub||'';
    detailSide.innerHTML='';detailSummary.innerHTML='';setFrame('', '');
    detailDlg.scrollTop=0;lastReportContext=null;
  }
  function openPageFromDialog() {
    var url=detailOpen.dataset.url;if(url)window.open(url,'_blank','noopener,noreferrer');
  }
  function showRecord(id, note, trigger) {
    focusBack=trigger||document.activeElement;
    var rec=recordData(id), title=rec&&rec.title?rec.title:id;
    resetDetail(title,id+' · catalogue record');
    detailSub.textContent=(rec&&rec.d?rec.d+' · ':'')+id;
    var intro=el('p','',detailSide);intro.textContent='Catalogue records are the source of the event description. Select another record reference from this event below.';
    if(note&&note.refs.length>1){
      el('div','ph-side-section',detailSide).textContent='Event record references';
      note.refs.forEach(function(ref){
        var rr=recordData(ref),b=makeButton((rr&&rr.s?rr.s+' · ':'')+ref,'ph-side-item',detailSide);
        if(ref===id)b.classList.add('selected');
        b.addEventListener('click',function(){showRecord(ref,note,b);});
      });
    }
    detailSummary.textContent=(rec&&rec.s?rec.s+' · ':'')+(note?D.institutions[note.i].name+' · '+D.rows[note.q]+' · '+note.n+' active day(s)':'');
    if(note&&note.refs.length) {
      el('div','ph-side-section',detailSide).textContent='Event context';
      var p=el('p','ph-side-intro',detailSide);p.textContent='This event cell links '+note.refs.length+' catalogue record reference(s). The full event record opens in the panel.';
    }
    setFrame('/catalogue/?id='+encodeURIComponent(id),'Catalogue record '+id);
    detailOpen.textContent='Open in catalogue ↗';
    openDetail();
  }
  function showEvent(o,trigger) {
    focusBack=trigger||document.activeElement;
    resetDetail(noteTitle(o),'Event · '+D.rows[o.q]+' · '+D.institutions[o.i].name);
    detailSummary.textContent=D.institutions[o.i].name+' was active in '+D.rows[o.q]+' ('+o.n+' active day(s)). '+(o.refs.length?'Catalogue references: '+o.refs.join(', '):'No catalogue ID was attached to this activity cell.');
    var refs=el('div','ph-side-section',detailSide);refs.textContent='Catalogue references';
    if(o.refs.length){
      o.refs.forEach(function(id){var rec=recordData(id);var b=makeButton((rec&&rec.s?rec.s+' · ':'')+id,'ph-side-item',detailSide);b.addEventListener('click',function(){showRecord(id,o,b);});});
    } else {var p=el('p','ph-side-intro',detailSide);p.textContent='This activity entry has no catalogue record identifier. Its event detail is limited to the institutional activity register.';}
    setFrame('', '');
    detailOpen.hidden=!(o.primary);
    detailOpen.dataset.url=o.primary?'/catalogue/?id='+encodeURIComponent(o.primary):'';
    detailOpen.textContent='Open catalogue record ↗';
    openDetail();
  }
  function showReport(report, inst, trigger) {
    focusBack=trigger||document.activeElement;
    currentReport=report;currentInstitution=inst;
    resetDetail(report.name,report.id+' · forensic assessment · v'+report.version);
    var chip=el('span','ph-chip '+(report.relationship==='direct'?'direct':'related'),detailSummary);
    chip.textContent=report.relationship==='direct'?'Direct institution match':'Related body · '+report.relationship_note;
    var verdict=el('p','',detailSummary);verdict.textContent=report.verdict||'Published institutional forensic assessment.';
    var meta=el('p','ph-side-intro',detailSummary);meta.textContent=report.status+' · '+report.published;
    setFrame(report.url,'Forensic assessment: '+report.name);
    detailOpen.textContent='Open assessment ↗';
    openDetail();
    detailSide.innerHTML='';
    var back=makeButton('← Back to institution','ph-back-report',detailSide);
    back.addEventListener('click',function(){showInstitution(inst,back);});
    el('div','ph-side-section',detailSide).textContent='Cited catalogue records';
    var cites=report.citation_ids||[];
    if(cites.length){
      cites.forEach(function(id){
        var rec=recordData(id);
        var b=makeButton((rec&&rec.d?rec.d+' · ':'')+id,'ph-cite-button',detailSide);
        b.addEventListener('click',function(){
          lastReportContext={report:report,inst:inst};
          showRecord(id,null,b);
          var backBtn=makeButton('← Back to '+report.id,'ph-back-report',detailSide);
          backBtn.addEventListener('click',function(){showReport(report,inst,backBtn);});
          detailSide.insertBefore(backBtn,detailSide.firstChild);
        });
      });
    }else{
      var p=el('p','ph-side-intro',detailSide);p.textContent='No catalogue record identifiers were extracted from the public assessment text. The assessment can still be opened in full.';
    }
  }
  function showInstitution(inst,trigger) {
    focusBack=trigger||document.activeElement;
    var reports=(F.institution_reports||{})[inst.id]||[];
    resetDetail(inst.name,'Institutional forensic assessment · '+inst.events+' activity day(s)');
    var intro=el('p','ph-side-intro',detailSide);
    intro.textContent=reports.length?'Reports mapped to this institution. Direct matches and related bodies are distinguished.':'No report is currently mapped to this key.';
    if(!reports.length){
      detailSummary.textContent='The institution has '+inst.events+' recorded activity day(s). There is no directly or relatedly mapped assessment in the current cross-reference. This is not a statement that no report exists.';
      var b=makeButton('Browse all 64 reports','ph-side-item',detailSide);
      b.addEventListener('click',function(){showAllReports(b);});
      setFrame('','');openDetail();return;
    }
    reports.forEach(function(report,index){
      var b=makeButton(report.id+' · '+report.name,'ph-side-item',detailSide);
      b.style.borderLeft='4px solid '+laneColor(inst);
      var small=el('small','',b);small.textContent=(report.relationship==='direct'?'Direct match':'Related body')+' · v'+report.version+' · '+report.status;
      b.addEventListener('click',function(){showReport(report,inst,b);});
      if(index===0)currentReport=report;
    });
    var report=reports.find(function(r){return r.relationship==='direct';})||reports[0];
    var verdict=el('p','',detailSummary);verdict.textContent=report.verdict||'Select a report from the list.';
    detailSummary.prepend((function(){var s=el('span','ph-chip '+(report.relationship==='direct'?'direct':'related'));s.textContent=report.relationship==='direct'?'Direct match':'Related body';return s;})());
    detailOpen.hidden=false;detailOpen.dataset.url=report.url;detailOpen.textContent='Open assessment ↗';
    setFrame(report.url,'Forensic assessment: '+report.name);
    openDetail();
  }
  function showAllReports(trigger) {
    focusBack=trigger||document.activeElement;
    resetDetail('All institutional assessments','64 published reports · 13 not assigned to an institution key');
    detailSummary.textContent='Browse the complete published assessment register. The unassigned reports remain available here but are not connected to an institution lane without a supported mapping.';
    var intro=el('p','ph-side-intro',detailSide);intro.textContent='All published institutional reports';
    (F.assessments||[]).forEach(function(report){
      var b=makeButton(report.id+' · '+report.name,'ph-side-item',detailSide);
      var small=el('small','',b);small.textContent='v'+report.version+' · '+report.status;
      b.addEventListener('click',function(){showReport(report,null,b);});
    });
    setFrame('', '');detailOpen.hidden=true;openDetail();
  }
  function closeDetail() { if(detailDlg.close)detailDlg.close();else detailDlg.removeAttribute('open'); }
  detailDlg.addEventListener('close',function(){detailFrame.removeAttribute('src');if(focusBack&&focusBack.isConnected)focusBack.focus();});
  $('ph-detail-close').addEventListener('click',closeDetail);
  detailDlg.addEventListener('click',function(e){if(e.target===detailDlg)closeDetail();});
  detailOpen.addEventListener('click',openPageFromDialog);
  $('ph-reports').addEventListener('click',function(){showAllReports($('ph-reports'));});
  detailSide.addEventListener('click',function(){});

  function renderLabel(arr) {
    eventLabel.innerHTML='';
    var chosen=arr.slice().sort(function(a,b){
      var aa=TH[a.primary]?1:0,bb=TH[b.primary]?1:0;
      return bb-aa||b.n-a.n;
    }).slice(0,3);
    chosen.forEach(function(o){
      var rec=recordData(o.primary),inst=D.institutions[o.i];
      var card=el('article','ph-label-card',eventLabel);card.style.setProperty('--lane',laneColor(inst));
      card.appendChild(makePreview(o,o.primary,'ph-label-image'));
      var text=el('div','ph-label-text',card);
      var date=el('div','ph-label-date',text);date.textContent=(rec&&rec.d)||D.rows[o.q];
      var title=el('div','ph-label-title',text);title.textContent=noteTitle(o);
      var sub=el('div','ph-label-sub',text);sub.textContent=inst.name+' · '+(o.refs.length?o.refs.join(', '):o.n+' active day(s)');
    });
    eventLabel.classList.add('visible');
    scheduleLabHide(3200);
  }
  function refreshFilter() {
    notes.forEach(function(o){o.el.classList.toggle('off',!inFilter(o));});
    buildSegs();
    buildReportMarkersAndLines();
    progress.max=Q;
    if(playing){clock=tAt(progressR);lastR=progressR;}
  }
  function stop(hold) {
    playing=false;cancelAnimationFrame(raf);raf=0;
    playBtn.setAttribute('aria-pressed','false');playBtn.setAttribute('aria-label','Play');playLabel.textContent='Play';
    if(hold)holdLabel();
  }
  function start() {
    resumeLabel();audio();
    if(progressR>=Q-0.01){progressR=0;positionAt(0);}
    clock=tAt(progressR);lastR=progressR;lastT=0;
    playing=true;playBtn.setAttribute('aria-pressed','true');playBtn.setAttribute('aria-label','Pause');playLabel.textContent='Pause';
    raf=requestAnimationFrame(step);
  }
  function setProgress(r,fromUser) {
    if(fromUser&&playing)stop(true);
    positionAt(r);lastR=progressR;clock=tAt(progressR);
  }
  function step(t) {
    if(!playing)return;
    var dt=lastT?Math.min(0.1,(t-lastT)/1000):0;lastT=t;
    var r0=lastR;
    clock+=dt/BEAT*(dbl?2:1);
    var r1=rAt(clock);
    positionAt(r1);
    for(var q=Math.max(0,Math.floor(r0-0.5));q<Q&&q+0.5<=r1+1e-6;q++){
      if(q+0.5>r0+1e-6)fire(q);
    }
    lastR=r1;
    if(r1>=Q-1e-6){stop(false);return;}
    raf=requestAnimationFrame(step);
  }
  function fire(q) {
    var arr=rows[q]?rows[q].filter(inFilter):[];
    if(!arr.length){tick();return;}
    arr.forEach(function(o,j){
      var vel=(0.48+0.52*Math.min(1,Math.log(1+o.n)/Math.log(9)))/Math.sqrt(Math.max(1,arr.length/3));
      tone(K[o.i].m,vel,j*Math.min(0.025,0.35/arr.length));
      o.el.classList.add('hit');setTimeout(function(){o.el.classList.remove('hit');},540);
    });
    renderLabel(arr);
    tick();
    BK.beat++;
    if(BK.on&&BK.beat%4===0)backingChord();
  }
  function togglePlay(){if(playing)stop(true);else start();}
  playBtn.addEventListener('click',togglePlay);
  x2Btn.addEventListener('click',function(){dbl=!dbl;x2Btn.setAttribute('aria-pressed',String(dbl));});
  backingBtn.addEventListener('click',function(){BK.on=!BK.on;backingBtn.setAttribute('aria-pressed',String(BK.on));backingBtn.setAttribute('aria-label',BK.on?'Backing sound on':'Backing sound off');});
  backingVol.addEventListener('input',function(){BK.vol=(+backingVol.value||0)/100;});
  filterEl.addEventListener('change',function(){FILTER=filterEl.value;refreshFilter();});
  progress.addEventListener('input',function(){setProgress(+progress.value,true);});
  $('ph-version').addEventListener('click',function(){var d=$('ph-version-dialog');if(d.showModal)d.showModal();else d.setAttribute('open','');});
  $('ph-version-close').addEventListener('click',function(){var d=$('ph-version-dialog');if(d.close)d.close();else d.removeAttribute('open');});

  function dragStart(ev) {
    if(ev.button!==undefined&&ev.button!==0)return;
    var target=ev.target;
    if(target.closest&&target.closest('button'))return;
    var rect=scoreViewport.getBoundingClientRect();
    var contentX=ev.clientX-rect.left-(PLAYHEAD_X-xAt(progressR));
    drag={pointer:ev.pointerId,active:true,origin:contentX,progress:progressR};
    try{scoreViewport.setPointerCapture(ev.pointerId);}catch(e){}
    ev.preventDefault();
  }
  function dragMove(ev) {
    if(!drag||!drag.active||drag.pointer!==ev.pointerId)return;
    var rect=scoreViewport.getBoundingClientRect();
    var contentX=ev.clientX-rect.left-(PLAYHEAD_X-xAt(progressR));
    var dx=drag.origin-contentX;
    var r=xToProgress(XAtDrag(drag.progress)+dx);
    if(playing)stop(true);
    positionAt(r);clock=tAt(r);lastR=r;
  }
  function XAtDrag(r){return xAt(r);}
  function xToProgress(x){return rowAtX(x);}
  function dragEnd(ev){if(drag&&drag.pointer===ev.pointerId){drag=null;}}
  scoreViewport.addEventListener('pointerdown',dragStart);
  scoreViewport.addEventListener('pointermove',dragMove);
  scoreViewport.addEventListener('pointerup',dragEnd);
  scoreViewport.addEventListener('pointercancel',dragEnd);

  function loadData() {
    Promise.all([
      fetch('data/activity.json?v=0.6.0').then(function(r){if(!r.ok)throw new Error('Activity data HTTP '+r.status);return r.json();}),
      fetch('data/thumbs.json?v=0.4.0').then(function(r){return r.ok?r.json():{};}),
      fetch('data/forensic-links.json?v=0.6.0').then(function(r){if(!r.ok)throw new Error('Assessment map HTTP '+r.status);return r.json();})
    ]).then(function(data){
      D=data[0];TH=data[1].thumbs||{};F=data[2];
      N=D.institutions.length;Q=D.rows.length;ROW_H=parseFloat(getComputedStyle(app).getPropertyValue('--ph-row'))||42;
      var g=geometry(N);K=g.keys;
      var sub=$('ph-sub');sub.textContent=N+' institution keys · '+Q+' chronological columns · '+F.assessments.length+' assessments, with source-backed citations';
      $('ph-event-count').textContent=D.counts.occupied_cells;
      $('ph-report-count').textContent=F.assessments.length;
      progress.max=Q;
      buildColumns();buildKeys();buildRulerAndGrid();buildMarkers();buildReportMarkersAndLines();buildSegs();
      positionAt(0);built=true;
      $('ph-data-note').textContent='Activity data '+D.generated+' · assessment source '+F.source.updated+' · 13 unassigned reports remain in the full report list';
      window.PianoHero={
        version:'0.6.0',play:start,pause:function(){stop(true);},toggle:togglePlay,
        data:D,forensic:F,openInstitution:showInstitution,openReport:showReport,
        openEvent:showEvent,openRecord:showRecord,seek:function(r){setProgress(r,true);},
        rowsPassed:function(){return progressR;},segments:function(){return segs;}
      };
      setTimeout(function(){ROW_H=parseFloat(getComputedStyle(app).getPropertyValue('--ph-row'))||42;positionAt(progressR);},150);
    }).catch(function(err){
      $('ph-sub').textContent='The score could not load: '+err.message;
      $('ph-data-note').textContent='Reload the page after checking the activity and assessment data sources.';
    });
  }
  // Keep the timeline and ruler aligned horizontally as the user scrubs; the vertical institution rail stays fixed.
  $('ph-now').textContent='1496';
  loadData();
})();