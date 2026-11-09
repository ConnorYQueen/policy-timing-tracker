# Are the district shapes the maps in use for the Nov. 3, 2026 election?

Checked 2026-11-09. Question: which state legislative maps (State Senate, State House) in effect for the 2026 election
differ from the boundaries in `2027-roster/legislative-districts/<ST>.json`, which come from the Census Bureau's 2025
cartographic boundary files (GENZ2025, legislative session year 2024)?

## Answer

- **Five state chambers have a different plan in the Census Bureau's 2026 files than in its 2024 ones:**
  Michigan State Senate, Minnesota State Senate, Minnesota State House, Mississippi State Senate, Mississippi State House.
  Every other chamber in all 50 states has the same district for every one of its census blocks.
- **What we did:** rebuilt `MI.json`, `MN.json` and `MS.json` from the Census 2026 TIGER/Line files with the pipeline
  (`tiger_update.py`; deterministic, member roster hash unchanged, validation unchanged), and gave those three files a
  short `note` that the page shows in the map key. The other 47 files are byte-for-byte what they were.
- **What this rests on:** the Census Bureau's own statement and its own block-by-block data. I could not open any other
  source (see "What I could not establish"), so every row below is "as the states reported their plans to the Census
  Bureau", not an independent check against court rulings, commissions or news.

## Sources (all opened, all on www2.census.gov)

| id | what | URL |
|---|---|---|
| C26 | TIGER/Line 2026 technical documentation, section 4.19, p. 4-43: "The 2026 SLDs include the state legislative district plans as submitted by the state liaisons in Phase 4 of the Redistricting Data Program (i.e., those in effect for the 2026 election cycle). Three states (Michigan, Minnesota, and Mississippi) delineated new SLDU chamber plans for the 2026 election cycle. Two states (Minnesota and Mississippi) delineated new SLDL chamber plans for the 2026 election cycle. All other states, the District of Columbia, and Puerto Rico had no changes to their SLD boundaries from the 2024 cycle." | https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2026/TGRSHP2026_TechDoc.pdf |
| C25 | TIGER/Line 2025 technical documentation, section 4.19, p. 4-45: the 2024-cycle list (SLDU: GA, MN, MT, NC, ND, OH, WA, WI; SLDL: GA, MI, MN, MT, NY, NC, ND, OH, SC, WA, WI) and "A new SLDU plan was approved for Michigan after the Census Bureau collected these boundaries but still prior to the 2024 elections. The Michigan Senate (upper) chamber is not up for reelection until 2026, so that plan is not reflected in this product. It will instead be captured in the 2026 collection cycle." (the 2024 documentation, p. 4-44, says the same) | https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2025/TGRSHP2025_TechDoc.pdf , https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2024/TGRSHP2024_TechDoc.pdf |
| B24, B26 | Census block equivalency files (which district each 2020 census block is in) for the 2024 and 2026 cycles; `sldu24.zip`, `sldl24.zip`, `sldu26.zip`, `sldl26.zip` | https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2025/2024-state-legislative-bef/ , https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2027/2026-state-legislative-bef/ |
| T | TIGER/Line state legislative district shapefiles, vintages 2023 to 2026 (`tl_<year>_<fips>_sldu`, `_sldl`), field `LSY` | https://www2.census.gov/geo/tiger/TIGER2026/SLDU/ (and `SLDL`, `TIGER2025`, `TIGER2024`, `TIGER2023`) |
| G | The cartographic files we use: `cb_2025_us_sldu_500k.zip`, `cb_2025_us_sldl_500k.zip` | https://www2.census.gov/geo/tiger/GENZ2025/shp/ |
| P | The page's own `roster-data` (`govt.seats.<chamber>.noElection`) for which chambers had no 2026 election | `2027-roster/index.html` |

## Method and results

1. **Session year per district.** `LSY` in GENZ2025 is **2024 for all 1,961 State Senate and all 4,875 State House
   districts** (all 50 states and Puerto Rico; `check_redistricting.py --lsy`). TIGER/Line 2023 carries 2022 for every
   district, 2024 and 2025 carry 2024, 2026 carries **2026** for every district. So no file we use has a year later than 2024.
2. **Census statement.** C26 above: only MI Senate and MN, MS both chambers changed since the 2024 cycle.
3. **Block by block.** `check_redistricting.py` compares B24 with B26: 8,174,955 blocks (Senate) and 8,049,840 (House),
   identical block lists. Blocks assigned to another district: MI Senate 23,770 of 254,730; MN Senate 16 and MN House 29
   of 198,705; MS Senate 5,926 and MS House 1,256 of 112,241. **Every other state and chamber: 0.** This agrees with C26
   and does not depend on reading it.
