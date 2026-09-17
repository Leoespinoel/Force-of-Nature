// Copy the store site into ./bon-voyage so it ships with this repo to GitHub Pages
// at https://forceofnature.org.in/bon-voyage/ .
// Usage: node deploy-store.mjs [--with-music]
//   Copies "../Store website/index.html" and its assets (logo, Milky Way) into ./bon-voyage/,
//   wiping whatever was there. Music files are left out unless --with-music is passed, because
//   the track currently in the store's assets is a commercial release and publishing it needs a licence.
//   Tools, design-loop docs, brand assets and screenshots never ship.
// Then: git add bon-voyage && git commit && git push
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'Store website');
const DEST = path.join(HERE, 'bon-voyage');
const withMusic = process.argv.includes('--with-music');

const SHIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.woff', '.woff2', '.css', '.js', '.mjs', '.json']);
const MUSIC_EXT = new Set(['.mp3', '.m4a', '.wav', '.ogg']);

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('Store index.html not found at ' + SRC);
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, 'assets'), { recursive: true });

fs.copyFileSync(path.join(SRC, 'index.html'), path.join(DEST, 'index.html'));
const shipped = ['index.html'];
const skipped = [];
for (const f of fs.readdirSync(path.join(SRC, 'assets'))) {
  const ext = path.extname(f).toLowerCase();
  const isMusic = MUSIC_EXT.has(ext);
  if ((SHIP_EXT.has(ext) || (isMusic && withMusic)) && !(isMusic && f !== 'music' + ext)) {
    fs.copyFileSync(path.join(SRC, 'assets', f), path.join(DEST, 'assets', f));
    shipped.push('assets/' + f);
  } else {
    skipped.push('assets/' + f);
  }
}

const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
console.log('Shipped to ' + DEST + ':');
for (const f of shipped) console.log('  ' + f + '  ' + size(path.join(DEST, f)));
if (skipped.length) {
  console.log('Left out' + (withMusic ? '' : ' (pass --with-music to include a licensed music.* file)') + ':');
  for (const f of skipped) console.log('  ' + f);
}
