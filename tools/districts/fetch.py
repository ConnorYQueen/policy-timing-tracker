"""Download the Census cartographic boundary files used for the state legislative district maps.

Usage:  python3 -I fetch.py <data_dir>

Everything goes into <data_dir> (one sub-folder per file; pass an empty or new folder, outside the repo
or in the git-ignored tools/districts/data/). The downloaded archives are treated as untrusted data:
they are only unpacked (never executed) and only read later by pyshp.
"""
import hashlib, os, sys, urllib.request, zipfile

BASE = 'https://www2.census.gov/geo/tiger'
# name -> path under BASE. 2025 is the vintage used; the state outline file is only used to prove the projection.
FILES = {
    'cb_2025_us_sldu_500k': 'GENZ2025/shp/cb_2025_us_sldu_500k.zip',
    'cb_2025_us_sldl_500k': 'GENZ2025/shp/cb_2025_us_sldl_500k.zip',
    'cb_2025_us_state_500k': 'GENZ2025/shp/cb_2025_us_state_500k.zip',
}
KEEP = ('.shp', '.shx', '.dbf', '.prj', '.cpg')  # only the pieces pyshp needs


def main(out):
    os.makedirs(out, exist_ok=True)
    for name, rel in FILES.items():
        dest = os.path.join(out, name)
        if os.path.exists(os.path.join(dest, name + '.shp')):
            print('have', name); continue
        os.makedirs(dest, exist_ok=True)
        zpath = os.path.join(out, name + '.zip')
        print('downloading', rel)
        urllib.request.urlretrieve(f'{BASE}/{rel}', zpath)
        print('  sha256', hashlib.sha256(open(zpath, 'rb').read()).hexdigest())
        with zipfile.ZipFile(zpath) as z:
            for info in z.infolist():
                base = os.path.basename(info.filename)  # flatten: never trust paths inside the archive
                if base.lower().endswith(KEEP) and base == name + os.path.splitext(base)[1]:
                    with z.open(info) as src, open(os.path.join(dest, base), 'wb') as dst:
                        dst.write(src.read())
        print('  unpacked', sorted(os.listdir(dest)))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
