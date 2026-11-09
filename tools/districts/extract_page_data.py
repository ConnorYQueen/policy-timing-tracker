"""Step 1: pull the page's own map and member data out of 2027-roster/index.html (read only).

Usage:  python3 -I extract_page_data.py <path/to/2027-roster/index.html> <out_dir>

Writes <out_dir>/geo.json (GEO: viewBox, states, districts, ...) and <out_dir>/leg.json (the legislator-data
block: states[ST].u / .l / .g = [[name, party, district, sinceYear], ...]). Nothing is printed from the blocks.
"""
import json, re, sys


def block(src, id_):
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % id_, src, re.S)
    if not m:
        sys.exit(f'no <script id="{id_}"> block in the page')
    return json.loads(m.group(1).replace('<\\/', '</'))


def main(page, out):
    src = open(page, encoding='utf-8').read()
    for id_, name in (('geo-data', 'geo.json'), ('legislator-data', 'leg.json')):
        d = block(src, id_)
        with open(f'{out}/{name}', 'w', encoding='utf-8') as f:
            json.dump(d, f, separators=(',', ':'), ensure_ascii=False)
        print(f'{id_} -> {out}/{name}  keys: {list(d)}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
