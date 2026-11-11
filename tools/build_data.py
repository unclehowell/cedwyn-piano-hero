#!/usr/bin/env python3
"""Piano Hero data build v0.2.0: activity by party, quarterly 1988-Q1 to 2025-Q4, then monthly from 2026-01 to the current month.

What counts as activity (one count per party per active day; the same day in several sources counts once):
  - emails RECEIVED from an institution (replies, acknowledgements, releases); emails sent to them are not counted.
    Source: the mail manifest when given (--gmail <path>), else the email records in the central catalogue (direction "received").
  - dated records in the central catalogue  https://cedwyn.bucklerfamily.estate/api/catalogue  (documents, releases, notices;
    not email records and not "correspondence record" thread summaries, which are dated at the opening request)
  - first replies in the ERP flows data     unclehowell/cedwyn-erp main public/data/flows.json (request-opened dates are not counted)
  - the forensic activity journal           unclehowell/cedwyn-forensic main journal/<body>/index.html ("Received" and
    "Website" entries; "Sent" entries are not counted)
  - WhatDoTheyKnow responses               tools/inputs/wdtk-responses.json (responses from public bodies on the case requests)
  - watchtower website changes             unclehowell/cedwyn-watchtower main public/data/changes.json (archived-page changes)
    and watch-events.json (released / altered / removed)
  - the Williams family: days on which a received reply, a dated catalogue record or a dated chronology event names the family
    (chronology: unclehowell/cedwyn-wayback main wayback/chronology/chronology.json)

Key order: by activity, centre out. The most active party takes the key nearest the middle of the keyboard, the next ones
alternate either side of it, and the least active sit at the two ends. Keys are numbered 1..N from left to right.

Usage: python3 tools/build_data.py [--out public/data/activity.json] [--gmail manifest.json] [--before old-activity.json]   — Sion's Tab agent
"""
import json, re, sys, datetime, urllib.request, html as H

VERSION = '0.2.0'
UA = {'User-Agent': 'cedwyn-piano-hero/0.2 (+https://bucklerfamily.estate/piano-hero/)'}
CAT = 'https://cedwyn.bucklerfamily.estate/api/catalogue?limit=500&offset=%d'
ERP = 'https://raw.githubusercontent.com/unclehowell/cedwyn-erp/main/public/data/flows.json'
FJ_TREE = 'https://api.github.com/repos/unclehowell/cedwyn-forensic/git/trees/main?recursive=1'
FJ_RAW = 'https://raw.githubusercontent.com/unclehowell/cedwyn-forensic/main/'
WT_RAW = 'https://raw.githubusercontent.com/unclehowell/cedwyn-watchtower/main/public/data/'
CHRONO = 'https://raw.githubusercontent.com/unclehowell/cedwyn-wayback/main/wayback/chronology/chronology.json'
MONTHLY_FROM = 2026   # quarterly rows up to the end of the year before, monthly rows from January of this year
START_YEAR = 1988

