// Renders the app icons from the same procedural crystal art the game uses.
// Run with: node tools/make-icons.mjs   (needs Playwright with Chromium available)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

// Resolved with require so a globally installed Playwright is found too.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
const server = http
  .createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><canvas id="c"></canvas>');
    }
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);

const render = (size, pad) =>
  page.evaluate(
    async ({ size, pad }) => {
      const { Scene } = await import('/js/scene.js');
      const out = document.createElement('canvas');
      out.width = out.height = size;
      const ctx = out.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, size);
      bg.addColorStop(0, '#2a1a78');
      bg.addColorStop(1, '#0b0820');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      const glow = ctx.createRadialGradient(size / 2, size * 0.5, 0, size / 2, size * 0.5, size * 0.55);
      glow.addColorStop(0, 'rgba(120, 235, 255, 0.55)');
      glow.addColorStop(0.5, 'rgba(200, 110, 255, 0.22)');
      glow.addColorStop(1, 'rgba(120, 80, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      const scene = new Scene(document.createElement('canvas'));
      scene.dpr = 1;
      scene.crystals = (await import('/js/scene.js')).composeCluster({ quartz: 15, amethyst: 15, geode: 5, loom: 5, aurora: 5 });
      let up = 0;
      for (const c of scene.crystals) up = Math.max(up, Math.cos(c.angle) * c.len);
      scene.up = up;
      const R = (size * (1 - pad * 2)) / 1.16;
      scene.R = R;
      scene.renderSprite();
      const oy = size / 2 + ((up - 0.34) / 2) * R;
      ctx.drawImage(scene.sprite, size / 2 - scene.spriteOx * R, oy - scene.spriteOy * R);
      return out.toDataURL('image/png');
    },
    { size, pad }
  );

const jobs = [
  ['icon-192.png', 192, 0.06],
  ['icon-512.png', 512, 0.06],
  ['apple-touch-icon.png', 180, 0.06],
  ['icon-maskable-512.png', 512, 0.16],
];
for (const [name, size, pad] of jobs) {
  const url = await render(size, pad);
  fs.writeFileSync(path.join(root, 'icons', name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
server.close();
