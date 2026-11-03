#!/bin/bash
# Builds the web version, Serious Sam: The Both Encounters (SamTBE: both games' levels, from the
# player's two installations or both games' demos), into web/build/dist.
#
#   web/build.sh [Release|RelWithDebInfo|Debug] [jspi|asyncify|all]
#
# Needs an activated emsdk (source <emsdk>/emsdk_env.sh), cmake, ninja, flex, bison, node, rsync
# and 7-Zip. The demos are fetched and put into the site on the first run (see package_demo.sh).
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$WEB_DIR")"
SRC_DIR="$REPO_DIR/SamTBE/Sources"
BUILD_DIR="$WEB_DIR/build"
DIST_DIR="$BUILD_DIR/dist"
BUILD_TYPE="${1:-Release}"
VARIANTS="${2:-all}"
if [ "$VARIANTS" = "all" ]; then
  VARIANTS="jspi asyncify"
fi

if ! command -v emcmake >/dev/null; then
  echo "Activate emsdk first (source <emsdk>/emsdk_env.sh)" >&2
  exit 1
fi
# macOS ships an ancient bison; prefer Homebrew's
for d in /opt/homebrew/opt/bison/bin /opt/homebrew/opt/flex/bin /usr/local/opt/bison/bin /usr/local/opt/flex/bin; do
  if [ -d "$d" ]; then PATH="$d:$PATH"; fi
done

# 1. the entity class compiler runs on the build machine
NATIVE_DIR="$BUILD_DIR/ecc-tbe"
cmake -S "$SRC_DIR" -B "$NATIVE_DIR" -G Ninja -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$NATIVE_DIR" --target ecc-tbe
ECC="$NATIVE_DIR/ecc-tbe"

# 2. the engine, once per way of yielding to the browser
for variant in $VARIANTS; do
  out="$BUILD_DIR/wasm-tbe-$variant"
  emcmake cmake -S "$SRC_DIR" -B "$out" -G Ninja -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
    -DECC="$ECC" -DWEB_ASYNC="$(echo "$variant" | tr a-z A-Z)" >/dev/null
  cmake --build "$out" --target SeriousSamTBE
  mkdir -p "$DIST_DIR/$variant"
  cp "$out/serioussamtbe.js" "$out/serioussamtbe.wasm" "$DIST_DIR/$variant/"
done

# the page, without what earlier builds put there: The First Encounter's own page and engine, the
# page in tbo/, the engine's earlier name, and the libraries and torrents for WebTorrent and WebRTC
rm -rf "$DIST_DIR/tbo"
rm -f "$DIST_DIR"/{jspi,asyncify}/serioussam{,tbo}.{js,wasm} "$DIST_DIR"/demo-files.json "$DIST_DIR"/demo.torrent \
  "$DIST_DIR"/demo-page.torrent "$DIST_DIR"/demo-torrent.json "$DIST_DIR"/webtorrent.min.js "$DIST_DIR"/netplay-signal.js
cp -R "$WEB_DIR/shell/"* "$DIST_DIR/"

# 3. the game data: the repository's files that the engine needs besides the games' own (its
#    players' or the demos'), and the demos
"$WEB_DIR/package_base.sh" "$DIST_DIR" SamTBE >/dev/null
"$WEB_DIR/package_demo.sh" "$DIST_DIR" >/dev/null

echo "Built into $DIST_DIR"
