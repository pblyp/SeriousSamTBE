#!/bin/bash
# Puts the two games' demos into the site, each in a folder of its own with the list of its files
# (demo-files.json, see tools/make_demo_list.mjs), which the page downloads (from mirrors, and
# else from these files) and keeps in IndexedDB:
#   demo/tfe/   The First Encounter's (see fetch_demo_data.sh), without what the browser version
#               doesn't use: the recorded demos and the intro flyover that played behind the menu
#   demo/tse/   The Second Encounter's (see fetch_tse_demo.sh)
# Both without empty files (placeholders the game doesn't need). Each one is fetched first if
# it isn't there yet.
#
#   package_demo.sh [dist dir]
#
# DEMO_MIRRORS (comma separated URLs, see README.md) lists other sites with a copy of demo/.
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$WEB_DIR/build"
OUT_DIR="${1:-$BUILD_DIR/dist}"

if [ ! -d "$BUILD_DIR/demo-data" ]; then
  "$WEB_DIR/fetch_demo_data.sh"
fi
if [ ! -d "$BUILD_DIR/tse-demo-data" ]; then
  "$WEB_DIR/fetch_tse_demo.sh"
fi

mkdir -p "$OUT_DIR/demo"
# (nothing else in demo/: e.g. what earlier builds put there)
find "$OUT_DIR/demo" -mindepth 1 -maxdepth 1 ! -name tfe ! -name tse -exec rm -rf {} +
rsync -a --delete --delete-excluded --min-size=1 --exclude '.DS_Store' --exclude '/demo-files.json' \
  --exclude '/Demos/[Aa]uto-[Dd]emo*' --exclude '/Levels/Intro.wld' \
  "$BUILD_DIR/demo-data/" "$OUT_DIR/demo/tfe/"
rsync -a --delete --delete-excluded --min-size=1 --exclude '.DS_Store' --exclude '/demo-files.json' \
  "$BUILD_DIR/tse-demo-data/" "$OUT_DIR/demo/tse/"
node "$WEB_DIR/tools/make_demo_list.mjs" "$OUT_DIR/demo/tfe"
node "$WEB_DIR/tools/make_demo_list.mjs" "$OUT_DIR/demo/tse"
