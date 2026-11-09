// Optional check: let a real browser parse every district path and compare with what the files claim.
//
// Usage (needs playwright with Chromium installed, which the repo itself does not depend on):
//   node browser_check.mjs <legislative-districts dir>
//
// For every district it builds an SVG <path d=...>, then checks that getBBox() equals "b" (to 0.01) and that the
// label point "c" is inside the fill (isPointInFill, nonzero rule, the page's default).
import { readFileSync, readdirSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const dir = process.argv[2];
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<svg id="s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 975 610"></svg>');
let n = 0, bad = [];
for (const f of files) {
  const doc = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const items = [];
  for (const ch of ['u', 'l', 'g']) for (const [k, d] of Object.entries(doc[ch] || {})) items.push([ch, k, d]);
  const res = await page.evaluate(items => {
    const svg = document.getElementById('s'), out = [];
    for (const [ch, k, d] of items) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d.d);
      svg.appendChild(p);
      const bb = p.getBBox();
      const inside = p.isPointInFill(new DOMPoint(d.c[0], d.c[1]));
      out.push([ch, k, [bb.x, bb.y, bb.x + bb.width, bb.y + bb.height], inside]);
      svg.removeChild(p);
    }
    return out;
  }, items.map(([ch, k, d]) => [ch, k, { d: d.d, c: d.c }]));
  res.forEach(([ch, k, bb, inside], i) => {
    n++;
    const want = items[i][2].b;
    const off = Math.max(...bb.map((v, j) => Math.abs(v - want[j])));
    if (off > 0.011) bad.push(`${f} ${ch} ${k}: browser bbox ${bb.map(v => +v.toFixed(3))} vs b ${want}`);
    if (!inside) bad.push(`${f} ${ch} ${k}: label point ${items[i][2].c} not inside the fill`);
  });
}
await browser.close();
console.log(`browser parsed ${n} districts in ${files.length} files; problems: ${bad.length}`);
bad.slice(0, 20).forEach(b => console.log('  ' + b));
process.exit(bad.length ? 1 : 0);