# Canonical institutions: (id, display name, [regex patterns matched against a source name or slug, case-insensitive]).
# Syndicated one-off reprints in distant papers (1994-95) are not counted as bodies involved; the local and specialist press is.
# Sub-units are folded into their parent body (Scrutiny into the Council, the Independent Complaints Reviewer into HMLR, ...).
CANON = [
 ('hmlr', 'HM Land Registry', [r'land registry', r'\bhmlr\b', r'hm-land-registry', r'independent complaints reviewer']),
 ('vog', 'Vale of Glamorgan Council', [r'vale of glamorgan council', r'vale-of-glamorgan-council']),
 ('glam-arch', 'Glamorgan Archives', [r'glamorgan archives', r'glamorgan-archives']),
 ('hmcts', 'Ministry of Justice / HMCTS', [r'hmcts', r'ministry of justice', r'courts and tribunals', r'county court', r'court of appeal']),
 ('tna', 'The National Archives', [r'national archives', r'national-archives', r'^tna\b']),
 ('mp', 'Member of Parliament (office)', [r'^member of parliament', r'^member-of-parliament']),
 ('swp', 'South Wales Police', [r'south wales police', r'south-wales-police']),
 ('cadw', 'Cadw (Welsh Government)', [r'\bcadw\b', r'cof cymru']),
 ('wg', 'Welsh Government', [r'^welsh government', r'welsh-government-ministerial']),
 ('nlw', 'National Library of Wales', [r'national library of wales', r'national-library-of-wales', r'welsh newspapers']),
 ('museum', 'Amgueddfa Cymru – Museum Wales', [r'amgueddfa', r'museum wales']),
 ('bp', 'BP', [r'^bp\b', r'^bp[- ]', r'bp properties', r'bp archive']),
 ('itv', 'ITV', [r'\bitv\b']),
 ('lcc', 'Llandough Community Council', [r'llandough community council', r'llandough-community-council']),
 ('dwr', 'Dŵr Cymru Welsh Water', [r'dwr cymru', r'dŵr cymru', r'dwr-cymru']),
 ('legal-reg', 'Legal regulators', [r'legal regulators', r'legal-regulators', r'law society', r'law-society', r'\bsra\b']),
 ('rcahmw', 'RCAHMW (Royal Commission)', [r'rcahmw', r'royal commission', r'coflein']),
 ('smg', 'Science Museum Group', [r'science museum']),
 ('dcms', 'Department for Culture, Media and Sport', [r'culture, media and sport', r'\bdcms\b', r'department-for-culture']),
 ('cvuhb', 'Cardiff and Vale University Health Board', [r'cardiff and vale university health', r'cardiff-and-vale-university']),
 ('heneb', 'Heneb / Historic Environment Record', [r'heneb', r'\bggat\b', r'historic environment record', r'archwilio']),
 ('linklaters', 'Linklaters', [r'linklaters']),
 ('cabinet', "Prime Minister's Office / Cabinet Office", [r'prime minister', r'cabinet office']),
 ('senedd', 'Senedd', [r'senedd']),
 ('coroner', "Coroner's Service (RCT Council)", [r'coroner']),
 ('cotswold', 'Cotswold Archaeology', [r'cotswold archaeolog']),
 ('wlga', 'Local Government Association / WLGA', [r'wlga', r'local government association']),
 ('mod', 'Ministry of Defence', [r'ministry of defence', r'ministry-of-defence']),
 ('bute', 'Mount Stuart (Bute archive)', [r'mount stuart', r'bute archive', r'bute-estate', r'bute estate']),
 ('nio', 'Northern Ireland Office', [r'northern ireland office', r'northern-ireland-office']),
 ('wales-office', 'Wales Office', [r'wales office', r'welsh office', r'welsh-office', r'wales-office']),
 ('persimmon', 'Persimmon Homes', [r'persimmon']),
 ('tfw', 'Transport for Wales', [r'transport for wales']),
 ('nrw', 'Natural Resources Wales', [r'natural resources wales']),
 ('ads', 'Archaeology Data Service', [r'archaeology data service', r'archaeology-data-service']),
 ('audit-wales', 'Audit Wales', [r'audit wales', r'audit-wales']),
 ('bt', 'BT Archives', [r'bt archives', r'bt-archives']),
 ('blake-morgan', 'Blake Morgan LLP', [r'blake morgan', r'blake-morgan']),
 ('register-office', 'Cardiff / Vale Register Office', [r'register office', r'registration service']),
 ('lambeth', 'Church of England archives (Lambeth Palace)', [r'lambeth palace', r'church of england', r'church-of-england']),
 ('nactso', 'Counter Terrorism Policing (NaCTSO)', [r'nactso', r'\bnctso\b', r'counter terrorism']),
 ('cps', 'Crown Prosecution Service', [r'crown prosecution', r'crown-prosecution']),
 ('defra', 'Defra', [r'\bdefra\b']),
 ('ccl', 'Cardiff Central Library', [r'cardiff central library', r'cardiff-central-library']),
 ('bona-vacantia', 'Government Legal Department (Bona Vacantia)', [r'government legal department', r'bona vacantia', r'government-legal-department']),
 ('he', 'Historic England', [r'historic england', r'historic-england']),
 ('ico', "Information Commissioner's Office", [r'information commissioner', r'^ico\b', r'information-commissioner']),
 ('os', 'Ordnance Survey', [r'ordnance survey', r'ordnance-survey']),
 ('phso', 'Parliamentary and Health Service Ombudsman', [r'parliamentary and health service ombudsman', r'parliamentary-and-health']),
 ('pacac', 'Public Administration and Constitutional Affairs Committee', [r'public administration and constitutional', r'public-administration-and-constitutional']),
 ('sfo', 'SFO', [r'^sfo\b', r'serious fraud office']),
 ('postal', 'The Postal Museum', [r'postal museum', r'the-postal-museum']),
 ('voa', 'Valuation Office Agency / HMRC', [r'valuation office', r'valuation-office']),
 ('rics', 'RICS', [r'\brics\b', r'chartered surveyors']),
 ('ace', 'Arts Council England', [r'arts council england', r'arts-council-england']),
 ('ch', 'Companies House', [r'companies house', r'companies-house']),
 ('foc', 'Forest of Cardiff', [r'forest of cardiff', r'forest-of-cardiff']),
 ('capital-law', 'Capital Law', [r'capital law', r'capital-law']),
 ('hugh-james', 'Hugh James / Loosemores', [r'loosemore', r'hugh james', r'hugh-james']),
 ('cardiff-council', 'Cardiff Council', [r'^cardiff council', r'cardiff city council', r'cardiff-city-council', r'^cardiff-council']),
 ('warwick', 'Modern Records Centre (Warwick)', [r'modern records centre', r'warwick']),
 ('darwin-gray', 'Darwin Gray', [r'darwin gray', r'darwin-gray']),
 ('hse', 'Health and Safety Executive', [r'health and safety executive', r'health-and-safety-executive']),
 ('spab', 'SPAB', [r'\bspab\b', r'protection of ancient buildings']),
 ('hbp', 'Historic Buildings & Places', [r'historic buildings & places', r'historic-buildings-places']),
 ('network-rail', 'Network Rail', [r'network rail', r'network-rail']),
 ('oss', 'Open Spaces Society', [r'open spaces society', r'open-spaces-society']),
 ('bgs', 'British Geological Survey', [r'british geological survey', r'british-geological-survey']),
 ('cucap', 'Cambridge Aerial Photography (CUCAP)', [r'cucap', r'cambridge university collection of aerial']),
 ('vicsoc', 'Victorian Society', [r'victorian society', r'victorian-society']),
 ('fsb', 'FSB Wales', [r'fsb wales', r'federation of small businesses']),
 ('sewbrec', 'SEWBReC (Biodiversity Records)', [r'sewbrec']),
 ('gfwi', "Glamorgan Federation of Women's Institutes", [r"women's institutes", r'women-s-institutes']),
 ('wtsww', 'Wildlife Trust of South and West Wales', [r'wildlife trust']),
 ('mawwfrs', 'Mid and West Wales Fire and Rescue', [r'fire and rescue']),
 ('chambers', 'Chambers Wales South East Wales', [r'chambers wales']),
 ('georgian', 'The Georgian Group', [r'georgian group']),
 ('ncap', 'National Collection of Aerial Photography', [r'national collection of aerial']),
 ('pins', 'Planning Inspectorate', [r'planning inspectorate']),
 ('psow', 'Public Services Ombudsman for Wales', [r'public services ombudsman']),
 ('hcr', 'Harrison Clark Rickerbys', [r'harrison clark', r'hcr law']),
 ('mhclg', 'Ministry of Housing, Communities and Local Government', [r'ministry of housing', r'\bmhclg\b']),
 ('cardiff-uni', 'Cardiff University Special Collections', [r'cardiff university']),
 ('echr', 'European Court of Human Rights', [r'european court of human rights', r'european commission of human rights', r'human-rights']),
 ('estates-gazette', 'Estates Gazette', [r'estates gazette']),
 ('echo', 'South Wales Echo', [r'south wales echo']),
 ('cardiff-post', 'Cardiff Post', [r'cardiff post']),
 ('barry-news', 'Barry & District News', [r'barry & district news', r'barry and district news']),
 ('bbc', 'BBC Cymru Wales', [r'\bbbc\b']),
 ('charity-comm', 'Charity Commission', [r'charity commission']),
 ('npcc', "National Police Chiefs' Council", [r'police chiefs', r'\bnpcc\b']),
 ('post-office', 'Post Office Limited', [r'post office limited', r'post office ltd']),
 ('penarth-times', 'Penarth Times', [r'penarth times']),
 ('gazette', 'The London Gazette', [r'london gazette']),
 ('pcw', "People's Collection Wales", [r"people's collection wales"]),
 ('law-com', 'Law Commission', [r'law com']),
 ('jcpc', 'Judicial Committee of the Privy Council', [r'privy council']),
 ('bailii', 'BAILII (court judgments)', [r'bailii']),
 ('wgr', 'Western Ground Rents Ltd', [r'western ground rents', r'western-ground-rents']),
]
CANON_RX = [(cid, name, [re.compile(p, re.I) for p in pats]) for cid, name, pats in CANON]

