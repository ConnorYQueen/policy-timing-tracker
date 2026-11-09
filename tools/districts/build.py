"""Step 4: simplify, join to the page's members, and write one JSON file per state.

Usage:
  python3 -I build.py --work <work_dir> --out <2027-roster/legislative-districts> [--only ST,ST]
                      [--tol-screen 0.30] [--quant-screen 0.15]

<work_dir> must hold geo.json and leg.json (extract_page_data.py) and pj_sldu.json / pj_sldl.json / pj_cousub.json
(project.mjs; the last is New Hampshire's towns, read only for the floterial districts).

What it does for each state and chamber:
  * rebuilds each district as polygons with holes from the projected rings;
  * simplifies the whole chamber as one coverage (shapely.coverage_simplify, GEOS Visvalingam), so a border
    shared by two districts is simplified once and stays shared: no gaps or overlaps appear;
  * snaps to a grid of 1 to 4 decimals chosen per state (see SIMPLIFICATION AND PRECISION), with GEOS so the
    shapes stay valid, drops islands/holes under a small area but always keeps a district's largest part, and
    writes compact relative SVG paths;
  * computes a label point inside the shape (centroid, or pole of inaccessibility when the centroid is outside
    or hugs the edge) and a bounding box;
  * joins each district to the members who hold it in the page's legislator data (see JOIN RULES);
  * New Hampshire House only: draws the floterial districts listed in nh_floterials.json as the union of the base
    districts they overlay (see FLOTERIAL DISTRICTS) and stores them under the file's top-level "f".
"""
import argparse, collections, json, os, re, struct, sys
import numpy as np
import shapely
from shapely.algorithms.polylabel import polylabel
from shapely.geometry import MultiPolygon, Point, Polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pathutil import fmt, join_nums, ring_to_path

SRC = ('U.S. Census Bureau cartographic boundary files, 2025 vintage (GENZ2025; state legislative districts '
       'for the 2024 legislative session year), 1:500,000')
# States whose plan changed for the 2026 election cycle (tiger_update.py swaps in the Census 2026 shapes for these chambers).
# Their files carry a short plain-English "note" that the page shows in the map key; the wording is fixed here so a
# rebuild reproduces it. Sources: redistricting-check.md.
CHAMBER_NAME = {'u': 'State Senate', 'l': 'State House'}
SRC_2026 = ' districts from the Census Bureau 2026 TIGER/Line state legislative districts (the plan for the 2026 election cycle), clipped to the same shoreline'
NOTES = {
    'MI': ('Michigan’s State Senate was redrawn: a new plan, approved in 2024, applies to the 2026 election and is the one '
           'drawn here. Each district is colored by who held that district number before the election, who was elected '
           'from the earlier lines. The State House map is unchanged.'),
    'MN': ('Minnesota’s State Senate and State House lines were adjusted by a handful of census blocks for 2026; the '
           'adjusted lines are drawn here.'),
    'MS': ('Mississippi’s State Senate and State House were redrawn after the 2024 session. The new districts are drawn '
           'here, each colored by who held that district number before the election, who may have been elected from '
           'the earlier lines.'),
}

# ---- SIMPLIFICATION AND PRECISION --------------------------------------------------------------------------
# The page zooms a state until it fills roughly a 650 x 500 px stage. z = that zoom (screen px per map unit).
# Everything is chosen in screen terms at that zoom, so small states keep detail (Rhode Island: z = 25, grid
# 0.001 map px) and big states stay light (Texas: z = 2, grid 0.01 map px). A fixed 0.1 map px grid would show
# as 2.5 screen px steps on Rhode Island.
STAGE_W, STAGE_H = 650.0, 500.0
Z_MIN, Z_MAX = 1.0, 40.0
TOL_SCREEN = 0.30         # simplification tolerance, screen px at the state's zoom
QUANT_SCREEN = 0.15       # coordinate grid step is at most this many screen px at the state's zoom
MIN_AREA_MAP = 0.3        # drop islands/holes under this many map px^2 ...
MIN_AREA_SCREEN = 3.0     # ... or under this many screen px^2 at the state's zoom, whichever is smaller

