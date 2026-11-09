"""Run fetch.sh and analyze.py first. Replace post-election chamber seat counts with the NYT/AP feed's whole-chamber balance; settle control that the feed settles.
Usage: python3 -I tools/state-seats/ingest.py <repo root> [--write]   (dry run without --write)"""
import sys, json, re, datetime
REPO = sys.argv[1]; WRITE = '--write' in sys.argv
import os
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.work')
PATH = f'{REPO}/2027-roster/index.html'
A = json.load(open(f'{WORK}/analysis.json'))
def die(m): print('ABORT:', m); sys.exit(1)
src = open(PATH, encoding='utf-8').read()
m = re.search(r'(<script type="application/json" id="roster-data">)(.*?)(</script>)', src, re.S)
page = json.loads(m.group(2))
lm = re.search(r'<script type="application/json" id="legislator-data">(.*?)</script>', src, re.S)
SIZES = json.loads(lm.group(1).replace('<\\/', '</'))['sizes']
WORDS = 'zero one two three four five six seven eight nine ten eleven twelve'.split()
def w(n): return WORDS[n] if n < len(WORDS) else str(n)
def feed_url(st):
    d = json.load(open(f"{WORK}/results-{page['states'][st]['name'].lower().replace(' ', '-')}.json"))
    u = d['pageConfig']['publish_url']
    if not u.startswith('https://www.nytimes.com/interactive/2026/11/03/us/elections/results-'): die(f'{st}: unexpected publish_url {u}')
    return u
def et_date(z):
    t = datetime.datetime.fromisoformat(z.replace('Z', '+00:00')) - datetime.timedelta(hours=5)
    return t.strftime('%Y-%m-%d'), t
SPECIAL = {
 'HI|lower': 'One seat (District 43) is a special primary between two Republicans that is still being counted; it stays Republican.',
 'GA|lower': 'One uncalled race (District 151) is headed to a runoff.',
 'AK|upper': 'Both chambers have been run by bipartisan coalitions, so party totals alone may not decide control.',
 'AK|lower': 'Both chambers have been run by bipartisan coalitions, so party totals alone may not decide control.',
}
changed_ctl = {}; log = []
for k, v in sorted(A.items()):
    st, ch = k.split('|')
    if st == 'NE' or st not in page['states']: continue
    g = page['states'][st]['govt']
    old = (g.get('seats') or {}).get(ch)
    if old and old.get('noElection'): continue                       # keep the pre-election roster for chambers with no 2026 election
    size = v['total']; sz = SIZES[st][0 if ch == 'upper' else 1]
    if sz != size: die(f'{k}: feed size {size} vs page {sz}')
    D = v['bal'].get('DEM', 0); R = v['bal'].get('GOP', 0); O = sum(v['bal'].values()) - D - R; unc = size - D - R - O
    if unc < 0: die(f'{k}: balance exceeds size')
    T = size // 2 + 1; maj = 'D' if D >= T else 'R' if R >= T else None
    ctl = g.get(ch)
    if ctl in ('D', 'R') and maj and maj != ctl: die(f'{k}: control {ctl} vs feed majority {maj}')
    if ctl in ('D', 'R') and not maj: die(f'{k}: page says {ctl} called but feed has no majority')
    if ctl in ('?', '?D', '?R') and maj: changed_ctl[k] = (ctl, maj)
    date, t = et_date(v['upd'])
    parts = []
    if unc: parts.append(f"{w(unc).capitalize()} seat{'s are' if unc != 1 else ' is'} not yet called.")
    if k in SPECIAL: parts.append(SPECIAL[k])
    url = feed_url(st)
    seats = dict(found=True, valid=True, size=size, D=D, R=R, other=O, uncalled=unc, vacant=0, noElection=False, asOf=date,
                 sources=[{'label': f"The New York Times, {page['states'][st]['name']} results (AP race calls)", 'url': url}], note=' '.join(parts))
    g.setdefault('seats', {})[ch] = seats
    log.append(f"{k:9} D{D:>3} R{R:>3} O{O:>2} unc{unc:>3} maj {maj} page-ctl {ctl} {date}")
print('\n'.join(log)); print(len(log), 'chambers from the feed')
print('control settled by the feed:', changed_ctl)
for k, (ctl, maj) in changed_ctl.items():
    st, ch = k.split('|'); page['states'][st]['govt'][ch] = maj
# state-level: date of the check, feed source, notes
for st, s in page['states'].items():
    g = s.get('govt')
    if not g or g.get('none'): continue
    ds = [(g.get('seats') or {}).get(c, {}).get('asOf') for c in ('upper', 'lower')]
    ds = [d for d in ds if d and not (g['seats'][('upper' if ds.index(d) == 0 else 'lower')].get('noElection'))]
    if not any(A.get(f'{st}|{c}') for c in ('upper', 'lower')): continue
    g['asOf'] = max(et_date(A[f'{st}|{c}']['upd'])[0] for c in ('upper', 'lower') if A.get(f'{st}|{c}'))
    u = feed_url(st)
    if not any(x['url'] == u for x in g['sources']): g['sources'].append({'label': f"The New York Times, {s['name']} results (AP race calls)", 'url': u})
# Control that the feed settles is set above. Rewrite those states' "What this means" control text by hand (means[ST].items kind 'control' and means[ST].summary); the script prints which chambers changed.
new = json.dumps(page, separators=(',', ':'), ensure_ascii=False)
if WRITE:
    open(PATH, 'w', encoding='utf-8').write(src[:m.start(2)] + new + src[m.end(2):]); print('WROTE')
else: print('dry run')