def match(s):
    if not s: return None
    for cid, name, rxs in CANON_RX:
        if any(r.search(s) for r in rxs): return cid
    return None

def get(url, js=True):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        b = r.read().decode('utf-8')
    return json.loads(b) if js else b

WILLIAMS = re.compile(r'\bWilliams\b')
NOT_FAMILY = re.compile(r'NOT OUR|disambiguation|Thomas Williams|J\. ?M\. Williams|Rev\. F|Frank\) Williams', re.I)
WT_INST = {'tna': 'tna', 'her': 'heneb', 'coflein': 'rcahmw', 'lcc': 'lcc', 'nlw': 'nlw', 'cadw': 'cadw', 'swp': 'swp', 'vale': 'vog',
           'hmlr': 'hmlr', 'glam': 'glam-arch', 'museum': 'museum', 'mod': 'mod', 'gazette': 'gazette', 'wg': 'wg', 'ads': 'ads',
           'ch': 'ch', 'bute': 'bute', 'pcw': 'pcw', 'bp': 'bp', 'dwr': 'dwr', 'cardiff': 'cardiff-council', 'archwilio': 'heneb',
           'bailii': 'bailii'}
WT_HOST = [(r'land-registry', 'hmlr'), (r'cotswoldarchaeology', 'cotswold'), (r'nationalarchives', 'tna'), (r'coflein', 'rcahmw'),
           (r'archwilio', 'heneb'), (r'museum\.wales', 'museum'), (r'cadw', 'cadw'), (r'llyfrgell|library\.wales', 'nlw')]

