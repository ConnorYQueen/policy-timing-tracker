// Step 3: project lon/lat features into the page's map coordinates (viewBox 0 0 975 610).
//
// Usage: node project.mjs <in_lonlat.json> <out_projected.json> [--precision=0]
//
// The page's map is d3's Albers USA composite (d3.geoAlbersUsa: Albers equal-area conic for the lower 48,
// Alaska at 0.35 scale and Hawaii as insets) at scale 1280 and translate [465.6, 300.6], with the Alaska and
// Hawaii insets in the places the page draws them (translates below). check_projection.py
// proves the match against the page's own state shapes. d3 is the copy checked into the repo root
// (d3.min.js, v7.9.0), so no npm install is needed.
//
// Each feature goes through the sub-projection for its state (AK, HI or the lower 48), so Alaska and Hawaii
// are never clipped away by the composite's inset boxes. Hawaii's Northwestern Islands (west of 161 W) are
// left out of the inset, like the page does.
//
// precision defaults to 0 (no adaptive resampling), so every vertex is a pure function of its lon/lat and
// two districts that share a border keep exactly shared vertices; that is what lets build.py simplify the
// borders once and keep them shared. (d3's default precision is 0.707 and moves a vertex by well under 0.1 px.)
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const d3 = require(path.join(here, '..', '..', 'd3.min.js'));

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [inFile, outFile] = args;
if (!inFile || !outFile) { console.error('usage: node project.mjs in.json out.json [--precision=0]'); process.exit(2); }

// --- the page's projection -------------------------------------------------------------------------------
// Lower 48: d3.geoAlbersUsa().scale(K).translate([X, Y]) (its lower-48 part is d3.geoAlbers()).
// Alaska and Hawaii use the same conic settings that geoAlbersUsa has inside (Alaska at 0.35 K, Hawaii at K),
// but the page draws the two insets further right and lower than geoAlbersUsa would, so their translates were
// fitted to the page's own state shapes (median vertex distance 0.07 px for Alaska, 0.03 px for Hawaii).
const K = 1280, X = 465.6, Y = 300.6;
const AK_TRANSLATE = [146.5, 561.5];   // geoAlbersUsa would use [X - 0.307 K, Y + 0.201 K] = [72.64, 557.88]
const HI_TRANSLATE = [286.5, 571.6];   // geoAlbersUsa would use [X - 0.205 K, Y + 0.212 K] = [203.2, 572.03]
const precision = +(opt.precision ?? 0);

const lower48 = d3.geoAlbers().scale(K).translate([X, Y]).precision(precision);
const alaska = d3.geoConicEqualArea().rotate([154, 0]).center([-2, 58.5]).parallels([55, 65])
  .scale(0.35 * K).translate(AK_TRANSLATE).precision(precision);
const hawaii = d3.geoConicEqualArea().rotate([157, 0]).center([-3, 19.9]).parallels([8, 18])
  .scale(K).translate(HI_TRANSLATE).precision(precision);
const PROJ = { AK: alaska, HI: hawaii };
const SKIP = new Set(['PR', 'VI', 'GU', 'MP', 'AS']);   // territories are drawn as tiles by the page, not projected

// A stream sink that collects every projected ring.
function collector() {
  const rings = []; let cur = null;
  return {
    rings,
    sink: {
      point(x, y) { if (cur) cur.push(+x.toFixed(3), +y.toFixed(3)); },
      lineStart() { cur = []; },
      lineEnd() { if (cur && cur.length >= 6) rings.push(cur); cur = null; },
      polygonStart() {}, polygonEnd() {}, sphere() {},
    },
  };
}

const feats = JSON.parse(readFileSync(inFile, 'utf8'));
const out = [];
let noOutput = [];
for (const f of feats) {
  if (SKIP.has(f.st)) continue;
  let polys = f.g;
  if (f.st === 'HI') polys = polys.filter(p => p[0].some(([lon]) => lon > -161));   // drop the Northwestern Islands
  const c = collector();
  d3.geoStream({ type: 'MultiPolygon', coordinates: polys }, (PROJ[f.st] ?? lower48).stream(c.sink));
  if (!c.rings.length) noOutput.push(f.st + ':' + f.code);
  out.push({ st: f.st, code: f.code, name: f.name, lsad: f.lsad, rings: c.rings });
}
writeFileSync(outFile, JSON.stringify(out));
console.log(`projected ${out.length} features (no output: ${noOutput.length ? noOutput.join(' ') : 'none'}) -> ${outFile}`);
