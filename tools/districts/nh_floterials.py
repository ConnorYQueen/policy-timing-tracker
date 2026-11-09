#!/usr/bin/env python3
"""Writes nh_floterials.json: every floterial district of the New Hampshire House, from nh_statute_662_5.json (nh_statute.py).

A floterial district is a statute district that is not one of the Census base districts (the keys of "l" in
2027-roster/legislative-districts/NH.json). Its towns or city wards are the union of whole base districts, so `of` is found by
matching each town or ward to the base district that lists it, and the script stops if a unit has no base district or a base
district is only partly covered. build.py then draws the floterial as the union of those base districts' shapes."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
stat = json.load(open(os.path.join(HERE, 'nh_statute_662_5.json')))
nh = json.load(open(os.path.join(HERE, '..', '..', '2027-roster', 'legislative-districts', 'NH.json')))
base = set(nh['l'].keys())
natkey = lambda k: (k.rsplit(' ', 1)[0], int(k.rsplit(' ', 1)[1]))
dist = {f'{c} {n}': v for c, d in stat['counties'].items() for n, v in d.items()}
unit_base = {}
for k in sorted(base, key=natkey):
    for u in dist[k]['towns']:
        key = (k.rsplit(' ', 1)[0], u)
        if key in unit_base: sys.exit(f'{key} is in two base districts: {unit_base[key]} and {k}')
        unit_base[key] = k
out = {}
for k in sorted(set(dist) - base, key=natkey):
    county, units = k.rsplit(' ', 1)[0], dist[k]['towns']
    of = set()
    for u in units:
        if (county, u) not in unit_base: sys.exit(f'{k}: {u!r} is in no base district')
        of.add(unit_base[(county, u)])
    for b in of:
        miss = [u for u in dist[b]['towns'] if u not in units]
        if miss: sys.exit(f'{k}: base district {b} is only partly covered (missing {miss})')
    out[k] = {'seats': dist[k]['seats'], 'towns': units, 'of': sorted(of, key=natkey)}
spec = {
 'about': "Composition of the New Hampshire House's floterial districts, read by build.py. A floterial district overlays two or more whole base districts, so its shape is the union of those districts as drawn. `towns` are the towns or city wards the statute lists for the district, `seats` its number of representatives, and `of` the Census base districts it covers, found by nh_floterials.py from nh_statute_662_5.json (RSA 662:5 as reenacted in 2022). build.py draws each from `of`; where every town also resolves on the Census town map it checks that the geometry gives the same base districts, and stops if not or if `seats` is not the number of members the page lists for the district. Rerun: nh_statute.py (on a saved copy of the bill page), nh_floterials.py, then run.sh.",
 'sources': {'statute': stat['source']},
 'floterials': out}
open(os.path.join(HERE, 'nh_floterials.json'), 'w', encoding='utf-8').write(json.dumps(spec, indent=1, ensure_ascii=False) + '\n')
print(len(out), 'floterial districts;', sum(v['seats'] for v in out.values()), 'seats')
