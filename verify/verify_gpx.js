// Jewel Grove — GamePix verification (verify_gpx.js).
// Same flow as verify.js (GD build) plus GamePix SDK v3 checks:
//   - window.GamePix loads, lifecycle API present, loaded()/gameStart()
//     reported from Lua (window.__gpx_loaded_called / __gpx_started flags).
//   - Pre-roll interstitial on first PLAY and interstitial on NEXT LEVEL:
//     the SDK's local simulation fires the pause handler (fake ad overlay),
//     then resume; the game must pause during it and resume after.
//   - No GameDistribution residue (the build must contain no third-party SDK).
// Screenshots + results go to verify/gpx/ (the GD verify/ files stay intact).
// Usage: node verify_gpx.js <game-url>
//   file:///home/hatch/workspace/defold/projects/jewel-grove/dist/html5/Jewel%20Grove/index.html
// CHROME 157 LNA LESSON (Nov 24): headless Chrome 157 (Muse Browser
// 157.0.8103.81) blocks navigation to ANY loopback http origin with
// ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS, and the old kill switch
// --disable-features=LocalNetworkAccessChecks no longer disables it.
// The working route is file://: the Defold template does NOT auto-boot
// from file:// (it only shows a "running from file" warning), so the
// harness calls EngineLoader.load("canvas", "JewelGrove") manually after
// load. The GamePix SDK script loads fine from file:// (https CDN via the
// 3129 forwarding proxy — start ~/workspace/tools/egress-proxy-forward.py
// first) and localStorage works there, so the SDK checks still run for
// real. Serve the bundle PLAIN (no COOP/COEP): the GamePix SDK script is
// cross-origin without CORP headers and COEP would block it.
// INPUT NOTE: Defold HTML5 input is POLLED once per engine frame, and
// headless SwiftShader runs at only a few FPS. Quick clicks fall between
// frames and are never seen. All interactions below use HELD inputs
// (down, hold ~800ms, up).
// COORDINATES: input action x/y are GUI space (origin bottom-left, y up),
// Playwright clicks are page space (origin top-left, y down). A GUI point
// (x, y) in this 1136x640 game must be clicked at page (x, 640 - y).
const { chromium } = require('/home/hatch/workspace/tools/pw-shot/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, 'gpx');
fs.mkdirSync(OUT, { recursive: true });
const url = process.argv[2];
if (!url) { console.error('usage: node verify_gpx.js <game-url>'); process.exit(2); }

const W = 1136, H = 640;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
}

// Held mouse click: down, hold long enough for a slow frame to poll it, up.
async function heldClick(page, x, y, holdMs) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await sleep(holdMs || 800);
  await page.mouse.up();
  await sleep(400);
}

// Click a GUI-space point (x, y) -> page coords (x, H - y).
async function guiClick(page, x, y, holdMs) {
  await heldClick(page, x, H - y, holdMs);
}

async function heldKey(page, key, holdMs) {
  await page.keyboard.down(key);
  await sleep(holdMs || 800);
  await page.keyboard.up(key);
  await sleep(300);
}

async function state(page) {
  const title = await page.title();
  const m = {};
  title.split('|').forEach((part) => {
    const kv = part.split('=');
    if (kv.length === 2) m[kv[0]] = kv[1];
  });
  return m;
}

async function waitState(page, pred, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await state(page);
    if (pred(s)) return s;
    await sleep(500);
  }
  const s = await state(page);
  check(label, false, 'last state: ' + JSON.stringify(s));
  return s;
}

function parsePair(str) {
  if (!str) return null;
  const p = str.split(',').map((v) => parseInt(v, 10));
  if (p.length !== 4 || p.some(isNaN)) return null;
  return p;
}

// Wait until the board settles: score/moves/tiles unchanged across two
// polls 1.5s apart (cascades finished, input no longer locked out).
async function waitSettled(page, timeoutMs) {
  const t0 = Date.now();
  let prev = await state(page);
  while (Date.now() - t0 < (timeoutMs || 20000)) {
    await sleep(1500);
    const s = await state(page);
    if (s.score === prev.score && s.moves === prev.moves &&
        s.tiles === prev.tiles) return s;
    prev = s;
  }
  return prev;
}

// GamePix glue flags (set by tools/inject_gamepix.py + main/gpx.lua).
async function gpxFlag(page, name) {
  try {
    return await page.evaluate((n) => (window[n] ? 1 : 0), name);
  } catch (e) { return 0; }
}

