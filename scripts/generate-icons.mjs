// Renders the design-system favicon into PWA icon variants.
// Run via: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/icons');

const BG = '#f3ebd9';
const INK = '#2a2520';
const CORAL = '#e88562';

// Standard (rounded) icon — for iOS / favicon / Android non-maskable.
function rounded(size) {
  // big radius for that soft-square look on home screens
  const r = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.58);
  const cy = Math.round(size * 0.72);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect x="${Math.round(size * 0.04)}" y="${Math.round(size * 0.04)}" width="${size - Math.round(size * 0.08)}" height="${size - Math.round(size * 0.08)}" rx="${r}" fill="${BG}" stroke="${INK}" stroke-width="${Math.max(3, Math.round(size * 0.045))}"/>
  <text x="${size / 2}" y="${cy}" text-anchor="middle" font-family="'Fraunces','Times New Roman',serif" font-weight="600" font-size="${fontSize}" fill="${INK}">n</text>
  <circle cx="${Math.round(size * 0.78)}" cy="${Math.round(size * 0.78)}" r="${Math.round(size * 0.1)}" fill="${CORAL}" stroke="${INK}" stroke-width="${Math.max(2, Math.round(size * 0.03))}"/>
</svg>`;
}

// Maskable — full-bleed cream background, all important content inside the inner 80% safe area.
function maskable(size) {
  const fontSize = Math.round(size * 0.46);
  const cy = Math.round(size * 0.66);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text x="${size / 2}" y="${cy}" text-anchor="middle" font-family="'Fraunces','Times New Roman',serif" font-weight="600" font-size="${fontSize}" fill="${INK}">n</text>
  <circle cx="${Math.round(size * 0.66)}" cy="${Math.round(size * 0.66)}" r="${Math.round(size * 0.07)}" fill="${CORAL}" stroke="${INK}" stroke-width="${Math.max(2, Math.round(size * 0.022))}"/>
</svg>`;
}

async function svgToPng(svg, outPath) {
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await svgToPng(rounded(192), path.join(outDir, 'icon-192.png'));
  await svgToPng(rounded(512), path.join(outDir, 'icon-512.png'));
  await svgToPng(rounded(180), path.join(outDir, 'apple-touch-icon.png'));
  await svgToPng(maskable(512), path.join(outDir, 'icon-maskable-512.png'));
  // simple favicon
  await svgToPng(rounded(64), path.join(outDir, 'favicon-64.png'));
  console.log('wrote icons to', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

void writeFile; // keep import used if later needed
