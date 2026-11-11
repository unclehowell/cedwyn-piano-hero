#!/usr/bin/env python3
"""Piano Hero data build v0.3.0: activity by party from a short count-in before the 1500s to the current month.
Rows (v0.3.0): LEAD_IN blank years (1496-1499), the 1500s as one row (the 1,000-year lease and the other 16th-century records),
one row a year 1600-1987, quarters 1988-Q1 to 2025-Q4, months from 2026-01. Records dated before 1500 are left out (listed in the
build output). Editorial rule: Bute papers dated before 1824 are not placed on the timeline (listed in the build output).
Each note carries up to 3 catalogue IDs, its days that are verbatim source records or transcripts ('v') and its days that are
press coverage, later citation or interpretation ('p'); days in neither class show under "All" only. Label facts per catalogue
ID (kind, type, a public title for pre-1900 records, a picture from the record's own Cedwyn page) are in 'records'.

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

Key order (v0.3.0): by activity, rising to the right. The least active party is on the far left key, the most active on the far
right, so the left half holds only the least active parties (the busiest of them nearest the centre). Keys are numbered 1..N
from left to right. (v0.2.0 ordered them centre out; centre_out() is kept for reference.)

Usage: python3 tools/build_data.py [--out public/data/activity.json] [--gmail manifest.json] [--before old-activity.json]   — Sion's Tab agent
"""
import json, re, sys, datetime, urllib.request, html as H

VERSION = '0.3.0'
UA = {'User-Agent': 'cedwyn-piano-hero/0.3 (+https://bucklerfamily.estate/piano-hero/)'}
CAT = 'https://cedwyn.bucklerfamily.estate/api/catalogue?limit=500&offset=%d'
ERP = 'https://raw.githubusercontent.com/unclehowell/cedwyn-erp/main/public/data/flows.json'
FJ_TREE = 'https://api.github.com/repos/unclehowell/cedwyn-forensic/git/trees/main?recursive=1'
FJ_RAW = 'https://raw.githubusercontent.com/unclehowell/cedwyn-forensic/main/'
WT_RAW = 'https://raw.githubusercontent.com/unclehowell/cedwyn-watchtower/main/public/data/'
CHRONO = 'https://raw.githubusercontent.com/unclehowell/cedwyn-wayback/main/wayback/chronology/chronology.json'
MONTHLY_FROM = 2026   # quarterly rows up to the end of the year before, monthly rows from January of this year
START_YEAR = 1500     # v0.3.0: the record starts with the 1500s row (the 1,000-year lease), after LEAD_IN blank years
LEAD_IN = 4          # blank year rows before the 1500s row (a short count-in)
QUARTERLY_FROM = 1988 # one row per year from 1600 to 1987, per quarter from 1988, per month from MONTHLY_FROM
CAT_ONE = 'https://cedwyn.bucklerfamily.estate'

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
# v0.3.0: catalogue records whose holder is not one of the bodies above fall into these groups (catalogue holders only)
GROUPS = [
 ('parliament', 'Parliament and legislation (Hansard, statutes)', [r'hansard', r'house of commons', r'\bhc deb\b', r'legislation\.gov', r'parliamentary archives', r'commons journal', r'limitation act', r'board of trade journal']),
 ('press', 'Newspapers and magazines', [r'western mail', r'\bnews\b', r'echo\b', r'courier', r'express', r'herald', r'telegraph', r'\bstar\b', r'times', r'standard', r'statesman', r'mercury', r'courant', r'tarian', r'newspaper', r'cutting', r'clipping', r'\bmail\b', r'financial times', r'current archaeology']),
 ('family-repo', 'Family evidence repository and wiki', [r'cedwyn evidence repository', r'wiki media library', r'cedwyn research library', r'great house farm wiki', r'bucklerfamily\.estate', r'family account', r'family papers', r'gmail thread', r'original correspondence', r'uploaded copy', r'datro repository', r'family post']),
 ('printed', 'Printed books, journals and directories', [r'archive\.org', r'internet archive', r'directories', r"kelly's", r'british history online', r'dictionary of welsh biography', r'\bbook\b', r'journal', r'\bdoi\b', r'archaeopress', r'medieval archaeology', r'place names', r'chappell', r'press\b.*university|university press', r'research framework', r'probate registry', r'isbn']),
 ('online', 'Websites, blogs, video and social media', [r'blog', r'youtube', r'facebook', r'instagram', r'rootsweb', r'wikimedia', r'nub news', r'vlex', r'casemine', r'casemap', r'\bpmc\b', r'ipsa loquitur', r'heirs and successes', r'course notes', r'teaching notes', r'gatehouse', r'ljmu', r'allen & overy', r'https?://', r'\.org\.uk', r'\.co\.uk', r'online']),
 ('holder-unknown', 'Holder not stated or not located', [r'^$', r'^not stated', r'holder unknown', r'^not identified', r'^not located', r'^not established', r'holder not located', r'not located']),
]
GROUPS_RX = [(cid, name, [re.compile(p, re.I) for p in pats]) for cid, name, pats in GROUPS]
def group(s):
    s = (s or '').strip()
    for cid, name, rxs in GROUPS_RX:
        if any(r.search(s) for r in rxs): return cid
    return None

