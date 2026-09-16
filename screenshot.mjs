// Screenshot a localhost URL with Puppeteer and save it under "./temporary screenshots/".
// Usage: node screenshot.mjs http://localhost:3000 [label]
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, 'temporary screenshots');

const url = process.argv[2];
const label = process.argv[3];

if (!url) {
  console.error('Usage: node screenshot.mjs <url> [label]');
  process.exit(1);
}

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function nextIndex() {
  const existing = fs.readdirSync(OUT_DIR)
    .map((f) => f.match(/^screenshot-(\d+)/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return existing.length ? Math.max(...existing) + 1 : 1;
}

const index = nextIndex();
const fileName = label ? `screenshot-${index}-${label}.png` : `screenshot-${index}.png`;
const outPath = path.join(OUT_DIR, fileName);

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle0' });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Saved ${outPath}`);
