// Copy the Online Store into ./store so it ships with this repo to GitHub Pages
// at https://forceofnature.org.in/store/ .
// Usage: node deploy-online-store.mjs
//   Copies "../Online Store/index.html" and its assets (logo, pieces/*.jpg, the sound button's music.mp3) into ./store/,
//   wiping whatever was there. Tools, design-loop docs and screenshots never ship.
// Then: git add store && git commit && git push
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'Online Store');
const DEST = path.join(HERE, 'store');

const SHIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.mp3', '.woff', '.woff2', '.css', '.js', '.mjs', '.json']);

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('Online Store index.html not found at ' + SRC);
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.copyFileSync(path.join(SRC, 'index.html'), path.join(DEST, 'index.html'));
const shipped = ['index.html'];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name), dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else if (SHIP_EXT.has(path.extname(entry.name).toLowerCase())) {
      fs.copyFileSync(src, dest);
      shipped.push(path.relative(DEST, dest).split(path.sep).join('/'));
    }
  }
}
copyDir(path.join(SRC, 'assets'), path.join(DEST, 'assets'));

const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
console.log('Shipped to ' + DEST + ':');
for (const f of shipped) console.log('  ' + f + '  ' + size(path.join(DEST, f)));