# v0.3.0 filter classes: 'v' = verbatim source record or transcript (not a second account); 'p' = press coverage, later
# citation and interpretation; None = not classified (shown under "All" only).
P_LABEL = re.compile(r'press|secondary|snippet|catalogue entry|catalogue read|analysis|research artifact|citation|newspaper text', re.I)
V_LABEL = re.compile(r'primary document held|primary record|primary \(photograph\)|reply attachment|public record|public register|official notice|legislation|map read|printed source|correspondence read|^email', re.I)
P_TYPE = re.compile(r'press|newspaper|blog|commentary|secondary|social|youtube|catalogue|monument record|analysis|database|directory entry|archive series|archive items|journal$|reconstruction', re.I)
V_TYPE = re.compile(r'^email|foi|letter|deed|lease|tenancy|court record|judgment|law-report|official|land registry|statute|statutory|gazette|notice|map|photo|reply attachment|minutes|planning|register entry|survey|directory|census|transcript|edited early source|edition of charters|early county description|act book|agreement|conveyance|probate|will\b', re.I)
NOT_HELD = re.compile(r'not yet held|not held|pending|sought|should exist|not found|not located|not seen|not yet obtained', re.I)
def classify(r):
    d = r.get('data') or {}; lab = d.get('label') or ''; t = d.get('type') or ''; st = r.get('status') or ''
    if r.get('kind') == 'media': return 'p'
    if r.get('kind') in ('missing_record', 'person', 'catalogue_candidate'): return None
    if (d.get('medium') or '').lower().startswith('painted'): return 'p'
    if lab:
        if re.search(r'not yet held|family account', lab, re.I): return None
        if P_LABEL.search(lab): return 'p'
        if V_LABEL.search(lab): return 'v'
    if not t or t in ('other', 'oral/family account'): return None
    if P_TYPE.search(t): return 'p'
    if V_TYPE.search(t): return None if NOT_HELD.search(st) else 'v'
    return None
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
    """yyyy-mm-dd (month and day may be 00) -> the row label: '1500s' for the 16th century, 'yyyy' from 1600 to QUARTERLY_FROM-1,
    'yyyy-Qn' to MONTHLY_FROM-1, 'yyyy-mm' from it. A date with no month after QUARTERLY_FROM has no row."""
    y = int(d[:4])
    if y < START_YEAR: return None
    if y < 1600: return '1500s'
    if y < QUARTERLY_FROM: return str(y)
    if len(d) < 7 or not d[5:7].isdigit() or d[5:7] == '00': return None
    m = int(d[5:7])
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

def right_lean(n):
    """v0.3.0 key order: rank r (0 = most active) -> key index. Keys run from the least active party at the far left to the most
    active at the far right, so the left half holds only the least active parties (the busiest of them nearest the centre)."""
    return [n - 1 - r for r in range(n)]

def centre_out(n):
    """Key indices from the middle of the keyboard outwards, alternating sides (left first on a tie)."""
    c = key_centres(n)
    return sorted(range(n), key=lambda i: (round(abs(c[i] - 50), 6), c[i]))

BANNED = re.compile(r'\b(says|claims?|claimed|according to|hearsay|unverified|alleged(ly)?|fraud\w*|stolen|testimony|recollections?)\b|1547|1552', re.I)
EARLY_HOUSE = re.compile(r't[yŷ] mawr|great house|bute|cedfin|cydfin|ken fin', re.I)
HOLDINGS = re.compile(r'\bparcel\b|holding', re.I)
def label_facts(r, img):
    """What a label may show for one catalogue record: id, kind, type, picture. The title only for records dated before 1900
    (historic records, not emails or people), never with banned words or digits, never a pre-1824 title naming the house."""
    d = r.get('data') or {}; ds = (r.get('date_sort') or '')[:4]; title = (r.get('title') or '').strip()
    o = {'k': r.get('kind'), 't': (d.get('type') or r.get('kind') or '')[:48]}
    if img: o['img'] = img
    if (ds.isdigit() and int(ds) < 1900 and r.get('kind') in ('evidence', 'artifact', 'media') and title and not BANNED.search(title)
            and not HOLDINGS.search(title) and not (int(ds) < 1824 and EARLY_HOUSE.search(title))):
        o['h'] = title if len(title) <= 96 else title[:93].rsplit(' ', 1)[0] + '…'
    return o

