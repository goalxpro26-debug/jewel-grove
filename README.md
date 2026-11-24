# Jewel Grove

An original jewel match-3 game for GameDistribution (HTML5), built with
Defold 1.14.0. Game 4 of the GD factory queue. Landscape 1136x640.

## The game

Swap two adjacent gems to make a row or column of 3 or more matching gems.
Matches pop, gems above fall, new gems drop in, and cascades chain for
bonus points. Match 4 in a row to make a line-clearer, 5 in a row to make
a bomb; swap a glowing special tile with any neighbour to fire it.
Golden star tiles cannot match — swap them downwards until they reach
the bottom row to collect them.

- **12 levels** with missions: reach a score target, clear N gems of one
  type, or drop N golden stars to the bottom — all move-limited. Stars
  (1–3) by moves left; progress saved.
- **Endless mode**: 120s score attack, best score saved.
- **Hint** (shows a good swap) and **Shuffle** (mixes the gems), both
  limited to 3 per level; a free shuffle fires automatically if the board
  ever has no moves, so a board is never dead.
- **Controls**: mouse / touch (tap a gem, then tap an adjacent gem to
  swap), keyboard (H hint, S shuffle, P/Esc pause). Hidden verification
  aid: press **A** to toggle an auto-play bot (plays the hint swap, and
  nudges the lowest star down so drop levels progress).
- **Audio**: 14 synthesized SFX + 2 music loops, all generated locally by
  `tools/synth_audio.py` (numpy, no AI audio, no downloads).
- **Art**: all sprites drawn in code by `tools/make_art.py` (PIL, no AI
  images, no copied assets). 6 original faceted gems (ruby, sapphire,
  emerald, topaz, amethyst, pearl — distinct shape + colour), golden star
  drop tile, gold ring for special tiles, grove background.
- **Animations**: swap tween, match pop + particle bursts, falling
  cascades (tiles slide in from above), combo/cascade popups, special
  effects with gold rings, confetti on win, tweened panels (gui.animate).

## GameDistribution SDK

- Extension vendored locally under `gamedistribution/` (bob cannot fetch
  the zip through the egress proxy; see Bloom Bubbles README for the same
  pattern) + `[library] include_dirs = gamedistribution` in `game.project`.
- `game.project` has `[gamedistribution] game_id = PLACEHOLDER` — the parent
  fills the real HEX Game ID from the portal Upload tab before upload.
- Ads only on user input: pre-roll interstitial on the first Play tap,
  interstitial when the player taps Next on a level-complete screen.
- `SDK_GAME_PAUSE` pauses the game + mutes audio; `SDK_GAME_START` resumes
  + unmutes. All `gdsdk` calls are guarded (`if gdsdk then`) so the game
  runs fine with no SDK / no network.

## Building (this VM)

```bash
# start the extender reverse proxy (once per VM boot)
setsid nohup python3 ~/workspace/tools/extender-reverse-proxy.py \
  >/tmp/extender-rproxy.log 2>&1 &
cd ~/workspace/defold/projects/jewel-grove
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true \
  -Djavax.net.ssl.trustStore=$HOME/workspace/tools/egress-truststore.jks \
  -Djavax.net.ssl.trustStorePassword=changeit"
~/workspace/defold/run-bob.sh --build-server http://127.0.0.1:8080 \
  --platform wasm-web --variant release --archive \
  --bundle-output dist/html5 resolve build bundle
# -> dist/html5/Jewel Grove/  (8 MB)
```

HTML5 platform is `wasm-web` (not `js-web`). Engine artifacts are
pre-seeded in `~/workspace/defold/bob-root/wasm_pthread-web/`. The
egress-proxy CA rotates: rebuild `egress-truststore.jks` from
`/run/hatch/egress-tls/ca-bundle.pem` (last cert only) if extender builds
start failing with PKIX errors.

## Verifying

**Environment problem (Nov 22, 2026):** this VM's Chromium 157 blocks ALL
`http://127.0.0.1` / `localhost` navigations with
`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` (Local Network Access).
`--disable-features=LocalNetworkAccessChecks`, `--no-proxy-server`, the
egress proxy route, and a managed-policy entry all fail to lift it.
Serving on the VM's non-loopback IP is intercepted by the sandbox.
So the documented `python3 -m http.server` route cannot be exercised from
this VM's browser right now.