4. **Shapes.** TIGER/Line 2025 vs 2026 (district overlap, intersection over union): MI Senate 14 of 38 districts changed
   (all in and around Detroit, and Macomb/Oakland/Wayne; overlap 0.00 to 0.94), Mississippi Senate 9 of 52 and House 5
   of 122 (overlap 0.08 to 0.7), Minnesota under 13 km2 in total (the largest single change is 1.0 km2, in 50 to 300 km2
   districts). A handful of other states show boundary differences under 3 percent of a district between 2025 and 2026
   (shoreline and line-work corrections; the block files show no change for them). Our shipped GENZ2025 shapes
   are the 2024-cycle plan: against TIGER 2025 the median district overlap is 0.999 for MI, MN, MS, AL and LA, and against
   TIGER 2026 every district of every chamber not listed as DIFFERENT overlaps at 0.956 or better (the lowest are small
   coastal districts in the New York, Illinois and Rhode Island Houses, where the 1:500,000 generalization shows). As a timeline check, TIGER 2023 to 2024 shows large shape changes in exactly the states C25 lists
   for the 2024 cycle (GA, MT, NC, ND, OH, WA, WI both chambers; MI, NY, SC House), so those new plans are already in our files.
5. **Rebuild.** For the five chambers the 2026 TIGER/Line shapes are clipped to the land of the GENZ2025 district files (TIGER
   districts run out over the Great Lakes and the Gulf; the cartographic files stop at the shoreline), thinned at about 11 m
   with one shared-border simplification, then go through the same projection, simplification and member join as every
   other state. Land left uncovered by the clip: MI Senate 0.003%, MN 0.006%, MS 0.013%. District keys, member indices and
   roster hashes are unchanged (the district numbers are the same), and every member still matches a district (MI 38 + 110,
   MN 67 + 133, MS 51 + 120 members), as before. `validate.py` on the new files: 98 chambers OK, 1 partial (New Hampshire House,
   as before), 0 failed; only the overlap figures of the three states changed (written to a scratch file, not to
   `validation-report.md`).

## State by state

Cell = status, then blocks that moved between the 2024 and 2026 Census files (of all blocks in the state), then the lowest
overlap between any of our shapes and the 2026 TIGER/Line district clipped to our land (1.000 = identical; for the five
rebuilt chambers this is against the old shape, which is the difference we fixed). "SAME" means the Census data show no change
and our shapes match them.