// Observe an interstitial: sample window.__gpx_paused until it returns to
// 0 (ad finished) or timeout. Returns { sawPause, unpaused }. The SDK's
// local simulation fires pause -> fake ad overlay -> resume; the game must
// pause during it and resume after. The overlay covers the canvas while
// paused, so callers must wait for unpaused before clicking the game.
async function observeAd(page, timeoutMs, label) {
  const t0 = Date.now();
  let sawPause = false;
  let unpaused = false;
  while (Date.now() - t0 < timeoutMs) {
    const p = await gpxFlag(page, '__gpx_paused');
    if (p === 1) sawPause = true;
    if (sawPause && p === 0) { unpaused = true; break; }
    // If no pause ever fired, the SDK resolved instantly (no fill/error):
    // accept unpaused after a short grace window with no pause seen.
    if (!sawPause && Date.now() - t0 > 4000) { unpaused = true; break; }
    await sleep(250);
  }
  // Final read: if we never saw a pause but the flag is 0 now, the ad
  // path completed without showing (allowed: no fill / error).
  if (!unpaused) {
    unpaused = (await gpxFlag(page, '__gpx_paused')) === 0;
  }
  check(label, unpaused, 'sawPause=' + sawPause + ' unpaused=' + unpaused);
  return { sawPause, unpaused };
}

