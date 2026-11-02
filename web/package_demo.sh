#!/bin/bash
# Prepares the game data for the page:
#   demo/, demo*.torrent, demo-torrent.json
#                        the demo (see fetch_demo_data.sh), downloaded with WebTorrent
#                        (from other players, and from these files as web seed)
#   base-data.{data,js}  this repository's game files (SE1_10b.gro, scripts, ...) packaged
#                        with Emscripten's file_packager, used under game files that the
#                        player provides
#
#   package_demo.sh [dist dir] [site url]
#
# The site URL (e.g. https://user.github.io/SeriousSamClassic/) is written into
# demo.torrent as web seed for BitTorrent clients; the page doesn't need it.
# DEMO_MIRRORS (comma separated URLs, see README.md) lists other sites with a copy of demo/.
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$WEB_DIR")"
DEMO_DIR="$WEB_DIR/build/demo-data"
OUT_DIR="${1:-$WEB_DIR/build/dist}"
SITE_URL="${2:-}"

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
# game doesn't need): GitHub Pages answers a request for part of an empty file with an
# error (416), which the torrent's web seed does when it falls inside a piece, and the
# download never finished
rm -f demo-data.data demo-data.js
rsync -a --delete --delete-excluded --min-size=1 --exclude '.DS_Store' \
  --exclude '/Demos/[Aa]uto-[Dd]emo*' --exclude '/Levels/Intro.wld' \
  "$DEMO_DIR/" "$OUT_DIR/demo/"
if [ "$WEB_DIR/tools/package-lock.json" -nt "$WEB_DIR/tools/node_modules/.package-lock.json" ]; then
  (cd "$WEB_DIR/tools" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)
fi
node "$WEB_DIR/tools/make_torrent.mjs" "$OUT_DIR" "$SITE_URL"
ls -la "$OUT_DIR"/base-data.* "$OUT_DIR"/demo*
