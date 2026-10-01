import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const seedDir = fileURLToPath(new URL('../server/seed/', import.meta.url));
const content = JSON.parse(readFileSync(`${seedDir}content.json`, 'utf8'));
mkdirSync(`${seedDir}images`, { recursive: true });

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const palette = { product: ['#2b2320', '#4a3a2e'], collection: ['#18202e', '#2c3a52'], boutique: ['#1d2a22', '#34493b'] };

// Latin text only: SVG rendering has no CJK fonts guaranteed.
const svg = (title, subtitle, [from, to]) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1200" height="1200" fill="url(#g)"/>
  <rect x="60" y="60" width="1080" height="1080" fill="none" stroke="#e9dcc0" stroke-opacity="0.45" stroke-width="2"/>
  <text x="600" y="520" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#e9dcc0" fill-opacity="0.7" letter-spacing="14">MAISON</text>
  <text x="600" y="620" text-anchor="middle" font-family="Georgia, serif" font-size="68" fill="#e9dcc0" letter-spacing="4">${escape(title)}</text>
  <text x="600" y="690" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#e9dcc0" fill-opacity="0.6" letter-spacing="8">${escape(subtitle)}</text>
</svg>`;

const jobs = [
  ...content.products.map((p) => [p.image, p.name.en, p.category.toUpperCase(), palette.product]),
  ...content.collections.map((c) => [c.image, c.name.en, 'COLLECTION', palette.collection]),
  ...content.boutiques.map((b) => [b.image, b.name.en, b.city.en.toUpperCase(), palette.boutique]),
];

for (const [file, title, subtitle, colors] of jobs) {
  await sharp(Buffer.from(svg(title, subtitle, colors))).png({ compressionLevel: 9 }).toFile(`${seedDir}images/${file}`);
}
console.log(`Generated ${jobs.length} images in server/seed/images`);
