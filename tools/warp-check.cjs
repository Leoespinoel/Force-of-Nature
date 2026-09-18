// The store's direct-visit wormhole (#warp-video): does it play through smoothly on a first visit?
// Usage: node tools/warp-check.cjs [url] [mbit]    default http://localhost:3001/ , unlimited. Cold cache, fresh session.
// Counts only while the clip is playing: gaps between painted frames, stalls, and time the clip cannot account for.
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
(async () => {
  const url = process.argv[2] || 'http://localhost:3001/', mbit = +(process.argv[3] || 0);
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  // PHONE=1: a 390x844 touch screen, and the processor slowed (CPU=4 by default) to stand in for a mid-range phone
  const phone = !!process.env.PHONE, cpu = +(process.env.CPU || (phone ? 4 : 1));
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36');
  if (cpu > 1) { const cc = await page.createCDPSession(); await cc.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  await page.setCacheEnabled(false);
  const bad = []; page.on('pageerror', (e) => bad.push('JS: ' + e.message)); page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  if (mbit) { const c = await page.createCDPSession(); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: mbit * 125000, uploadThroughput: 2 * 125000 }); }
  await page.evaluateOnNewDocument(() => {
    const s = window.__warp = { waiting: 0, frames: 0, maxGap: 0, gaps50: 0, ended: false, error: false };
    const t0 = performance.now();
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => (s.long = s.long || []).push(Math.round(e.duration) + 'ms@' + Math.round(e.startTime - t0) + 'ms'))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    const hook = () => {
      const v = document.getElementById('warp-video'); if (!v) return setTimeout(hook, 5);
      let playing = false, prev = 0;
      v.addEventListener('playing', () => { if (!playing) { playing = true; s.playStartMs = Math.round(performance.now() - t0); } });
      v.addEventListener('waiting', () => { if (playing && !s.ended) s.waiting++; });
      v.addEventListener('ended', () => { s.ended = true; s.endedMs = Math.round(performance.now() - t0); });
      v.addEventListener('error', () => { s.error = true; });
      const f = (now, md) => { if (playing && !s.ended) { if (s.p0 == null) s.p0 = md.presentedFrames; s.presented = md.presentedFrames - s.p0 + 1;
        // this callback runs on the main thread, the picture does not: a long gap between callbacks is only a freeze ON SCREEN if
        // hardly any frames were presented during it. presentedFrames comes from the compositor, so it tells the two apart
        if (prev) { const shown = md.presentedFrames - s.pPrev, gg = now - prev; if (gg > 120 && shown <= 2) (s.freezes = s.freezes || []).push(Math.round(gg) + 'ms@' + v.currentTime.toFixed(2) + 's'); else if (gg > 120) (s.blind = s.blind || []).push(Math.round(gg) + 'ms/' + shown + 'fr'); }
        s.pPrev = md.presentedFrames;
        if (prev) { const g = now - prev; if (g > s.maxGap) { s.maxGap = Math.round(g); s.maxGapAt = +v.currentTime.toFixed(2); } if (g > 50) { s.gaps50++; (s.gapList = s.gapList || []).push(Math.round(g) + 'ms@' + v.currentTime.toFixed(2) + 's'); } } s.frames++; prev = now; } s.t = +v.currentTime.toFixed(2); s.dur = +(v.duration || 0).toFixed(2); s.rate = v.playbackRate; const q = v.getVideoPlaybackQuality(); s.dropped = q.droppedVideoFrames; s.total = q.totalVideoFrames; v.requestVideoFrameCallback(f); };
      v.requestVideoFrameCallback(f);
    };
    hook();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // until the trip is over (ended, or the overlay gone = skipped), then 1.5s more for the page's start-up; 20s at most
  await page.waitForFunction(() => window.__warp && (window.__warp.ended || (performance.now() > 1500 && !document.getElementById('warp').classList.contains('is-on'))), { timeout: 20000, polling: 100 }).catch(() => {});
  await new Promise((r) => setTimeout(r, +(process.env.AFTER || 1500))); // AFTER=9000 to see the page once its intro has finished
  const s = await page.evaluate(() => window.__warp);
  const slack = s.ended ? Math.round(s.endedMs - s.playStartMs - s.dur / (s.rate || 1) * 1000) : null;
  console.log(`${process.env.PHONE ? 'PHONE (cpu /' + (process.env.CPU || 4) + ') | ' : ''}${url} | ${mbit ? mbit + ' Mbit/s' : 'unlimited'} | first visit`);
  console.log(`  tunnel began ${s.playStartMs} ms after the page started; reached ${s.t}s of ${s.dur}s at rate ${s.rate}; ended: ${s.ended}; error: ${s.error}`);
  console.log(`  while playing: stalls ${s.waiting}; frames painted ${s.frames}; dropped ${s.dropped}/${s.total}; longest gap ${s.maxGap} ms; gaps over 50 ms: ${s.gaps50} [${(s.gapList || []).join(', ')}]; unaccounted ${slack} ms`);
  console.log(`  ON SCREEN: ${s.presented} of ~145 frames presented; real freezes (long gap with <=2 frames shown): [${(s.freezes || []).join(', ') || 'none'}]; callback gaps during which frames kept being shown (main thread busy, picture fine): [${(s.blind || []).join(', ') || 'none'}]`);
  const inTunnel = (s.long || []).filter((x) => { const [d, at] = x.split('ms@').map(parseFloat); return s.playStartMs != null && at + d > s.playStartMs && at < s.playStartMs + 2420; });
  console.log('  main-thread long tasks (duration@page time):', (s.long || []).join(', ') || 'none');
  console.log('  of which DURING the tunnel:', inTunnel.join(', ') || 'none');
  console.log('  VERDICT:', s.playStartMs == null ? 'trip skipped (never played): by design on a slow line, otherwise a fault' : (s.ended ? 'finished' : 'did not reach the end') + ' | ' + (((s.freezes || []).length || (slack !== null && slack > 250) || s.presented < 110) ? 'BROKE UP' : 'smooth') + ' (judged on frames presented, not on callback gaps)');
  // the page after the trip: did the start-up that waited for the tunnel actually run?
  const after = await page.evaluate(() => ({ introDone: document.documentElement.classList.contains('intro-done'), warpOn: document.getElementById('warp').classList.contains('is-on'), heroVisible: (() => { const e = document.querySelector('.hero [data-reveal]'); return e ? +getComputedStyle(e).opacity : null; })(), lenis: !!document.documentElement.className.match(/lenis/) }));
  console.log('  page afterwards:', JSON.stringify(after), '|', bad.length ? 'PROBLEMS: ' + bad.join(' ; ') : 'no page errors, no failed requests');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, type: 'jpeg', quality: 70 });
  await browser.close();
})();
