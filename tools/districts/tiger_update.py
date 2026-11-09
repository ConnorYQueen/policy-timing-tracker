"""Step 3b: swap in the Census 2026 plan for the state chambers whose legislative map is new for the 2026 election.

Usage:  python3 -I tiger_update.py <data_dir> <work_dir>

The cartographic boundary files used by the other steps (GENZ2025) carry the 2024 legislative session year. The Census
Bureau's 2026 TIGER/Line files ("the state legislative district plans ... in effect for the 2026 election cycle") are the
first Census files to carry a newer plan, and there is no 2026 cartographic vintage yet. NEW_PLANS lists the state
chambers whose plan changed (see redistricting-check.md for how that list was established); for each one this script:

  1. reads tl_2026_<fips>_<sldu|sldl> from <data_dir> (fetch.py downloads them),
  2. clips every district to the land of the GENZ2025 chamber it replaces (the union of that state's GENZ2025 districts),
     because TIGER/Line districts run out over the Great Lakes and the Gulf while the cartographic files stop at the
     shoreline; the clip keeps the shoreline, the state outline and the look of every other state file the same,
  3. thins the full-resolution detail with one coverage simplification at PRE_TOL, far finer than the page's own
     simplification (so the look is the same) but enough that no two vertices end up closer than project.mjs's 0.001 px
     rounding, which would fold a ring over itself in build.py; neighbors keep exactly shared borders,
  4. rewrites that state's features in <work_dir>/ll_sldu.json or ll_sldl.json (written by read_shp.py) with the same
     code, name and lsad as before, so the join to members and the file keys do not change,
  5. writes <work_dir>/overlay.json ({"MI": ["u"], ...}) which build.py reads to say so in each file's "src".

Run it after read_shp.py and before project.mjs. It is a pure function of its inputs.
"""
import json, os, sys
import numpy as np
import shapefile  # pyshp
import shapely
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.polygon import orient

# state -> (FIPS, chambers). 'u' = State Senate (sldu), 'l' = State House (sldl).
# Source: TGRSHP2026_TechDoc.pdf section 4.19 ("Three states (Michigan, Minnesota, and Mississippi) delineated new SLDU
# chamber plans for the 2026 election cycle. Two states (Minnesota and Mississippi) delineated new SLDL chamber plans"),
# confirmed by comparing the Census block equivalency files sldu24/sldu26 and sldl24/sldl26 (check_redistricting.py).
NEW_PLANS = {'MI': ('26', ('u',)), 'MN': ('27', ('u', 'l')), 'MS': ('28', ('u', 'l'))}
LAYER = {'u': 'sldu', 'l': 'sldl'}
YEAR = '2026'
PRE_TOL = 1e-4     # degrees, about 11 m


def to_shapely(feature):
    polys = []
    for rings in feature['g']:
        p = Polygon(rings[0], rings[1:])
        polys.append(p if p.is_valid else shapely.make_valid(p))
    return shapely.unary_union(polys)


def polygons_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [q for part in g.geoms for q in polygons_of(part)]
    return []


def to_rings(geom):
    """Shapely geometry -> the read_shp.py layout: a list of polygons, each [outer ring, hole rings...] of [lon, lat],
    outer rings clockwise and holes counter-clockwise (as Census shapefiles are wound)."""
    out = []
    for p in sorted(polygons_of(geom), key=lambda q: (-q.area, q.bounds)):
        if p.area <= 0:
            continue
        p = orient(p, sign=-1.0)
        out.append([[list(c) for c in p.exterior.coords]] + [[list(c) for c in h.coords] for h in p.interiors])
    return out


def main(data_dir, work):
    overlay = {}
    for st, (fips, chambers) in NEW_PLANS.items():
        for ch in chambers:
            layer = LAYER[ch]
            name = f'tl_{YEAR}_{fips}_{layer}'
            reader = shapefile.Reader(os.path.join(data_dir, name, name))
            code_field = 'SLDUST' if ch == 'u' else 'SLDLST'
            tiger = {}
            for sr in reader.iterShapeRecords():
                rec = sr.record.as_dict()
                code = str(rec[code_field])
                g = shapely.make_valid(shapely.geometry.shape(sr.shape.__geo_interface__))
                tiger[code] = shapely.union(tiger[code], g) if code in tiger else g

            path = os.path.join(work, f'll_{layer}.json')
            feats = json.load(open(path, encoding='utf-8'))
            mine = [f for f in feats if f['st'] == st and not str(f['code']).startswith('ZZ')]
            old_codes = {f['code'] for f in mine}
            if old_codes != set(tiger):
                raise SystemExit(f'{st} {layer}: district codes differ between GENZ2025 and TIGER {YEAR}: '
                                 f'{sorted(old_codes ^ set(tiger))[:10]}')
            land = shapely.union_all([to_shapely(f) for f in mine])
            land = shapely.make_valid(land)

            by_code = {f['code']: f for f in mine}
            codes = sorted(by_code)
            # an intersection can come back with stray lines or points where borders only touch: keep the polygons
            clipped = np.array([MultiPolygon(polygons_of(shapely.intersection(tiger[c], land))) for c in codes], dtype=object)
            gap = shapely.difference(land, shapely.union_all(clipped)).area / land.area
            thin = shapely.coverage_simplify(clipped, PRE_TOL, simplify_boundary=True)
            new = dict(zip(codes, thin))
            print(f'{st} {layer}: {len(new)} districts from TIGER {YEAR}; land not covered after the clip: {gap * 100:.4f}%')

            for f in feats:
                if f['st'] == st and f['code'] in by_code:
                    rings = to_rings(new[f['code']])
                    if not rings:
                        raise SystemExit(f'{st} {layer} {f["code"]}: nothing left after the clip')
                    f['g'] = rings
            with open(path, 'w', encoding='utf-8') as fh:
                json.dump(feats, fh, separators=(',', ':'), ensure_ascii=False)
            overlay.setdefault(st, []).append(ch)
    with open(os.path.join(work, 'overlay.json'), 'w') as fh:
        json.dump(overlay, fh, sort_keys=True)
    print('overlay:', overlay)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