NONGEO = {                # members with no geographic district; they never match a polygon and are not "unmatched"
    # Maine House: the non-voting tribal representatives (the page lists Houlton Band of Maliseet Indians and
    # Passamaquoddy Tribe; Penobscot Nation is not in the member list).
    ('ME', 'l'): {'Houlton Band of Maliseet Indians', 'Passamaquoddy Tribe', 'Penobscot Nation'},
}
FLOTERIALS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nh_floterials.json')
COUNTY_FIPS = {'Belknap': '001', 'Carroll': '003', 'Cheshire': '005', 'Coos': '007', 'Grafton': '009',
               'Hillsborough': '011', 'Merrimack': '013', 'Rockingham': '015', 'Strafford': '017', 'Sullivan': '019'}
FLO_INSIDE = 0.98         # a base district counts as inside the listed towns when this share of it is
FLO_SLIVER = 0.02         # a base district with a share between this and FLO_INSIDE is a partial overlap: an error

# ---- JOIN RULES --------------------------------------------------------------------------------------------
# Census gives NAME ('19', '07A', 'Merrimack 08', 'Berkshire-Hampden-Franklin-Hampshire', 'Windsor-Orange-1', ...).
# Open States gives district strings ('19', '7A', 'Merrimack 8', 'Berkshire, Hampden, Franklin and Hampshire', ...).
# Both are reduced to the same comparison form by norm(): lower case, leading zeros dropped from numbers,
# the word "and" dropped, everything that is not a letter or digit removed.
def norm(s):
    s = s.lower()
    s = re.sub(r'\b0+(\d)', r'\1', s)
    s = re.sub(r'\band\b', ' ', s)
    return re.sub(r'[^a-z0-9]+', '', s)


# Per-state rules for member district strings that are NOT a district name.
def member_polygon_name(st, ch, district):
    # Idaho: 35 districts elect two House members each, listed as seats '1A' and '1B'; the polygon is district '1'.
    if (st, ch) == ('ID', 'l'):
        return re.sub(r'(?<=\d)[AB]$', '', district)
    return district


def canonical_key(name):
    """Key for a polygon nobody holds in the data: the Census NAME with leading zeros dropped ('064' -> '64')."""
    return re.sub(r'\b0+(\d)', r'\1', name)


def roster_hash(members):
    """FNV-1a (32 bit) over the district strings of a member list, in list order, as UTF-16 code units.

    Stored in each file as h[chamber]. The "m" indices are positions in that member list, so they are only valid
    while the district at each position is unchanged; the page can compute the same number (see README) and
    skip the district map for a chamber whose list has changed since the files were built.
    """
    x = 2166136261
    for m in members:
        b = (m[2] + '\n').encode('utf-16-le')
        for (u,) in struct.iter_unpack('<H', b):
            x = ((x ^ u) * 16777619) & 0xFFFFFFFF
    return x


def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s)]


# ---- GEOMETRY ----------------------------------------------------------------------------------------------
def ring_pts(flat):
    a = np.asarray(flat, dtype=float).reshape(-1, 2)
    keep = np.ones(len(a), dtype=bool)
    keep[1:] = np.any(a[1:] != a[:-1], axis=1)
    a = a[keep]
    if len(a) > 1 and np.all(a[0] == a[-1]):
        a = a[:-1]
    return a


