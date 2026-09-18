// Where does the renderer's main thread spend the page's first seconds, script or rendering? Aggregates a Chrome trace.
// Usage: [PHONE=1] node tools/startup-trace.cjs [url] [seconds]
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules', 'puppeteer'));
const fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  const url = process.argv[2] || 'http://localhost:3001/', secs = +(process.argv[3] || 11), phone = !!process.env.PHONE;
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  if (phone) { const c = await page.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  if (process.env.MBIT) { const n = await page.createCDPSession(); await n.send('Network.enable'); await n.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: +process.env.MBIT * 125000, uploadThroughput: 250000 }); }
  const file = path.join(os.tmpdir(), 'fon-trace.json');
  await page.tracing.start({ path: file, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'blink.user_timing', 'loading'] });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, secs * 1000));
  await page.tracing.stop(); await browser.close();
  const ev = JSON.parse(fs.readFileSync(file, 'utf8')).traceEvents;
  // several renderers exist (the blank start page, the site): take the main thread that did the most work
  const mains = ev.filter((e) => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain');
  const work = (m) => ev.reduce((a, e) => a + (e.pid === m.pid && e.tid === m.tid && e.ph === 'X' && /RunTask/.test(e.name) ? e.dur || 0 : 0), 0);
  const main = mains.sort((x, y) => work(y) - work(x))[0];
  const pid = main.pid, tid = main.tid;
  const X = ev.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && e.dur > 0).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const t0 = Math.min(...X.map((e) => e.ts));
  // self time per event name (children subtracted), plus the long tasks and what is inside each
  const stack = [], self = new Map(), tasks = [];
  for (const e of X) {
    while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop();
    const node = { name: e.name, end: e.ts + e.dur, e };
    if (stack.length) { const p = stack[stack.length - 1]; self.set(p.name, (self.get(p.name) || 0) - e.dur); }
    self.set(e.name, (self.get(e.name) || 0) + e.dur);
    if ((e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.dur > 400000) tasks.push(e);
    stack.push(node);
  }
  console.log(`${phone ? 'PHONE (cpu /4) | ' : ''}${url} | first ${secs}s | main-thread self time by kind of work:`);
  [...self].filter(([n]) => !/RunTask|^Task$/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([n, d]) => console.log(`  ${String(Math.round(d / 1000)).padStart(6)} ms  ${n}`));
  const fin = ev.filter((e) => e.name === 'ResourceFinish' || e.name === 'ResourceSendRequest');
  const urls = new Map(); fin.forEach((e) => { const d = e.args.data; if (e.name === 'ResourceSendRequest') urls.set(d.requestId, d.url); });
  console.log(' resources finishing after 2.5s:'); fin.filter((e) => e.name === 'ResourceFinish' && (e.ts - t0) / 1000 > 2500).forEach((e) => console.log(`  ${String(Math.round((e.ts - t0) / 1000)).padStart(6)} ms  ${(urls.get(e.args.data.requestId) || '?').split('/').slice(-1)[0].slice(0, 60)}  ${Math.round((e.args.data.encodedDataLength || 0) / 1024)} KB`));
  console.log(' long tasks over 400 ms, and the biggest pieces inside each:');
  for (const t of tasks) {
    const inside = new Map();
    X.filter((e) => e !== t && e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur && !/RunTask/.test(e.name)).forEach((e) => {
      let label = e.name; const d = e.args && (e.args.data || e.args.beginData);
      if (d && d.url) label += ' ' + String(d.url).split('/').pop().slice(0, 40); else if (d && d.functionName) label += ' ' + d.functionName + ':' + d.lineNumber;
      inside.set(label, Math.max(inside.get(label) || 0, 0) + e.dur);
    });
    const top = [...inside].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, d]) => `${n} ${Math.round(d / 1000)}ms`).join(' | ');
    console.log(`  ${Math.round(t.dur / 1000)} ms @ ${Math.round((t.ts - t0) / 1000)} ms: ${top}`);
  }
})();
