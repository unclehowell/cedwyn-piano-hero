#!/usr/bin/env python3
"""Piano Hero data build: institution activity by calendar quarter, 1988-Q1 to the current quarter.

Sources (all public, read-only):
  1. the central catalogue      https://cedwyn.bucklerfamily.estate/api/catalogue  (date_sort + holder / email institutions)
  2. the ERP flows data         unclehowell/cedwyn-erp main public/data/flows.json  (request opened, first reply, last message, checks)
  3. the forensic journal       unclehowell/cedwyn-forensic main journal/<body>/index.html  (dated journal entries)

An event is one institution active on one day (the same day seen in two sources counts once). A cell holds the number of
active days that institution had in that quarter. Only institutions and organisations are kept: anything that does not
match the canonical list below (private individuals, the family archive, websites, social media groups) is left out.

Usage: python3 tools/build_data.py [--out public/data/activity.json]          — Sion's Tab agent
"""
import json, re, sys, datetime, urllib.request, html as H

VERSION = '0.1.0'
UA = {'User-Agent': 'cedwyn-piano-hero/0.1 (+https://bucklerfamily.estate/piano-hero/)'}
CAT = 'https://cedwyn.bucklerfamily.estate/api/catalogue?limit=500&offset=%d'
ERP = 'https://raw.githubusercontent.com/unclehowell/cedwyn-erp/main/public/data/flows.json'
FJ_TREE = 'https://api.github.com/repos/unclehowell/cedwyn-forensic/git/trees/main?recursive=1'
FJ_RAW = 'https://raw.githubusercontent.com/unclehowell/cedwyn-forensic/main/'
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
 ('heneb', 'Heneb / Historic Environment Record', [r'heneb', r'\bggat\b', r'historic environment record']),
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
 ('nactso', 'Counter Terrorism Policing (NaCTSO)', [r'nactso', r'counter terrorism']),
 ('cps', 'Crown Prosecution Service', [r'crown prosecution', r'crown-prosecution']),
 ('defra', 'Defra', [r'\bdefra\b']),
 ('ccl', 'Cardiff Central Library', [r'cardiff central library', r'cardiff-central-library']),
 ('bona-vacantia', 'Government Legal Department (Bona Vacantia)', [r'government legal department', r'bona vacantia', r'government-legal-department']),
 ('he', 'Historic England', [r'historic england', r'historic-england']),
 ('ico', "Information Commissioner's Office", [r'information commissioner', r'^ico\b', r'information-commissioner']),
 ('os', 'Ordnance Survey', [r'ordnance survey', r'ordnance-survey']),
 ('phso', 'Parliamentary and Health Service Ombudsman', [r'parliamentary and health service ombudsman', r'parliamentary-and-health']),
 ('pacac', 'Public Administration and Constitutional Affairs Committee', [r'public administration and constitutional', r'public-administration-and-constitutional']),
 ('sfo', 'Serious Fraud Office', [r'^sfo\b', r'serious fraud office']),
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

