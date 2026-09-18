// What is the page's main thread busy with while it starts up? Samples the JS profiler and prints the heaviest functions
// (self time) and the heaviest call chains' top-level callers. Usage: [PHONE=1] node tools/startup-profile.cjs [url] [seconds]
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
(async () => {
  const url = process.argv[2] || 'http://localhost:3001/', secs = +(process.argv[3] || 10), phone = !!process.env.PHONE;
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  const c = await page.createCDPSession();
  if (phone) await c.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 500 }); await c.send('Profiler.start');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, secs * 1000));
  const { profile } = await c.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map();
  profile.nodes.forEach((n) => (n.children || []).forEach((k) => parent.set(k, n.id)));
  const self = new Map(), total = (profile.endTime - profile.startTime) / 1000;
  const dts = profile.timeDeltas; profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dts[i] || 0) / 1000));
  const label = (n) => `${n.callFrame.functionName || '(anonymous)'} ${(n.callFrame.url || '').split('/').pop().split('?')[0] || '-'}:${n.callFrame.lineNumber + 1}`;
  const skip = /^\((idle|program|root|garbage collector)\)/;
  const fn = new Map(), owner = new Map();
  for (const [id, ms] of self) {
    const n = byId.get(id); const l = label(n); if (skip.test(l)) { if (/garbage/.test(l)) fn.set('(garbage collector)', (fn.get('(garbage collector)') || 0) + ms); continue; }
    fn.set(l, (fn.get(l) || 0) + ms);
    // nearest ancestor that lives in the page's own index.html = "who asked for this work"
    let p = id, who = null; while (p != null) { const a = byId.get(p); if (/index\.html|^$/.test((a.callFrame.url || '').split('/').pop().split('?')[0]) && a.callFrame.url && a.callFrame.functionName !== '(root)') { who = label(a); } p = parent.get(p); }
    owner.set(who || '(library / browser, no page caller)', (owner.get(who || '(library / browser, no page caller)') || 0) + ms);
  }
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).forEach(([l, ms]) => console.log(`  ${String(Math.round(ms)).padStart(6)} ms  ${l}`));
  const busy = [...fn.values()].reduce((a, b) => a + b, 0);
  console.log(`${phone ? 'PHONE (cpu /4) | ' : ''}${url} | first ${secs}s | JS busy ${Math.round(busy)} ms of ${Math.round(total)} ms`);
  console.log(' heaviest functions (self time):'); top(fn, 14);
  console.log(' outermost page function responsible (index.html line):'); top(owner, 10);
  await browser.close();
})();
