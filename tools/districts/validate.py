"""Step 5: check the generated files against the page itself and write the validation report.

Usage:
  python3 -I validate.py --page <2027-roster/index.html> --dir <2027-roster/legislative-districts> \
        --report <report.md> [--geo <geo.json>]

Everything is re-read from the finished files (paths are parsed back from the SVG text), and the member data
comes straight from the page's own legislator-data block, so this checks what the page will actually load:
  * every member index in "m" exists, appears in only one district, and the district really is that member's
    (the member's district string, or its seat-stripped form for Idaho, matches the key);
  * New Hampshire's floterial districts (top-level "f"): each one's members exist and hold exactly that district, its
    shape is valid like any district, and it is exactly the union of the base districts named in "of";
  * members the build could not place are listed, per state and chamber (the Maine House's non-voting tribal
    representatives are listed as a note, not as unmatched);
  * districts with no member in the data are listed;
  * every path parses, lies inside the page's viewBox, and its bbox "b" and label point "c" agree with the
    path (the label point is inside the shape);
  * the districts together cover the page's own state shape (intersection over union against GEO.states[ST]),
    with overlap and gap between districts measured;
  * file sizes against the budget.
Exit status is 1 when a file is over budget or a hard check fails.
"""
import argparse, collections, json, os, re, sys
import numpy as np
import shapely
from shapely.geometry import MultiPolygon, Point, Polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import NONGEO, feature_geom, member_polygon_name, norm, roster_hash
from extract_page_data import block
from pathutil import parse_path

MAX_FILE = 700_000
MAX_TOTAL = 9_000_000
CHAMBER_NAME = {'u': 'upper', 'l': 'lower', 'g': 'single chamber'}


def geom_of(d):
    """Path text -> shapely geometry, the way a browser's nonzero fill fills it."""
    rings = [np.array(r, dtype=float).ravel().tolist() for r in parse_path(d)]
    return feature_geom(rings)


