# Federal race calls

The Federal side of the 2027 Roster takes its Senate, House and governor race calls from the New York Times national results feeds
(`static01.nyt.com/elections-assets/pages/data/2026-11-03/results-{senate,house,governor}.json`, the AP calls the page already cites).

```
bash tools/federal-calls/fetch.sh                    # downloads 3 files (about 8 MB) into tools/federal-calls/.work/
python3 -I tools/federal-calls/ingest.py .           # dry run: lists each new call and incumbency change
python3 -I tools/federal-calls/ingest.py . --write
```

- Only seats shown as "Too close to call" or "Leading, not called" change, and only when the AP has called one winner. The winner becomes the seat's holder,
  with the feed's final count for that race; the flip is worked out from the party that held the seat before.
- Races still not called keep their earlier vote snapshot. Runoffs, delegates and territories are not touched.
- `ingest.py` aborts if a winner is not one of the page's candidates, if the AP winner is not the top vote-getter (a ranked-choice reversal: edit that seat by hand),
  or if a race the page already calls has a different winner in the feed. It also recounts each state's incumbents (won, lost, leading, trailing, too close)
  and stops first if its recount of the page as it stands does not match the page.
- `callsAsOf` becomes the oldest of the three files' update times, shown on the page as "Race calls updated ...".
- Then update the "What this means" text by hand where it still calls these races open: `means.US.summary` (the seat counts it prints) and the
  summary and items of each state whose governor's race was called.
