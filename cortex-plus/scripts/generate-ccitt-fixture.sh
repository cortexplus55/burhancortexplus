#!/usr/bin/env bash
# Generate a tiny CCITT G4 scanned PDF fixture for unit tests.
# Requires: ImageMagick (convert), libtiff-tools (tiffcp, tiff2pdf)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/tests/fixtures/ccitt-scan-3page.pdf"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for i in 1 2 3; do
  convert -size 600x800 xc:white -font DejaVu-Sans -pointsize 36 -fill black \
    -gravity center -annotate 0 "CORTEX TEST 123\nAnayasa md ${i}" \
    -threshold 50% -compress Group4 "TIFF:${TMP}/p${i}.tif"
done
tiffcp "${TMP}/p1.tif" "${TMP}/p2.tif" "${TMP}/p3.tif" "${TMP}/all.tif"
tiff2pdf -o "$OUT" "${TMP}/all.tif"
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
