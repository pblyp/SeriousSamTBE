# Serious Sam: The Both Encounters in the browser

The engine compiled to WebAssembly with Emscripten, rendering with WebGL 2: The First
Encounter and The Second Encounter as one campaign, from the player's installations of both
games (zipped; the files never leave their device), or out of the box with the two games'
official demos, Karnak then Palenque.

It is `SamTBE`, a copy of `SamTSE` (The Second Encounter's code) with the web version's
changes and what playing The First Encounter's levels takes. (`SamTFE` has the web version's
changes too, from before; it isn't built for the web any more.)

## Building

Requirements: [emsdk](https://emscripten.org/docs/getting_started/downloads.html)
(activated with `source <emsdk>/emsdk_env.sh`), CMake, Ninja, flex, bison
(on macOS, Homebrew's: `brew install bison flex`), a host C++ compiler, Node.js and
7-Zip (`brew install sevenzip` / `apt install 7zip`).

```sh
web/build.sh                       # Release build of both variants into web/build/dist
web/build.sh RelWithDebInfo jspi   # one variant, with DWARF debug info
```

The first build downloads The First Encounter's demo (`SeriousSamDemo.exe`) and its 1.05
patch, and The Second Encounter's demo (`SeriousSamSEDemo.exe`), from archive.org, checked
against `demo_data.sha256` and `tse_demo_data.sha256` (`fetch_demo_data.sh`,
`fetch_tse_demo.sh`), and puts them into the site (`package_demo.sh`): each in a folder of
`demo/` (`tfe/`, `tse/`) with a list of its files (`demo-files.json`, by
`tools/make_demo_list.mjs`). It also packages the repository's game files that the engine
needs besides the games' own (`package_base.sh`, `base-data.data`).

`web/build/dist` is a static site: serve it with any web server, e.g.

```sh
node web/test/server.mjs 8080      # add 0.0.0.0 to serve other devices on the network
                                   # (npm install in web/test first: it also passes network
                                   # games on)
```

and open <http://localhost:8080/>. The `.wasm` (about 4 MB) and `.data` files
compress well; let the server use brotli or gzip. The server should answer HTTP range
requests (a demo download that stopped goes on from where it was).

## Hosting on GitHub Pages

`.github/workflows/web-pages.yml` builds the site and publishes it on every push to
`main` or `web-port` (or when started by hand from the Actions tab):

1. push the branch to your fork on GitHub;
2. in the fork's Settings → Pages, set Source to "GitHub Actions";
3. the game is at `https://<user>.github.io/<repository>/`.

All files are below Pages' 100 MB limit (the largest is The Second Encounter demo's 84 MB
`SEDemo1_00.gro`), and everything is loaded with relative URLs. The game was at `tbo/` before:
`tbo/index.html` sends links there (e.g. to a network game's room) to the page.

## Both games

- **Two installations.** The player picks a .zip of each game's folder (one after the
  other, or both at once), or one .zip with both folders; the page tells them apart by
  their group files (`SE1_00*.gro`, `1_00c*.gro`; The Second Encounter's demo, `SEDemo1_00*.gro`,
  counts as its installation too). The Second Encounter's files go to `/data`, The First
  Encounter's to `/tfe`, which the engine gets as its second data folder (`+cdpath /tfe/`):
  where both games have a file with the same name, The Second Encounter's is used; The First
  Encounter's levels, textures and music come from `/tfe`. What the game doesn't read isn't
  taken (`installs` in `shell/config.js`).
- **The First Encounter's levels** are recognized by where they come from, and converted
  when loaded (their keys, weapons given at the start, lighting fixes, map).
- **The demos.** *Play the demos* downloads The First Encounter's demo (`demo/tfe/`) and The
  Second Encounter's (`demo/tse/`), one after the other (`demos` in `shell/config.js`). The
  engine sees the Palenque demo level without The Second Encounter's levels: New Game starts
  Karnak, and at its end (after the demo's credits) Palenque follows.
- **Group files read as they are needed.** Both installations are more than some phones let
  a page have in memory, so the page doesn't put the `.gro` files in the engine's file system:
  it streams each one from the .zip into IndexedDB in 1 MB pieces (`shell/archives.js`; the
  demos' are kept the same way as they are downloaded), and leaves an empty file of that name
  for the engine to find. The engine reads archives through one reader
  (`Engine/Base/ArchiveReader.h`); in the web build, `Engine/Base/Emscripten/WebArchive.cpp`
  copies what is in the page's cache of pieces (up to 96 MB, those read last) and otherwise
  waits for the pieces from IndexedDB, yielding to the browser as it does every frame (JSPI or
  Asyncify). Other files (scripts, loose levels) are in memory, and so is the music track that
  is playing, when it is an .mp3 (its decoder reads files itself).
- **Its storage** keeps the names it had at `tbo/` (so what players kept there stays): game
  files in `tbo-own-files`, settings and saved games in `/tbo-user`, the start page's options
  (`tbo.` prefix), the service worker's cache (`tbo-app`), and network games' room names
  (`tbo-` prefix).
- **Tests**: `web/test/tbo-page.mjs` checks the page with made-up installations, and
  `web/test/ownfiles.mjs` with the two demos as installations; `web/test/archive-reader.mjs`
  reads every file of The First Encounter's demo's group files from IndexedDB through the
  engine's reader (a test program, `SamTBE/Sources/Tests/ArchiveReaderTest.cpp`) with a small
  cache, in both builds; `web/test/tbo-demos.mjs` plays the demos (Custom Level, Karnak,
  give-all, its end, then Palenque). With real installations,
  `TBO_TSE_ZIP=… TBO_TFE_ZIP=… node web/test/tbo-levels.mjs` starts each level of both games
  and reports what the engine says about it, and lists the files both have with different
  contents; `tbo-handoff.mjs` plays The First Encounter's end and The Second Encounter's start.

## How it works

- **Two builds.** The engine yields to the browser in the middle of its own loops
  (every frame, and while loading levels). `jspi/` uses JavaScript Promise
  Integration; `asyncify/` is for browsers without it (bigger and a bit slower).
  The page picks one by feature detection.
- **One binary.** The game, entity and shader libraries that are normally loaded
  with `dlopen()` are linked in. The engine still looks their symbols up by name,
  in a table generated at build time (`SamTBE/Sources/cmake/gen_static_symbols.cmake`,
  `Engine/Base/Emscripten/StaticDynamicLoader.cpp`).
- **Rendering.** The engine's OpenGL 1.x code runs unchanged: every `pgl*` function
  it calls is emulated on WebGL 2 by `Engine/Graphics/Emscripten/GL1Emulation.cpp`
  (fixed function state turned into generated shaders, client side vertex arrays
  streamed into buffers, occlusion queries instead of depth buffer reads for lens flares).
- **Files.** Game data is in `/data` and `/tfe` (see [Both games](#both-games)), with the base
  package's files under them; settings and saved games are in `/tbo-user`, which is stored in
  IndexedDB. Players give their installations as .zip files of their folders (picking folders
  doesn't work on phones); `shell/zip.js` reads only the zip's directory up front and unpacks the files
  the game needs one by one with the browser's `DecompressionStream`. Dropping the folder
  itself on the page works too. Each `.gro` file is checked on the way in (they are zip
  archives too), so a damaged or cut short one is named before the game starts.
  The player's files are also kept in IndexedDB (`tbo-own-files`), and counted as kept
  only once the game has started with them; on later visits *Play my game files* uses them.
- **When the game can't start**, the page says what happened (with the engine's message
  under "What the game said") and what to try, with *Start over*, *Clear assets* and
  *Clear my data* (both also on the start page). Each deletes, after asking, only its part
  of what this page keeps. *Clear assets…*: the demos' pieces, the cached base game package
  and the player's kept game files. *Clear my data…*: settings and saved games (`/tbo-user`)
  and the start page's options. Other sites on the same address (e.g. a `github.io`
  account's other projects) are left alone.
  Settings are saved whenever the page is hidden, since a tab can be closed at any time.
- **Demo download.** `shell/demo-download.js` downloads the files that each demo's
  `demo-files.json` lists, from the [mirrors](#demo-mirrors) first, and from the site when they fail, which
  keeps the site's bandwidth (GitHub Pages: 100 GB a month) for those who need it. Each file
  is kept in IndexedDB in 1 MB pieces as it arrives (one database per version of the demo
  data, named after a hash of its files; other versions are deleted), so later visits
  download nothing, and a download that stopped goes on from where it was (with a range
  request). Where IndexedDB can't be used, the files are downloaded into memory each visit.
  Only the official demos' files are downloaded from the site, which to our knowledge may be
  freely redistributed; the start page explains this to players. Files from a player's own
  installations never leave their device.
- **Installing as an app (PWA).** `shell/manifest.webmanifest` (fullscreen, landscape,
  icons made from `SamTFE/serioussam.png`) and the service worker `shell/sw.js` make the
  page installable; Chromium also gets an *Install the app* button on the start page. The
  service worker fetches from the site first and keeps a copy of what it gets, which
  answers when the site can't be reached; when it installs, it also fetches what the page
  needs to start (the first visit loads it before the worker takes over), including the
  engine build this browser uses. It leaves alone what is kept in IndexedDB anyway (the
  demos' pieces, `*.data` packages), requests for parts of files, `net-hub.json` and
  other sites. So after one visit the game starts offline, with the demos or the player's
  game files kept in the browser. Only on https and localhost; `?nosw` goes without it.
- **Size.** The game renders at the size of the canvas (`web_fMaxPixelRatio`, 2 by
  default, limits the resolution on high density displays).
- **Touch screens.** `shell/touch.js` adds on screen controls (on by default on touch
  screens, or chosen on the start page): an analog stick under the left thumb, dragging
  on the right to look, and buttons. The engine reads them every frame: the stick as an
  analog movement axis (`Web_GetTouchMove()`, a short push walks), the rest as the keys
  and mouse of the default controls (`Web_GetTouchInput()`: Space, C, mouse buttons and
  wheel). In menus, NETRICSA and demos they hide, and taps work as mouse clicks.
- **Gamepads.** `shell/gamepad.js` reads the browser's Gamepad API once per frame
  (`Web_PollGamepad()`). While playing, the engine takes the sticks and buttons as a fixed
  layout like the console version's (`Web_GetPadInput()`, `CControls::CreateAction()`): the
  sticks are analog movement and turning (by the controls' sensitivity and invert look), the
  buttons set the controls' actions (`ctl_bFire`, …) directly, so changed key bindings don't
  matter. In menus, the console and NETRICSA the pad presses keys (arrows, Enter, Escape,
  Page Up/Down) and the right stick moves the mouse.
- **Aim assist.** A shot goes to the enemy nearest to the crosshair whose bounding box
  overlaps a square 150% the size of the crosshair (`CPlayerWeapons::AimAssistTarget()`),
  only with the knife and the weapons whose shots hit at once: colt, shotguns, tommygun,
  minigun (`AimAssistRange()`); the shots of the others fly, and are never turned. The
  crosshair glides onto that enemy and the weapon turns toward it
  (`CPlayerWeapons::UpdateAimAssistTurn()`), and both glide back when there is none. The
  square is fixed (not the player's crosshair size or view), and the setting travels with
  the player's settings (`PSF_AIMASSIST`), so all computers of a network game agree. It is
  chosen per player in the Controls menu (in place of iFeel): Auto (on with touch controls
  or a gamepad, `CGame::ResolveAimAssist()`), Yes or No. `dbg_bAimAssist=1` prints where
  shots are turned.
- **View bobbing** is speed-based, derived from the Quake engine's (`V_CalcRoll`,
  `V_CalcBob`, released under the GPL): the view tilts when moving sideways, nothing below
  3 m/s, then gradually more up to 2° at full running speed, 10 m/s
  (`CPlayerAnimator::ViewRoll()`); its height stays while moving, as with the original
  bobbing. The original bobbing, which rocks the view with every step whatever the speed
  and doesn't go well with gamepads, is still there: Options → Advanced options →
  Additional display parameters → Miscellaneous → Legacy view bobbing
  (`plr_bLegacyViewBobbing`, off by default). The weapon keeps its original sideways
  swaying by default (Legacy weapon bobbing, `plr_bLegacyWeaponBobbing`, on); switched
  off, it is pushed forward with the steps as much as the player moves, as in the Quake
  engine (`StepBob()`). `plr_fViewRollAngle` (2°), `plr_fViewRollMinSpeed` (3 m/s) and
  `plr_fViewRollMaxSpeed` (10 m/s) tune the tilt; `plr_fViewBob` (0.02),
  `plr_fViewBobCycle` (0.6 s) and `plr_fViewBobUp` (0.5) the weapon's push (the Quake
  engine's defaults; gentler values are e.g. 0.01 and 0.8). The player profile's View
  bobbing turns off all of it.
- **Sound.** The game mixes sound every frame and keeps only about 70 ms ready for the
  browser, so it doesn't lag behind the picture.

Platform specific code is under `#ifdef PLATFORM_EMSCRIPTEN`.

## Network games

The engine's multiplayer works as it always has: the player who starts a network game
(Network → Start) runs the server, the others join it as clients. Their browsers connect
through the page's server (`shell/netplay.js`, `Engine/Base/Emscripten/WebNet.cpp`):

- The page's server passes the game's packets on: `test/server.mjs` has a WebSocket hub at
  `/hub` (announced in `/net-hub.json`) that sends each message to the room's other
  players. A site without one (e.g. GitHub Pages) can't run network games: hosting says so.
  On a local network, games need no internet. `?nethub=ws://…` uses another hub.
- The engine's UDP packets go through as they are; the engine's own acknowledgements and
  resends do the rest. All the engine's socket calls are in
  `CCommunicationInterface::UpdateMasterBuffers()`, which sends and receives through the
  page instead; the other players get made up addresses (10.83.0.x).
- Players meet in a room: starting a network game gives a code like `K7Q-2MX` and a link
  (`index.html?join=K7Q2MX`), shown on the page with *Copy link* and *Share*. Joiners
  open the link, or type the code in Network → Join → Specify server ("Room code").
  Joining waits up to 20 s for the host.
- The page tells the engine when a player is gone, so a player who leaves is dropped
  within seconds (UDP only notices after `net_tmDisconnectTimeout`), and the others are
  told when the host leaves. A player whose connection closes counts as gone when it isn't
  back within 10 s.
- While a network game runs, the game goes on in a hidden tab (with timers instead of
  animation frames, which browsers stop there), so the others aren't stuck when the host
  switches tabs. Browsers slow timers down in background tabs that play no sound, and
  phones may suspend them altogether.
- The demos' levels for network games: Karnak and Palenque (cooperative), Desert Temple and
  Little Trouble (deathmatch). In the browser the connection settings start at "5mb - Fiber
  Optics" (the game's defaults are for modems).

## Demo mirrors

Other web sites can serve the demos, so that players don't use up the site's bandwidth
(and the download goes on when the site is slow). A mirror is a copy of the built
`web/build/dist/demo/` folder (with `tfe/` and `tse/` in it) anywhere on the web; its URL is
the address of that copy (for `https://cdn.example.org/sam/demo/tfe/Levels/…` it is
`https://cdn.example.org/sam/demo/`). Players' browsers download the files from it (with range
requests to go on with a download that stopped; a file of the wrong size is downloaded
from the next source), which needs these CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Range
Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
```

For example the CORS policy of an S3 or Cloudflare R2 bucket:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"],
   "AllowedHeaders": ["Range"], "ExposeHeaders": ["Content-Range", "Content-Length", "Accept-Ranges"] }]
```

The build lists the mirrors in each demo's `demo-files.json` from `DEMO_MIRRORS` (comma
separated URLs): `DEMO_MIRRORS=https://cdn.example.org/sam/demo/ web/build.sh`. The GitHub
Pages workflow takes it from the repository variable `DEMO_MIRRORS` (Settings → Secrets and
variables → Actions → Variables). `?mirror=…` adds mirrors for a visit (for trying one out).
A mirror must have exactly the files of the build's `demo/` (those the `demo-files.json`
files list; empty files are left out and needn't be there).

## Page options

`index.html?…`

| Parameter | |
|---|---|
| `autostart` | play the demos without clicks |
| `log` | show the engine's console output on the page |
| `args=+level%20Levels/KarnakDemo.wld` | command line |
| `exec=snd_iFormat=2;` | console commands to run at startup |
| `build=jspi` or `build=asyncify` | force a build |
| `touch=on`, `off` or `auto` | touch screen controls |
| `touchdebug` | show what the touch controls receive (for problems on devices) |
| `mirror=https://…` | more [demo mirrors](#demo-mirrors) (comma separated) |
| `join=K7Q2MX` | join the network game in that room (`quickjoin` to skip the join menu) |
| `nosw` | without the service worker (no offline start) |
| `nethub=ws://…` | network games through that hub instead of the page server's |
| `net=local` | network games between tabs of this browser (for tests) |

From the browser's console, `Module.webCommands = ['some_command;']` runs console
commands in the running game. `web_bFrameStats=1;` prints frame timing and how much
sound is buffered.

## Tests

```sh
cd web/test && npm install && npx playwright install chromium firefox webkit
npm test              # all of the following
node smoke.mjs        # plays Karnak in Chromium (both builds), Firefox and WebKit
node persistence.mjs  # settings survive reloading the page
node ownfiles.mjs     # "Use my game files" (the demos as installations): zips made in several ways, broken game files, clearing stored data (--browser webkit)
node touch.mjs        # touch screen controls (--size 844x390 for a phone)
node gamepad.mjs      # gamepads (a stand-in for the Gamepad API) and aim assist
node mobile.mjs       # phone players' path on an emulated Android phone and iPhone
node pwa.mjs          # installable app: manifest, service worker, starting offline
node demo-download.mjs  # the demos' download: from the site, from IndexedDB, on after it stopped, from mirrors
node netplay.mjs      # network games: hosting, joining by code, leaving, a site without a hub
node netplay-browsers.mjs  # network games between WebKit, Firefox and Chromium
node tbo-page.mjs     # the page with made-up installations of both games
node archive-reader.mjs  # the engine's reader of group files kept in IndexedDB
node tbo-demos.mjs    # the demos: Custom Level, Karnak, give-all, its end, then Palenque (--browser webkit)
node escape.mjs       # Escape with the mouse captured (opens a browser window; not part of npm test)
node run.mjs --args "+level Levels/KarnakDemo.wld" --seconds 30 --shots 10,20 --out /tmp/shots
node demo-frames.mjs --frames 30,90 --native <native>/ScreenShots   # compare with a native build
                      # (needs recorded demos, which the packaged demos leave out)
```

`run.mjs` also profiles (`--profile 20,30`, use `--build asyncify`: Chrome doesn't
attribute WebAssembly running under JSPI) and counts WebGL calls (`--glstats`). The tests
download the demos from the local server.

## Known differences

- The game starts in the menu, without the intro flyover and the recorded demos.
- No LAN or internet server lists: network games are joined by room code.
- Demos recorded with other builds desynchronize after a while (floating point
  differences change the simulation), as they do between native builds.
- Native macOS builds look darker in places: macOS doesn't report
  `GL_EXT_texture_edge_clamp`, so they clamp shadow maps with `GL_CLAMP`; the web
  build clamps to the edge like the game does on Windows.
