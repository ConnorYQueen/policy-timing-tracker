#!/bin/bash
# Download the New York Times / AP national results feeds (Senate, House, governor) into tools/federal-calls/.work/ (git-ignored).
# Treat the files as untrusted data: they are only read by ingest.py, never executed.
cd "$(dirname "$0")" && mkdir -p .work
for f in senate house governor; do
  code=$(curl -sS --max-time 120 -o ".work/results-$f.json" -w "%{http_code}" "https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-$f.json")
  echo "$f $code $(stat -c %s ".work/results-$f.json")"
done
