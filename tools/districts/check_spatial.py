"""Sanity check that district numbers in the files point at the right places on the map.

Usage:  python3 -I check_spatial.py --page <2027-roster/index.html> --dir <legislative-districts> [--out report.md]

If the join put members on the wrong shapes (say, a state numbering its districts differently from the Census),
parties would be scattered at random over the map. Two tests, both against random shuffles of the same labels
over the same shapes (200 shuffles, z = how many standard deviations above chance):

  1. Neighbours: among districts held by one party only (D or R), the share of touching pairs with the same party.
  2. Two chambers: the area-weighted share of the state where the upper-house district and the lower-house district
     on top of each other are held by the same party. A shuffled upper house makes this fall to chance, so this test
     has real power for the upper chambers, where test 1 is weak (few, large districts).
"""
import argparse, json, os, sys
import numpy as np
import shapely
from shapely.strtree import STRtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_page_data import block
from validate import geom_of

ap = argparse.ArgumentParser()
ap.add_argument('--page', required=True)
ap.add_argument('--dir', required=True)
ap.add_argument('--out')
args = ap.parse_args()
leg = block(open(args.page, encoding='utf-8').read(), 'legislator-data')['states']
rng = np.random.default_rng(1)


def single_party(st, ch, doc):
    keys, geoms, labels = [], [], []
    for k, d in doc[ch].items():
        ps = {leg[st][ch][i][1] for i in d['m']}
        if len(ps) == 1 and ps <= {'D', 'R'}:
            keys.append(k); geoms.append(geom_of(d['d'])); labels.append(1 if ps == {'D'} else 0)
    return keys, geoms, np.array(labels)


def zscore(obs, stat, n=200):
    sims = np.array([stat() for _ in range(n)])
    return (obs - sims.mean()) / (sims.std() or 1e-9), sims.mean()


lines = ['| state | chamber | one-party districts | neighbour pairs | same-party share | chance | z (neighbours) |',
         '|---|---|---:|---:|---:|---:|---:|']
two = ['| state | area share where the upper and lower district have the same party | chance | z (two chambers) |',
       '|---|---:|---:|---:|']
weak1, weak2 = [], []
for st in sorted(leg):
    doc = json.load(open(f'{args.dir}/{st}.json'))
    cache = {}
    for ch in ('u', 'l', 'g'):
        if ch not in doc:
            continue
        keys, geoms, lab = single_party(st, ch, doc)
        cache[ch] = (keys, geoms, lab)
        if len(keys) < 8 or len(set(lab)) < 2:
            lines.append(f'| {st} | {ch} | {len(keys)} | - | - | - | n/a (too few of one party) |')
            continue
        tree = STRtree(geoms)
        a, b = tree.query(geoms, predicate='intersects')
        pairs = [(i, j) for i, j in zip(a, b) if i < j and geoms[i].intersection(geoms[j]).length > 0]
        I = np.array([p[0] for p in pairs]); J = np.array([p[1] for p in pairs])
        obs = float(np.mean(lab[I] == lab[J]))
        z, base = zscore(obs, lambda: np.mean((p := rng.permutation(lab))[I] == p[J]))
        lines.append(f'| {st} | {ch} | {len(keys)} | {len(pairs)} | {obs:.2f} | {base:.2f} | {z:.1f} |')
        if z < 3:
            weak1.append((st, ch, round(float(z), 1)))
    if 'u' in cache and 'l' in cache:
        ku, gu, lu = cache['u']; kl, gl, ll = cache['l']
        if len(set(lu)) < 2 or len(set(ll)) < 2:
            two.append(f'| {st} | n/a (one party only) | | |')
            continue
        tree = STRtree(gl)
        A = np.zeros((len(gu), len(gl)))
        for i, g in enumerate(gu):
            for j in tree.query(g, predicate='intersects'):
                A[i, j] = g.intersection(gl[j]).area
        same = lambda lab_u: float((A * (lab_u[:, None] == ll[None, :])).sum() / A.sum())
        obs = same(lu)
        z, base = zscore(obs, lambda: same(rng.permutation(lu)))
        two.append(f'| {st} | {obs:.2f} | {base:.2f} | {z:.1f} |')
        if z < 3:
            weak2.append((st, round(float(z), 1)))
out = '\n'.join(['## Neighbouring districts', ''] + lines + ['', '## Upper and lower chamber on top of each other', ''] + two)
print(out)
print('\nneighbour test, chambers with z < 3:', weak1 or 'none')
print('two-chamber test, states with z < 3:', weak2 or 'none')
if args.out:
    open(args.out, 'w').write(out + '\n')
