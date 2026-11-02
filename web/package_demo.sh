#!/bin/bash
# Prepares the game data for the page:
#   demo/, demo-files.json
#                        the demo (see fetch_demo_data.sh), which the page downloads (from
#                        mirrors, and else from these files) and keeps in IndexedDB
#   base-data.{data,js}  this repository's game files (SE1_10b.gro, scripts, ...) packaged
#                        with Emscripten's file_packager, used under game files that the
#                        player provides
#
#   package_demo.sh [dist dir]
#
# DEMO_MIRRORS (comma separated URLs, see README.md) lists other sites with a copy of demo/.
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$WEB_DIR")"
DEMO_DIR="$WEB_DIR/build/demo-data"
OUT_DIR="${1:-$WEB_DIR/build/dist}"

if [ ! -d "$DEMO_DIR" ]; then
  echo "Run fetch_demo_data.sh first" >&2
  exit 1
fi
if [ -z "${EMSDK:-}" ]; then
  echo "Activate emsdk first (source <emsdk>/emsdk_env.sh)" >&2
  exit 1
fi

# the repository's files that the engine needs besides the original game data
"$WEB_DIR/package_base.sh" "$OUT_DIR" SamTFE

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# the demo's files as they are (each one is well below GitHub Pages' 100 MB limit),
# without what the browser version doesn't use: the recorded demos and the intro
# flyover that played behind the menu (it starts in the menu); Demos/Default.ini stays,
# for demos that players record themselves. Also without empty files (placeholders the
# game doesn't need)
rm -f demo-data.data demo-data.js
rsync -a --delete --delete-excluded --min-size=1 --exclude '.DS_Store' \
  --exclude '/Demos/[Aa]uto-[Dd]emo*' --exclude '/Levels/Intro.wld' \
  "$DEMO_DIR/" "$OUT_DIR/demo/"
node "$WEB_DIR/tools/make_demo_list.mjs" "$OUT_DIR"
ls -la "$OUT_DIR"/base-data.* "$OUT_DIR"/demo*