| State | State Senate | State House | Notes |
|---|---|---|---|
| Alabama | SAME<br>0 of 185,976<br>0.997 | SAME<br>0 of 185,976<br>0.989 | The 2025 court-ordered Senate map named in the task could not be checked in a source I could open; the Census data show no change. UNKNOWN beyond the Census. |
| Alaska | SAME<br>0 of 28,568<br>0.997 | SAME<br>0 of 28,568<br>0.986 |  |
| Arizona | SAME<br>0 of 155,444<br>0.998 | SAME<br>0 of 155,444<br>0.998 |  |
| Arkansas | SAME<br>0 of 136,422<br>0.997 | SAME<br>0 of 136,422<br>0.993 |  |
| California | SAME<br>0 of 519,723<br>0.997 | SAME<br>0 of 519,723<br>0.994 |  |
| Colorado | SAME<br>0 of 140,345<br>0.996 | SAME<br>0 of 140,345<br>0.993 |  |
| Connecticut | SAME<br>0 of 49,926<br>0.994 | SAME<br>0 of 49,926<br>0.976 |  |
| Delaware | SAME<br>0 of 20,198<br>0.993 | SAME<br>0 of 20,198<br>0.989 |  |
| Florida | SAME<br>0 of 390,066<br>0.999 | SAME<br>0 of 390,066<br>0.996 | Named in the task. No legislative change in the Census data; no other source opened. |
| Georgia | SAME (new in 2024 cycle, already in file)<br>0 of 232,717<br>0.995 | SAME (new in 2024 cycle, already in file)<br>0 of 232,717<br>0.989 | Named in the task. The 2024-cycle plans are in our file; no further change in the Census data. |
| Hawaii | SAME<br>0 of 14,732<br>0.989 | SAME<br>0 of 14,732<br>0.977 |  |
| Idaho | SAME<br>0 of 81,879<br>0.994 | SAME<br>0 of 81,879<br>0.994 |  |
| Illinois | SAME<br>0 of 369,978<br>0.983 | SAME<br>0 of 369,978<br>0.968 |  |
| Indiana | SAME<br>0 of 204,568<br>0.998 | SAME<br>0 of 204,568<br>0.995 |  |
| Iowa | SAME<br>0 of 175,199<br>0.995 | SAME<br>0 of 175,199<br>0.989 |  |
| Kansas | SAME<br>0 of 172,529<br>0.998 | SAME<br>0 of 172,529<br>0.992 | No 2026 Senate election (page data). |
| Kentucky | SAME<br>0 of 132,662<br>0.994 | SAME<br>0 of 132,662<br>0.990 |  |
| Louisiana | SAME<br>0 of 142,874<br>0.996 | SAME<br>0 of 142,874<br>0.993 | No legislative election in 2026 (page data). UNKNOWN whether a map was adopted after the Census collected plans; none shows in the Census data. No 2026 election in either chamber (page data). |
| Maine | SAME<br>0 of 47,138<br>0.994 | SAME<br>0 of 47,138<br>0.982 |  |
| Maryland | SAME<br>0 of 83,827<br>0.992 | SAME<br>0 of 83,827<br>0.979 |  |
| Massachusetts | SAME<br>0 of 107,278<br>0.993 | SAME<br>0 of 107,278<br>0.976 |  |
| Michigan | DIFFERENT<br>23,770 of 254,730<br>0.000 | SAME (new in 2024 cycle, already in file)<br>0 of 254,730<br>0.991 | Senate: new plan approved in 2024 for the 2026 election (Census 2024/2025 tech docs); rebuilt from TIGER 2026, note added. House: the 2024-cycle plan, unchanged. |
| Minnesota | DIFFERENT<br>16 of 198,705<br>0.996 | DIFFERENT<br>29 of 198,705<br>0.983 | Both chambers: Census lists new plans for 2026, but only 16 (Senate) and 29 (House) of 198,705 blocks moved; rebuilt from TIGER 2026, note added. Reason and date UNKNOWN. |
| Mississippi | DIFFERENT<br>5,926 of 112,241<br>0.081 | DIFFERENT<br>1,256 of 112,241<br>0.320 | Both chambers: new plans (5,926 and 1,256 of 112,241 blocks moved); rebuilt from TIGER 2026, note added. Reason and date UNKNOWN. No 2026 election in either chamber (page data). |
| Missouri | SAME<br>0 of 253,632<br>0.997 | SAME<br>0 of 253,632<br>0.987 | Named in the task. No legislative change in the Census data; no other source opened. |
| Montana | SAME (new in 2024 cycle, already in file)<br>0 of 88,417<br>0.993 | SAME (new in 2024 cycle, already in file)<br>0 of 88,417<br>0.987 |  |
| Nebraska | SAME<br>0 of 119,103<br>0.977 | none |  |
| Nevada | SAME<br>0 of 57,409<br>0.997 | SAME<br>0 of 57,409<br>0.994 |  |
| New Hampshire | SAME<br>0 of 31,948<br>0.995 | SAME<br>0 of 31,948<br>0.976 | Not touched (file owned elsewhere). Floterial House districts have no Census shape (see README). |
| New Jersey | SAME<br>0 of 137,972<br>0.995 | SAME<br>0 of 137,972<br>0.995 | No 2026 election in either chamber (page data). |
| New Mexico | SAME<br>0 of 107,215<br>0.992 | SAME<br>0 of 107,215<br>0.990 | No 2026 Senate election (page data). |
| New York | SAME<br>0 of 288,819<br>0.989 | SAME (new in 2024 cycle, already in file)<br>0 of 288,819<br>0.956 | Named in the task. The 2024-cycle House plan is in our file; no further change in the Census data. |
| North Carolina | SAME (new in 2024 cycle, already in file)<br>0 of 236,638<br>0.995 | SAME (new in 2024 cycle, already in file)<br>0 of 236,638<br>0.994 |  |
| North Dakota | SAME (new in 2024 cycle, already in file)<br>0 of 84,566<br>0.983 | SAME (new in 2024 cycle, already in file)<br>0 of 84,566<br>0.983 | Named in the task. The 2024-cycle plans are in our file; no further change in the Census data. |
| Ohio | SAME (new in 2024 cycle, already in file)<br>0 of 276,428<br>0.994 | SAME (new in 2024 cycle, already in file)<br>0 of 276,428<br>0.989 | Named in the task. The 2024-cycle plan (both chambers) is in our file; no further change in the Census data. |
| Oklahoma | SAME<br>0 of 180,154<br>0.990 | SAME<br>0 of 180,154<br>0.996 |  |
| Oregon | SAME<br>0 of 130,807<br>0.997 | SAME<br>0 of 130,807<br>0.994 |  |
| Pennsylvania | SAME<br>0 of 336,985<br>0.990 | SAME<br>0 of 336,985<br>0.978 |  |
| Rhode Island | SAME<br>0 of 25,649<br>0.981 | SAME<br>0 of 25,649<br>0.969 |  |
| South Carolina | SAME<br>0 of 146,844<br>0.992 | SAME (new in 2024 cycle, already in file)<br>0 of 146,844<br>0.986 | No 2026 Senate election (page data). |
| South Dakota | SAME<br>0 of 71,383<br>0.990 | SAME<br>0 of 71,383<br>0.990 |  |
| Tennessee | SAME<br>0 of 179,717<br>0.994 | SAME<br>0 of 179,717<br>0.991 | Named in the task. No legislative change in the Census data; no other source opened. |
| Texas | SAME<br>0 of 668,757<br>0.998 | SAME<br>0 of 668,757<br>0.994 | Named in the task. No legislative change in the Census data; I could not open any other source on mid-decade redistricting. |
| Utah | SAME<br>0 of 71,207<br>0.996 | SAME<br>0 of 71,207<br>0.986 | Named in the task. No legislative change in the Census data; no other source opened. |
| Vermont | SAME<br>0 of 24,611<br>0.992 | SAME<br>0 of 24,611<br>0.972 |  |
| Virginia | SAME<br>0 of 163,491<br>0.992 | SAME<br>0 of 163,491<br>0.988 | No 2026 election in either chamber (page data). |
| Washington | SAME (new in 2024 cycle, already in file)<br>0 of 158,093<br>0.995 | SAME (new in 2024 cycle, already in file)<br>0 of 158,093<br>0.995 |  |
| West Virginia | SAME<br>0 of 72,558<br>0.998 | SAME<br>0 of 72,558<br>0.988 |  |
| Wisconsin | SAME (new in 2024 cycle, already in file)<br>0 of 203,059<br>0.996 | SAME (new in 2024 cycle, already in file)<br>0 of 203,059<br>0.990 | Named in the task. The 2024-cycle plans are in our file; no further change in the Census data. |
| Wyoming | SAME<br>0 of 53,769<br>0.992 | SAME<br>0 of 53,769<br>0.983 |  |

