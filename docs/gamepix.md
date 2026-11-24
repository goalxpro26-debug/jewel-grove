# Jewel Grove — GamePix conversion notes

GamePix build: `dist/html5/Jewel Grove/` (8.1 MB) + upload pack
`dist/gpx-upload/` (zip 4,276,735 bytes, cover 1360x850, icon 256x256,
description/instructions/tags). GamePix SDK v3, manual lifecycle.
The GameDistribution build is untouched in `dist/gd-upload/` and the GD
portal entry (81499) stays Draft (activation pending the ~Nov 30 weekly
reset) — the two lanes are separate.

## What the conversion changed (GamePix SDK v3, no native extension)

- New `main/gpx.lua`: copy of Bloom Bubbles' / Tile Garden's pure-Lua
  bridge over `html5.run` (`pcall(require, "html5")`, so the game runs
  fully without the SDK). `loaded()` / `game_start()` /
  `show_interstitial()` / `happy_moment(kind)` / `sad_moment(kind)` /
  `poll_paused()` / `sdk_present()`. All calls guarded.
- `main/game.script`: GD listener block removed; new `update()` polls
  `gpx.poll_paused()` once per frame and applies ad-pause transitions
  (mute + `ad_pause` / `ad_resume` GUI messages) — Jewel Grove had no
  `update()` before, so this function was added; `show_ad` calls
  `gpx.show_interstitial()`; `gpx.loaded()` in `show_title` (once-only
  guard inside); `gpx.game_start()` in `start_level`;
  `happy_moment("level_complete")` on `ui_level_won`;
  `sad_moment("game_over")` (endless) / `"level_failed"` (normal) on
  `ui_level_lost`.
- `main/gui.gui_script`: `gd_pause` / `gd_resume` messages renamed to
  `ad_pause` / `ad_resume` (incl. the stale-pause comment).
- `game.project`: `[library] include_dirs = gamedistribution` and
  `[gamedistribution] game_id = 226056a2397547abbb2e2d91f71b3dad` removed.
- `gamedistribution/` folder moved OUT of the project to sibling backup
  `~/workspace/defold/projects/jewel-grove-gd-extension/` (Defold
  discovers extensions by scanning for `ext.manifest`; removing the
  game.project lines alone does NOT stop bob from using it — proven on
  Bloom Bubbles).
- `tools/inject_gamepix.py`: copy of Bloom's post-processor for the built
  `index.html` — inserts `window.GamePixConfig = { lifecycle: 'manual' }`
  + the SDK script (`https://integration.gamepix.com/sdk/v3/gamepix.sdk.js`)
  + glue JS as the first scripts in `<head>`; glue registers pause/resume
  handlers setting `window.__gpx_paused`, tracks visibility in
  `window.__gpx_hidden`, calls `lifecycle.loading(0)`; adds
  `body{touch-action:none}`; verifies SDK present and NO GameDistribution
  residue; idempotent. Run after every rebuild.
- Ads: pre-roll interstitial on first Play tap, interstitial on Next
  Level (level complete). Pause during ads is automatic (SDK calls our
  pause handler before the ad, resume after); the game also mutes audio
  while paused. No rewarded ads (no reward flow in the game).

## Bug found + fixed during this conversion (banner stuck behind ads)

- The mission banner (`show_play`, 1.6s timer) was cleared by
  `clear_overlay` only when `not self.paused`. The pre-roll ad fires on
  the first Play tap, so the game is ad-paused when the 1.6s timer fires
  — the banner node was never deleted and would cover the board for the
  whole level. Same latent bug Tile Garden had (found there Nov 24).
- Fix (`main/gui.gui_script`): the banner node is now tracked as
  `self.banner_node` and deleted directly (`gui.delete_node`, pcall
  guarded) when its timer expires, paused or not. The banner is
  informational only, so deleting it during an ad is safe.
- **Same latent bug exists in the GD build** (same code, same pre-roll
  flow) — the GD build in `dist/gd-upload/` and the portal entry were
  NOT touched here (GD lane is separate; a GD rebuild + re-upload would
  be needed to fix it there). Verify shot 02 confirms the full 8x8 board
  with no banner in the GamePix build.

## Build (canonical, proven Nov 24, 2026)

From the project dir, with the egress truststore in JAVA_TOOL_OPTIONS:

```
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true -Djavax.net.ssl.trustStore=$HOME/workspace/tools/egress-truststore.jks -Djavax.net.ssl.trustStorePassword=changeit"
~/workspace/defold/run-bob.sh --platform wasm-web --variant release --archive --bundle-output dist/html5 resolve build bundle
python3 tools/inject_gamepix.py "dist/html5/Jewel Grove"
```

No `--build-server` needed (no native extensions in the GamePix build).
The `resolve build bundle` verbs are REQUIRED (without them bob exits 0
and writes no bundle). After any extension/template change, clean
`build/` and the bundle dir first — bob's incremental build reuses the
cached GD template otherwise. Always confirm the bundle timestamp
before injecting.

## Verify — Chrome 157 LNA lesson (Nov 24, 2026)

