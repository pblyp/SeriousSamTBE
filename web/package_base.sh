#!/bin/bash
# Packages a game version's repository files (SE1_10b.gro, scripts, ...) with Emscripten's
# file_packager into base-data.{data,js}, which the page loads under the game files that the
# player provides (in /data).
#
#   package_base.sh <dist dir> <game dir in the repository, e.g. SamTFE>
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$WEB_DIR")"
OUT_DIR="$1"
GAME="$2"
BASE_DIR="$WEB_DIR/build/base-data-$GAME"

if [ -z "${EMSDK:-}" ]; then
  echo "Activate emsdk first (source <emsdk>/emsdk_env.sh)" >&2
  exit 1
fi
FILE_PACKAGER="$EMSDK/upstream/emscripten/tools/file_packager.py"

# the repository's files that the engine needs besides the original game data
rm -rf "$BASE_DIR"
mkdir -p "$BASE_DIR"
rsync -a --exclude 'Sources' --exclude 'Bin' --exclude 'Tools.Win32' --exclude 'GameAgent' \
  --exclude 'Mods' --exclude 'Demos' --exclude '/*.desktop' --exclude '/*.png' \
  "$REPO_DIR/$GAME/" "$BASE_DIR/"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"
python3 "$FILE_PACKAGER" base-data.data --preload "$BASE_DIR@/data" \
  --use-preload-cache --js-output=base-data.js
