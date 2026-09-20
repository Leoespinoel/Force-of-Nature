// Copy the Pitch Site into ./pitch so it ships with this repo to GitHub Pages
// at https://forceofnature.org.in/pitch/ .
// Usage: node deploy-pitch.mjs
//   Copies "../Pitch Site/index.html" and its assets (logo, photographs, site screenshot) into ./pitch/,
//   wiping whatever was there. Tools, the dev server and screenshots never ship.
// Then: git add pitch && git commit && git push
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'Pitch Site');
const DEST = path.join(HERE, 'pitch');

const SHIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.woff', '.woff2', '.css', '.js', '.mjs', '.json']);

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('Pitch Site index.html not found at ' + SRC);
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
