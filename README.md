## Serious Sam Classic: The Both Encounters in the browser
[![Web version](https://github.com/pblyp/SeriousSamTBE/actions/workflows/web-pages.yml/badge.svg)](https://github.com/pblyp/SeriousSamTBE/actions/workflows/web-pages.yml)
[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)

Serious Engine 1.10 compiled to WebAssembly and rendering with WebGL 2: *Serious Sam: The
First Encounter* and *Serious Sam: The Second Encounter* as one campaign (The Both Encounters),
playable in a web browser on computers and phones.

**Play it: <https://pblyp.github.io/SeriousSamTBE/>**

- **One campaign.** It runs The Second Encounter's code, which also plays The First
  Encounter's levels: when they end, its ending and credits play (Fire skips them) and The
  Second Encounter follows, with the starting weapons as in a new game: in single player with
  its recap of the story so far, in cooperative games straight from its first level. Both
  games' deathmatch maps are there too (e.g. Desert Temple), with The Second Encounter's
  weapons.
- **The demos, out of the box.** The official demos of both games (Karnak, then Palenque;
  about 120 MB) are downloaded once and kept in the browser.
- **The full games, with your own copies.** Zip the folders where both games are installed
  and pick the two .zip files (or one with both folders) on the start page. Your files never
  leave your device; they are kept in the browser, so next time *Play my game files* starts
  the game without the .zip files. They are read from the browser's storage as they are
  needed, so both games fit on phones and tablets. Don't have them? Buy them to support
  Croteam: on Steam ([The First Encounter](https://store.steampowered.com/app/41050/Serious_Sam_Classic_The_First_Encounter/),
  [The Second Encounter](https://store.steampowered.com/app/41060/Serious_Sam_Classic_The_Second_Encounter/))
  or on GOG.com, completely DRM-free ([The First Encounter](https://www.gog.com/en/game/serious_sam_the_first_encounter),
  [The Second Encounter](https://www.gog.com/en/game/serious_sam_the_second_encounter)).
- **Network games.** The player who starts a game gets a room code and a link to send to
  the others. The games go through the page's server, when it can pass them on (the
  included server can; GitHub Pages can't).
- **Touch screens.** Phones and tablets get on-screen controls: an analog stick under the
  left thumb, dragging on the right to look, and buttons.
- **Settings and saved games** stay in the browser. *Clear my data* on the start page
  removes them; *Clear assets* removes the downloaded demos and your kept game files instead.
- **Exporting.** *Export my game files…* and *Export the demos…* on the start page save what
  the browser keeps as .zip files, which *Use my game files…* takes back. Exported game files
  are for your personal use only, the full games' above all: please don't share them.

It runs in current Chrome, Edge, Firefox and Safari. Basic gameplay was tested on Android, iOS,
iPadOS and Xbox, and in desktop browsers on macOS and Linux. Budget devices play at a lower frame
rate: it sometimes dips to 25–30 fps, depending on what is in view.

This is a fork of [SeriousSamClassic](https://github.com/tx00100xt/SeriousSamClassic)
(the Linux, BSD and macOS port of Croteam's open source Serious Engine). The web version
is in the `web-port` branch, in its own source tree, `SamTBE` (a copy of `SamTSE` with the web
version's changes, and what playing The First Encounter's levels takes); for native builds of
both games, see the original repository.

Playing
-------

- **Keyboard and mouse:** click the game to capture the mouse. <kbd>Esc</kbd> opens the
  menu, <kbd>~</kbd> the console, and <kbd>F11</kbd> goes fullscreen.
- **Touch:** the left thumb moves, dragging on the right looks around, and there are
  buttons for Fire, Jump, Duck, Use, weapons and Esc. Taps work as clicks in the menus.
  The controls are on by default on touch screens, and can be switched on the start page.
- **Gamepad:** press a button on it once the page is open (browsers only show a pad after
  that). The left stick moves, the right stick looks, RT fires, LT or X uses, A jumps,
  B ducks, LB/RB (or the D-pad) change weapons, Y flips to the last weapon, Back opens
  NETRICSA and Start the menu. In the menus the D-pad or left stick moves, A chooses and
  B goes back.
- **Aim assist:** shots go to an enemy next to the crosshair. It is on with touch controls
  or a gamepad, and can be switched on or off for good in Options → Players and
  controls → Customize controls → Aim assist.
- **Your own games:** choose *Use my game files…* and pick a .zip of each game's installation
  folder (with their `.gro` files). On a computer you can also drop the folders themselves on
  the page.
- **As an app:** install it from the browser's menu (or the start page's *Install the app*
  button). After one visit it also starts offline.
- **Network games:** in the game's menu, Network → Start. A badge shows the room code with
  *Copy link* and *Share*. The others open the link, or type the code under Network →
  Join → Specify server. The demos have cooperative levels (Karnak, Palenque) and
  deathmatch levels (e.g. Desert Temple). They need the page opened from a server that passes games on (see
  [Running it yourself](#running-it-yourself)).

Running it yourself
-------------------

### Requirements

- [emsdk](https://emscripten.org/docs/getting_started/downloads.html), version 6.0.12
- CMake, Ninja, flex, bison, and a C++ compiler for the build machine
- SDL2, zlib, libogg and libvorbis development files (the build machine's CMake configure
  step looks for them)
- Node.js 20 or newer, Python 3, 7-Zip, rsync and curl

On macOS:
```sh
brew install cmake ninja bison flex sdl2 libogg libvorbis sevenzip node
```
On Debian or Ubuntu:
```sh
sudo apt install cmake ninja-build flex bison g++ libsdl2-dev zlib1g-dev libogg-dev libvorbis-dev 7zip rsync curl nodejs npm python3
```

### Building

```sh
git clone -b web-port https://github.com/pblyp/SeriousSamTBE.git
cd SeriousSamTBE

git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
~/emsdk/emsdk install 6.0.12 && ~/emsdk/emsdk activate 6.0.12
source ~/emsdk/emsdk_env.sh

web/build.sh            # the site, in web/build/dist
```

The first build takes a while. It downloads both games' official demos and The First
Encounter's 1.05 patch from archive.org (checked against `web/demo_data.sha256` and
`web/tse_demo_data.sha256`), builds the entity compiler for the build machine, and builds
the engine twice. Browsers with JavaScript Promise Integration get one build, the others an
Asyncify build.

`SamTBE` builds for the desktop too, like `SamTFE` and `SamTSE` (which stay as they are): run
it with The Second Encounter's files in its folder and `+cdpath <The First Encounter's folder>`.

### Serving it

`web/build/dist` is a static site. The included server also helps network games:

```sh
(cd web/test && npm install)       # once
node web/test/server.mjs 8080 0.0.0.0
```

Open <http://localhost:8080/>. Other devices on your network open
`http://<this computer's address>:8080/`.

- **Network games**, also without the internet: players who open the page from this
  server play through it.
- **Any other web server** works too, without network games. It should answer range
  requests: a demo download that stopped goes on from where it was.

### Hosting it on GitHub Pages

`.github/workflows/web-pages.yml` builds the site and publishes it on every push to
`main` or `web-port` (or when started by hand):

1. Fork this repository and push the `web-port` branch to your fork.
2. In the fork's **Actions** tab, enable workflows.
3. Settings → **Pages** → Source: **GitHub Actions**.
4. Settings → **Environments** → **github-pages**: allow the `web-port` branch to deploy.
5. Actions → **Web version (GitHub Pages)** → **Run workflow**.

The site is then at `https://<user>.github.io/SeriousSamTBE/`.

Pages allows 100 GB of traffic a month: [demo mirrors](web/README.md#demo-mirrors) take
load off the site. Network games don't work there (Pages can't pass them on).

### Tests

```sh
cd web/test && npm install && npx playwright install chromium firefox webkit
npm test
```

How the port works (rendering, threads, files, the demo download, network games), the
page's options and the individual tests are described in [web/README.md](web/README.md).

Troubleshooting
---------------

- **The page doesn't start, or the fullscreen option is missing:** some content blockers
  block scripts with "fullscreen" in their name. The game works without it.
- **Network games don't connect:** the page must come from a server that passes games on
  (`web/test/server.mjs`, see [Running it yourself](#running-it-yourself)), the same one
  for all players. Open the page with `?log` to see what happens.
- **The game doesn't start with your files:** the page explains what is wrong (for example
  a damaged `.gro` file) and offers to start over or clear the stored data.

License
-------

* Serious Engine is licensed under the GNU GPL v2 (see LICENSE file).
* amp11lib is licensed under the GNU GPL v2 (see amp11lib/COPYING file).
* *Serious Sam* and the *Serious Sam: The First Encounter* and *The Second Encounter* demos are
  © Croteam. The page only shares the official demos, which to our knowledge are freely
  redistributable. The full games need your own copies.

### Note:
The following applies only to the for Windows build. Because none of the following is used when building under (Linux, *BSD, macOS) systems.
<pre>

Some of the code included with the engine sources is not licensed under the GNU GPL v2:
</pre>

* zlib (located in `Sources/Engine/zlib`) by Jean-loup Gailly and Mark Adler
* LightWave SDK (located in `Sources/LWSkaExporter/SDK`) by NewTek Inc.
* libogg/libvorbis (located in `Sources/libogg` and `Sources/libvorbis`) by Xiph.Org Foundation