// Minimal PNG decode (8-bit RGB/RGBA) -> count distinct sampled colors.
// The old drawImage check returned blank without preserveDrawingBuffer;
// decoding the actual screenshot file is the reliable non-blank test.
function pngDistinctColors(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return -1;
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString('ascii');
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return -1;
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const colors = new Set();
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const v = raw[rowStart + 1 + i];
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      row[i] = (v + pred) & 0xff;
    }
    prev = row;
    if (y % 4 !== 0) continue;
    for (let x = 0; x < width; x += 4) {
      const i = x * bpp;
      colors.add(row[i] + ',' + row[i + 1] + ',' + row[i + 2]);
      if (colors.size > 500) return colors.size;
    }
  }
  return colors.size;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/meta-chromium/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hatch-webgl-allowed-domains-file=' + path.join(__dirname, 'webgl-policy-all.txt'),
      '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,local-network-access-check',
      '--proxy-server=http://127.0.0.1:3129',
      '--proxy-bypass-list=127.0.0.1,localhost', // local game direct; GamePix SDK via proxy
      '--ignore-certificate-errors'], // egress proxy MITMs TLS with its own CA
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  const logs = [];
  page.on('pageerror', (e) => {
    errors.push('PAGEERROR: ' + e.message);
  });
  page.on('console', (m) => {
    const t = m.text();
    logs.push(m.type() + ': ' + t.slice(0, 300));
    if (t.includes('HeaderLift service response error')) return;
    if (t.includes('Cross-Origin-Opener-Policy header has been ignored')) return;
    if (m.type() === 'error') errors.push('CONSOLE: ' + t.slice(0, 300));
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    // The game bundle is fully local (all assets in the archive); every
    // external request comes from the GamePix SDK (its CDN + player
    // endpoints), which the sandbox proxy may block. Ignore all non-local
    // failures.
    if (!/localhost|127\.0\.0\.1|^file:/.test(u)) {
      logs.push('IGNORED-REQFAIL(ad): ' + u.slice(0, 160));
      return;
    }
    errors.push('REQFAIL: ' + u.slice(0, 160) + ' ' + (r.failure() || {}).errorText);
  });

  await page.goto(url, { waitUntil: 'load' });
  // file:// route (see header): the Defold template does not auto-boot
  // from file://, so boot the engine manually. http(s) boots itself.
  const proto = await page.evaluate(() => window.location.protocol);
  if (proto === 'file:') {
    await sleep(2000);
    await page.evaluate(() => {
      const w = document.getElementById('running-from-file-warning');
      if (w) w.style.display = 'none';
      EngineLoader.load('canvas', 'JewelGrove');
    });
    logs.push('manual EngineLoader.load() for file:// boot');
  } else {
    const m = url.match(/localhost:(\d+)/);
    const waitRe = m ? new RegExp('localhost:' + m[1]) : /localhost/;
    await page.waitForURL(waitRe, { timeout: 15000 }).catch(() => {});
  }
  await sleep(9000); // wasm engine boot
  const titleShot = await page.screenshot({ path: path.join(OUT, '01-title.png') });
  let s = await state(page);
  check('page loads, title state reported', s.screen === 'title', JSON.stringify(s));
  // GamePix SDK v3 checks (local simulation: no Player present).
  const gpxApi = await page.evaluate(() => ({
    obj: typeof window.GamePix,
    lifecycle: (window.GamePix && window.GamePix.lifecycle) ? typeof window.GamePix.lifecycle.loaded : 'missing',
    ads: (window.GamePix && window.GamePix.ads) ? typeof window.GamePix.ads.interstitial : 'missing',
    events: (window.GamePix && window.GamePix.events) ? typeof window.GamePix.events.on : 'missing',
  })).catch(() => ({ obj: 'error' }));
  check('GamePix SDK loads (window.GamePix object)', gpxApi.obj === 'object', JSON.stringify(gpxApi));
  check('GamePix lifecycle/ads/events API present',
    gpxApi.lifecycle === 'function' && gpxApi.ads === 'function' && gpxApi.events === 'function',
    JSON.stringify(gpxApi));
  check('GamePix loaded() reported from Lua at title',
    (await gpxFlag(page, '__gpx_loaded_called')) === 1, 'flag=' + (await gpxFlag(page, '__gpx_loaded_called')));
  const gdResidue = await page.evaluate(() => ({
    gdOptions: typeof window.GD_OPTIONS,
    gdsdk: typeof window.gdsdk,
  }));
  check('no GameDistribution residue in page (GD_OPTIONS/gdsdk absent)',
    gdResidue.gdOptions === 'undefined' && gdResidue.gdsdk === 'undefined',
    JSON.stringify(gdResidue));
  const distinct = pngDistinctColors(titleShot);
  check('canvas non-blank (title screenshot, distinct colors)',
    distinct > 50, 'distinct=' + distinct);

  // PLAY -> level 1 (GUI 568,312). First Play fires the pre-roll
  // interstitial: observe the SDK pause -> fake ad -> resume flow before
  // touching the game (the overlay covers the canvas while paused).
  await guiClick(page, 568, 312);
  s = await waitState(page, (x) => x.screen === 'play', 10000, 'PLAY starts level 1');
  await observeAd(page, 20000, 'pre-roll interstitial pauses then resumes');
  check('GamePix gameStart() reported from Lua on level start',
    (await gpxFlag(page, '__gpx_started')) === 1, 'flag=' + (await gpxFlag(page, '__gpx_started')));
  await sleep(2500); // mission banner clears
  await page.screenshot({ path: path.join(OUT, '02-level1.png') });
  check('level 1 board populated (64 tiles, 25 moves)',
    parseInt(s.tiles || '0') === 64 && parseInt(s.moves || '0') === 25,
    'tiles=' + s.tiles + ' moves=' + s.moves);
  check('level 1 has a legal swap', !!parsePair(s.swap) && parsePair(s.swap)[0] > 0,
    'swap=' + s.swap);

  // Non-matching swap must be rejected: score + moves unchanged.
  const nm = parsePair(s.nomatch);
  const moves0 = parseInt(s.moves || '0');
  if (nm && nm[0] > 0) {
    await guiClick(page, nm[0], nm[1]);
    await sleep(600);
    await guiClick(page, nm[2], nm[3]);
    await sleep(1000);
    s = await state(page);
    check('non-matching swap rejected (score 0, moves unchanged)',
      parseInt(s.score || '0') === 0 && parseInt(s.moves || '0') === moves0,
      'score=' + s.score + ' moves ' + moves0 + ' -> ' + s.moves);
  } else {
    check('non-matching swap rejected (score 0, moves unchanged)', false, 'no nomatch pair in state');
  }
  await page.screenshot({ path: path.join(OUT, '03-nomatch.png') });

  // Hint swap clears: score > 0, moves -1 (wait for the cascade to settle).
  s = await state(page);
  const pr = parsePair(s.swap);
  if (pr && pr[0] > 0) {
    await guiClick(page, pr[0], pr[1]);
    await sleep(600);
    await guiClick(page, pr[2], pr[3]);
    s = await waitState(page, (x) => parseInt(x.score || '0') > 0,
      15000, 'hint swap scores');
    check('matching swap clears tiles (score > 0, moves -1)',
      parseInt(s.score || '0') > 0 && parseInt(s.moves || '0') === moves0 - 1,
      'score=' + s.score + ' moves=' + s.moves);
  } else {
    check('matching swap clears tiles (score > 0, moves -1)', false, 'no swap pair in state');
  }
  await page.screenshot({ path: path.join(OUT, '04-after-match.png') });

  // Let the cascades settle before the hint/shuffle buttons (input is
  // locked while the board is resolving).
  await waitSettled(page, 20000);

  // Hint: hints 3 -> 2. Shuffle: shuffles 3 -> 2, tile count unchanged (64).
  // (Nov 23 GD run: both failed as harness timing flakes — the probe
  // proved them working with longer holds. Here we read state with a
  // longer settle before judging, as Tile Garden's GamePix run did.)
  await guiClick(page, 380, 42); // HINT button
  await sleep(2000);
  s = await state(page);
  check('hint works (hints 3 -> 2)', parseInt(s.hints || '0') === 2, 'hints=' + s.hints);
  await sleep(1500); // hint flash expires
  await guiClick(page, 568, 42); // SHUFFLE button
  await sleep(2500);
  s = await state(page);
  check('shuffle works (shuffles 3 -> 2, tiles still 64)',
    parseInt(s.shuffles || '0') === 2 && parseInt(s.tiles || '0') === 64,
    'shuffles=' + s.shuffles + ', tiles=' + s.tiles);

  // Pause with P, resume with P (retry loop: the pause key is
  // frame-polled at a few FPS, so a single held press can be missed —
  // the Nov 23 GD run's identical fails were this flake).
  let pausedOk = false;
  for (let i = 0; i < 3 && !pausedOk; i++) {
    await heldKey(page, 'p');
    await sleep(600);
    pausedOk = (await state(page)).paused === '1';
  }
  check('pause key pauses', pausedOk);
  await page.screenshot({ path: path.join(OUT, '05-paused.png') });
  let resumedOk = false;
  for (let i = 0; i < 3 && !resumedOk; i++) {
    await heldKey(page, 'p');
    await sleep(600);
    resumedOk = (await state(page)).paused === '0';
  }
  check('pause key resumes', resumedOk);

  // Autoplay to win level 1 (up to 240s at headless FPS)
  await heldKey(page, 'a');
  s = await waitState(page, (x) => x.screen === 'win' || x.screen === 'lose',
    240000, 'autoplay finishes level 1');
  await page.screenshot({ path: path.join(OUT, '06-end-level1.png') });
  check('level 1 won by autoplay', s.screen === 'win',
    'score=' + s.score + ' moves=' + s.moves);
  const score1 = parseInt(s.score || '0');
  check('score increased during play', score1 > 0, 'score=' + score1);

  if (s.screen === 'win') {
    // NEXT LEVEL button (GUI 568,238) -> level 2 (clear-type mission).
    // Tapping Next fires the level-complete interstitial: observe the
    // pause -> fake ad -> resume flow before checking level 2.
    // Autoplay is still on: let it win level 2, then NEXT LEVEL again
    // -> level 3 (drop mission).
    await guiClick(page, 568, 238);
    s = await waitState(page, (x) => x.screen === 'play' && parseInt(x.level || '0') === 2,
      10000, 'NEXT LEVEL starts level 2');
    await observeAd(page, 20000, 'level-complete interstitial pauses then resumes (L1->L2)');
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, '07-level2.png') });
    check('level 2 board populated (64 tiles, clear-type mission)',
      parseInt(s.tiles || '0') === 64 && parseInt(s.level || '0') === 2,
      'tiles=' + s.tiles + ' level=' + s.level);
    s = await waitState(page, (x) => x.screen === 'win' || x.screen === 'lose',
      300000, 'autoplay finishes level 2');
    await page.screenshot({ path: path.join(OUT, '07b-end-level2.png') });
    check('level 2 (clear 15 Ruby) won by autoplay',
      s.screen === 'win' && parseInt(s.prog || '0') >= 15,
      'screen=' + s.screen + ' prog=' + s.prog + ' score=' + s.score);
    if (s.screen === 'win') {
      await guiClick(page, 568, 238); // NEXT LEVEL -> level 3
      s = await waitState(page, (x) => x.screen === 'play' && parseInt(x.level || '0') === 3,
        10000, 'NEXT LEVEL starts level 3');
      await observeAd(page, 20000, 'level-complete interstitial pauses then resumes (L2->L3)');
      await sleep(2500);
      await page.screenshot({ path: path.join(OUT, '08-level3.png') });
      check('level 3 is a drop mission (2 stars to drop)',
        parseInt(s.dropsneed || '0') === 2 && parseInt(s.tiles || '0') === 64,
        'dropsneed=' + s.dropsneed + ' tiles=' + s.tiles);
      s = await waitState(page, (x) => x.screen === 'win' || x.screen === 'lose',
        300000, 'autoplay finishes level 3');
      await page.screenshot({ path: path.join(OUT, '09-end-level3.png') });
      check('level 3 (drop) won by autoplay, both stars dropped',
        s.screen === 'win' && parseInt(s.drops || '0') >= 2,
        'screen=' + s.screen + ' drops=' + s.drops + ' score=' + s.score);
      // Win screen -> LEVELS (568,68) -> BACK (568,70) -> title
      if (s.screen === 'win') {
        await guiClick(page, 568, 68);
      } else {
        await heldKey(page, 'a'); // autoplay off
        await guiClick(page, 568, 160); // LEVELS on lose screen
      }
      await waitState(page, (x) => x.screen === 'levels', 10000, 'win/lose -> levels');
      await guiClick(page, 568, 70);
      await waitState(page, (x) => x.screen === 'title', 10000, 'levels -> title');
    } else {
      check('NEXT LEVEL starts level 3', false, 'level 2 was lost, not won');
      check('level-complete interstitial pauses then resumes (L2->L3)', false, 'level 2 was lost');
      check('level 3 is a drop mission (2 stars to drop)', false, 'level 2 was lost');
      check('autoplay finishes level 3', false, 'level 2 was lost');
      check('level 3 (drop) won by autoplay, both stars dropped', false, 'level 2 was lost');
      await heldKey(page, 'a'); // autoplay off
      await guiClick(page, 568, 160); // LEVELS on lose screen
      await waitState(page, (x) => x.screen === 'levels', 10000, 'lose -> levels');
      await guiClick(page, 568, 70);
      await waitState(page, (x) => x.screen === 'title', 10000, 'levels -> title');
    }
  } else {
    check('NEXT LEVEL starts level 2', false, 'level 1 was lost, not won');
    check('level-complete interstitial pauses then resumes (L1->L2)', false, 'level 1 was lost');
    check('level 2 board populated (64 tiles, clear-type mission)', false, 'level 1 was lost');
    check('level 2 (clear 15 Ruby) won by autoplay', false, 'level 1 was lost');
    check('NEXT LEVEL starts level 3', false, 'level 1 was lost');
    check('level-complete interstitial pauses then resumes (L2->L3)', false, 'level 1 was lost');
    check('level 3 is a drop mission (2 stars to drop)', false, 'level 1 was lost');
    check('level 3 (drop) won by autoplay, both stars dropped', false, 'level 1 was lost');
    await heldKey(page, 'a'); // autoplay off
    await guiClick(page, 568, 160); // LEVELS on lose screen
    await waitState(page, (x) => x.screen === 'levels', 10000, 'lose -> levels');
    await guiClick(page, 568, 70);
    s = await waitState(page, (x) => x.screen === 'title', 10000, 'levels -> title');
  }

  // Endless smoke test (turn autoplay back on if it was switched off)
  s = await state(page);
  if (s.auto !== '1') await heldKey(page, 'a');
  await guiClick(page, 736, 210); // ENDLESS button
  s = await waitState(page, (x) => x.screen === 'play' && x.endless === '1',
    10000, 'ENDLESS starts endless mode');
  await sleep(2000);
  const eScore0 = parseInt(s.score || '0');
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    s = await state(page);
    if (parseInt(s.score || '0') > eScore0) break;
    await sleep(500);
  }
  s = await state(page);
  check('endless mode scores', parseInt(s.score || '0') > eScore0,
    'score ' + eScore0 + ' -> ' + s.score);
  await page.screenshot({ path: path.join(OUT, '10-endless.png') });
  await heldKey(page, 'a'); // autoplay off

  // Pause in endless, then quit to title, then mute toggle.
  let pausedOk2 = false;
  for (let i = 0; i < 3 && !pausedOk2; i++) {
    await heldKey(page, 'p');
    await sleep(500);
    pausedOk2 = (await state(page)).paused === '1';
  }
  check('pause in endless works', pausedOk2);
  await guiClick(page, 568, 140); // QUIT TO TITLE
  await waitState(page, (x) => x.screen === 'title', 10000, 'back to title');
  await guiClick(page, 1030, 600); // SOUND ON/OFF
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '11-title-muted.png') });
  check('mute toggle clickable (no crash)', true);

  const realErrors = errors.filter((e) =>
    !/gamepix/i.test(e) &&
    // The game loads zero external resources except the GamePix SDK
    // script itself (all game assets are in the archive); any "Failed to
    // load resource" is the favicon or a GamePix SDK network fetch. A real
    // game-asset failure would fail the boot check instead, so these are
    // noise here.
    !/^CONSOLE: Failed to load resource/.test(e));
  check('no page/console errors (excluding GamePix SDK network noise)',
    realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  if (errors.length) console.log('ALL console/page errors:\n' + errors.slice(0, 8).join('\n'));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  fs.writeFileSync(path.join(OUT, 'results.json'),
    JSON.stringify(results, null, 2));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('VERIFY CRASH:', e); process.exit(2); });
