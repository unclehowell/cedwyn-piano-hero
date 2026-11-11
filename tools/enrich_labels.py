#!/usr/bin/env python3
"""Piano Hero 0.4.0 label + key-order pass. Run after tools/build_data.py:  python3 tools/enrich_labels.py
1. Key order (owner's ask 11 Nov 2026): the left half (keys 1-44) keeps the quietest parties, least active on the far left rising
   towards middle C; the right half is turned round, so the most active party sits on key 45 (F4, just above middle C) and the
   parties grow quieter towards the top (key 88). Notes are remapped; each party keeps its activity rank.
2. Labels: each catalogue record gets 'd' (its date, short) and 's' (what happened, at most 8 words) from the public catalogue
   (title, or an email's subject line), with the editorial filters (no banned words, no private names, no holdings, no addresses,
   no pre-1824 house titles). The old 'h' (title) and 'img' (full-size picture URL) fields are dropped.
3. Pictures: every record whose catalogue page carries a picture on our own domains (research evidence pages; the catalogue's
   reconstructions of missing records) gets a small webp thumbnail in public/data/thumbs.json (data URIs, so nothing is
   hotlinked and nothing has to load late). A note's refs are reordered so a record with a picture comes first.
Stdlib + Pillow. Reads only public pages. — Sion's Tab agent"""
import json, re, io, base64, sys, urllib.request, concurrent.futures as cf
from urllib.parse import urljoin
OUT = 'public/data/activity.json'; THUMBS = 'public/data/thumbs.json'
CAT = 'https://cedwyn.bucklerfamily.estate/api/catalogue?limit=500&offset=%d'
EVIDX = 'https://cedwyn.bucklerfamily.estate/research/evidence/'
RECON = 'https://bucklerfamily.estate/catalogue/'
OWN = re.compile(r'^https://(cedwyn\.|research\.)?bucklerfamily\.estate/')
UA = {'User-Agent': 'cedwyn-piano-hero/0.4 (+https://bucklerfamily.estate/piano-hero/)'}
def get(u, raw=False, t=60):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r:
        b = r.read(); return b if raw else json.loads(b)

BANNED = re.compile(r'\b(says|claims?|claimed|according to|hearsay|unverified|alleged(ly)?|fraud\w*|stolen|testimony|recollections?)\b|1547|1552', re.I)
EARLY_HOUSE = re.compile(r't[yŷ] mawr|great house|bute|cedfin|cydfin|ken fin', re.I)
HOLDINGS = re.compile(r'\bparcel\b|holding', re.I)
PRIVATE = re.compile(r'\b(Branwen|Sion|Hywel)\b', re.I)
GIVEN = set('Mary John William Thomas David Bruce George Ted Alun Daniel Alfred Amy Ellen Colin Edward Elizabeth Margaret Ann Anne Jane '
            'Sarah James Robert Richard Henry Charles Peter Michael Paul Mark Susan Linda Patricia Jean Joan Doris Evan Ivor Gwyn Gareth '
            'Rhys Dafydd Huw Emrys Glyn Megan Nancy Fred Frederick Billy Bucky Jenkin Owen Hugh Arthur Albert Ernest Frank Harold Walter '
            'Sidney Stanley Dorothy Florence Edith Annie Lily Gladys Hannah Catherine Rose Kate'.split())
ROLE = re.compile(r'(lodger|girl|boy|resident|tenant|farmer|widow|son|daughter),?\s*$', re.I)
def unname(s, yr):
    """No private individuals: from 1940 on (people who may be living), a person's name is dropped unless it is the Williams family (the subject of the record),
    a public office-holder (MP, Lord, Baron) or part of a company or case name."""
    if not yr or yr < 1940: return s
    def sub(m):
        if m.group(1) not in GIVEN or m.group(3) == 'Williams': return m.group(0)
        tail = s[m.end():m.end() + 12]
        if re.match(r"\s*(MP|Ltd|Limited|Windows|&|,\s*1st|Lord)\b", tail): return m.group(0)
        return '\x00' if ROLE.search(s[:m.start()]) else 'a resident'
    out = re.sub(r"\b([A-Z][a-z]+)\s+(\([A-Z][a-z]+\)\s+)?([A-Z][a-z]+)\b", sub, s)
    out = re.sub(r',?\s*\x00,?', '', out)
    return re.sub(r'\s+', ' ', out).strip()
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
TYPEWORD = {'press': 'Press report', 'email': 'Email received', 'map': 'Map', 'letter': 'Letter', 'directory': 'Directory entry'}

