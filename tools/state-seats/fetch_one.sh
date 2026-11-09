#!/bin/bash
# usage: fetch.sh slug outdir
slug=$1; out=$2
mkdir -p "$out"
code=$(curl -sS --max-time 90 -o "$out/results-$slug.json" -w "%{http_code}" "https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-$slug.json")
echo "$slug $code $(stat -c %s "$out/results-$slug.json")"