## What I could not establish (UNKNOWN)

- **No source other than the Census Bureau was reachable.** The session's web search budget (200 calls per turn, shared by
  every agent) was used up before my first query, and WebFetch could not resolve ballotpedia.org or en.wikipedia.org (outside
  the allowed network), so I stopped trying other sites. Bash reaches only www2.census.gov. Nothing from Ballotpedia, NCSL, court
  dockets, state commissions or news was opened.
- **Why and when Mississippi's and Minnesota's maps changed** is not in any document I opened. For Michigan only the Census
  documents above (C25, C26) say it: a new Senate plan approved before the 2024 elections, first used in 2026.
- **Alabama's State Senate.** The task names a 2025 court order. The Census files show no change for Alabama (0 of the Senate's
  blocks moved; shapes identical in TIGER 2025 and 2026). If a court-ordered map is in effect for 2026 and the Census was
  never given it, our file is out of date and I cannot tell. Same caution for any court or legislative action after the
  states' submissions (the 2026 block files are dated 2026-08-24 to 2026-08-31).
- **Louisiana** (no legislative election in 2026): whether a new legislative map was adopted for 2027 is not in the Census data
  and I did not find out.
- **Texas, Florida, Utah, Missouri, Tennessee, Ohio, New York, Georgia, Wisconsin, North Dakota** (named in the task): the
  Census data show no legislative change from the 2024 cycle for any of them in 2026, and the 2024-cycle changes
  (GA, WI, ND, OH both chambers; NY House) are already in our files. Mid-decade redistricting in 2025 and 2026 was about
  congressional maps in the states I know of; I did not open any source on that, so I cannot cite it.
- **Colors in a redrawn chamber.** The page colors a district by the member who held that district number before the
  election (page data). In Michigan's State Senate those members were elected from the earlier lines. In Mississippi I do not
  know whether any seat was filled in an election held under the new lines, so the note says "may have been". The notes on
  these files say so.

## Reproduce

```
python3 -I tools/districts/check_redistricting.py <dir> --lsy <dir with the cb_2025 folders>   # block files, ~140 MB
PYTHON=.venv/bin/python tools/districts/run.sh                                                  # rebuilds all 50 files
```