def find_thumbs(ids, refinfo):
    """Catalogue id -> the first picture on the record's own Cedwyn page (same-site images only), when it has one."""
    import concurrent.futures as cf
    todo = [(i, refinfo[i].get('page')) for i in ids if i in refinfo and refinfo[i].get('page')]
    def one(it):
        i, pg = it
        u = pg if pg.startswith('http') else CAT_ONE + pg
        if not re.match(r'^https://(cedwyn\.|research\.)?bucklerfamily\.estate/', u): return i, None
        try: h = get(u, js=False)
        except Exception: return i, None
        m = re.search(r'<main[^>]*>(.*)</main>', h, re.S); h = m.group(1) if m else h
        for src in re.findall(r'<img[^>]+src="([^"]+)"', h):
            if re.search(r'\.(jpe?g|png|webp)(\?|$)', src, re.I) and not re.search(r'/_cedwyn/|logo|icon|og/', src):
                base = re.match(r'^(https://[^/]+)', u).group(1)
                return i, src if src.startswith('https://') else (base + src if src.startswith('/') else None)
        return i, None
    out = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for i, img in ex.map(one, todo):
            if img and re.match(r'^https://(cedwyn\.|research\.)?bucklerfamily\.estate/', img): out[i] = img
    return out

def main():
    out = 'public/data/activity.json'
    arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
    out = arg('--out') or out
    today = datetime.date.today()
    days = {}        # (cid, yyyy-mm-dd) -> set(sources)
    unmatched = {}
    excluded = {'email_sent': 0, 'journal_sent': 0, 'erp_opened': 0, 'correspondence_records': 0, 'email_private': 0}
    def norm(d):
        d = (d or '')[:10]
        if re.match(r'^\d{4}$', d): d += '-00-00'
        if re.match(r'^\d{4}-\d\d$', d): d += '-00'
        return d
    def ok(d):
        d = norm(d)
        if not re.match(r'^\d{4}-\d\d-\d\d$', d) or int(d[:4]) < START_YEAR or d > today.isoformat(): return False
        return int(d[:4]) < QUARTERLY_FROM or (d[5:7] != '00' and d[8:10] != '00')
    refinfo = {}     # catalogue id -> record facts for the label
    def hit(cid, d, src, label, cls=None, ref=None):
        if not ok(d or ''): return
        if cid is None:
            unmatched[label] = unmatched.get(label, 0) + 1; return
        o = days.setdefault((cid, norm(d)), {'src': set(), 'cls': set(), 'refs': []})
        o['src'].add(src)
        if cls: o['cls'].add(cls)
        if ref and ref not in o['refs']: o['refs'].append(ref)
    # 1. central catalogue
    recs, off = [], 0
    while True:
        j = get(CAT % off); items = j.get('items') or []
        recs += items; off += len(items)
        if not items or off >= j.get('total', 0): break
    cat_emails = []; before_start = []; bute_early = []
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
        if re.match(r'^\d{4}', d) and 0 < int(d[:4]) < START_YEAR: before_start.append(r['id']); continue
        t = ' '.join(str(r.get(k) or '') for k in ('title', 'summary'))
        # editorial rule: Bute papers are never placed on the timeline as dated records before 1824 (the first found mention)
        if re.match(r'^\d{4}', d) and int(d[:4]) < 1824 and re.search(r'\bbute\b', (n or '') + ' ' + t, re.I):
            bute_early.append(r['id']); continue
        cls = classify(r); rid = r.get('id')
        refinfo[rid] = r
        hit(match(n) or group(n), d, 'catalogue', (n or '')[:60], cls, rid)
        if WILLIAMS.search(t) and not NOT_FAMILY.search(t): hit('williams', d, 'williams', 'williams', cls, rid)
    # 2. emails received (mail manifest if given, else the catalogue's email records)
    gm = arg('--gmail'); n_recv = 0
    ev_of = {}
    for r in cat_emails:
        refinfo[r['id']] = r
        for a in (r.get('alias'), ((r.get('data') or {}).get('email') or {}).get('message_id')):
            if a: ev_of[a] = r['id']
    if gm:
        mails = json.load(open(gm, encoding='utf-8'))['messages']
        rows = [(x.get('direction'), (x.get('date') or '')[:10], [x.get('institution')], (x.get('subject') or '') + ' ' + (x.get('summary') or ''), x.get('private'), ev_of.get(x.get('id'))) for x in mails]
        email_src = 'mail manifest'
    else:
        rows = []
        for r in cat_emails:
            em = (r.get('data') or {}).get('email') or {}
            rows.append((em.get('direction'), (r.get('date_sort') or '')[:10], [i.get('name') for i in (em.get('institutions') or [])], em.get('subject') or '', False, r['id']))
        email_src = 'catalogue email records'
    for direction, d, insts, text, private, evid in rows:
        if direction != 'received': excluded['email_sent'] += 1; continue
        if private: excluded['email_private'] += 1; continue
        n_recv += 1
        for n in insts: hit(match(n), d, 'email', 'email: ' + (n or '')[:50], 'v', evid)
        if WILLIAMS.search(text) and not NOT_FAMILY.search(text): hit('williams', d, 'williams', 'williams', 'v', evid)
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
            if kind == 'web': fj_web += 1; hit(cid, t, 'website', 'journal web: ' + name, 'v')
            else: hit(cid, t, 'journal', 'journal: ' + name)
    # 5. WhatDoTheyKnow responses
    wdtk = json.load(open('tools/inputs/wdtk-responses.json', encoding='utf-8'))['responses']
    for w in wdtk: hit(match(w['body']), w['date'], 'wdtk', 'wdtk: ' + w['body'], 'v')
    # 6. watchtower website changes
    chg = get(WT_RAW + 'changes.json'); wt_n = 0
    inst_names = {i['id']: i['name'] for i in chg.get('institutions', [])}
    for c in chg.get('changes', []):
        wt_n += 1; hit(WT_INST.get(c.get('inst')) or match(inst_names.get(c.get('inst'))), c.get('date'), 'website', 'watchtower: ' + str(c.get('inst')), 'v')
    wev = get(WT_RAW + 'watch-events.json'); wev = wev.get('events', wev) if isinstance(wev, dict) else wev
    for e in wev:
        if e.get('type') not in ('released', 'altered', 'removed'): continue
        url = e.get('page_url') or e.get('url') or ''
        cid = next((c for rx, c in WT_HOST if re.search(rx, url)), None) or WT_INST.get(e.get('inst'))
        wt_n += 1; hit(cid, e.get('date'), 'website', 'watch-event: ' + str(e.get('inst')), 'v')
    # 7. chronology events naming the Williams family
    ch = get(CHRONO); ch_n = 0
    for e in ch.get('events', []):
        t = e.get('event') or ''
        if WILLIAMS.search(t) and not NOT_FAMILY.search(t) and ok(e.get('sort') or ''):
            ch_n += 1; hit('williams', e['sort'], 'williams', 'chronology', 'p')
    # rows: LEAD_IN blank years, the 1500s, a year per row 1600..QUARTERLY_FROM-1, quarters to MONTHLY_FROM-1, then months
    rows = ['%d' % y for y in range(START_YEAR - LEAD_IN, START_YEAR)] + ['1500s'] + ['%d' % y for y in range(1600, QUARTERLY_FROM)]
    yearly = len(rows)
    rows += ['%d-Q%d' % (y, q) for y in range(QUARTERLY_FROM, MONTHLY_FROM) for q in range(1, 5)]
    switch = len(rows)
    rows += ['%d-%02d' % (y, m) for y in range(MONTHLY_FROM, today.year + 1) for m in range(1, 13) if (y, m) <= (today.year, today.month)]
    ri = {r: i for i, r in enumerate(rows)}
    cells, tot, firstq, ccls, crefs = {}, {}, {}, {}, {}
    src_n = {s: 0 for s in ('catalogue', 'email', 'erp', 'journal', 'wdtk', 'website', 'williams')}
    day_cls = {'v': 0, 'p': 0, 'both': 0, 'none': 0}
    for (cid, d), o in sorted(days.items()):
        p = period(d)
        if p not in ri: continue
        k = (cid, ri[p]); cells[k] = cells.get(k, 0) + 1
        tot[cid] = tot.get(cid, 0) + 1
        firstq[cid] = min(firstq.get(cid, 10**6), ri[p])
        for s_ in o['src']: src_n[s_] += 1
        cc = ccls.setdefault(k, {'v': 0, 'p': 0})
        for c_ in o['cls']: cc[c_] += 1
        day_cls['both' if len(o['cls']) == 2 else (next(iter(o['cls'])) if o['cls'] else 'none')] += 1
        rl = crefs.setdefault(k, [])
        for x in o['refs']:
            if x not in rl: rl.append(x)
    names = {cid: name for cid, name, _ in CANON}; names.update({cid: name for cid, name, _ in GROUPS}); names['williams'] = 'Williams family'
    occ = {}
    for (c, q) in cells: occ[c] = occ.get(c, 0) + 1
    MAXKEYS = 88
    rank = sorted(tot, key=lambda c: (-tot[c], -occ[c], firstq[c], names[c]))
    keep = rank[:MAXKEYS]; left_out = [names[c] for c in rank[MAXKEYS:]]
    slots = right_lean(len(keep))           # slots[r] = key index for the party of rank r
    order = [None] * len(keep)
    for r, c in enumerate(keep): order[slots[r]] = c
    cells = {k: v for k, v in cells.items() if k[0] in keep}
    inst = [{'n': i + 1, 'id': c, 'name': names[c], 'events': tot[c], 'cells': occ[c], 'rank': keep.index(c) + 1, 'first': rows[firstq[c]]} for i, c in enumerate(order)]
    col = {c: i for i, c in enumerate(order)}
    # label facts for the catalogue records a note points at (at most 3 per note; records with a picture first)
    thumbs = find_thumbs({x for k in cells for x in crefs.get(k, [])}, refinfo)
    notes, used = [], set()
    for (c, q), n in cells.items():
        rl = sorted(crefs.get((c, q), []), key=lambda x: (x not in thumbs,))[:3]
        used.update(rl)
        cc = ccls.get((c, q), {'v': 0, 'p': 0})
        notes.append([q, col[c], n, cc['v'], cc['p'], rl])
    notes.sort(key=lambda x: (x[0], x[1]))
    records = {x: label_facts(refinfo[x], thumbs.get(x)) for x in sorted(used) if x in refinfo}
    filt = {'all': len(notes), 'p': sum(1 for x in notes if x[4]), 'v': sum(1 for x in notes if x[3]), 'unclassified': sum(1 for x in notes if not x[3] and not x[4])}
    data = {'schema': 'cedwyn-piano-hero/3', 'version': VERSION, 'generated': today.isoformat(),
            'unit': 'one party active on one day; a cell counts active days in the period of its row (the 1500s, a year, a quarter or a month)',
            'order': 'by activity, rising to the right: the least active party on the far left key, the most active on the far right; keys numbered left to right',
            'sources': {'email': 'emails received from institutions (%d; emails sent are not counted)' % n_recv,
                        'catalogue': 'central catalogue dated records (%d records read)' % len(recs),
                        'erp': 'ERP request data, first replies (%d bodies)' % len(fl.get('bodies', [])),
                        'journal': 'forensic activity journal, received and website entries (%d pages, %d entries)' % (len(pages), fj_n),
                        'wdtk': 'WhatDoTheyKnow responses on the case requests (%d)' % len(wdtk),
                        'website': 'watchtower website changes (%d, plus %d journal website entries)' % (wt_n, fj_web),
                        'williams': 'records naming the Williams family (replies, catalogue records, %d chronology events)' % ch_n},
            'source_days': src_n, 'class_days': day_cls,
            'filters': [{'id': 'all', 'label': 'All'},
                        {'id': 'p', 'label': 'Press coverage, later citation & interpretation'},
                        {'id': 'v', 'label': 'Verbatim source record or transcript'}],
            'filter_counts': filt,
            'rows': rows, 'lead_in': LEAD_IN, 'yearly_to': yearly, 'monthly_from': switch, 'institutions': inst,
            'notes': notes, 'records': records,
            'left_out': left_out, 'counts': {'institutions': len(inst), 'events': sum(tot[c] for c in keep), 'occupied_cells': len(notes),
                                             'rows': len(rows), 'yearly_rows': yearly, 'quarterly_rows': switch - yearly, 'monthly_rows': len(rows) - switch,
                                             'before_start_left_out': len(before_start), 'bute_before_1824_left_out': len(bute_early)}}
    with open(out, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(data['counts']), 'source days', json.dumps(src_n))
    print('excluded', json.dumps(excluded), 'email source', email_src, 'received', n_recv)
    print('filters', json.dumps(filt), 'class days', json.dumps(day_cls), 'thumbs', len([r for r in records.values() if r.get('img')]), 'records', len(records))
    print('before start', before_start, 'bute before 1824', bute_early)
    print('rank', json.dumps([(names[c], tot[c]) for c in rank]))
    if '--unmatched' in sys.argv:
        for k, v in sorted(unmatched.items(), key=lambda kv: -kv[1])[:80]: print('  unmatched', v, k)

if __name__ == '__main__': main()
