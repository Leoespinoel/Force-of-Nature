// Check the store's own loading sequence: direct visit should play the black hole clip, then the heart loader;
// arriving with ?hole=1 (as if from bon-voyage) should skip straight to the heart loader.
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', 'temporary screenshots');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, url) {
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const bad = []; p.on('pageerror', (e) => bad.push('JS: ' + e.message));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  const seenVideo = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    const s = await p.evaluate(() => {
      const v = document.getElementById('blackhole-video');
      const loader = document.getElementById('loader');
      const cnt = document.querySelector('.loader__count');
      return {
        hasVideo: !!v, videoOpacity: v ? getComputedStyle(v).opacity : null, videoPaused: v ? v.paused : null, videoTime: v ? +v.currentTime.toFixed(2) : null,
        hasLoader: !!loader, count: cnt ? getComputedStyle(cnt).opacity : null,
      };
    });
    seenVideo.push(JSON.stringify(s));
    await wait(150);
  }
  console.log(`--- ${label} (${url}) ---`);
  // print unique consecutive states to keep it short
  let prev = null;
  for (const s of seenVideo) { if (s !== prev) console.log(s); prev = s; }
  console.log('JS errors:', bad.length ? bad.join('\n') : 'none');
  await b.close();
}

(async () => {
  await run('direct visit', 'http://localhost:3000/store/');
  await run('via bon-voyage hole', 'http://localhost:3000/store/?hole=1');
})();
