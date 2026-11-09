"""Which state legislative maps changed between the 2024 and the 2026 election cycle, according to the Census Bureau?

Usage:  python3 -I check_redistricting.py <data_dir> [--lsy <GENZ_data_dir>]

Downloads the Census block equivalency files (BEFs) of the two cycles from www2.census.gov into <data_dir> (about 140 MB;
treated as untrusted data: they are only read as text, never unpacked or executed) and compares, state by state and
chamber by chamber, which district each of the 8.2 million 2020 census blocks is assigned to:

  2024 cycle  .../rdo/mapping-files/2025/2024-state-legislative-bef/sldu24.zip, sldl24.zip
  2026 cycle  .../rdo/mapping-files/2027/2026-state-legislative-bef/sldu26.zip, sldl26.zip   ("the 2026 election cycle")

A chamber whose plan did not change has the same district for every block. The table goes to stdout (one row per state
and chamber with any change; everything not listed is identical); redistricting-check.md has the result and sources.
With --lsy it also prints the legislative session year (LSY) the cartographic boundary files carry (fetch.py's
cb_2025_us_sldu_500k / sldl_500k folders in <GENZ_data_dir>), which is 2024 for every district of every state.
"""
import collections, os, sys, urllib.request, zipfile

BASE = 'https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files'
FILES = {
    ('U', 24): f'{BASE}/2025/2024-state-legislative-bef/sldu24.zip',
    ('L', 24): f'{BASE}/2025/2024-state-legislative-bef/sldl24.zip',
    ('U', 26): f'{BASE}/2027/2026-state-legislative-bef/sldu26.zip',
    ('L', 26): f'{BASE}/2027/2026-state-legislative-bef/sldl26.zip',
}
FIPS = {'01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
        '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
        '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
        '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
        '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
        '56': 'WY', '72': 'PR'}


def fetch(url, folder):
    dest = os.path.join(folder, os.path.basename(url))
    if not os.path.exists(dest):
        print('downloading', url, file=sys.stderr)
        urllib.request.urlretrieve(url, dest)
    return dest


def read(zpath, member):
    """{GEOID: district code} for the national file inside the zip, streamed."""
    out = {}
    with zipfile.ZipFile(zpath) as z, z.open(member) as f:
        head = f.readline().decode().strip().split(',')
        gi, di = head.index('GEOID'), len(head) - 1       # the district code is the last column in both layouts
        for line in f:
            p = line.decode().strip().split(',')       # strip: some lines end in CRLF
            out[p[gi]] = p[di]
    return out


def main(data_dir, genz_dir=None):
    os.makedirs(data_dir, exist_ok=True)
    rows = []
    for ch in ('U', 'L'):
        old = read(fetch(FILES[(ch, 24)], data_dir), f'NationalSLD{ch}24.txt')
        new = read(fetch(FILES[(ch, 26)], data_dir), f'NationalSLD{ch}26.txt')
        per = collections.defaultdict(lambda: [0, 0, set(), set()])
        for g, v in new.items():
            s = per[g[:2]]
            s[0] += 1
            if g not in old:
                s[1] += 1
            elif old[g] != v:
                s[1] += 1
                s[2].add(old[g])
                s[3].add(v)
        missing = len(set(old) - set(new))
        print(f'{"Senate" if ch == "U" else "House"}: {len(old):,} blocks in the 2024 file, {len(new):,} in the 2026 file, '
              f'{missing:,} only in the 2024 file')
        for k, (n, changed, before, after) in sorted(per.items()):
            if changed:
                rows.append((FIPS.get(k, k), 'State Senate' if ch == 'U' else 'State House', changed, n, len(before)))
    print('\nstate | chamber | blocks assigned to another district | of | 2024-plan districts touched')
    for r in rows:
        print(' | '.join(str(x) for x in r))
    print(f'\n{len(rows)} state chambers differ; every other chamber has the same district for every block.')

    if genz_dir:
        import shapefile  # pyshp
        print('\nlegislative session year (LSY) in the cartographic boundary files:')
        for layer in ('sldu', 'sldl'):
            r = shapefile.Reader(os.path.join(genz_dir, f'cb_2025_us_{layer}_500k', f'cb_2025_us_{layer}_500k'))
            years = collections.Counter(rec.as_dict()['LSY'] for rec in r.records())
            print(f'  {layer}: {dict(years)}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        sys.exit(__doc__)
    main(args[0], args[2] if len(args) == 3 and args[1] == '--lsy' else None)
