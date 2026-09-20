/* Checks the hero headline shuffle: scroll down from it, back up to it, and back up from far below.
   For each move it samples the headline text every frame and reports whether it scrambled, whether it
   settled back to the real words, and whether the line ever changed width or height (it must not re-wrap). */
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer'));
const OUT = process.argv[2] || path.join(__dirname, 'shuffle-shots');
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport(vp);
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3500)); /* let the intro finish */

    const sample = (label, y, shot) => page.evaluate(async (y, label) => {
      const h = document.querySelector('.h-hero'), ls = [...h.querySelectorAll('.l')];
      const real = ls.map(l => l.textContent);
      const box0 = ls.map(l => [Math.round(l.scrollWidth), Math.round(l.offsetHeight)]);
      window.scrollTo(0, y);
      const seen = new Set(); let maxDw = 0, maxDh = 0, frames = 0, firstDiff = -1, lastDiff = -1;
      const t0 = performance.now();
      await new Promise(done => { const tick = () => {
        const t = performance.now() - t0, now = ls.map(l => l.textContent);
        if (now.join('|') !== real.join('|')) { seen.add(now.join('|')); if (firstDiff < 0) firstDiff = t; lastDiff = t; }
        ls.forEach((l, i) => { maxDw = Math.max(maxDw, Math.abs(Math.round(l.scrollWidth) - box0[i][0])); maxDh = Math.max(maxDh, Math.abs(Math.round(l.offsetHeight) - box0[i][1])); });
        frames++; if (t < 2200) requestAnimationFrame(tick); else done();
      }; requestAnimationFrame(tick); });
      const end = ls.map(l => l.textContent);
      return { label, scrambledOrders: seen.size, firstMs: Math.round(firstDiff), lastMs: Math.round(lastDiff), settled: end.join('|') === real.join('|'), maxWidthShiftPx: maxDw, maxHeightShiftPx: maxDh, frames, sampleOrder: [...seen][Math.floor(seen.size / 3)] || null };
    }, y, label);

    const H = vp.height;
    const results = [];
    const pDown = sample('scroll down from it', 300);
    await new Promise(r => setTimeout(r, 450));
    await page.screenshot({ path: path.join(OUT, vp.name + '-mid-shuffle.png') });
    results.push(await pDown);
    results.push(await sample('scroll back up to it', 0));
    results.push(await sample('go far below (no shuffle expected to matter)', H * 2.5));
    results.push(await sample('come back up from below', Math.round(H * 0.35)));
    await page.screenshot({ path: path.join(OUT, vp.name + '-settled.png') });
    console.log('\n== ' + vp.name + ' ==');
    results.forEach(r => console.log(JSON.stringify(r)));
    console.log('page errors:', errors.length ? errors : 'none');
    await page.close();
  }
  await browser.close();
})();