Headless Chrome 157 (Muse Browser 157.0.8103.81) blocks navigation to
ANY loopback http origin with `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`,
and `--disable-features=LocalNetworkAccessChecks` no longer disables it.
The working route is **file://**: serve nothing, load
`file:///.../dist/html5/Jewel Grove/index.html` directly. The Defold
template does NOT auto-boot from file:// (it only shows a "running from
file" warning), so the harness calls
`EngineLoader.load("canvas", "JewelGrove")` manually after load. The
GamePix SDK script loads fine from file:// (https CDN via the 3129
forwarding proxy — start `~/workspace/tools/egress-proxy-forward.py`
first) and localStorage works there, so the SDK checks still run for
real. Harness: `verify/verify_gpx.js` (adapted from Tile Garden's, with
Jewel Grove's gameplay flow: 1136x640 landscape, 64-tile board, swap/
nomatch, hint/shuffle, autoplay wins L1/L2/L3, endless).
Results in `verify/gpx/results.json`.

Verify results (run 1, Nov 24, 2026):
- **27/28 PASS** — all GamePix SDK checks pass (SDK loads,
  loaded()/gameStart() from Lua, pre-roll + both level-complete
  interstitials pause then resume with sawPause=true, no GD residue,
  no errors); gameplay: L1 board 64 tiles/25 moves, legal swap, non-match
  rejected, match clears (score 180, moves 24), shuffle 3->2, pause/
  resume, autoplay WINS L1 (score 3060, moves 18), L2 clear-type won
  (score 9660, prog 15/15), L3 drop won (both stars dropped, score 940),
  endless scores (0->180), pause in endless, mute toggle.
- The 1 FAIL ("hint works", hints stayed 3) is a HARNESS TIMING FLAKE,
  proven by targeted probe `verify/gpx/probe_hint.js`: the first two
  2.5s-held HINT clicks fell between frame polls at low FPS; the third
  landed and hints dropped 3->2. Same signature as the Nov 23 GD run's
  identical fails (hint/shuffle/pause/resume), which the GD probe also
  proved working. VERDICT: GamePix build verified (effectively 28/28),
  ready for the dashboard.

## Assets (all from real GamePix-build gameplay, verify/gpx/)

- Cover 1360x850 (`dist/gpx-upload/cover_1360x850.jpg`, 247,660 bytes):
  gameplay shot 02, board-only crop (100,70,675,520) mirroring the GD
  thumbnail crops, bold JEWEL GROVE title at the bottom over the gem
  rows, no HUD buttons, no banner. Visually checked.
- Icon 256x256 (`dist/gpx-upload/icon_256x256.jpg`, 40,599 bytes):
  same shot, centre board crop (115,70,565,520), bold title.
- Built with `~/workspace/defold/projects/tools/make_gpx_assets.py
  jewel-grove` (scoped run: the tool takes a project argument so one
  game's asset build never re-writes another game's loose files).

## Listing (GamePix dashboard)

- Description: `dist/gpx-upload/description.txt` (339 chars, fits the
  100-500 char field, no em-dashes). Instructions:
  `dist/gpx-upload/instructions.txt` (257 chars, fits the ≤500 char
  How to Play field). Tags: `dist/gpx-upload/tags.txt` — matching,
  jewels, arcade, logic, relaxing (GD-verified; **re-check against
  GamePix's own picker at listing time** — Bloom's Nov 24 submission
  proved the picker does NOT offer "matching", "logic" or "relaxing"
  and caps extra tags at 4 (Bloom's actual tags: arcade, bubble-shooter,
  match-3). For Jewel Grove expect "arcade" + "match-3" to be offered;
  drop anything the picker doesn't offer, never invent replacements).
- Category: Puzzle. Main tag: puzzle (check the picker). Orientation:
  Landscape (game is 1136x640 landscape). Engine: HTML5-JS. SDK
  integration: checked. Desktop + Mobile friendly: both checked.
- "Allow Distribution": ON (owner maximises distribution; non-exclusive).
- REVIEW LOCK (CORRECTED Nov 24): Bloom's submission showed the Review
  tab HAS a "Cancel review" button — submitting is NOT irreversible as
  earlier assumed. Still submit only the verified final build.

## Re-enable GameDistribution (GD lane, do NOT do this for GamePix)

1. Copy `~/workspace/defold/projects/jewel-grove-gd-extension/gamedistribution/`
   back into the project as `gamedistribution/`.
2. Restore `game.project` from git: `[library] include_dirs =
   gamedistribution` + `[gamedistribution] game_id =
   226056a2397547abbb2e2d91f71b3dad`.
3. Rebuild with the extender reverse proxy + `--build-server
   http://127.0.0.1:8080` (GD extension needs the extender), verbs
   `resolve build bundle`, then re-zip into `dist/gd-upload/`.
4. The GamePix files (`main/gpx.lua`, injector, verify_gpx.js) stay in
   the repo unused by the GD build; `main/game.script` would need its
   GD listener restored from git (the GamePix edit replaced it).
5. NOTE: the GD build also carries the mission-banner-stuck-behind-ads
   bug (see above). Apply the `banner_node` fix from
   `main/gui.gui_script` to the GD rebuild too, or the banner will cover
   the board whenever the pre-roll ad shows.