def signed_area(a):
    x, y = a[:, 0], a[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def feature_geom(rings):
    """Projected rings (outer rings and holes mixed) -> a shapely geometry (outer rings positive, holes negative)."""
    pts = [ring_pts(r) for r in rings]
    pts = [p for p in pts if len(p) >= 3 and abs(signed_area(p)) > 0]
    if not pts:
        return None
    big = max(pts, key=lambda p: abs(signed_area(p)))
    sgn = 1 if signed_area(big) > 0 else -1
    outers = [Polygon(p) for p in pts if signed_area(p) * sgn > 0]
    holes = [p for p in pts if signed_area(p) * sgn < 0]
    parts = [[o, []] for o in outers]
    for h in holes:
        hp = Polygon(h).representative_point()
        cand = [i for i, (o, _) in enumerate(parts) if o.contains(hp)]
        if cand:
            parts[min(cand, key=lambda i: parts[i][0].area)][1].append(h)
    polys = []
    for o, hs in parts:
        p = Polygon(o.exterior.coords, hs)
        if not p.is_valid:
            p = shapely.make_valid(p)
            polys.extend(g for g in getattr(p, 'geoms', [p]) if g.geom_type == 'Polygon' and g.area > 0)
        else:
            polys.append(p)
    return MultiPolygon(polys) if polys else None


def simplify_coverage(geoms, tol):
    arr = np.array(geoms, dtype=object)
    try:
        return list(shapely.coverage_simplify(arr, tol, simplify_boundary=True))
    except Exception as e:  # pragma: no cover - fall back, but say so
        print('   coverage_simplify failed (%s); simplifying one by one' % e)
        return [shapely.simplify(g, tol, preserve_topology=True) for g in arr]


def parts_of(g):
    if g is None or g.is_empty:
        return []
    return list(g.geoms) if g.geom_type in ('MultiPolygon', 'GeometryCollection') else [g]


def snap_ring(coords, dec):
    """Round a ring to the grid and drop repeated points. Returns an (n, 2) array or None if it collapsed."""
    q = 10 ** dec
    a = np.round(np.asarray(coords, dtype=float) * q) / q
    keep = np.ones(len(a), dtype=bool)
    keep[1:] = np.any(a[1:] != a[:-1], axis=1)
    a = a[keep]
    if len(a) > 1 and np.all(a[0] == a[-1]):
        a = a[:-1]
    if len(a) < 3 or abs(signed_area(a)) < 0.5 / q / q:
        return None
    return a


def finish_district(geom, dec, min_area, orig):
    """Simplified geometry -> (list of rings [outer, holes...] as arrays per part). Never returns nothing."""
    out = []
    # Snap to the grid with GEOS, which keeps the shape valid (rounding by hand can fold narrow necks over).
    geom = shapely.set_precision(geom, 10 ** -dec)
    ps = sorted(parts_of(geom), key=lambda p: -p.area)
    for i, p in enumerate(ps):
        if i > 0 and p.area < min_area:
            continue
        ext = snap_ring(p.exterior.coords, dec)
        if ext is None:
            continue
        if signed_area(ext) < 0:
            ext = ext[::-1]
        holes = []
        for h in p.interiors:
            if Polygon(h).area < min_area:
                continue
            hr = snap_ring(h.coords, dec)
            if hr is None:
                continue
            if signed_area(hr) > 0:
                hr = hr[::-1]
            holes.append(hr)
        out.append((ext, holes))
    if not out:   # collapsed completely: fall back to the original district's largest part, snapped
        best = max(parts_of(orig), key=lambda p: p.area)
        ext = snap_ring(best.exterior.coords, dec)
        if ext is None:   # smaller than the grid: draw the smallest square on the grid around its centroid
            c = best.centroid
            q = 10 ** dec
            cx, cy = round(c.x * q) / q, round(c.y * q) / q
            e = 1.0 / q
            ext = np.array([[cx - e, cy - e], [cx + e, cy - e], [cx + e, cy + e], [cx - e, cy + e]])
        elif signed_area(ext) < 0:
            ext = ext[::-1]
        out.append((ext, []))
    return out


def label_point(parts, dec):
    """A point inside the drawn shape: the centroid when it is clearly inside, else the pole of inaccessibility."""
    geom = MultiPolygon([Polygon(e, h) for e, h in parts])
    if not geom.is_valid:
        geom = shapely.make_valid(geom)
    c = geom.centroid
    if geom.contains(c) and geom.boundary.distance(c) >= 2 * 10 ** -dec:
        p = c
    else:
        biggest = max(parts_of(geom) if geom.geom_type != 'Polygon' else [geom], key=lambda g: g.area)
        biggest = biggest if biggest.geom_type == 'Polygon' else max(
            (g for g in biggest.geoms if g.geom_type == 'Polygon'), key=lambda g: g.area)
        p = polylabel(biggest, tolerance=10 ** -dec)
    # Round to the grid; if that lands outside (thin shapes), take the best grid point just around it.
    q = 10 ** dec
    gx, gy = round(p.x * q), round(p.y * q)
    best = None
    for r in (0, 1, 2, 3):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:
                    continue
                pt = Point((gx + dx) / q, (gy + dy) / q)
                if geom.contains(pt):
                    score = geom.boundary.distance(pt)
                    if best is None or score > best[0]:
                        best = (score, pt)
        if best:
            break
    if best is None:   # cannot happen for shapes of at least a few grid cells; keep the exact point
        return [round(p.x, dec + 1), round(p.y, dec + 1)]
    return [best[1].x, best[1].y]


def path_of(parts, dec):
    return ''.join(ring_to_path(r, dec) for ext, holes in parts for r in [ext, *holes])


def bbox_of(parts):
    pts = np.vstack([e for e, _ in parts])
    return [float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())]


