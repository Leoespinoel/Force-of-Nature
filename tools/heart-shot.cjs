// Screenshot the heart moment's settled end state at a given viewport.
// Usage: node tools/heart-shot.cjs [label] [width] [height]
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', 'temporary screenshots');
fs.mkdirSync(OUT, { recursive: true });
const label = process.argv[2] || 'heart', W = +(process.argv[3] || 1366), H = +(process.argv[4] || 768);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H });
  await p.evaluateOnNewDocument(() => sessionStorage.setItem('fon-intro', '1'));
  await p.goto('http://localhost:3000/bon-voyage/', { waitUntil: 'networkidle2' });
  await wait(600);
  await p.mouse.move(W / 2, H / 2);
  let on = false;
  for (let i = 0; i < 700 && !on; i++) {
    await p.mouse.wheel({ deltaY: 140 }); await wait(35);
    on = await p.evaluate(() => { const t = window.__fon && window.__fon.heart; if (t) { t.pause(); return true; } return false; });
  }
  if (!on) { console.log('never fired'); await b.close(); return; }
  await p.evaluate(() => { window.__fon.heart.timeScale(15).play(); });
  const dur = await p.evaluate(() => window.__fon.heart.duration());
  await wait(dur / 15 * 1000 + 1200);
  await p.screenshot({ path: path.join(OUT, `${label}-${W}x${H}.jpg`), type: 'jpeg', quality: 85 });
  console.log('saved', `${label}-${W}x${H}.jpg`);
  await b.close();
})();
