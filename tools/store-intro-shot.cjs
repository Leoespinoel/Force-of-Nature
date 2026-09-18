const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', 'temporary screenshots');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('http://localhost:3000/store/', { waitUntil: 'domcontentloaded' });
  await wait(700);
  await p.screenshot({ path: path.join(OUT, 'store-intro-blackhole.jpg'), type: 'jpeg', quality: 80 });
  await wait(1300);
  await p.screenshot({ path: path.join(OUT, 'store-intro-heart.jpg'), type: 'jpeg', quality: 80 });
  await wait(2500);
  await p.screenshot({ path: path.join(OUT, 'store-intro-done.jpg'), type: 'jpeg', quality: 80 });
  await b.close();
})();