def num(v, dec):
    """Round to dec decimals as a JSON number with no trailing zeros."""
    r = round(v, dec)
    return int(r) if r == int(r) else r


# ---- FLOTERIAL DISTRICTS (New Hampshire House) -------------------------------------------------------------
# The Census publishes only the 164 non-overlapping House districts. A floterial district overlays two or more whole
# base districts (the statute lists it by town), so its shape is the union of those districts AS DRAWN: its outline
# then runs exactly along base-district edges. The towns in nh_floterials.json are used to find which base districts
# those are, and the build stops rather than guess when the towns are not a union of whole base districts.
def build_floterials(spec, members, keep, towns, dec, min_area):
    """Returns (dict floterial key -> {d, c, b, n, m, of}, log lines)."""
    base_keys = set(keep)
    by_district = collections.defaultdict(list)
    for i, m in enumerate(members):
        by_district[m[2]].append(i)
    out, log = {}, []
    for key in sorted(spec['floterials'], key=natkey):
        f = spec['floterials'][key]
        county = key.rsplit(' ', 1)[0]
        idx = by_district.get(key, [])
        if key in base_keys:
            raise SystemExit(f'NH floterial {key!r} is also a base district')
        if county not in COUNTY_FIPS or not idx:
            raise SystemExit(f'NH floterial {key!r}: unknown county or no member of the page holds it')
        if len(idx) > f['seats']:   # fewer members than seats is a vacancy (the page lists members in office)
            raise SystemExit(f'NH floterial {key!r}: nh_floterials.json says {f["seats"]} seats, the page lists {len(idx)} members')
        # `of` (the base districts, read from the statute by nh_statute.py + nh_floterials.py) is the answer. When every
        # town also resolves on the Census map, the geometry has to agree with it (a second, independent check); a floterial
        # that lists city wards cannot be placed on a town map, so it rests on the statute alone.
        stat_of = sorted(f['of'], key=natkey) if f.get('of') else None
        if stat_of is not None and any(k not in base_keys for k in stat_of):
            raise SystemExit(f'NH floterial {key!r}: `of` names a district that is not a base district: {stat_of}')
        geo = None
        hits = [[t for t in towns if t['name'] == name and t['county'] == COUNTY_FIPS[county]] for name in f['towns']]
        if all(len(h) == 1 for h in hits):
            units = [feature_geom(h[0]['rings']) for h in hits]
            area = shapely.union_all(units)
            of, shares = [], {}
            for k in sorted(keep, key=natkey):
                g = keep[k][1]
                share = g.intersection(area).area / g.area
                if share >= FLO_INSIDE:
                    of.append(k)
                elif share > FLO_SLIVER:
                    raise SystemExit(f'NH floterial {key!r}: base district {k!r} is only {share:.1%} inside the listed towns, '
                                     f'so the towns are not a union of whole base districts')
                shares[k] = share
            covered = area.intersection(shapely.union_all([keep[k][1] for k in of])).area / area.area if of else 0
            if not of or covered < FLO_INSIDE:
                raise SystemExit(f'NH floterial {key!r}: the base districts found cover only {covered:.1%} of the listed towns')
            geo = (of, shares, covered)
            if stat_of is not None and sorted(of, key=natkey) != stat_of:
                raise SystemExit(f'NH floterial {key!r}: the statute says base districts {stat_of} but the Census towns give {of}')
        elif stat_of is None:
            raise SystemExit(f'NH floterial {key!r}: a town was not found exactly once in {county} County and no `of` is given')
        of = stat_of if stat_of is not None else geo[0]
        polys = [Polygon(ext, holes) for k in of for ext, holes in keep[k][0]]
        union = shapely.union_all(polys)
        parts = finish_district(union, dec, min_area, union)
        x0, y0, x1, y1 = bbox_of(parts)
        c = label_point(parts, dec)
        out[key] = {
            'd': path_of(parts, dec),
            'c': [num(c[0], dec), num(c[1], dec)],
            'b': [num(x0, dec), num(y0, dec), num(x1, dec), num(y1, dec)],
            'n': 'Floterial district ' + key,
            'm': idx,
            'of': of,
        }
        check = (f'least inside {min(geo[1][k] for k in of):.1%}, towns covered {geo[2]:.1%}' if geo
                 else 'statute only (city wards, no Census town shape)')
        log.append(f'   floterial {key}: {len(idx)} seats, {len(f["towns"])} towns -> base districts {", ".join(of)} ({check})')
    return out, log


