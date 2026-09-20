// Does the supernova sky on Bon Voyage play smoothly, and can the loop's wrap (end -> beginning) be seen?
// Usage: node tools/sky-loop-check.cjs [url]     url default http://localhost:3000/bon-voyage/
// Reports, for a stretch in mid-flight and for the stretch across the wrap: painted frames, the longest gap between two
// painted frames (requestVideoFrameCallback) and gaps over 34ms (two frames at 60fps). Whether the wrap shows in the
// picture itself is a property of the file: last frame against first, measured when the loop was built.
// PHONE=1: a 390x844 touch screen with the processor slowed 4x.
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer'));
(async () => {
  const url = process.argv[2] || 'http://localhost:3000/bon-voyage/';
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const phone = !!process.env.PHONE;
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  if (phone) { const cc = await page.createCDPSession(); await cc.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  await page.goto(url, { waitUntil: 'networkidle2' });
  const setup = await page.evaluate(async () => {
    const box = document.querySelector('.hero-sky'), vids = box.querySelectorAll('video'), v = vids[0];
    const t0 = performance.now();
    while ((v.paused || v.readyState < 3) && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
    window.__v = v;
    window.__watch = (ms) => new Promise((done) => {
      const s = { frames: 0, maxGap: 0, over34: 0, wrapped: false, from: +v.currentTime.toFixed(2) }; let prev = 0, lastT = v.currentTime; const end = performance.now() + ms;
      const tick = (now, meta) => {
        if (prev) { const g = now - prev; s.maxGap = Math.max(s.maxGap, g); if (g > 34) s.over34++; }
        if (meta.mediaTime < lastT - 1) { s.wrapped = true; s.wrapGap = prev ? +(now - prev).toFixed(1) : 0; }
        lastT = meta.mediaTime; prev = now; s.frames++;
        if (performance.now() < end) v.requestVideoFrameCallback(tick); else { s.maxGap = +s.maxGap.toFixed(1); s.to = +v.currentTime.toFixed(2); done(s); }
      };
      v.requestVideoFrameCallback(tick);
    });
    const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
    return { players: vids.length, loop: v.loop, src: v.currentSrc.split('/').pop(), duration: +v.duration.toFixed(2), playing: !v.paused, size: v.videoWidth + 'x' + v.videoHeight, dropped0: q.droppedVideoFrames || 0 };
  });
  console.log('sky:', setup);
  // no seeking: the page never seeks, and the loop has a single keyframe, so a seek would mean decoding from the start
  await page.evaluate(async () => { while (window.__v.currentTime < 8) await new Promise(r => setTimeout(r, 50)); }); /* past page start-up, at the flight's fastest */
  console.log('mid-flight, 4s:', await page.evaluate(() => window.__watch(4000)));
  // across the wrap: wait for the clip to come within 2s of its end, shoot either side of it
  await page.evaluate(async (d) => { while (window.__v.currentTime < d - 2) await new Promise(r => setTimeout(r, 50)); }, setup.duration);
  console.log('across the wrap, 3s:', await page.evaluate(() => window.__watch(3000)));
  console.log('dropped frames in all:', await page.evaluate((d0) => (window.__v.getVideoPlaybackQuality().droppedVideoFrames || 0) - d0, setup.dropped0));
  await browser.close();
})();
