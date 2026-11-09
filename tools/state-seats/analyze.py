"""Tally every state legislative chamber from the downloaded feed: whole-chamber party balance (includes seats not up this year),
the AP call status of each race, and the time of the last update. Writes .work/analysis.json. Run fetch.sh first."""
import json, glob, os, sys
from collections import Counter
OUT = {}
for f in sorted(glob.glob(os.path.dirname(os.path.abspath(__file__)) + '/.work/results-*.json')):
    d = json.load(open(f)); upd = d['resultsMeta']['resultsUpdatedAt']
    for st in d['partyControlData']['results']:
        for oid, o in st['offices'].items():
            if oid not in ('SS', 'SH'): continue
            pb = o['party_balance']; bal = {k: v['seats'] for k, v in pb.items()}
            noel = {k: v['no_election'] for k, v in pb.items()}
            # race level tally
            won = Counter(); unc = []; ncalled = 0; seats_up = 0; statuses = Counter()
            for r in d['races']:
                if r.get('office_id') != oid: continue
                mw = r.get('max_winners') or 1; seats_up += mw; statuses[r['race_call_status']] += 1
                meta = r.get('candidate_metadata') or {}
                w = (r.get('outcome') or {}).get('won') or []
                n = 0
                for x in w:
                    cid = x if isinstance(x, str) else x.get('nyt_id')
                    c = meta.get(cid); p = ((c or {}).get('party') or {}).get('nyt_id', '?') if c else '?'
                    won[p] += 1; n += 1
                if n < mw:
                    tr = r.get('top_reporting_unit') or {}
                    cl = sorted([((meta.get(c['nyt_id'], {}).get('party') or {}).get('nyt_id'), c['votes']['total'], c.get('leader')) for c in tr.get('candidates', [])], key=lambda x: -x[1])[:3]
                    unc.append((r['nyt_id'], mw - n, r['race_call_status'], cl))
            OUT[f"{st['state_postal']}|{'upper' if oid=='SS' else 'lower'}"] = dict(upd=upd, total=o['total'], open=o['open_seats'], noel=o['no_election_seats'], called=o['num_races_called'], bal=bal, noelp=noel, won=dict(won), seats_up=seats_up, unc=unc, statuses=dict(statuses), ctrl=o.get('current_control'))
json.dump(OUT, open(os.path.dirname(os.path.abspath(__file__)) + '/.work/analysis.json', 'w'), indent=1)
for k, v in OUT.items():
    sb = sum(v['bal'].values()); unc = sum(u[1] for u in v['unc'])
    print(f"{k:9} size {v['total']:3} up {v['seats_up']:3} noel {v['noel']:3} bal {v['bal']} (sum {sb}) won {v['won']} uncalled {unc} {v['upd'][5:16]}")
