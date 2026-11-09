"""Prove the projection: project the Census state outlines and compare them with the page's own state
shapes (GEO.states[ST]) for all 50 states, by bounding box and by overlap (intersection over union).

Usage:  python3 -I check_projection.py <geo.json> <projected_states.json>
  geo.json                the page's geo-data block (see extract_page_data.py)
  projected_states.json   output of project.mjs run on the state outline layer

Expected result: the great majority of states agree to 0.00-0.06 px (the scale is 1280 and the translate
465.6, 300.6, and the Alaska/Hawaii insets were fitted to the page, see project.mjs). A few states differ by 0.5 to
6 px only because of tiny islets the page leaves out or keeps (Ka'ula Rock off Hawaii at 0.02 px^2 is 6.3 px west of
Niihau; the Isles of Shoals off New Hampshire; a rock in Lake Superior off Michigan), which move a bounding box
but not the shapes. Exit status is non-zero unless at least 45 shapes agree to 0.15 px and none is off by 7 px.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pathutil import parse_path
import shapely
from shapely.geometry import Polygon


geo = json.load(open(sys.argv[1]))['states']
proj = json.load(open(sys.argv[2]))
rows = []
for f in proj:
    st = f['st']
    if st not in geo or not f['rings']:
        continue
    rings = f['rings']
    xs = [v for r in rings for v in r[0::2]]
    ys = [v for r in rings for v in r[1::2]]
    mine = [min(xs), min(ys), max(xs), max(ys)]
    theirs = geo[st]['b']
    diff = [round(a - b, 2) for a, b in zip(mine, theirs)]
    mp = shapely.union_all([Polygon(list(zip(r[0::2], r[1::2]))).buffer(0) for r in rings])
    pp = shapely.union_all([Polygon(r).buffer(0) for r in parse_path(geo[st]['d'])])
    iou = mp.intersection(pp).area / mp.union(pp).area
    rows.append((max(abs(d) for d in diff), iou, st, diff))
print('state  max|bbox diff| px   IoU     (bbox diff x0,y0,x1,y1)')
for w, iou, st, diff in sorted(rows, reverse=True)[:10]:
    print(f'{st:5s}  {w:8.2f}          {iou:.4f}  {diff}')
print(f'states compared: {len(rows)} (incl. DC)')
print(f'bbox differences: median {sorted(r[0] for r in rows)[len(rows)//2]:.3f}px, '
      f'{sum(r[0] <= 0.15 for r in rows)} states within 0.15px, {sum(r[0] <= 1 for r in rows)} within 1px, '
      f'worst {max(r[0] for r in rows):.2f}px')
print(f'IoU: min {min(r[1] for r in rows):.4f}, median {sorted(r[1] for r in rows)[len(rows)//2]:.4f}')
sys.exit(0 if sum(r[0] <= 0.15 for r in rows) >= 45 and max(r[0] for r in rows) < 7 else 1)
