#!/bin/bash
# Downloads the official Serious Sam: The Second Encounter demo (Windows) from archive.org,
# extracts it and stages its game data (the Palenque demo level) into web/build/tse-demo-data,
# for The Both Encounters' page, which plays it after The First Encounter's demo (see
# fetch_demo_data.sh). Only the game data is taken: TBE's own scripts, controls and settings
# are used.
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$WEB_DIR/build"
DL_DIR="$BUILD_DIR/downloads"
SRC_DIR="$BUILD_DIR/tse-demo-src"
OUT_DIR="$BUILD_DIR/tse-demo-data"

DEMO_URL="https://archive.org/download/serioussamsedemo/SeriousSamSEDemo.exe"

SEVENZIP="$(command -v 7zz || command -v 7z || true)"
if [ -z "$SEVENZIP" ]; then
  echo "7-Zip is required (brew install sevenzip / apt install 7zip)" >&2
  exit 1
fi

mkdir -p "$DL_DIR"
file="$DL_DIR/$(basename "$DEMO_URL")"
if [ ! -s "$file" ]; then
  echo "Downloading $DEMO_URL"
  curl -fL --retry 3 -o "$file.part" "$DEMO_URL"
  mv "$file.part" "$file"
fi
(cd "$DL_DIR" && shasum -a 256 -c "$WEB_DIR/tse_demo_data.sha256")

rm -rf "$SRC_DIR" "$OUT_DIR"
mkdir -p "$SRC_DIR" "$OUT_DIR"
(cd "$SRC_DIR" && "$SEVENZIP" x -y "$file" >/dev/null)
# its group files and levels (the demo level, a deathmatch map, the tech test, the intro)
rsync -a --include '/*.gro' --include '/Levels/***' --exclude '*' "$SRC_DIR/Disk1/" "$OUT_DIR/"

echo "The Second Encounter's demo data staged in $OUT_DIR"
du -sh "$OUT_DIR"
