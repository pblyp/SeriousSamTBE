#!/bin/bash
# Puts the two games' demos into the site, each in a folder of its own with the list of its files
# (demo-files.json, see tools/make_demo_list.mjs), which the page downloads (from mirrors, and
# else from these files) and keeps in IndexedDB:
#   demo/tfe/   The First Encounter's (see fetch_demo_data.sh), only what the page takes of it
#               (see skip in shell/config.js and isNeeded() in shell/main.js): not TBE's own
#               scripts, controls and settings, the recorded demos, the intro flyover that played
#               behind the menu, the 1.10 engine data (the base package's SE1_10b.gro) or the
#               editor's data; and its group files without what The Second Encounter's demo and the
#               base package have too (see tools/pack_demo.py)
#   demo/tse/   The Second Encounter's (see fetch_tse_demo.sh)
# Both without empty files (placeholders the game doesn't need), their group files with their
# files stored, and served xz-compressed (tools/pack_demo.py). Each one is fetched first if it
# isn't there yet. The base package must be staged first (package_base.sh), to trim against.
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

BASE_DIR="$BUILD_DIR/base-data-SamTBE"
if [ ! -d "$BASE_DIR" ]; then
  echo "Stage the base package first (package_base.sh <dist dir> SamTBE)" >&2
  exit 1
fi

# the demos as the page takes them
STAGE_DIR="$BUILD_DIR/demo-staged"
mkdir -p "$STAGE_DIR"
rsync -a --delete --delete-excluded --min-size=1 --exclude '.DS_Store' --exclude '/demo-files.json' \
  --exclude '/Scripts/' --exclude '/Controls/' --exclude '/Data/' --exclude '/Demos/' --exclude '/Help/' \
  --exclude '/Players/' --exclude '/SaveGame/' --exclude '/Temp/' --exclude '/VirtualTrees/' \
  --exclude '/SE1_10b.gro' --exclude '/1_00_ExtraTools.gro' --exclude '/Levels/Intro.wld' \
  "$BUILD_DIR/demo-data/" "$STAGE_DIR/tfe/"
rsync -a --delete --delete-excluded --min-size=1 --exclude '.DS_Store' --exclude '/demo-files.json' \
  "$BUILD_DIR/tse-demo-data/" "$STAGE_DIR/tse/"

mkdir -p "$OUT_DIR/demo"
# (nothing else in demo/: e.g. what earlier builds put there)
find "$OUT_DIR/demo" -mindepth 1 -maxdepth 1 ! -name tfe ! -name tse -exec rm -rf {} +
python3 "$WEB_DIR/tools/pack_demo.py" "$STAGE_DIR/tse" "$OUT_DIR/demo/tse" "$STAGE_DIR/tse.json"
python3 "$WEB_DIR/tools/pack_demo.py" "$STAGE_DIR/tfe" "$OUT_DIR/demo/tfe" "$STAGE_DIR/tfe.json" \
  --trim-against "$STAGE_DIR/tse" "$BASE_DIR"
node "$WEB_DIR/tools/make_demo_list.mjs" "$OUT_DIR/demo/tfe" "$STAGE_DIR/tfe.json"
node "$WEB_DIR/tools/make_demo_list.mjs" "$OUT_DIR/demo/tse" "$STAGE_DIR/tse.json"
