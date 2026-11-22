// Generates the Android launcher icons and splash screens from resources/icon.svg.
// Run: node scripts/make-icons.mjs   (needs the dev dependency "sharp")
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RES = 'android/app/src/main/res';
const BRAND = '#13293d';
const svg = readFileSync('resources/icon.svg', 'utf8');
const fg = svg.replace(/<rect[^>]*\/>/, ''); // foreground only (transparent background)
const inner = svg.replace('viewBox="0 0 108 108"', 'viewBox="18 18 72 72"'); // legacy icon: crop to the 72dp content area

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const png = (src, size) => sharp(Buffer.from(src), { density: 72 * (size / 108) * 4 }).resize(size, size).png().toBuffer();

for (const [d, k] of Object.entries(DENSITY)) {
  const dir = join(RES, `mipmap-${d}`);
  const legacy = Math.round(48 * k);
  const square = await png(inner, legacy);
  // legacy square icon with rounded corners
  const r = Math.round(legacy * 0.18);
  const mask = Buffer.from(`<svg width="${legacy}" height="${legacy}"><rect width="${legacy}" height="${legacy}" rx="${r}" ry="${r}"/></svg>`);
  writeFileSync(join(dir, 'ic_launcher.png'), await sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer());
  const circle = Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`);
  writeFileSync(join(dir, 'ic_launcher_round.png'), await sharp(square).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer());
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), await png(fg, Math.round(108 * k)));
}

// splash screens: brand colour with the icon in the middle (same sizes as before)
const splashes = [
  'drawable/splash.png',
  ...['land', 'port'].flatMap((o) => Object.keys(DENSITY).map((d) => `drawable-${o}-${d}/splash.png`)),
];
for (const rel of splashes) {
  const file = join(RES, rel);
  const { width, height } = await sharp(file).metadata();
  const size = Math.round(Math.min(width, height) * 0.42);
  const icon = await png(fg, size);
  const out = await sharp({ create: { width, height, channels: 4, background: BRAND } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toBuffer();
  writeFileSync(file, out);
}
console.log('icons and splash screens written');
