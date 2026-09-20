// Does the shared sound button (the leoespinoel.com pill) work on all three sites?
// Usage: node tools/sound-check.cjs [outDir]
// For each page, on a desktop and a phone screen: presses the button, checks it reads "On", that the nine dots are
// really moving with the music (their levels come from the live analyser, so flat dots = no signal), presses again,
// checks it reads "Off" and the dots rest. Saves a close-up of the header, off and on.
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer'));
const OUT = process.argv[2] || path.join(__dirname, 'sound-shots');
require('fs').mkdirSync(OUT, { recursive: true });
const PAGES = [['newsletter', 'http://localhost:3000/'], ['bon-voyage', 'http://localhost:3000/bon-voyage/'], ['store', 'http://localhost:3002/']];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [name, url] of PAGES) for (const vp of [{ n: 'desktop', width: 1440, height: 900 }, { n: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('requestfailed', r => { if (/music/.test(r.url())) errors.push('music request failed: ' + r.url()); });
    await page.setViewport(vp);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await wait(7000); /* loaders and intros */
    const read = () => page.evaluate(() => {
      const b = document.getElementById('sound-toggle'); if (!b) return null;
      const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
      return { pressed: b.getAttribute('aria-pressed'), label: b.querySelector('.sound-toggle__label').textContent, labelShown: getComputedStyle(b.querySelector('.sound-toggle__label')).display !== 'none',
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], opacity: cs.opacity, border: cs.borderTopColor, vw: innerWidth, docW: document.documentElement.scrollWidth,
        dots: [...b.querySelectorAll('.sound-toggle__matrix i')].map(d => +(+getComputedStyle(d).opacity).toFixed(2)) };
    });
    const clip = { x: 0, y: 0, width: vp.width, height: 130 };
    const off = await read();
    await page.screenshot({ path: path.join(OUT, `${name}-${vp.n}-off.png`), clip });
    await page.click('#sound-toggle');
    await wait(2500);
    /* sample the dots over a second: they should differ between samples while music plays */
    const samples = []; for (let i = 0; i < 6; i++) { samples.push((await read()).dots.join(',')); await wait(170); }
    const on = await read();
    await page.screenshot({ path: path.join(OUT, `${name}-${vp.n}-on.png`), clip });
    await page.click('#sound-toggle');
    await wait(900);
    const after = await read();
    console.log(`\n== ${name} / ${vp.n} ==`);
    console.log('off  :', JSON.stringify(off));
    console.log('on   :', JSON.stringify(on), '| distinct dot states in 1s:', new Set(samples).size);
    console.log('after:', JSON.stringify({ pressed: after.pressed, label: after.label, dots: after.dots }));
    console.log('sideways overflow:', off.docW > off.vw ? `YES (${off.docW} > ${off.vw})` : 'none', '| errors:', errors.length ? errors : 'none');
    await page.close();
  }
  await browser.close();
})();