def fdate(ds, disp=''):
    ds = (ds or '').strip(); disp = disp or ''
    if BANNED.search(ds): return ''
    if re.match(r'^\d{4}-01-01', ds) and not re.search(r'\b(1|01)\s*Jan|January', disp): ds = ds[:4]
    m = re.match(r'^(\d{4})-(\d\d)-(\d\d)', ds)
    if m and m.group(2) != '00' and m.group(3) != '00': return '%d %s %s' % (int(m.group(3)), MON[int(m.group(2)) - 1], m.group(1))
    m = re.match(r'^(\d{4})-(\d\d)', ds)
    if m and m.group(2) != '00': return '%s %s' % (MON[int(m.group(2)) - 1], m.group(1))
    m = re.match(r'^(\d{4})', ds)
    return m.group(1) if m else ''
def fallback(it):
    d = it.get('data') or {}; t = (d.get('type') or '').strip(); k = it.get('kind')
    if k == 'missing_record': return 'Record not held'
    if k == 'person': return 'Family history record'
    if k == 'media': return (t[:1].upper() + t[1:] if t else 'Press') + ' item'
    return TYPEWORD.get(t.lower(), (t[:1].upper() + t[1:]) if t else 'Catalogue record')
def clean(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    s = re.sub(r'\s*\((?:[^()]*\d{4}[^()]*)\)', '', s)
    s = re.sub(r"\bMr\.? Buckler('s|’s)?\b", lambda m: 'the farmer' + ("'s" if m.group(1) else ''), s)
    s = re.sub(r"\bMrs\.? Buckler('s|’s)?\b", lambda m: 'the family' + ("'s" if m.group(1) else ''), s)
    s = re.sub(r"\b(William|Billy|Fred|Frederick|Bucky|Sion|Hywel|Nancy)(\s+\(\w+\))?\s+Buckler(s'|'s|’s|s)?\b",
               lambda m: 'the family' + ("'s" if m.group(3) else ''), s)
    s = re.sub(r',?\s*\b\d+[a-z]?\s+[A-Z][a-z]+(\s[A-Z][a-z]+)?\s(Road|Close|Street|Lane|Avenue)\b', '', s)
    s = re.sub(r'\s*\((?:lead|not checked)[^()]*\)', '', s)
    s = re.sub(r'(\s[-–—])(\s[-–—])+', r'\1', s)
    s = re.sub(r'[“”"]', '', s).strip(' ,;:-–—|')
    s = re.sub(r'\s+', ' ', s)
    return s[:1].upper() + s[1:]
def words8(s, n=8):
    w = s.split()
    return s if len(w) <= n else ' '.join(w[:n]).rstrip(',;:-–—|/') + '…'
def summarise(it):
    k = it.get('kind'); d = it.get('data') or {}; title = (it.get('title') or '').strip()
    ys = (it.get('date_sort') or '')[:4]; yr = int(ys) if ys.isdigit() else None
    em = d.get('email') or {}
    if k == 'person': s = 'Family history record'
    elif em.get('subject') is not None or title.startswith('Email from'):
        sub = em.get('subject') or ''
        sub = re.sub(r'^\s*((re|fw|fwd|aw|atb|atb/re)\s*[:/]\s*)+', '', sub, flags=re.I)
        sub = re.sub(r'\[[^\]]*\]', '', sub)
        sub = re.sub(r'(?<!\bv )(?<!\bvs )(?<!\bv\. )(?<!/ )(?<!/)\bBuckler\b(?!\s+[Ff]amily)', '', sub)
        sub = re.sub(r'^[\s\-–—:]+|(\s[\-–—])(?=\s[\-–—])', '', sub); sub = re.sub(r'\s{2,}', ' ', sub)
        if re.match(r'\s*(automatic reply|out of office|auto.?reply|ateb awtomatig)', sub, re.I): s = 'Automatic reply received'
        else:
            sub = unname(clean(sub), 2000)
            s = ('Reply: ' + sub) if sub else 'Email received'
            if re.search(r'@|\b(Dear|Mr|Mrs|Ms|Dr)\b', sub): s = 'Email received'
    else:
        t = title
        m = re.match(r'^[^:]{3,90}?,\s*(?:\d{1,2}\s+\w+\s+)?\d{4}[^:]*:\s*(.+)$', t)   # "Outlet, 7 Jun 1892: headline"
        if m: t = m.group(1)
        t = unname(clean(t), yr)
        if k == 'missing_record': t = 'Not held: ' + t
        s = t or fallback(it)
    if BANNED.search(s) or HOLDINGS.search(s) or PRIVATE.search(s) or (yr and yr < 1824 and EARLY_HOUSE.search(s)): s = fallback(it)
    return words8(s)

def thumb(u):
    b = get(u, raw=True, t=40)
    from PIL import Image
    im = Image.open(io.BytesIO(b)).convert('RGB'); w, h = im.size; sc = 200 / max(w, h)
    if sc < 1: im = im.resize((max(1, round(w * sc)), max(1, round(h * sc))), Image.LANCZOS)
    o = io.BytesIO(); im.save(o, 'WEBP', quality=66, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(o.getvalue()).decode()

def main():
    D = json.load(open(OUT))
    # 1. key order
    insts = D['institutions']; n = len(insts); half = n // 2
    def new_index(rank): return (half - 1) + rank if rank <= n - half else n - rank
    old_to_new = {i: new_index(x['rank']) for i, x in enumerate(insts)}
    assert sorted(old_to_new.values()) == list(range(n)), 'ranks must be 1..n'
    new = [None] * n
    for i, x in enumerate(insts): j = old_to_new[i]; x = dict(x); x['n'] = j + 1; new[j] = x
    D['institutions'] = new
    for nt in D['notes']: nt[1] = old_to_new[nt[1]]
    D['order'] = ('by activity: the left half (keys 1-%d) holds the quietest parties, least active on the far left rising towards middle C; '
                  'the right half starts with the most active party on key %d (just above middle C) and grows quieter to key %d; keys numbered left to right') % (half, half + 1, n)
    # 2. labels
    cat = []; off = 0
    while True:
        j = get(CAT % off); cat += j['items']; off += len(j['items'])
        if not j['items'] or off >= j['total']: break
    by = {x['id']: x for x in cat}
    used = sorted({r for nt in D['notes'] for r in (nt[5] if len(nt) > 5 else [])})
    recs = D.get('records') or {}
    for rid in used:
        it = by.get(rid); o = dict(recs.get(rid) or {}); o.pop('h', None); o.pop('img', None)
        if it:
            o.setdefault('k', it.get('kind')); o['d'] = fdate(it.get('date_sort'), it.get('date_display')); o['s'] = summarise(it)
            if not o['d']: o.pop('d')
        recs[rid] = o
    D['records'] = recs
    # 3. pictures
    idx = get(EVIDX, raw=True).decode('utf-8', 'replace'); slugs = {}
    for s in sorted(set(re.findall(r'ev-\d{4}-[a-z0-9-]+', idx))): slugs.setdefault(s[:7].upper(), s)
    def page_img(rid):
        u = EVIDX + slugs[rid] + '/'
        try: h = get(u, raw=True, t=30).decode('utf-8', 'replace')
        except Exception: return rid, None
        m = re.search(r'<main[^>]*>(.*)</main>', h, re.S); h = m.group(1) if m else h
        for src in re.findall(r'<img[^>]+src="([^"]+)"', h):
            if re.search(r'\.(jpe?g|png|webp)(\?|$)', src, re.I) and not re.search(r'/_cedwyn/|logo|icon|og/', src):
                a = urljoin(u, src); return rid, a if OWN.match(a) else None
        return rid, None
    src = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for rid, a in ex.map(page_img, [r for r in used if r in slugs]):
            if a: src[rid] = a
    for rid in used:
        rc = ((by.get(rid) or {}).get('data') or {}).get('recon', {}).get('img')
        if rc: src[rid] = urljoin(RECON, rc); recs[rid]['rc'] = 1
    TH = {}
    def one(it):
        try: return it[0], thumb(it[1])
        except Exception as e: print('thumb failed', it[0], e, file=sys.stderr); return it[0], None
    with cf.ThreadPoolExecutor(6) as ex:
        for rid, t in ex.map(one, sorted(src.items())):
            if t: TH[rid] = t
    for rid in list(recs):
        if 'rc' in recs[rid] and rid not in TH: recs[rid].pop('rc')
    for nt in D['notes']:
        if len(nt) > 5 and nt[5]: nt[5].sort(key=lambda r: 0 if r in TH else 1)
    D['version'] = '0.4.0'; D['schema'] = 'cedwyn-piano-hero/4'
    D.setdefault('counts', {})['pictures'] = len(TH)
    D['counts']['notes_with_picture'] = sum(1 for nt in D['notes'] if len(nt) > 5 and nt[5] and nt[5][0] in TH)
    json.dump(D, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'schema': 'cedwyn-piano-hero-thumbs/1', 'note': 'small webp thumbnails of catalogue pictures, keyed by catalogue ID; made from same-site images', 'thumbs': TH},
              open(THUMBS, 'w'), separators=(',', ':'))
    print(json.dumps({'keys': n, 'top5': [(x['n'], x['name'], x['events']) for x in sorted(new, key=lambda x: x['rank'])[:5]],
                      'records': len(used), 'summaries': sum(1 for r in used if recs[r].get('s')), 'pictures': len(TH),
                      'notes_with_picture': D['counts']['notes_with_picture'], 'notes': len(D['notes'])}))
if __name__ == '__main__':
    main()
