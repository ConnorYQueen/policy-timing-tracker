"""Step 2: read one Census shapefile (via pyshp) into a plain lon/lat JSON file for project.mjs.

Usage:  python3 -I read_shp.py <layer: sldu|sldl|state|cousub> <shapefile_basename_without_extension> <out.json>

Output: [{"st":"CA","code":"019","name":"19","lsad":"State Senate District 19","g":[ [ring, ring...], ... ]}, ...]
where "g" is a list of polygons and each polygon is a list of rings (outer ring first, holes after),
rings are lists of [lon, lat]. Rings are wound the way d3-geo wants them (outer clockwise, holes
counter-clockwise when drawn with x = lon, y = lat), which is also how Census shapefiles are wound.
"""
import json, sys
import shapefile  # pyshp
from shapely.geometry import Polygon

CODE = {'sldu': 'SLDUST', 'sldl': 'SLDLST', 'state': 'STATEFP', 'cousub': 'COUSUBFP'}


def signed_area(ring):
    a = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        a += x0 * y1 - x1 * y0
    return a / 2.0  # > 0 counter-clockwise


def polygons(shape):
    """Group the parts of a shape into polygons: outer rings (clockwise) and the holes inside them."""
    pts = shape.points
    parts = list(shape.parts) + [len(pts)]
    rings = [[list(map(float, p)) for p in pts[a:b]] for a, b in zip(parts, parts[1:])]
    rings = [r for r in rings if len(r) >= 4]
    outers = [r for r in rings if signed_area(r) < 0]
    holes = [r for r in rings if signed_area(r) >= 0]
    polys = [[r] for r in outers]
    shells = [Polygon(r) for r in outers]
    for h in holes:
        hp = Polygon(h).representative_point()
        cands = [i for i, s in enumerate(shells) if s.contains(hp)]
        if not cands:  # a hole with no shell: keep it as its own shell, reversed (should not happen)
            polys.append([h[::-1]])
            continue
        i = min(cands, key=lambda i: shells[i].area)
        polys[i].append(h)
    return polys


def main(layer, base, out):
    r = shapefile.Reader(base, encoding='utf-8')
    fields = [f[0] for f in r.fields[1:]]
    res = []
    for sr in r.iterShapeRecords():
        rec = dict(zip(fields, sr.record))
        item = {
            'st': rec.get('STUSPS'),
            'code': rec[CODE[layer]],
            'name': rec.get('NAME'),
            'lsad': rec.get('NAMELSAD'),
            'g': polygons(sr.shape),
        }
        if 'COUNTYFP' in rec:      # county subdivisions: the county tells two towns of the same name apart
            item['county'] = rec['COUNTYFP']
        res.append(item)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(res, f, separators=(',', ':'), ensure_ascii=False)
    print(layer, len(res), 'features ->', out)


if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] not in CODE:
        sys.exit(__doc__)
    main(*sys.argv[1:])