def winding_inside(d, x, y):
    """Nonzero winding test on the path itself (independent of shapely)."""
    wn = 0
    for r in parse_path(d):
        for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
            if y0 <= y:
                if y1 > y and (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0:
                    wn += 1
            elif y1 <= y and (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0:
                wn -= 1
    return wn != 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--page', required=True)
    ap.add_argument('--dir', required=True)
    ap.add_argument('--report', required=True)
    args = ap.parse_args()

    src = open(args.page, encoding='utf-8').read()
    leg = block(src, 'legislator-data')['states']
    sizes = block(src, 'legislator-data').get('sizes', {})
    geo = block(src, 'geo-data')
    vb = geo['viewBox']

    rows, hard, total = [], [], 0
    for st in sorted(leg):
        path = f'{args.dir}/{st}.json'
        if not os.path.exists(path):
            hard.append(f'{st}: file missing')
            continue
        raw = open(path, 'rb').read()
        total += len(raw)
        doc = json.loads(raw)
        if len(raw) > MAX_FILE:
            hard.append(f'{st}: file is {len(raw)} bytes (over {MAX_FILE})')
        if doc.get('v') != 1 or 'src' not in doc:
            hard.append(f'{st}: bad header')
        state_shape = geom_of(geo['states'][st]['d'])
        for ch, members in leg[st].items():
            if doc.get('h', {}).get(ch) != roster_hash(members):
                hard.append(f'{st} {ch}: roster hash h[{ch!r}] does not match the page\'s member list (files are stale)')
        for ch in ('u', 'l', 'g'):
            members = leg[st].get(ch)
            if members is None:
                if ch in doc:
                    hard.append(f'{st}: has chamber {ch} the page does not')
                continue
            dist = doc.get(ch)
            row = {'st': st, 'ch': ch, 'bytes': len(raw), 'members': len(members), 'notes': []}
            if not dist:
                row.update(polys=0, matched=0, unmatched=[(i, m[2]) for i, m in enumerate(members)], memberless=[],
                           iou=0.0, overlap=0.0, gap=0.0, status='failed')
                row['notes'].append('no districts in file')
                rows.append(row)
                continue
            seen, bad = {}, []
            geoms = {}
            for key, d in dist.items():
                # indices
                for i in d['m']:
                    if not (0 <= i < len(members)):
                        bad.append(f'{key}: member index {i} out of range')
                    elif i in seen:
                        bad.append(f'{key}: member {i} also in {seen[i]}')
                    else:
                        seen[i] = key
                    if 0 <= i < len(members):
                        if norm(member_polygon_name(st, ch, members[i][2])) != norm(key):
                            bad.append(f'{key}: member {i} has district {members[i][2]!r}')
                # geometry
                g = geom_of(d['d'])
                if g is None:
                    bad.append(f'{key}: path has no area')
                    continue
                geoms[key] = g
                x0, y0, x1, y1 = g.bounds
                if max(abs(a - b) for a, b in zip((x0, y0, x1, y1), d['b'])) > 1e-6:
                    bad.append(f'{key}: bbox {d["b"]} differs from path bounds {[round(v, 3) for v in (x0, y0, x1, y1)]}')
                if x0 < vb[0] - 1 or y0 < vb[1] - 1 or x1 > vb[2] + 1 or y1 > vb[3] + 1:
                    bad.append(f'{key}: outside the viewBox')
                cx, cy = d['c']
                if not winding_inside(d['d'], cx, cy):
                    bad.append(f'{key}: label point {d["c"]} is not inside the path')
                if not re.fullmatch(r'M[-\d. lZM]+', d['d']):
                    bad.append(f'{key}: unexpected characters in path')
            flo = doc.get('f') if ch == 'l' else None
            for key, d in (flo or {}).items():
                if key in dist:
                    bad.append(f'floterial {key}: also a base district key')
                if not d['m']:
                    bad.append(f'floterial {key}: no members')
                for i in d['m']:
                    if not (0 <= i < len(members)):
                        bad.append(f'floterial {key}: member index {i} out of range')
                        continue
                    if i in seen:
                        bad.append(f'floterial {key}: member {i} also in {seen[i]}')
                    seen[i] = f'floterial {key}'
                    if members[i][2] != key:
                        bad.append(f'floterial {key}: member {i} has district {members[i][2]!r}')
                g = geom_of(d['d'])
                if g is None:
                    bad.append(f'floterial {key}: path has no area')
                    continue
                x0, y0, x1, y1 = g.bounds
                if max(abs(a - b) for a, b in zip((x0, y0, x1, y1), d['b'])) > 1e-6:
                    bad.append(f'floterial {key}: bbox {d["b"]} differs from path bounds')
                if x0 < vb[0] - 1 or y0 < vb[1] - 1 or x1 > vb[2] + 1 or y1 > vb[3] + 1:
                    bad.append(f'floterial {key}: outside the viewBox')
                if not winding_inside(d['d'], *d['c']):
                    bad.append(f'floterial {key}: label point {d["c"]} is not inside the path')
                if not re.fullmatch(r'M[-\d. lZM]+', d['d']):
                    bad.append(f'floterial {key}: unexpected characters in path')
                of = d.get('of') or []
                if not of or any(k not in geoms for k in of):
                    bad.append(f'floterial {key}: "of" {of} is empty or names a district that is not in the file')
                else:
                    u2 = shapely.union_all([geoms[k] for k in of])
                    diff = g.symmetric_difference(u2).area / u2.area
                    if diff > 1e-4:
                        bad.append(f'floterial {key}: differs from the union of {of} by {diff:.4%}')
            unmatched = []
            for i, m in enumerate(members):
                if i in seen:
                    continue
                if m[2] in NONGEO.get((st, ch), ()):
                    row['notes'].append(f'{m[0]} ({m[2]}): non-geographic seat (non-voting tribal representative), '
                                        f'no district shape; not counted as unmatched')
                else:
                    unmatched.append((i, m[2]))
            if flo:
                row['floterial'] = len(flo)
                rest = sorted({d for _, d in unmatched}, key=lambda s: [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)])
                row['notes'].append(f'{len(flo)} floterial district(s) drawn as the union of the base districts they overlay: '
                                    + '; '.join(f'{k} = {", ".join(d["of"])} ({len(d["m"])} members)' for k, d in flo.items())
                                    + f'. {len(unmatched)} members hold {len(rest)} other district names that have no shape '
                                    f'(floterial districts whose composition is not in tools/districts/nh_floterials.json): '
                                    + ', '.join(rest))
            memberless = [k for k, d in dist.items() if not d['m']]
            # coverage of the page's own state shape
            u = shapely.union_all(list(geoms.values()))
            inter = u.intersection(state_shape).area
            iou = inter / u.union(state_shape).area
            overlap = (sum(g.area for g in geoms.values()) - u.area) / max(u.area, 1e-9)
            gap = state_shape.difference(u).area / state_shape.area
            row.update(polys=len(dist), matched=len(seen), unmatched=unmatched, memberless=memberless,
                       iou=iou, overlap=overlap, gap=gap, bad=bad, seats=(sizes.get(st) or [None, None])[0 if ch in 'ug' else 1])
            if bad:
                hard.extend(f'{st} {ch}: {b}' for b in bad)
            status = 'OK'
            if unmatched:
                status = 'partial'
            if bad or iou < 0.95 or len(seen) == 0:
                status = 'failed' if (bad or len(seen) == 0) else status
            row['status'] = status
            rows.append(row)

    # ---- report ----------------------------------------------------------------------------------------------
    n = collections.Counter(r['status'] for r in rows)
    out = ['# State legislative districts: validation report', '',
           f'Page: `{os.path.relpath(args.page, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))}`  |  {len(rows)} chambers in {len(set(r["st"] for r in rows))} states  |  '
           f'total {total/1e6:.2f} MB (budget {MAX_TOTAL/1e6:.0f} MB), largest file '
           f'{max(os.path.getsize(f"{args.dir}/{f}") for f in os.listdir(args.dir) if f.endswith(".json"))/1024:.0f} KB '
           f'(budget {MAX_FILE//1000} KB)', '',
           f'**Status: {n.get("OK", 0)} OK, {n.get("partial", 0)} partial, {n.get("failed", 0)} failed** (of {len(rows)} chambers).', '']
    nonok = [r for r in rows if r['status'] != 'OK']
    if nonok:
        out += ['## Not fully OK', '']
        for r in nonok:
            out.append(f'- **{r["st"]} {CHAMBER_NAME[r["ch"]]}: {r["status"]}**. '
                       f'{len(r["unmatched"])} of {r["members"]} members have no district shape: '
                       + '; '.join(f'#{i} {d}' for i, d in r['unmatched'][:40]) + (' ...' if len(r['unmatched']) > 40 else ''))
        out.append('')
    out += ['## Per state and chamber', '',
            '`seats` is the chamber size from the page; `polys` the districts drawn; `members` the members in the data '
            '(fewer than seats means vacancies); `matched` how many of them sit on a drawn district (a New Hampshire floterial '
            'district counts); `memberless` the '
            'drawn districts with nobody in the data; `IoU` how well the districts together cover the page\'s own state '
            'shape; `overlap`/`gap` are the share of the state area covered twice / not covered by any district.', '',
            '| state | chamber | seats | polys | members | matched | unmatched | memberless | IoU | overlap | gap | file KB | status |',
            '|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|']
    for r in rows:
        ml = ', '.join(r['memberless'][:6]) + (f' (+{len(r["memberless"]) - 6})' if len(r['memberless']) > 6 else '')
        out.append(f'| {r["st"]} | {CHAMBER_NAME[r["ch"]]} | {r.get("seats") or ""} | {r["polys"]}{" + %d floterial" % r["floterial"] if r.get("floterial") else ""} | {r["members"]} | {r["matched"]} | '
                   f'{len(r["unmatched"])} | {ml or "none"} | {r["iou"]:.4f} | {r["overlap"]*100:.3f}% | {r["gap"]*100:.3f}% | '
                   f'{r["bytes"]/1024:.0f} | {r["status"]} |')
    notes = [(r, x) for r in rows for x in r['notes']]
    if notes:
        out += ['', '## Notes', '']
        out += [f'- {r["st"]} {CHAMBER_NAME[r["ch"]]}: {x}' for r, x in notes]
    if hard:
        out += ['', '## Hard check failures', ''] + [f'- {h}' for h in hard]
    open(args.report, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print(out[2]); print(out[4])
    print(f'hard check failures: {len(hard)}')
    for h in hard[:20]:
        print('  ', h)
    sys.exit(1 if hard or total > MAX_TOTAL else 0)


if __name__ == '__main__':
    main()
