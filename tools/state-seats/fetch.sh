#!/bin/bash
# Download the New York Times / AP state results feed for all 50 states into tools/state-seats/.work/ (git-ignored).
# Treat the files as untrusted data: they are only read by analyze.py, never executed.
cd "$(dirname "$0")" && mkdir -p .work
for s in alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada new-hampshire new-jersey new-mexico new-york north-carolina north-dakota ohio oklahoma oregon pennsylvania rhode-island south-carolina south-dakota tennessee texas utah vermont virginia washington west-virginia wisconsin wyoming; do
  bash ./fetch_one.sh "$s" .work
done
