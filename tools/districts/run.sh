#!/usr/bin/env bash
# Rebuild 2027-roster/legislative-districts/*.json from the Census files and the page's own data.
#
#   tools/districts/run.sh [work_dir]
#
# work_dir (default tools/districts/.work, git-ignored) receives the downloads and intermediate files.
# Needs: python3 with shapely>=2.1, pyshp, numpy (see requirements.txt); node >= 18 (uses the repo's d3.min.js).
# Set PYTHON=/path/to/venv/bin/python to use a virtualenv.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WORK=${1:-$HERE/.work}
PY=${PYTHON:-python3}
PAGE="$ROOT/2027-roster/index.html"
OUT="$ROOT/2027-roster/legislative-districts"
DATA="$WORK/data"
B="$WORK/build"
mkdir -p "$DATA" "$B"

echo "== 1. download the Census cartographic boundary files (kept in $DATA, treated as untrusted data)"
"$PY" -I "$HERE/fetch.py" "$DATA"

echo "== 2. read the page's map and member data"
"$PY" -I "$HERE/extract_page_data.py" "$PAGE" "$B"

echo "== 3. shapefiles -> lon/lat JSON -> the page's projection"
for layer in state sldu sldl; do
  "$PY" -I "$HERE/read_shp.py" "$layer" "$DATA/cb_2025_us_${layer}_500k/cb_2025_us_${layer}_500k" "$B/ll_${layer}.json"
  node "$HERE/project.mjs" "$B/ll_${layer}.json" "$B/pj_${layer}.json"
done

# New Hampshire's towns (county subdivisions): used only to read the floterial districts' towns (nh_floterials.json)
"$PY" -I "$HERE/read_shp.py" cousub "$DATA/cb_2025_33_cousub_500k/cb_2025_33_cousub_500k" "$B/ll_cousub.json"
node "$HERE/project.mjs" "$B/ll_cousub.json" "$B/pj_cousub.json"

echo "== 4. prove the projection against the page's own state shapes"
"$PY" -I "$HERE/check_projection.py" "$B/geo.json" "$B/pj_state.json"

echo "== 5. simplify, join to members, write the per-state files"
"$PY" -I "$HERE/build.py" --work "$B" --out "$OUT"

echo "== 6. validate against the page"
"$PY" -I "$HERE/validate.py" --page "$PAGE" --dir "$OUT" --report "$HERE/validation-report.md"
echo "== 7. spatial sanity check: do the parties sit on the map the way real legislatures do (informational)"
"$PY" -I "$HERE/check_spatial.py" --page "$PAGE" --dir "$OUT" --out "$HERE/spatial-check.md" | tail -3
echo "done: $OUT  (reports: $HERE/validation-report.md, $HERE/spatial-check.md)"
