// Sweep viewport sizes to see where the heart moment's settled state clips the mark or the full statement.
// Usage: node tools/heart-sweep.cjs
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = [[1440, 900], [1440, 760], [1536, 730], [1366, 768], [1280, 720], [1920, 1080], [390, 844]];

async function check(browser, W, H) {
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H });
  await p.evaluateOnNewDocument(() => sessionStorage.setItem('fon-intro', '1'));
  await p.goto('http://localhost:3000/bon-voyage/', { waitUntil: 'networkidle2' });
  await wait(600);
  await p.mouse.move(W / 2, H / 2);
  let on = false;
  for (let i = 0; i < 700 && !on; i++) {
    await p.mouse.wheel({ deltaY: 140 }); await wait(30);
    on = await p.evaluate(() => { const t = window.__fon && window.__fon.heart; if (t) { t.pause(); return true; } return false; });
  }
  if (!on) { console.log(`${W}x${H}: never fired`); await p.close(); return; }
  const dur = await p.evaluate(() => window.__fon.heart.duration());
  await p.evaluate(() => { window.__fon.heart.timeScale(15).play(); });
  const t0 = Date.now();
  while (Date.now() - t0 < dur / 15 * 1000 + 1500) {
    const done = await p.evaluate(() => window.__fon.heart.progress() >= 1);
    if (done) break;
    await wait(80);
  }
  await wait(400);
  const gridTop = await p.evaluate(() => Math.round(document.querySelector('.heart-grid').getBoundingClientRect().top + scrollY));
  const r = await p.evaluate(() => {
    const vh = innerHeight, mark = document.getElementById('heart-mark').getBoundingClientRect(), title = document.getElementById('heart-title').getBoundingClientRect();
    const inView = (r) => r.top >= 0 && r.bottom <= vh;
    return { markTop: Math.round(mark.top), markBottom: Math.round(mark.bottom), markOK: inView(mark), titleTop: Math.round(title.top), titleBottom: Math.round(title.bottom), titleOK: inView(title), vh, markCenter: Math.round(mark.top + mark.height / 2) };
  });
  console.log(`${W}x${H}: mark ${r.markTop}..${r.markBottom} (${r.markOK ? 'OK' : 'CLIPPED'}, center ${r.markCenter} vs vh/2 ${Math.round(r.vh / 2)})  title ${r.titleTop}..${r.titleBottom} (${r.titleOK ? 'OK' : 'CLIPPED'})  gridTop=${gridTop}`);
  await p.close();
}

(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  for (const [W, H] of SIZES) await check(b, W, H);
  await b.close();
})();