# ---- MAIN --------------------------------------------------------------------------------------------------
def build_chamber(st, ch, feats, members, state_bbox, args, keep=None):
    """Returns (json object for this chamber, stats dict). `keep`, when given, receives key -> (drawn parts, raw geometry)."""
    w, h = state_bbox[2] - state_bbox[0], state_bbox[3] - state_bbox[1]
    z = min(max(min(STAGE_W / w, STAGE_H / h), Z_MIN), Z_MAX)
    tol = args.tol_screen / z
    dec = next(d for d in (1, 2, 3, 4) if 10 ** -d <= args.quant_screen / z or d == 4)
    min_area = min(MIN_AREA_MAP, MIN_AREA_SCREEN / z ** 2)

    recs, geoms = [], []
    for f in feats:
        g = feature_geom(f['rings'])
        if g is None:
            raise SystemExit(f'{st} {ch}: district {f["name"]} has no usable geometry')
        recs.append(f)
        geoms.append(g)
    simp = simplify_coverage(geoms, tol)

    # polygons by comparison name
    byname = collections.defaultdict(list)
    for i, f in enumerate(recs):
        byname[norm(f['name'])].append(i)
    dup = {k: v for k, v in byname.items() if len(v) > 1}
    if dup:
        raise SystemExit(f'{st} {ch}: two polygons share a name: {dup}')

    holders = collections.defaultdict(list)       # polygon index -> member indices
    unmatched, nongeo = [], []
    for i, m in enumerate(members):
        if m[2] in NONGEO.get((st, ch), ()):
            nongeo.append((i, m[2]))
            continue
        hit = byname.get(norm(member_polygon_name(st, ch, m[2])))
        if hit:
            holders[hit[0]].append(i)
        else:
            unmatched.append((i, m[2]))

    districts, keys_used = {}, {}
    nbytes = 0
    memberless = []
    for i, f in enumerate(recs):
        ms = holders.get(i, [])
        strings = {members[j][2] for j in ms}
        key = strings.pop() if len(strings) == 1 else canonical_key(f['name'])
        if key in districts:
            raise SystemExit(f'{st} {ch}: duplicate key {key!r}')
        parts = finish_district(simp[i], dec, min_area, geoms[i])
        x0, y0, x1, y1 = bbox_of(parts)
        c = label_point(parts, dec)
        districts[key] = {
            'd': path_of(parts, dec),
            'c': [num(c[0], dec), num(c[1], dec)],
            'b': [num(x0, dec), num(y0, dec), num(x1, dec), num(y1, dec)],
            'n': canonical_key(f['lsad']),
            'm': ms,
        }
        if not ms:
            memberless.append(key)
        if keep is not None:
            keep[key] = (parts, geoms[i])
    ordered = {k: districts[k] for k in sorted(districts, key=natkey)}
    stats = {
        'polygons': len(recs), 'members': len(members), 'matched': sum(len(v) for v in holders.values()),
        'unmatched': unmatched, 'nongeo': nongeo, 'memberless': sorted(memberless, key=natkey),
        'z': round(z, 2), 'tol': round(tol, 4), 'dec': dec, 'min_area': min_area,
    }
    return ordered, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only')
    ap.add_argument('--tol-screen', type=float, default=TOL_SCREEN)
    ap.add_argument('--quant-screen', type=float, default=QUANT_SCREEN)
    args = ap.parse_args()

    geo = json.load(open(f'{args.work}/geo.json'))['states']
    leg = json.load(open(f'{args.work}/leg.json'))['states']
    feats = collections.defaultdict(list)
    for layer, ch in (('sldu', 'u'), ('sldl', 'l')):
        for f in json.load(open(f'{args.work}/pj_{layer}.json')):
            if f['st'] in leg and not str(f['code']).startswith('ZZ'):   # ZZ = "districts not defined" (water)
                feats[(f['st'], ch)].append(f)
    towns = None
    if os.path.exists(f'{args.work}/pj_cousub.json'):
        towns = [f for f in json.load(open(f'{args.work}/pj_cousub.json')) if f['st'] == 'NH']
    os.makedirs(args.out, exist_ok=True)
    only = set(args.only.split(',')) if args.only else None
    overlay_path = f'{args.work}/overlay.json'      # written by tiger_update.py: {"MI": ["u"], ...}
    overlay = json.load(open(overlay_path)) if os.path.exists(overlay_path) else {}

    rows, total = [], 0
    for st in sorted(leg):
        if only and st not in only:
            continue
        doc = {'v': 1, 'src': SRC}
        if st in overlay:
            doc['src'] = SRC + '; ' + ' and '.join(CHAMBER_NAME[c] for c in overlay[st]) + SRC_2026
            doc['note'] = NOTES[st]
        hashes = {}
        for ch in ('u', 'l', 'g'):
            members = leg[st].get(ch)
            if members is None:
                continue
            layer_ch = 'u' if ch == 'g' else ch    # Nebraska's single chamber is drawn from the Census upper-house layer
            keep = {} if (st, ch) == ('NH', 'l') else None
            obj, stats = build_chamber(st, ch, feats[(st, layer_ch)], members, geo[st]['b'], args, keep)
            doc[ch] = obj
            if keep is not None and os.path.exists(FLOTERIALS):
                if towns is None:
                    raise SystemExit('pj_cousub.json is missing: run read_shp.py cousub and project.mjs (see run.sh)')
                spec = json.load(open(FLOTERIALS, encoding='utf-8'))
                fl, log = build_floterials(spec, members, keep, towns, stats['dec'], stats['min_area'])
                print('\n'.join(log))
                if fl:
                    doc['f'] = fl
                    held = {i for v in fl.values() for i in v['m']}
                    stats['unmatched'] = [(i, d) for i, d in stats['unmatched'] if i not in held]
                    stats['matched'] += len(held)
                    stats['floterial'] = len(fl)
            hashes[ch] = roster_hash(members)
            stats.update(st=st, ch=ch)
            rows.append(stats)
        doc['h'] = hashes
        text = json.dumps(doc, separators=(',', ':'), ensure_ascii=False)
        with open(f'{args.out}/{st}.json', 'w', encoding='utf-8') as f:
            f.write(text)
        size = len(text.encode('utf-8'))
        total += size
        for r in rows:
            if r['st'] == st:
                r['bytes'] = size
        print(f'{st}: {size/1024:6.0f} KB  ' + '  '.join(
            f"{r['ch']}: {r['polygons']} polys, {r['matched']}/{r['members']} members, z={r['z']} dec={r['dec']}"
            for r in rows if r['st'] == st))
    print(f'total {total/1e6:.2f} MB in {len(set(r["st"] for r in rows))} files')
    json.dump(rows, open(f'{args.work}/build_stats.json', 'w'))


if __name__ == '__main__':
    main()
