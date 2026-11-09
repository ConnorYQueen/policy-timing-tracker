# State legislative district shapes for The 2027 Roster

Builds `2027-roster/legislative-districts/<ST>.json`: the boundaries of every state legislative district (both
chambers, 50 states), as compact SVG paths **in the same coordinate system as the page's map** (`GEO.viewBox`
`0 0 975 610`), each linked to the members who hold it in the page's `legislator-data`. The files are generated
and committed; this folder holds the scripts that make them.

## Rerun

```
python3 -m venv .venv && .venv/bin/pip install -r tools/districts/requirements.txt
PYTHON=.venv/bin/python tools/districts/run.sh        # needs node >= 18; takes about two minutes
```

`run.sh` downloads about 60 MB from `www2.census.gov` into `tools/districts/.work/` (git-ignored; treat the
downloads as untrusted data: they are only unpacked and read by pyshp, never executed), then runs, in order:

| step | script | what it does |
|---|---|---|
| 1 | `fetch.py` | downloads `cb_2025_us_sldu_500k`, `cb_2025_us_sldl_500k`, `cb_2025_us_state_500k` (GENZ2025) |
| 2 | `extract_page_data.py` | reads `geo-data` and `legislator-data` out of `2027-roster/index.html` (read only) |
| 3 | `read_shp.py`, `project.mjs` | shapefile to lon/lat JSON, then into the page's projection with d3 |
| 4 | `check_projection.py` | proves the projection against the page's own state shapes |
| 5 | `build.py` | simplifies, joins to members, writes the 50 files |
| 6 | `validate.py` | re-reads the files and checks them against the page; writes `validation-report.md` |
| 7 | `check_spatial.py` | informational: parties on the map cluster the way real legislatures do (shuffle test); writes `spatial-check.md` |

`browser_check.mjs` is an optional extra (needs Playwright/Chromium): a real browser parses every path and
confirms its bounding box and that the label point is inside the fill. The generated output is deterministic;
a rerun on the same inputs gives byte-identical files.

**Rerun whenever the member list in the page's `legislator-data` changes** (a new roster, a reordered list): the
`m` indices are positions in that list. Each file stores a hash `h` per chamber so a stale file can be detected.

## Projection

The page's map is d3's Albers USA composite (equal-area conic, parallels 29.5 and 45.5, Alaska at 0.35 scale and
Hawaii as insets) with **`scale(1280)` and `translate([465.6, 300.6])`** for the lower 48. Proof: projecting the
Census state outlines with exactly those parameters reproduces `GEO.states[ST].b` to within 0.15 px for 45 of
the 51 shapes (50 states plus DC; most agree to 0.03 px), three more (Alaska, Florida, Minnesota) are within 0.55 px,
and three (Michigan, New Hampshire, Hawaii) differ by 1.2 to 6.3 px only because of tiny islets (a rock in Lake
Superior, the Isles of Shoals, Ka'ula Rock off Hawaii), which move a bounding box but not the shape. The Alaska and Hawaii insets are not where `d3.geoAlbersUsa` puts them, so their
translates were fitted to the page's own shapes: Alaska `[146.5, 561.5]` at scale `0.35*1280`, Hawaii
`[286.5, 571.6]` at scale `1280`, with the standard rotate/center/parallels (median vertex distance to the page's
outline 0.07 px and 0.03 px). Hawaii's Northwestern Islands (west of 161 W) are left out, like the page. Run
`check_projection.py` for the numbers; the overlap (intersection over union) with the page's state shapes has a
median of 0.9995.

## File format

```
{"v":1,
 "src":"U.S. Census Bureau cartographic boundary files, 2025 vintage (GENZ2025; ...), 1:500,000",
 "u":{ "<key>":{"d":"M...Z","c":[x,y],"b":[x0,y0,x1,y1],"n":"State Senate District 1","m":[0,3]}, ... },
 "l":{ ... },                       // Nebraska has one chamber, under "g" instead of "u"/"l"
 "h":{"u":2905054787,"l":399759407} }
```

- `d` path with relative `l` runs and `Z`; holes wind opposite to their outer ring, so the default nonzero fill is
  right. A district can have several rings (islands, enclaves).
- `c` a label point inside the shape (the centroid, or the pole of inaccessibility when the centroid is outside or
  on the edge); `b` bounding box; `n` the Census name (leading zeros dropped).
- `m` indices into `LEG.states[ST][chamber]` (`u`, `l`, or `g` for Nebraska) of the members holding the district;
  `[]` if nobody in the data holds it (vacant seat). Multi-member districts list all their members.
- `<key>` is the district string used by those members in the page's data ('12', '7A', 'Hillsborough 5',
  'Berkshire, Hampden, Franklin and Hampshire', ...). For a district nobody holds it is the Census name with
  leading zeros dropped. **Exception: Idaho House.** Members there are listed by seat ('1A', '1B') but the shape is
  district '1', so the key is '1' and `m` lists both members.