def period(d):
    """yyyy-mm-dd -> the row label: 'yyyy-Qn' before MONTHLY_FROM, 'yyyy-mm' from it."""
    if len(d) < 7 or not d[5:7].isdigit() or d[5:7] == '00': return None
    y, m = int(d[:4]), int(d[5:7])
    return '%d-%02d' % (y, m) if y >= MONTHLY_FROM else '%d-Q%d' % (y, (m - 1) // 3 + 1)

def is_white(m): return m % 12 in (0, 2, 4, 5, 7, 9, 11)

def key_centres(n):
    """Centre of each of n consecutive piano keys, as the app draws them (same geometry as assets/ph.js)."""
    best = None
    for s in range(21, 109 - n + 1):
        if is_white(s) and is_white(s + n - 1):
            c = abs(s + (n - 1) / 2 - 62)
            if best is None or c < best[1]: best = (s, c)
    s = best[0] if best else 21
    B, ks, w = 0.6, [], 0
    for i in range(n):
        m = s + i
        if is_white(m): ks.append((w, w + 1)); w += 1
        else: ks.append((w - B / 2, w + B / 2))
    total = w + (0 if is_white(s + n - 1) else B / 2)
    return [((a + b) / 2) / total * 100 for a, b in ks]

def centre_out(n):
    """Key indices from the middle of the keyboard outwards, alternating sides (left first on a tie)."""
    c = key_centres(n)
    return sorted(range(n), key=lambda i: (round(abs(c[i] - 50), 6), c[i]))

def main():
    out = 'public/data/activity.json'
    arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
    out = arg('--out') or out
    today = datetime.date.today()
    days = {}        # (cid, yyyy-mm-dd) -> set(sources)
    unmatched = {}
    excluded = {'email_sent': 0, 'journal_sent': 0, 'erp_opened': 0, 'correspondence_records': 0, 'email_private': 0}
    def ok(d):
        return bool(d) and re.match(r'^\d{4}-\d\d-\d\d', d) and d[5:7] != '00' and d[8:10] != '00' and int(d[:4]) >= START_YEAR and d[:10] <= today.isoformat()
    def hit(cid, d, src, label):
        if not ok(d or ''): return
        if cid is None:
            unmatched[label] = unmatched.get(label, 0) + 1; return
        days.setdefault((cid, d[:10]), set()).add(src)
    # 1. central catalogue
    recs, off = [], 0
    while True:
        j = get(CAT % off); items = j.get('items') or []
        recs += items; off += len(items)
        if not items or off >= j.get('total', 0): break
    cat_emails = []
    for r in recs:
        d = r.get('date_sort') or ''
        data = r.get('data') or {}
        em = data.get('email') or {}
        if r.get('kind') == 'email' or em:
            cat_emails.append(r); continue
        if (data.get('type') or '') == 'correspondence record':
            excluded['correspondence_records'] += 1; continue
        n = r.get('holder')
        if n and n.startswith('Cedwyn email archive'): continue
        hit(match(n), d, 'catalogue', (n or '')[:60])
        t = ' '.join(str(r.get(k) or '') for k in ('title', 'summary'))
        if WILLIAMS.search(t) and not NOT_FAMILY.search(t): hit('williams', d, 'williams', 'williams')
    # 2. emails received (mail manifest if given, else the catalogue's email records)
    gm = arg('--gmail'); n_recv = 0
    if gm:
        mails = json.load(open(gm, encoding='utf-8'))['messages']
        rows = [(x.get('direction'), (x.get('date') or '')[:10], [x.get('institution')], (x.get('subject') or '') + ' ' + (x.get('summary') or ''), x.get('private')) for x in mails]
        email_src = 'mail manifest'
    else:
        rows = []
        for r in cat_emails:
            em = (r.get('data') or {}).get('email') or {}
            rows.append((em.get('direction'), (r.get('date_sort') or '')[:10], [i.get('name') for i in (em.get('institutions') or [])], em.get('subject') or '', False))
        email_src = 'catalogue email records'
    for direction, d, insts, text, private in rows:
        if direction != 'received': excluded['email_sent'] += 1; continue
        if private: excluded['email_private'] += 1; continue
        n_recv += 1
        for n in insts: hit(match(n), d, 'email', 'email: ' + (n or '')[:50])
        if WILLIAMS.search(text) and not NOT_FAMILY.search(text): hit('williams', d, 'williams', 'williams')
    # 3. ERP flows: first replies only
    fl = get(ERP)
    def walk(o, cid):
        if isinstance(o, dict):
            if isinstance(o.get('first_reply'), str): hit(cid, o['first_reply'][:10], 'erp', o.get('title', '')[:40])
            if isinstance(o.get('opened'), str): excluded['erp_opened'] += 1
            for v in o.values(): walk(v, cid)
        elif isinstance(o, list):
            for v in o: walk(v, cid)
    for body in fl.get('bodies', []):
        cid = match(body.get('name')) or match(body.get('id'))
        if cid is None: unmatched['ERP: ' + body.get('name', '')] = 1; continue
        walk(body.get('lines'), cid)
    # 4. forensic journal: received and website entries
    tree = get(FJ_TREE).get('tree', [])
    pages = [t['path'] for t in tree if re.match(r'^journal/[^/]+/index\.html$', t['path'])]
    fj_n = fj_web = 0
    for pth in pages:
        slug = pth.split('/')[1]
        h = get(FJ_RAW + pth, js=False)
        m = re.search(r'<h1>(.*?)</h1>', h, re.S)
        name = H.unescape(re.sub(r'<[^>]+>', '', m.group(1))).replace(': activity journal', '').strip() if m else slug
        cid = match(name) or match(slug)
        for t, kind in re.findall(r'<div class="m"><time datetime="(\d{4}-\d\d-\d\d)"[^>]*>[^<]*</time><span class="d-([a-z-]+)"', h):
            if kind == 'sent': excluded['journal_sent'] += 1; continue
            fj_n += 1
            if kind == 'web': fj_web += 1; hit(cid, t, 'website', 'journal web: ' + name)
            else: hit(cid, t, 'journal', 'journal: ' + name)
    # 5. WhatDoTheyKnow responses
    wdtk = json.load(open('tools/inputs/wdtk-responses.json', encoding='utf-8'))['responses']
    for w in wdtk: hit(match(w['body']), w['date'], 'wdtk', 'wdtk: ' + w['body'])
    # 6. watchtower website changes
    chg = get(WT_RAW + 'changes.json'); wt_n = 0
    inst_names = {i['id']: i['name'] for i in chg.get('institutions', [])}
    for c in chg.get('changes', []):
        wt_n += 1; hit(WT_INST.get(c.get('inst')) or match(inst_names.get(c.get('inst'))), c.get('date'), 'website', 'watchtower: ' + str(c.get('inst')))
    wev = get(WT_RAW + 'watch-events.json'); wev = wev.get('events', wev) if isinstance(wev, dict) else wev
    for e in wev:
        if e.get('type') not in ('released', 'altered', 'removed'): continue
        url = e.get('page_url') or e.get('url') or ''
        cid = next((c for rx, c in WT_HOST if re.search(rx, url)), None) or WT_INST.get(e.get('inst'))
        wt_n += 1; hit(cid, e.get('date'), 'website', 'watch-event: ' + str(e.get('inst')))
    # 7. chronology events naming the Williams family
    ch = get(CHRONO); ch_n = 0
    for e in ch.get('events', []):
        t = e.get('event') or ''
        if WILLIAMS.search(t) and not NOT_FAMILY.search(t) and ok(e.get('sort') or ''):
            ch_n += 1; hit('williams', e['sort'], 'williams', 'chronology')
    # rows: quarters to the end of MONTHLY_FROM-1, then months to the current month
    rows = ['%d-Q%d' % (y, q) for y in range(START_YEAR, MONTHLY_FROM) for q in range(1, 5)]
    switch = len(rows)
    rows += ['%d-%02d' % (y, m) for y in range(MONTHLY_FROM, today.year + 1) for m in range(1, 13) if (y, m) <= (today.year, today.month)]
    ri = {r: i for i, r in enumerate(rows)}
    cells, tot, firstq = {}, {}, {}
    src_n = {s: 0 for s in ('catalogue', 'email', 'erp', 'journal', 'wdtk', 'website', 'williams')}
    for (cid, d), srcs in days.items():
        p = period(d)
        if p not in ri: continue
        k = (cid, ri[p]); cells[k] = cells.get(k, 0) + 1
        tot[cid] = tot.get(cid, 0) + 1
        firstq[cid] = min(firstq.get(cid, 10**6), ri[p])
        for s in srcs: src_n[s] += 1
    names = {cid: name for cid, name, _ in CANON}; names['williams'] = 'Williams family'
    occ = {}
    for (c, q) in cells: occ[c] = occ.get(c, 0) + 1
    MAXKEYS = 88
    rank = sorted(tot, key=lambda c: (-tot[c], -occ[c], firstq[c], names[c]))
    keep = rank[:MAXKEYS]; left_out = [names[c] for c in rank[MAXKEYS:]]
    slots = centre_out(len(keep))           # slots[r] = key index for the party of rank r
    order = [None] * len(keep)
    for r, c in enumerate(keep): order[slots[r]] = c
    cells = {k: v for k, v in cells.items() if k[0] in keep}
    inst = [{'n': i + 1, 'id': c, 'name': names[c], 'events': tot[c], 'cells': occ[c], 'rank': keep.index(c) + 1, 'first': rows[firstq[c]]} for i, c in enumerate(order)]
    col = {c: i for i, c in enumerate(order)}
    notes = sorted([[q, col[c], n] for (c, q), n in cells.items()])
    data = {'schema': 'cedwyn-piano-hero/2', 'version': VERSION, 'generated': today.isoformat(),
            'unit': 'one party active on one day; a cell counts active days in the quarter (to 2025) or the month (from 2026)',
            'order': 'by activity, centre out: the most active party on the middle key, the least active at both ends; keys numbered left to right',
            'sources': {'email': 'emails received from institutions (%d; emails sent are not counted)' % n_recv,
                        'catalogue': 'central catalogue dated records (%d records read)' % len(recs),
                        'erp': 'ERP request data, first replies (%d bodies)' % len(fl.get('bodies', [])),
                        'journal': 'forensic activity journal, received and website entries (%d pages, %d entries)' % (len(pages), fj_n),
                        'wdtk': 'WhatDoTheyKnow responses on the case requests (%d)' % len(wdtk),
                        'website': 'watchtower website changes (%d, plus %d journal website entries)' % (wt_n, fj_web),
                        'williams': 'records naming the Williams family (replies, catalogue records, %d chronology events)' % ch_n},
            'source_days': src_n,
            'rows': rows, 'monthly_from': switch, 'institutions': inst, 'notes': notes,
            'left_out': left_out, 'counts': {'institutions': len(inst), 'events': sum(tot[c] for c in keep), 'occupied_cells': len(notes),
                                             'rows': len(rows), 'quarterly_rows': switch, 'monthly_rows': len(rows) - switch}}
    with open(out, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(data['counts']), 'source days', json.dumps(src_n))
    print('excluded', json.dumps(excluded), 'email source', email_src, 'received', n_recv)
    print('rank', json.dumps([(names[c], tot[c]) for c in rank]))
    if '--unmatched' in sys.argv:
        for k, v in sorted(unmatched.items(), key=lambda kv: -kv[1])[:80]: print('  unmatched', v, k)

if __name__ == '__main__': main()
