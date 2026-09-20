// Bon Voyage → store: does the supernova turn into the black hole cleanly, and does the clip play to its end without stutter?
// Usage: node tools/hole-check.cjs [hero|exit|nav|light] [outDir]
//   hero  = Store clicked in the menu with the hero's cloud on screen (clip plays inside the cloud)
//   exit  = "Enter the store" on the last panel (same, in the exit panel's cloud)
//   nav   = Store clicked in the menu mid-page, no cloud on screen (the cloud blooms over the page)
//   light = the same click in the light theme, where the clouds are hidden (bloom)
//   outDir (optional) = where to save a frame of the screen roughly every 100ms, to look at the motion
//   PHONE=1: a 390x844 touch screen with the processor slowed 4x (CPU=n to change)
// Reports: which placement was chosen, where the hole was aimed, how much of the clip had played when the browser left,
// stalls, frames presented against the clip's real frame count, and real freezes (same judging as voyage-check.cjs).
const path = require('path'), fs = require('fs');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer'));
(async () => {
  const mode = process.argv[2] || 'hero', outDir = process.argv[3] || '';
  const url = process.env.URL || 'http://localhost:3000/bon-voyage/?voyage=1';
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const phone = !!process.env.PHONE, cpu = +(process.env.CPU || (phone ? 4 : 1));
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36');
  const cdp = await page.createCDPSession();
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  let last = null, left = null; const t0 = { v: 0 };
  await page.exposeFunction('__report', (s) => { last = s; });
  // the trip ends by leaving for the store: note when, and hold the request so the last frames can still be read
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.isNavigationRequest() && t0.v && !/bon-voyage/.test(r.url())) { if (left === null) left = Date.now() - t0.v; r.abort(); return; }
    // SKY_SRC=remnant-cloud.mp4 serves that file as the sky's clip (to test against footage that is not in place yet)
    if (process.env.SKY_SRC && /assets\/remnant-[\w-]+\.mp4/.test(r.url())) { r.continue({ url: r.url().replace(/remnant-[\w-]+\.mp4/, process.env.SKY_SRC) }); return; }
    r.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle2' });
  if (mode === 'light') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await new Promise((r) => setTimeout(r, 1500));
  const sel = mode === 'exit' ? '.exit-cta' : (phone ? '[data-store]' : '.nav a[data-store]');
  await page.evaluate((mode) => {
    const to = mode === 'exit' ? document.querySelector('#exit') : mode === 'nav' ? document.querySelector('#partnerships') : null;
    if (to) window.scrollTo(0, to.getBoundingClientRect().top + scrollY + (mode === 'exit' ? to.offsetHeight - innerHeight : 0));
  }, mode);
  await new Promise((r) => setTimeout(r, 3500)); /* the scroll settles, the sky near the click starts playing, the clip gets fetched */
  // SKY_T=7.5: the live cloud is put at that moment of its flight first. The collapse clip opens on the flight's first
  // frame, so the far end of the flight is the hardest hand-over
  if (process.env.SKY_T) {
    await page.evaluate((t) => document.querySelectorAll('[data-sky] video').forEach((v) => { if (v.readyState) v.currentTime = Math.min(t, (v.duration || t) - 0.3); }), +process.env.SKY_T);
    await new Promise((r) => setTimeout(r, 800));
  }
  await page.evaluate(() => {
    const v = document.getElementById('hole-video'), s = { waiting: 0, ended: false, error: false, frames: 0, maxGap: 0, t: 0, dur: 0 };
    let prev = 0, click = 0, playing = false;
    window.__arm = () => { click = performance.now(); s.readyAtClick = v.readyState; };
    v.addEventListener('playing', () => { if (click && !playing) { playing = true; s.playStartMs = Math.round(performance.now() - click); prev = 0; } });
    v.addEventListener('waiting', () => { if (playing) s.waiting++; });
    v.addEventListener('ended', () => { s.ended = true; push(); });
    v.addEventListener('error', () => { s.error = true; push(); });
    const push = () => {
      s.t = +v.currentTime.toFixed(2); s.dur = +(v.duration || 0).toFixed(2); s.src = (v.currentSrc || '').split('/').pop();
      const q = v.getVideoPlaybackQuality(); s.dropped = q.droppedVideoFrames; s.total = q.totalVideoFrames;
      s.inSky = v.classList.contains('is-in-sky'); s.parent = v.parentElement.className;
      const f = document.getElementById('hole-flare'); s.hx = f.style.getPropertyValue('--hx'); s.hy = f.style.getPropertyValue('--hy');
      s.closed = document.documentElement.classList.contains('is-sinking-close');
      if (s.closed && s.closedAt == null) s.closedAt = Math.round(performance.now() - click);
      window.__report(s);
    };
    const onFrame = (now, md) => {
      if (playing) {
        if (s.p0 == null) s.p0 = md.presentedFrames; s.presented = md.presentedFrames - s.p0 + 1;
        if (prev) { const shown = md.presentedFrames - s.pPrev, g = now - prev; if (g > s.maxGap) s.maxGap = Math.round(g); if (g > 120 && shown <= 2) (s.freezes = s.freezes || []).push(Math.round(g) + 'ms@' + v.currentTime.toFixed(2) + 's'); }
        s.pPrev = md.presentedFrames; s.frames++; prev = now; push();
      }
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
    setInterval(push, 50);
  });
  const shots = [];
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    let lastShot = 0;
    cdp.on('Page.screencastFrame', (f) => {
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      if (!t0.v) return; const ms = Date.now() - t0.v; if (ms - lastShot < 90) return; lastShot = ms;
      const name = mode + (phone ? '-phone' : '') + '-' + String(ms).padStart(4, '0') + '.jpg'; fs.writeFileSync(path.join(outDir, name), Buffer.from(f.data, 'base64')); shots.push(name);
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 960, maxHeight: 960, everyNthFrame: 1 });
  }
  const btn = await page.$(sel);
  await page.evaluate(() => window.__arm());
  t0.v = Date.now();
  if (phone) await btn.tap(); else await btn.click();
  const until = Date.now() + 9000;
  while (left === null && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 300));
  const s = last || {};
  console.log(`${phone ? 'PHONE (cpu /' + cpu + ') | ' : ''}${mode} | ${s.src}`);
  console.log(`  placement: ${s.inSky ? 'in the cloud (' + s.parent + ')' : 'bloom over the page'}; hole aimed at ${s.hx}, ${s.hy}; veil began closing ${s.closedAt} ms after click`);
  console.log(`  left the page after ${left} ms; clip had reached ${s.t}s of ${s.dur}s; ended: ${s.ended}; error: ${s.error}; ready state at click ${s.readyAtClick}/4; playback began ${s.playStartMs} ms after click`);
  const expect = s.total || 84;
  console.log(`  ON SCREEN: ${s.presented} of ~${expect} frames presented; dropped ${s.dropped}/${s.total}; stalls ${s.waiting}; longest gap ${s.maxGap} ms; real freezes: [${(s.freezes || []).join(', ') || 'none'}]`);
  console.log('  VERDICT:', s.ended ? 'finished' : 'CUT OFF before the end', '|', ((s.freezes || []).length || !s.frames || s.presented < expect * 0.76) ? 'BROKE UP' : 'smooth');
  if (outDir) console.log(`  ${shots.length} frames saved in ${outDir}`);
  await browser.close();
})();
