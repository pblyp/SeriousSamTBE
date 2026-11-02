#!/bin/bash
# Builds the web version of Serious Sam: The First Encounter into web/build/dist, and The Both
# Encounters (SamTBO: both games' levels, from the player's two installations) into
# web/build/dist/tbo.
#
#   web/build.sh [Release|RelWithDebInfo|Debug] [jspi|asyncify|all] [tfe|tbo|all]
#
# Needs an activated emsdk (source <emsdk>/emsdk_env.sh), cmake, ninja, flex, bison and node.
# The demo data is fetched and packaged on the first run (see fetch_demo_data.sh).
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$WEB_DIR")"
SRC_DIR="$REPO_DIR/SamTFE/Sources"
BUILD_DIR="$WEB_DIR/build"
DIST_DIR="$BUILD_DIR/dist"
BUILD_TYPE="${1:-Release}"
VARIANTS="${2:-all}"
if [ "$VARIANTS" = "all" ]; then
  VARIANTS="jspi asyncify"
fi
GAMES="${3:-tfe}"
if [ "$GAMES" = "all" ]; then
  GAMES="tfe tbo"
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
NATIVE_DIR="$BUILD_DIR/ecc"
cmake -S "$SRC_DIR" -B "$NATIVE_DIR" -G Ninja -DCMAKE_BUILD_TYPE=Release -DTFE=TRUE >/dev/null
cmake --build "$NATIVE_DIR" --target ecc
ECC="$NATIVE_DIR/ecc"

# the page's libraries (WebTorrent, Trystero)
if [ "$WEB_DIR/tools/package-lock.json" -nt "$WEB_DIR/tools/node_modules/.package-lock.json" ]; then
  (cd "$WEB_DIR/tools" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)
fi

# 2. the engine, once per way of yielding to the browser
#    (tfe: SamTFE into dist; tbo: SamTBO into dist/tbo, its page with its own config.js)
for game in $GAMES; do
  case "$game" in
    tfe) src="$SRC_DIR"; dist="$DIST_DIR"; prefix="wasm"; target="SeriousSam"; engine="serioussam" ;;
    tbo) src="$REPO_DIR/SamTBO/Sources"; dist="$DIST_DIR/tbo"; prefix="wasm-tbo"; target="SeriousSamTBO"; engine="serioussamtbo" ;;
    *) echo "Unknown game: $game (tfe, tbo or all)" >&2; exit 1 ;;
  esac
  mkdir -p "$dist"
  for variant in $VARIANTS; do
    out="$BUILD_DIR/$prefix-$variant"
    emcmake cmake -S "$src" -B "$out" -G Ninja -DCMAKE_BUILD_TYPE="$BUILD_TYPE" -DTFE=TRUE \
      -DECC="$ECC" -DWEB_ASYNC="$(echo "$variant" | tr a-z A-Z)" >/dev/null
    cmake --build "$out" --target "$target"
    mkdir -p "$dist/$variant"
    cp "$out/$engine.js" "$out/$engine.wasm" "$dist/$variant/"
  done
  # the page (the same for both, apart from the version's own files)
  cp -R "$WEB_DIR/shell/"* "$dist/"
  if [ "$game" = "tbo" ]; then
    cp -R "$WEB_DIR/shell-tbo/"* "$dist/"
  fi
  node "$WEB_DIR/tools/build_libs.mjs" "$dist"
done

# 3. the game data: TBO's base package (its players provide all the rest), and The Second
#    Encounter's demo, which its page plays after The First Encounter's (that is the site's,
#    shared with The First Encounter's page)
if [[ " $GAMES " == *" tbo "* ]]; then
  "$WEB_DIR/package_base.sh" "$DIST_DIR/tbo" SamTBO >/dev/null
  if [ ! -d "$BUILD_DIR/tse-demo-data" ]; then
    "$WEB_DIR/fetch_tse_demo.sh"
  fi
  # (without empty files, see package_demo.sh)
  rsync -a --delete --delete-excluded --min-size=1 --exclude '.DS_Store' "$BUILD_DIR/tse-demo-data/" "$DIST_DIR/tbo/demo/"
  DEMO_MIRRORS= node "$WEB_DIR/tools/make_torrent.mjs" "$DIST_DIR/tbo" "${SITE_URL:+${SITE_URL}tbo/}" \
    'Serious Sam: The Second Encounter demo, for the web version' >/dev/null
fi

# and TFE's base package and demo (SITE_URL: where the site will be, for demo.torrent's web
# seed; DEMO_MIRRORS: other sites with a copy of demo/, see README.md)
if [[ " $GAMES " != *" tfe "* ]]; then
  echo "Built into $DIST_DIR"
  exit 0
fi
if [ ! -f "$DIST_DIR/demo-page.torrent" ] || [ ! -f "$DIST_DIR/base-data.data" ]; then
  if [ ! -d "$BUILD_DIR/demo-data" ]; then
    "$WEB_DIR/fetch_demo_data.sh"
  fi
  "$WEB_DIR/package_demo.sh" "$DIST_DIR" "${SITE_URL:-}"
else
  # (the demo is packaged already: the torrent again, in case the mirrors changed)
  node "$WEB_DIR/tools/make_torrent.mjs" "$DIST_DIR" "${SITE_URL:-}" >/dev/null
fi

echo "Built into $DIST_DIR"
