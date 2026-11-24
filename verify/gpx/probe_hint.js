// Targeted probe: HINT button (3 -> 2) with long holds.
// The GamePix verify run 1 failed "hint works" (hints stayed 3) — the Nov 23
// GD run failed the same check as a harness timing flake and a targeted
// probe with 2.5s holds proved it working. This probe retries the HINT
// click up to 3 times with long holds and settles before judging.
const { chromium } = require('/home/hatch/workspace/tools/pw-shot/node_modules/playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function state(page) {
  const title = await page.title();
  const m = {};
  title.split('|').forEach((part) => {
    const kv = part.split('=');
    if (kv.length === 2) m[kv[0]] = kv[1];
  });
  return m;
}
async function guiClick(page, x, y, holdMs) {
  await page.mouse.move(x, 640 - y);
  await page.mouse.down();
  await sleep(holdMs || 800);
  await page.mouse.up();
  await sleep(400);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/meta-chromium/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hatch-webgl-allowed-domains-file=/home/hatch/workspace/defold/projects/jewel-grove/verify/webgl-policy-all.txt',
      '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,local-network-access-check',
      '--proxy-server=http://127.0.0.1:3129',
      '--proxy-bypass-list=127.0.0.1,localhost',
      '--ignore-certificate-errors'],
  });
  const page = await browser.newPage({ viewport: { width: 1136, height: 640 } });
  await page.goto('file:///home/hatch/workspace/defold/projects/jewel-grove/dist/html5/Jewel%20Grove/index.html', { waitUntil: 'load' });
  await sleep(2000);
  await page.evaluate(() => {
    const w = document.getElementById('running-from-file-warning');
    if (w) w.style.display = 'none';
    EngineLoader.load('canvas', 'JewelGrove');
  });
  await sleep(9000);
  let s = await state(page);
  console.log('title state:', JSON.stringify(s));
  await guiClick(page, 568, 312); // PLAY
  for (let i = 0; i < 20; i++) {
    s = await state(page);
    if (s.screen === 'play') break;
    await sleep(500);
  }
  console.log('play state:', JSON.stringify(s));
  await sleep(3000); // banner clears, ad (if any) resolves
  for (let attempt = 1; attempt <= 3; attempt++) {
    await guiClick(page, 380, 42, 2500); // HINT, long hold
    await sleep(3000);
    s = await state(page);
    console.log('attempt', attempt, 'hints=', s.hints, 'tiles=', s.tiles, 'score=', s.score);
    if (parseInt(s.hints || '0') === 2) {
      console.log('PROBE PASS: hint works (hints 3 -> 2)');
      await browser.close();
      process.exit(0);
    }
  }
  console.log('PROBE FAIL: hint never dropped to 2');
  await browser.close();
  process.exit(1);
})().catch((e) => { console.error('PROBE CRASH:', e); process.exit(2); });
