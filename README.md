# Policy timing & conflicts tracker

**Live site: https://connoryqueen.github.io/policy-timing-tracker/**

Money that reached presidents’ families and connected firms, trades placed just before government announcements, and what investigators did about it, for Trump, Biden and Obama, plus the same check of every senator and 55 House members. Every item links to its sources. Being listed here is not proof of wrongdoing.

The site opens in any browser, phones included, with no account or sign-in. Data as of October 18, 2026.

## What's in this repository

- `index.html`: the page.
- `core.js`, `pres.js`, `pages.js`: the charts and tables.
- `dash-runtime.js`: a small runtime that loads the data into the page.
- `theme.css`: the light and dark color themes.
- `data.js` and `data/*.csv`: the data. Readers can download the CSV files from the bottom of the page.
- `d3.min.js`: the d3 charting library, version 7.9.0 (ISC license, see `LICENSE-d3.txt`).

## Hosting

GitHub Pages serves the `main` branch from the repository root. The empty `.nojekyll` file tells Pages to serve the files exactly as they are. Everything runs in the reader's browser; nothing runs on a server.
