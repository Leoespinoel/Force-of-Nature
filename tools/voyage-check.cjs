// Does the Bon Voyage wormhole play to its end before the page leaves, and does it stutter on the way?
// Usage: node tools/voyage-check.cjs [url] [mbit] [hover|nohover] [dwell seconds]
//   e.g. node tools/voyage-check.cjs https://forceofnature.org.in/ 10 nohover 6   (reads the page for 6s, then taps without hovering)
//   url  default http://localhost:3000/ ; mbit = download limit in Mbit/s (0 = unlimited). Cold cache every run.
// Reports: how much of the clip had played when the browser left, stalls ("waiting"), dropped frames, and the longest
// gap between two painted frames (requestVideoFrameCallback), which is what the eye reads as the tunnel breaking up.
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
(async () => {
  const url = process.argv[2] || 'http://localhost:3000/', mbit = +(process.argv[3] || 0), hover = process.argv[4] === 'hover', dwell = +(process.argv[5] || 0);
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  // PHONE=1: a 390x844 touch screen, and the processor slowed (CPU=4 by default) to stand in for a mid-range phone
  const phone = !!process.env.PHONE, cpu = +(process.env.CPU || (phone ? 4 : 1));
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36');
  if (cpu > 1) { const cc = await page.createCDPSession(); await cc.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  await page.setCacheEnabled(false);
  if (mbit) { const c = await page.createCDPSession(); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: mbit * 125000, uploadThroughput: 2 * 125000 }); }
  let last = null, left = null; const t0 = { v: 0 };
  await page.exposeFunction('__report', (s) => { last = s; });
  page.on('request', (r) => { if (r.isNavigationRequest() && /bon-voyage/.test(r.url()) && left === null) left = Date.now() - t0.v; });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const v = document.getElementById('voyageVideo'), s = { waiting: 0, ended: false, error: false, frames: 0, maxGap: 0, gaps50: 0, t: 0, dur: 0, rate: 0, readyAtClick: -1, firstFrameMs: -1 };
    let prev = 0, click = 0, playing = false;
    window.__arm = () => { click = performance.now(); s.readyAtClick = v.readyState; s.preloadAtClick = v.preload; s.bufferedAtClick = v.buffered.length ? +v.buffered.end(v.buffered.length - 1).toFixed(2) : 0; };
    // stalls and gaps only count once the tunnel is actually running: a frame painted while the clip loads, or the wait
    // before the portal opens, is not something the visitor sees as the tunnel breaking up
    v.addEventListener('playing', () => { if (click && !playing) { playing = true; s.playStartMs = Math.round(performance.now() - click); prev = 0; } });
    v.addEventListener('waiting', () => { if (playing) s.waiting++; });
    v.addEventListener('ended', () => { s.ended = true; push(); });
    v.addEventListener('error', () => { s.error = true; push(); });
    const push = () => { s.t = +v.currentTime.toFixed(2); s.dur = +(v.duration || 0).toFixed(2); s.rate = v.playbackRate; const q = v.getVideoPlaybackQuality(); s.dropped = q.droppedVideoFrames; s.total = q.totalVideoFrames; window.__report(s); };
    const onFrame = (now, md) => { if (playing) { if (s.p0 == null) s.p0 = md.presentedFrames; s.presented = md.presentedFrames - s.p0 + 1;
      // see warp-check.cjs: a callback gap is only a freeze on screen if hardly any frames were presented during it
      if (prev) { const shown = md.presentedFrames - s.pPrev, gg = now - prev; if (gg > 120 && shown <= 2) (s.freezes = s.freezes || []).push(Math.round(gg) + 'ms@' + v.currentTime.toFixed(2) + 's'); else if (gg > 120) (s.blind = s.blind || []).push(Math.round(gg) + 'ms/' + shown + 'fr'); }
      s.pPrev = md.presentedFrames;
      if (s.firstFrameMs < 0) s.firstFrameMs = Math.round(now - click); if (prev) { const g = now - prev; if (g > s.maxGap) s.maxGap = Math.round(g); if (g > 50) s.gaps50++; } s.frames++; prev = now; push(); } v.requestVideoFrameCallback(onFrame); };
    v.requestVideoFrameCallback(onFrame);
    setInterval(push, 100);
  });
  const btn = await page.$('#voyageBtn');
  await btn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 600 + dwell * 1000));
  if (hover) { await btn.hover(); await new Promise((r) => setTimeout(r, 1500)); }
  await page.evaluate(() => window.__arm());
  t0.v = Date.now();
  if (phone) await btn.tap(); else await btn.click();
  const until = Date.now() + 12000;
  while (left === null && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  const s = last || {};
  console.log(`${phone ? 'PHONE (cpu /' + cpu + ') | ' : ''}${url} | ${mbit ? mbit + ' Mbit/s' : 'unlimited'}${hover ? ' | hovered 1.5s first' : ' | no hover (as on a phone)'}${dwell ? ' | on the page ' + dwell + 's before the click' : ' | clicked ~1s after load'}`);
  console.log(`  left the page after ${left} ms; clip had reached ${s.t}s of ${s.dur}s (${s.dur ? Math.round(s.t / s.dur * 100) : 0}%) at rate ${s.rate}; ended event: ${s.ended}; error: ${s.error}`);
  console.log(`  at click: ready state ${s.readyAtClick}/4, preload="${s.preloadAtClick}", ${s.bufferedAtClick}s buffered; playback began ${s.playStartMs} ms after click`);
  console.log(`  while playing: first frame ${s.firstFrameMs} ms after click; stalls: ${s.waiting}; frames painted: ${s.frames}; dropped: ${s.dropped}/${s.total}; longest gap between frames: ${s.maxGap} ms; gaps over 50 ms: ${s.gaps50}`);
  // a stall only matters if it shows: either as a gap between two painted frames, or as time the clip cannot account for
  // (left the page later than start + clip length / rate), which is how a freeze after the last painted frame would appear
  const slack = s.ended && s.playStartMs != null ? Math.round(left - s.playStartMs - s.dur / (s.rate || 1) * 1000) : null;
  // the clip's own frame count is what the decoder reported (the supernova is 30fps: 72 frames; the wormhole was 60fps: ~145)
  const expect = s.total || 145;
  console.log(`  ON SCREEN: ${s.presented} of ~${expect} frames presented; real freezes: [${(s.freezes || []).join(', ') || 'none'}]; gaps with frames still shown: [${(s.blind || []).join(', ') || 'none'}]`);
  console.log(`  unaccounted time (left - start - clip length): ${slack} ms`);
  console.log('  VERDICT:', s.ended ? 'finished' : 'CUT OFF before the end', '|', ((s.freezes || []).length || (slack !== null && slack > 250) || !s.frames || s.presented < expect * 0.76) ? 'BROKE UP' : 'smooth', '(judged on frames presented)');
  await browser.close();
})();