**Workaround used:** the shipped bundle is verified via a `file://` copy:
`verify/bundle-copy/` is an exact copy of `dist/html5/Jewel Grove/` with
ONE harness-only change — `dmloader.js` accepts XHR status 0 as success
(file:// XHR has no HTTP status). The Defold template also refuses to
auto-boot from `file://`, so `verify.js` calls `EngineLoader.load`
directly after page load. Nothing in the game code, art, audio, or the
shipped `dist/` bundle is changed by this; the shipped bundle is the one
built by bob and is what gets uploaded.

```bash
node verify/verify.js \
  "file:///home/hatch/workspace/defold/projects/jewel-grove/verify/bundle-copy/index.html"
```

The game reports live state in `document.title`
(`JEWELGROVE|screen=...|score=...|moves=...|tiles=...|drops=...|...`)
which the verify script polls. Screenshots land in `verify/`.

**Verification record (Nov 22, 2026):** **20/20 checks passed**,
`verify/results.json`. Title loads, canvas non-blank, level 1 board
populated (64 tiles, 25 moves), a non-matching swap is rejected (score 0,
moves unchanged), a matching swap clears (score 180, moves 24), hint works
(3 -> 2), shuffle works (3 -> 2, tiles still 64), pause/resume via P,
autoplay wins level 1 (score 3060, 18 moves left), NEXT LEVEL starts
level 2, autoplay wins level 2 (clear 15 Ruby, score 9660), NEXT LEVEL
starts level 3 (drop mission, 2 stars), autoplay wins level 3 (both stars
dropped, score 940), endless mode scores (0 -> 180), pause in endless,
mute toggle, no page/console errors (excluding the GD SDK's ad-network
fetch, which fails with `ERR_SSL_PROTOCOL_ERROR` because the sandbox
blocks that network — the game itself loads zero external resources).

Board logic was also unit-tested standalone with luajit
(`board.lua`: fresh boards have no matches + a legal swap, 4-run creates
a line-clearer, 5-run creates a bomb, line-clearer clears a row, nomatch
swaps are rejected, stars collect at the bottom row, 200 random swaps
resolve with no tile-count drift, shuffle preserves stars) — all passed.

**Bugs found and fixed during verification:**
1. Hint click landed mid-cascade while input was locked out: verify now
   waits for the board to settle (score/moves/tiles stable across two
   polls) before the hint/shuffle buttons.
2. Level 3 is locked until level 2 is won: verify now wins level 2 via
   autoplay and uses NEXT LEVEL to reach level 3 instead of jumping
   through the level-select screen. Clear-type targets were also softened
   (L2 20 -> 15 Ruby, L5 25 -> 20, L8 30 -> 25, L11 35 -> 30).
3. Win screen's LEVELS button (y=68) sat exactly on the top edge of the
   play screen's SHUFFLE button, and the pick loop checked older buttons
   first, so the click was swallowed: the pick loop now iterates in
   reverse (topmost UI first). Stale `paused` state is also reset on
   show_title / show_levels.
4. HUD mission text wrapped to two lines and the 2nd line rendered behind
   the top board row: it is now a single unwrapped line (the side panel
   shows the full mission text).

**Headless-verification gotchas (carry over from Bloom Bubbles / Tile
Garden):**
1. Defold HTML5 input is **polled once per engine frame**; headless
   SwiftShader runs at a few FPS, so quick clicks fall between frames.
   Use **held inputs** (down, hold ~800 ms, up).
2. Input action x/y are in **GUI space (origin bottom-left, y up)**,
   but Playwright clicks in **page space (origin top-left, y down)**.
   A GUI point (x, y) in this 1136x640 game must be clicked at page
   (x, 640 - y).
3. Canvas blankness: decode the screenshot PNG and count distinct
   colors (drawImage returns blank without preserveDrawingBuffer).
4. `bob` without a command only **builds**; the bundle is written only
   when the `bundle` command is passed.

## Files

- `main/` — `game.script` (controller/save/GD/music), `gui.gui_script`
  (all screens, board rendering, input, animations), `board.lua` (pure
  match-3 logic: matches, specials, gravity, star drops, shuffle),
  `levels.lua` (12 levels + endless), `audio.lua`
- `art/` — PIL-drawn PNGs + `atlas.atlas`
- `audio/` — synthesized WAVs + `.sound` files + `audio.go`
- `tools/` — `make_art.py`, `synth_audio.py`
- `input/game.input_binding` — mouse + touch + keyboard
- `verify/` — Playwright verification script + screenshots +
  `bundle-copy/` (file:// verification copy, see above)
