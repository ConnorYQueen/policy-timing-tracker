# State chamber seat counts

The State side of the 2027 Roster takes each legislative chamber's seat count from the New York Times state results feed
(`static01.nyt.com/elections-assets/pages/data/2026-11-03/results-<state>.json`, the same host the page already uses for governors).
Per chamber it carries the whole-chamber party balance (seats not on this year's ballot included), how many races were called by the AP,
and the time of the last update.

```
bash tools/state-seats/fetch.sh                      # downloads 50 files (about 50 MB) into tools/state-seats/.work/
python3 -I tools/state-seats/analyze.py              # writes .work/analysis.json and prints one line per chamber
python3 -I tools/state-seats/ingest.py .             # dry run: shows what would change in 2027-roster/index.html
python3 -I tools/state-seats/ingest.py . --write
```

- A seat counts for a party only when the feed's balance does. A race not called is **not called** even if one candidate leads; the page says so.
- Chambers with no election in 2026 (their seats are marked `noElection`) are left as the roster of members in office.
- `ingest.py` aborts if a chamber's size differs from the page's, or if the feed disagrees with a control the page already calls.
  Where the feed settles a control that was "not called", it sets it and prints it. Then update that state's "What this means" text by hand
  (`means[ST].summary` and the `control` item), and run the checks in the brief (federal fingerprint, round trip, state pages).
- Quirks checked when this was built: Arkansas and Texas each have a special election that repeats a seat (tallying winners by race double counts it; use the balance);
  California and Hawaii have contests between two candidates of one party, which the balance already counts.