def quarter(d):
    y, m = int(d[:4]), int(d[5:7]) if len(d) >= 7 and d[5:7].isdigit() and d[5:7] != '00' else None
    if m is None: return None
    return '%d-Q%d' % (y, (m - 1) // 3 + 1)

def main():
    out = 'public/data/activity.json'
    if '--out' in sys.argv: out = sys.argv[sys.argv.index('--out') + 1]
    today = datetime.date.today()
    days = {}        # (cid, yyyy-mm-dd or yyyy-mm) -> set(sources)
    unmatched = {}
    def hit(cid, d, src, label):
        if not d or not re.match(r'^\d{4}-\d\d', d): return
        if int(d[:4]) < START_YEAR or d[:10] > today.isoformat(): return
        if d[5:7] == '00': return
        if cid is None:
            unmatched[label] = unmatched.get(label, 0) + 1; return
        days.setdefault((cid, d[:10]), set()).add(src)
    # 1. catalogue
    recs, off = [], 0
    while True:
        j = get(CAT % off); items = j.get('items') or []
        recs += items; off += len(items)
        if not items or off >= j.get('total', 0): break
    for r in recs:
        d = r.get('date_sort') or ''
        em = ((r.get('data') or {}).get('email') or {})
        names = [i.get('name') for i in (em.get('institutions') or [])] or [r.get('holder')]
        for n in names:
            if n and n.startswith('Cedwyn email archive'): continue
            hit(match(n), d, 'catalogue', (n or '')[:60])
    # 2. ERP flows
    fl = get(ERP)
    def walk(o, cid):
        if isinstance(o, dict):
            for k in ('opened', 'first_reply', 'last', 'date'):
                v = o.get(k)
                if isinstance(v, str): hit(cid, v[:10], 'erp', o.get('title', '')[:40])
            for v in o.values(): walk(v, cid)
        elif isinstance(o, list):
            for v in o: walk(v, cid)
    for body in fl.get('bodies', []):
        cid = match(body.get('name')) or match(body.get('id'))
        if cid is None: unmatched['ERP: ' + body.get('name', '')] = 1; continue
        walk(body.get('lines'), cid)
    # 3. forensic journal
    tree = get(FJ_TREE).get('tree', [])
    pages = [t['path'] for t in tree if re.match(r'^journal/[^/]+/index\.html$', t['path'])]
    fj_n = 0
    for pth in pages:
        slug = pth.split('/')[1]
        h = get(FJ_RAW + pth, js=False)
        m = re.search(r'<h1>(.*?)</h1>', h, re.S)
        name = H.unescape(re.sub(r'<[^>]+>', '', m.group(1))).replace(': activity journal', '').strip() if m else slug
        cid = match(name) or match(slug)
        for t in re.findall(r'<div class="m"><time datetime="(\d{4}-\d\d-\d\d)"', h):
            fj_n += 1; hit(cid, t, 'journal', 'journal: ' + name)
    # quarters
    y1 = today.year; q1 = (today.month - 1) // 3 + 1
    quarters = ['%d-Q%d' % (y, q) for y in range(START_YEAR, y1 + 1) for q in range(1, 5) if (y, q) <= (y1, q1)]
    qi = {q: i for i, q in enumerate(quarters)}
    cells, tot, firstq, src_n = {}, {}, {}, {'catalogue': 0, 'erp': 0, 'journal': 0}
    for (cid, d), srcs in days.items():
        q = quarter(d)
        if q not in qi: continue
        k = (cid, qi[q]); cells[k] = cells.get(k, 0) + 1
        tot[cid] = tot.get(cid, 0) + 1
        firstq[cid] = min(firstq.get(cid, 10**6), qi[q])
        for s in srcs: src_n[s] += 1
    names = {cid: name for cid, name, _ in CANON}
    MAXKEYS = 88   # a full piano; if more bodies are active, the least active are left out (named in 'left_out')
    keep = sorted(tot, key=lambda c: (-tot[c], firstq[c], names[c]))[:MAXKEYS]
    left_out = [names[c] for c in tot if c not in keep]
    order = sorted(keep, key=lambda c: (firstq[c], -tot[c], names[c]))
    for c in list(tot):
        if c not in keep: tot.pop(c)
    cells = {k: v for k, v in cells.items() if k[0] in keep}
    inst = [{'n': i + 1, 'id': c, 'name': names[c], 'events': tot[c], 'first': quarters[firstq[c]]} for i, c in enumerate(order)]
    col = {c: i for i, c in enumerate(order)}
    notes = sorted([[q, col[c], n] for (c, q), n in cells.items()])
    data = {'schema': 'cedwyn-piano-hero/1', 'version': VERSION, 'generated': today.isoformat(),
            'unit': 'one institution active on one day; a cell counts active days in the quarter',
            'order': 'by first quarter of activity, then by total activity',
            'sources': {'catalogue': 'central catalogue API (%d records read)' % len(recs),
                        'erp': 'ERP flows data (%d bodies)' % len(fl.get('bodies', [])),
                        'journal': 'forensic activity journal (%d pages, %d entries)' % (len(pages), fj_n)},
            'source_days': src_n,
            'quarters': quarters, 'institutions': inst, 'notes': notes,
            'left_out': left_out, 'counts': {'institutions': len(inst), 'events': sum(tot.values()), 'occupied_cells': len(notes), 'quarters': len(quarters)}}
    with open(out, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(data['counts']), 'source days', json.dumps(src_n))
    if '--unmatched' in sys.argv:
        for k, v in sorted(unmatched.items(), key=lambda kv: -kv[1])[:80]: print('  unmatched', v, k)

if __name__ == '__main__': main()