- `h[chamber]` is FNV-1a (32 bit) over the members' district strings in list order, so the page can check the files
  still match its member list:

```js
function rosterHash(list){let x=2166136261;for(const m of list){const s=m[2]+'\n';for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)>>>0}}return x}
// usable when doc.h[ch] === rosterHash(LEG.states[st][ch])
```

The page (`2027-roster/index.html`, section "State mode: district map") fetches `legislative-districts/<ST>.json` the first
time a state is focused in State mode (and prefetches it when the state's panel opens), checks `h[chamber]` with the snippet
above, and draws the chamber's districts over the state at the State Senate and State House stops: the party of the member
who held the district before the Nov. 3 election (stripes when its members differ, a grey hatch when `m` is empty). A hash
that does not match shows "District map not shown: its districts do not match this page's member list" and draws nothing,
so rerun the build after the member list changes. From `file://` or offline the fetch cannot work, and the key says "District
map unavailable here; it loads when the page is served over the web."

Draw order: the district shapes do not cover water that the Census district files leave out (Sandusky Bay, Lake
Pontchartrain, Green Bay, parts of the Great Lakes), while the page's state shapes include some of it, so draw the
state shape first and the districts over it.

## Simplification and size

Each chamber is simplified as one coverage with `shapely.coverage_simplify` (GEOS, Visvalingam), so a border shared
by two districts is simplified once and stays shared: measured overlap between districts is 0.000%, and the part of
the page's state shape that no district covers is under 0.15% of the state in 45 of 50 states (Alaska 0.4%, Hawaii
1.5%, Ohio 0.75%, Wisconsin 0.4%, Louisiana Senate 1.0%: water the district files leave out, and coast/islet
differences). Everything is chosen at the zoom
the page uses when a state fills its stage (about 650 x 500 px; `z`): tolerance 0.30 screen px, coordinates snapped
to a grid of at most 0.15 screen px (1 to 4 decimals per state; Texas 0.01 map px, Rhode Island 0.001, since a fixed
0.1 map px step would show as 2.5 px steps on Rhode Island). Islands and holes smaller than
min(0.3 map px^2, 3 screen px^2) are dropped, but a district's largest part is always kept, so no district is ever
dropped. Total 5.9 MB for 6,775 districts, largest file 243 KB (SC). To change the detail, edit `TOL_SCREEN` /
`QUANT_SCREEN` in `build.py` and rerun step 5 and 6.

## Joining districts to members

Census `NAME` and the page's district strings are reduced to a common form (`norm()` in `build.py`: lower case, leading
zeros dropped, the word "and" dropped, punctuation and spaces removed), which handles plain numbers, Alaska letters,
Minnesota/Maryland/South Dakota/North Dakota sub-districts ('7A', '4B'), New Hampshire county names ('Merrimack 8' =
Census 'Merrimack 08'), Massachusetts names ('Berkshire, Hampden, Franklin and Hampshire' = Census
'Berkshire-Hampden-Franklin-Hampshire'), Vermont names ('Windsor-Orange-1') and multi-member districts (Arizona,
Washington, New Jersey, West Virginia Senate, South Dakota, North Dakota, Vermont). State rules on top of that:

- Idaho House: seat letter stripped ('1A', '1B' -> district 1).
- Census placeholder polygons "State Senate/House Districts not defined" (code `ZZZ`: Louisiana Senate, Wisconsin
  both chambers) are dropped; they are areas outside every district.
- Maine House: the two tribal representatives in the data (Houlton Band of Maliseet Indians, Passamaquoddy Tribe) have
  no geographic district and stay unmatched by design.
- Washington, DC and Puerto Rico are out of scope.

## Caveats

- **Vintage.** Boundaries are the Census 2025 cartographic boundary files, which carry legislative session year
  **2024** (field `LSY`). They are not necessarily the maps used in the 2026 elections; a state legislative map
  changed after the 2024 session (by court order, a special session or a referendum) is not reflected, and which
  states that covers was not checked here. The join is by district name, so a redrawn state would still join but the
  shapes could be old. For every single-member chamber the polygon count equals the chamber's seat count
  (table in `validation-report.md`).
- **New Hampshire House is partial.** The Census publishes the 164 non-overlapping districts; the 39 floterial
  districts (e.g. 'Rockingham 31' to 'Rockingham 40', 'Hillsborough 37' to '45') overlay them and have no shape, so
  their 55 members have no district on the map.
- **Generalized, shoreline-clipped boundaries** (1:500,000): good for a state-scale map, not for finding which
  district an address is in.
- **Members are those in office before the Nov. 3, 2026 election** (the page's `legislator-data`); districts show who
  held them, not who won.
- Colors by party come from the member list: a vacancy (`"m":[]`) has no party.
