"""Run fetch.sh first. Apply AP race calls made since the last update to the federal seats (Senate, House, governor) in 2027-roster/index.html.
Usage: python3 -I tools/federal-calls/ingest.py <repo root> [--write]   (dry run without --write)

Only seats the page shows as "too_close" or "anticipated" are touched, and only when the feed has one AP winner.
Vote tallies in races that stay uncalled keep their earlier snapshot. Runoffs, delegates and territories are left alone.
Aborts if a winner is not among the page's candidates, if the winner is not the top vote-getter (a ranked-choice
reversal needs a hand edit), or if a race the page already calls now has a different winner in the feed."""
import sys, os, re, json, datetime, collections

REPO = sys.argv[1]; WRITE = '--write' in sys.argv
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.work')
PATH = f'{REPO}/2027-roster/index.html'
FILES = ('senate', 'house', 'governor')


def die(msg):
    print('ABORT:', msg); sys.exit(1)


def et(z):
    return datetime.datetime.fromisoformat(z.replace('Z', '+00:00')) - datetime.timedelta(hours=5)


feeds = {f: json.load(open(f'{WORK}/results-{f}.json')) for f in FILES}
races = {}
for f in FILES:
    for r in feeds[f]['races']:
        races.setdefault(r['nyt_id'], r)
calls_as_of = min(feeds[f]['resultsMeta']['resultsUpdatedAt'] for f in FILES)

src = open(PATH, encoding='utf-8').read()
m = re.search(r'(<script type="application/json" id="roster-data">)(.*?)(</script>)', src, re.S)
page = json.loads(m.group(2))
if json.dumps(page, separators=(',', ':'), ensure_ascii=False) != m.group(2):
    die('roster-data does not round-trip; the page format changed')


def top_unit(r):
    want = (r.get('top_reporting_unit') or {}).get('nyt_id')
    for ru in r['reporting_units']:
        if ru['nyt_id'] == want:
            return ru
    return r['reporting_units'][0]


def pct(v, t):
    return round(v / t * 100, 1) if t else None


def incumbency(seats):
    """Incumbents on the ballot per state: won/lost (called), leading/trailing (anticipated), undecided (too close or runoff)."""
    out = collections.defaultdict(lambda: dict(ballot=0, won=0, leading=0, lost=0, trailing=0, undecided=0))
    for s in seats:
        if s['status'] == 'not_up' or not s.get('race'):
            continue
        r = races.get(s['race']['raceId'])
        if not r:
            continue
        for inc in [k for k, c in r['candidate_metadata'].items() if c.get('incumbent')]:
            c = out[s['st']]; c['ballot'] += 1
            held = (s['holder'] or {}).get('nytId') == inc
            if s['status'] == 'called':
                c['won' if held else 'lost'] += 1
            elif s['status'] == 'anticipated':
                c['leading' if held else 'trailing'] += 1
            else:
                c['undecided'] += 1
    return out


# The recount must match the page before anything changes, or the rule here is not the page's rule.
before = incumbency(page['seats'])
for st, v in page['states'].items():
    if v.get('incumbency'):
        mine = before.get(st, dict(ballot=0, won=0, leading=0, lost=0, trailing=0, undecided=0))
        if {k: v['incumbency'].get(k) for k in mine} != mine:
            die(f'{st}: incumbency recount {dict(mine)} differs from the page {v["incumbency"]}')

log = []
for s in page['seats']:
    r = races.get((s.get('race') or {}).get('raceId'))
    if not r:
        continue
    o = r.get('outcome') or {}
    won = o.get('won') or []
    if s['status'] == 'called':
        if won and s['holder']['nytId'] not in won:
            die(f"{s['id']}: page winner {s['holder']['nytId']} but feed winner {won}")
        continue
    if s['status'] not in ('too_close', 'anticipated') or r.get('race_call_status') != 'called' or len(won) != 1:
        continue
    w = won[0]
    ru = top_unit(r)
    T = ru['total_votes']
    votes = sorted(ru['candidates'], key=lambda c: -c['votes']['total'])
    if votes[0]['nyt_id'] != w:
        die(f"{s['id']}: AP winner {w} is not the top vote-getter {votes[0]['nyt_id']}; edit this seat by hand")
    if s['status'] == 'anticipated':
        if (s['holder'] or {}).get('nytId') != w:
            die(f"{s['id']}: page shows {(s['holder'] or {}).get('nytId')} leading, AP called {w}")
        holder = s['holder']
    else:
        pick = [c for c in s['contenders'] if c.get('nytId') == w]
        if len(pick) != 1:
            die(f"{s['id']}: AP winner {w} is not one of the page's candidates")
        holder = pick[0]
        s['holder'] = holder
        s['contenders'] = []
        s.pop('lean', None)
    holder['votes'] = votes[0]['votes']['total']
    holder['pct'] = pct(holder['votes'], T)
    old = s['status']
    s['status'] = 'called'
    s['party'] = holder['party']
    s['caucus'] = holder['caucus']
    prev = s['previousParty']
    s['flip'] = None if prev in (None, holder['caucus']) else f"{prev}>{holder['caucus']}"
    s['race'].update(
        calledBy=o.get('called_by') or ['ap'],
        calledAt=(o.get('winner_accepted_at') or [None])[0],
        leaderPct=pct(votes[0]['votes']['total'], T),
        runnerUpPct=pct(votes[1]['votes']['total'], T) if len(votes) > 1 else None,
        marginPts=pct(votes[0]['votes']['total'] - votes[1]['votes']['total'], T) if len(votes) > 1 else None,
        pctCounted=ru.get('eevp'),
        totalVotes=T,
        need=None,
        rule=None,
    )
    when = et(s['race']['calledAt']).strftime('%b %d') if s['race']['calledAt'] else '?'
    log.append(f"{s['id']:9} {old:11} -> called {holder['name']} ({holder['party']}){' flip ' + s['flip'] if s['flip'] else ''}, AP {when} ET")

after = incumbency(page['seats'])
for st, v in page['states'].items():
    if v.get('incumbency'):
        new = dict(after.get(st, dict(ballot=0, won=0, leading=0, lost=0, trailing=0, undecided=0)))
        if {k: v['incumbency'].get(k) for k in new} != new:
            log.append(f"{st:9} incumbency {v['incumbency']} -> {new}")
            v['incumbency'].update(new)

if any('-> called' in x for x in log):
    page['callsAsOf'] = calls_as_of

print('\n'.join(log) or 'nothing new')
print('callsAsOf', page.get('callsAsOf'), '=', et(page['callsAsOf']).strftime('%b %d %I:%M %p'), 'ET')


def tally(office):
    c = collections.Counter()
    for s in page['seats']:
        if s['office'] == office and s['status'] in ('called', 'not_up') and s.get('caucus'):
            c[s['caucus'] if office == 'senate' else s['party']] += 1
        elif s['office'] == office:
            c['open'] += 1
    return dict(c)


print('Senate, all seats by caucus:', tally('senate'))
house = collections.Counter(s['party'] for s in page['seats'] if s['office'] == 'house' and s['status'] == 'called')
print('House, called by party:', dict(house), '| not called:', sum(1 for s in page['seats'] if s['office'] == 'house' and s['status'] != 'called'))
print('Governors, all seats by party:', tally('governor'))
print('Update the "What this means" text by hand where it mentions these races (means[ST].summary and items, means.US.summary).')

if WRITE:
    new = json.dumps(page, separators=(',', ':'), ensure_ascii=False)
    open(PATH, 'w', encoding='utf-8').write(src[:m.start(2)] + new + src[m.end(2):])
    print('WROTE')
else:
    print('dry run')
