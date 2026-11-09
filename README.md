# Politicians Finances

**Live sites**

- Politicians Finances: https://connoryqueen.github.io/policy-timing-tracker/
- The 2027 Roster: https://connoryqueen.github.io/policy-timing-tracker/2027-roster/

Money that reached presidents’ families and connected firms, trades placed just before government announcements, and what investigators did about it, for Trump, Biden and Obama, plus the same check of every senator and 55 House members. Every item links to its sources. Being listed here is not proof of wrongdoing.

The site opens in any browser, phones included, with no account or sign-in. Data as of October 18, 2026.

## What's in this repository

- `index.html`: the page.
- `core.js`, `pres.js`, `pages.js`: the charts and tables.
- `dash-runtime.js`: a small runtime that loads the data into the page.
- `theme.css`: the light and dark color themes.
- `data.js` and `data/*.csv`: the data. Readers can download the CSV files from the bottom of the page.
- `d3.min.js`: the d3 charting library, version 7.9.0 (ISC license, see `LICENSE-d3.txt`).
- `2027-roster/`: The 2027 Roster, a separate one-page dashboard of who holds each Senate, House, and governor's seat after the 2026 midterms, with campaign money. Live at https://connoryqueen.github.io/policy-timing-tracker/2027-roster/. A Federal | State slider at the top switches it to State, which shows who controls each state's governor's office and both legislative chambers, and whether one party holds all three, with a source for each state, the seat count in each chamber, and the state senators and representatives in office before the election (from Open States, as of Nov. 5, 2026). State chamber control is as of Nov. 4, 2026. The State Senate and State House stops also draw each chamber's district map (shapes in `2027-roster/legislative-districts/`, built from Census Bureau boundary files by the scripts in `tools/districts/`), a seat-by-seat chart, and veto-override thresholds.

## Hosting

GitHub Pages serves the `main` branch from the repository root. The empty `.nojekyll` file tells Pages to serve the files exactly as they are. Everything runs in the reader's browser; nothing runs on a server.
