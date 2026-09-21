// Does the supernova sky on Bon Voyage play smoothly, and can the loop's wrap (end -> beginning) be seen?
// Usage: node tools/sky-loop-check.cjs [url]     url default http://localhost:3000/bon-voyage/
// The sky is two players over one file whose last TAIL seconds repeat its opening: the visible one plays into the tail,
// the hidden one starts from 0, is brought onto the same frame and swapped in (skyLoop() in the page). So the check
// follows the frames that are actually on screen, whichever player shows them (requestVideoFrameCallback on both,
// keeping only callbacks from the player with opacity 1), and reports
//   mid-flight, 4s   painted frames, longest gap between two, gaps over 50ms (a frame and a half at 30fps) and where
//                    in the clip they fell
//   across the wrap  the same, plus the swap itself: the gap it made, and whether the frame shown after it is the next
//                    frame of the flight (new mediaTime against old mediaTime - loop; 0.033 = exactly one frame on)
// Whether the file itself is one smooth forward flight is tools/sky-forward-verify.py's job.
// PHONE=1: a 390x844 touch screen with the processor slowed 4x.
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer'));
const TAIL = 3;
(async () => {
  const url = process.argv[2] || 'http://localhost:3000/bon-voyage/';
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const phone = !!process.env.PHONE;
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  if (phone) { const cc = await page.createCDPSession(); await cc.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const setup = await page.evaluate(async (TAIL) => {
    const box = document.querySelector('.hero-sky'), all = () => [...box.querySelectorAll('video')];
    const t0 = performance.now();
    const showing = () => all().find((v) => getComputedStyle(v).opacity === '1');
    while ((all().length < 2 || !showing() || showing().paused || showing().readyState < 3) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 100));
    const vids = all();
    const log = (window.__log = []); /* frames on screen: [time, player, mediaTime] */
    vids.forEach((v, i) => { const f = (now, m) => { if (getComputedStyle(v).opacity === '1') log.push([now, i, m.mediaTime]); v.requestVideoFrameCallback(f); }; v.requestVideoFrameCallback(f); });
    window.__now = () => showing().currentTime;
    const v = showing();
    return { players: vids.length, nativeLoop: vids.some((x) => x.loop), src: v.currentSrc.split('/').pop(), duration: +v.duration.toFixed(3), loop: +(v.duration - TAIL).toFixed(3), playing: !v.paused, size: v.videoWidth + 'x' + v.videoHeight };
  }, TAIL);
  console.log('sky:', setup);
  const stretch = (from, to) => page.evaluate((from, to, loop) => {
    const f = window.__log.filter((e) => e[0] >= from && e[0] <= to), s = { frames: f.length, maxGap: 0, over50: 0, gaps: [] };
    for (let i = 1; i < f.length; i++) {
      const g = f[i][0] - f[i - 1][0]; s.maxGap = Math.max(s.maxGap, g); if (g > 50) { s.over50++; s.gaps.push(Math.round(g) + 'ms at ' + f[i][2].toFixed(2) + 's'); }
      if (f[i][1] !== f[i - 1][1]) s.swap = { gapMs: +g.toFixed(1), frameStep: +(f[i][2] - (f[i - 1][2] - loop)).toFixed(3), atTail: +(f[i - 1][2] - loop).toFixed(2) };
    }
    s.maxGap = +s.maxGap.toFixed(1); return s;
  }, from, to, setup.loop);
  const now = () => page.evaluate(() => performance.now());
  const wait = (fn, arg) => page.evaluate(async (src, arg) => { const f = eval(src); while (!f(arg)) await new Promise(r => setTimeout(r, 50)); }, '(' + fn.toString() + ')', arg);
  await wait((t) => window.__now() > t, 8); /* past page start-up */
  let a = await now(); await new Promise(r => setTimeout(r, 4000));
  console.log('mid-flight, 4s:', await stretch(a, await now()));
  // across the wrap: no seeking (the page never seeks the visible player), wait for the flight to get there
  await wait((t) => window.__now() > t, setup.loop - 1.5);
  a = await now();
  await wait((t) => window.__now() < t && window.__now() > 1.5, 10); /* swapped, and 1.5s into the new round */
  console.log('across the wrap:', await stretch(a, await now()));
  const q = await page.evaluate(() => [...document.querySelectorAll('.hero-sky video')].map((v) => (v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().droppedVideoFrames : 0)));
  console.log('dropped frames per player:', q);
  await browser.close();
})();
