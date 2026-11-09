// Renders everything the App Store needs from the game's own art:
//   - the iOS app icons (default and the golden Patron one) and the launch screen
//   - one image per Game Center achievement        -> store/game-center/
//   - App Store screenshots for iPhone and iPad     -> store/screenshots/
// Run with: node tools/make-store-assets.mjs   (needs Playwright with Chromium available)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { ACHIEVEMENTS } from '../js/data.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http
  .createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/blank') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><title>art</title>');
    }
    const file = path.join(root, url === '/' ? 'index.html' : decodeURIComponent(url));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(0);
const base = `http://localhost:${server.address().port}`;
const write = (rel, buf) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log('wrote', rel);
};

// App Store icons must not have an alpha channel, and canvas PNGs always do, so encode plain RGB here.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let c = 0xffffffff;
  for (const b of body) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}
function pngRGB(size, rgba) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0, o = 0, i = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++, i += 4) {
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const browser = await chromium.launch();

// ---------- Icons, launch screen and achievement art ----------

const art = await browser.newPage();
await art.goto(`${base}/blank`);

/** Draw the cluster on a glowing square. Returns raw RGBA (format 'raw') or a JPEG, base64 encoded. */
const render = (opts) =>
  art.evaluate(async ({ size, scale, skin, hue, hue2 = hue + 70, top, bottom, gens, format }) => {
    const { Scene, composeCluster } = await import('/js/scene.js');
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const ctx = out.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, size);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.55 * Math.max(scale, 0.5));
    glow.addColorStop(0, `hsla(${hue}, 95%, 72%, 0.55)`);
    glow.addColorStop(0.5, `hsla(${hue2}, 90%, 65%, 0.2)`);
    glow.addColorStop(1, `hsla(${hue2}, 90%, 60%, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    const scene = new Scene(document.createElement('canvas'));
    scene.dpr = 1;
    scene.crystals = composeCluster(gens, { skin });
    if (skin === 'mono') for (const c of scene.crystals) Object.assign(c, { hue: hue + ((c.hue % 30) - 15), sat: 85 });
    let up = 0;
    for (const c of scene.crystals) up = Math.max(up, Math.cos(c.angle) * c.len);
    scene.up = up;
    const R = (size * scale) / 1.16;
    scene.R = R;
    scene.renderSprite();
    const oy = size / 2 + ((up - 0.34) / 2) * R;
    ctx.drawImage(scene.sprite, size / 2 - scene.spriteOx * R, oy - scene.spriteOy * R);
    if (format === 'jpeg') return out.toDataURL('image/jpeg', 0.9).split(',')[1];
    const bytes = ctx.getImageData(0, 0, size, size).data;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(bin);
  }, opts);

const ICON_GENS = { quartz: 15, amethyst: 15, geode: 5, loom: 5, aurora: 5 };
const b64 = (s) => Buffer.from(s, 'base64');
const ASSETS = 'ios/App/App/Assets.xcassets';
const iconSet = (file) => JSON.stringify({ images: [{ filename: file, idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2) + '\n';

write(`${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`, pngRGB(1024, b64(await render({ size: 1024, scale: 0.88, hue: 188, top: '#2a1a78', bottom: '#0b0820', gens: ICON_GENS, format: 'raw' }))));
write(`${ASSETS}/AppIcon-Patron.appiconset/AppIcon-Patron.png`, pngRGB(1024, b64(await render({ size: 1024, scale: 0.88, skin: 'gilded', hue: 40, hue2: 18, top: '#4a2c12', bottom: '#120a06', gens: ICON_GENS, format: 'raw' }))));
write(`${ASSETS}/AppIcon-Patron.appiconset/Contents.json`, iconSet('AppIcon-Patron.png'));
// The launch screen is centred and cropped to fill, so the cluster sits small in the middle.
const splash = pngRGB(1366, b64(await render({ size: 1366, scale: 0.2, hue: 200, top: '#120b33', bottom: '#07051a', gens: ICON_GENS, format: 'raw' })));
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) write(`${ASSETS}/Splash.imageset/${name}`, splash);

for (const a of ACHIEVEMENTS) {
  const jpeg = await render({ size: 512, scale: 0.8, skin: 'mono', hue: a.hue, top: `hsl(${a.hue + 60}, 55%, 22%)`, bottom: '#0b0820', gens: { quartz: 15, amethyst: 5, geode: 5 }, format: 'jpeg' });
  write(`store/game-center/achievement-${a.id}.jpg`, b64(jpeg));
}
await art.close();

// ---------- App Store screenshots ----------

const DAY = new Date();
const today = `${DAY.getFullYear()}-${String(DAY.getMonth() + 1).padStart(2, '0')}-${String(DAY.getDate()).padStart(2, '0')}`;
const SAVE = {
  v: 2, shards: 4.82e9, runShards: 9e9, totalShards: 6.4e11, allTimeShards: 6.4e11, taps: 8412, growthsBought: 700, playSeconds: 9000, firstShatterSeconds: 1500,
  gens: { moss: 110, quartz: 100, amethyst: 82, geode: 64, loom: 50, aurora: 37, star: 26, moon: 15, heart: 6, void: 1 },
  upgrades: { tap1: true, tap2: true, tap3: true, all1: true, all2: true, moss1: true, quartz1: true, res1: true },
  prisms: 46, prismsEarned: 800, prismsAllTime: 800, facets: { seed: 2, sustain: 2, sleep: 2, chime: 3 }, shatters: 6, glimmersCaught: 31,
  specimens: { rose: 3, citrine: 1, fluorite: 2, azurite: 1, selenite: 1, tiger: 1, moonstone: 1, bismuth: 1, opal: 1 },
  achievements: Object.fromEntries(['tap100', 'tap5k', 'kinds5', 'kinds10', 'own100', 'shards1m', 'glim1', 'shatter1', 'prism100', 'find1', 'geode1'].map((id) => [id, 1])),
  daily: { day: today, mod: 'bright', goal: 'glimmers', target: 4, progress: 4, claimed: false }, lastGeodeDay: '', streak: 0, bestStreak: 3, geodesCracked: 5,
  resonance: 0.7, glimmerIn: 999, settings: { sound: false, buyMode: 10, music: 'off' },
};
const SHOTS = [
  { name: '1-cluster', tap: 6 },
  { name: '2-grow', scroll: ['#gen-list', 250], tap: 3 },
  { name: '3-shatter', view: 'shatter' },
  { name: '4-trove', view: 'trove' },
  { name: '5-collection', view: 'trove', scroll: ['#view-trove .list', 330] },
  { name: '6-looks', look: { skin: 'aurora', backdrop: 'northern', tapFx: 'stars' }, tap: 8 },
];
const DEVICES = [
  { dir: 'iphone-6.9', width: 440, height: 956, scale: 3 }, // 1320 x 2868
  { dir: 'ipad-13', width: 1032, height: 1376, scale: 2 }, // 2064 x 2752
];
for (const d of DEVICES) {
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale, hasTouch: true });
    await page.addInitScript(
      ({ save, look }) => {
        save.lastSeen = Date.now();
        Object.assign(save.settings, look || {});
        localStorage.setItem('crystal-cluster-save-v1', JSON.stringify(save));
        // Screenshots may show pack looks; this only pretends they are owned for the picture.
        if (look) localStorage.setItem('crystal-cluster-entitlements-v1', JSON.stringify({ owned: ['pack.aurora'], tips: 0 }));
      },
      { save: SAVE, look: shot.look }
    );
    await page.goto(`${base}/${shot.look ? '?devstore' : ''}`);
    await page.addStyleTag({ content: '#toast { display: none !important; }' });
    await page.waitForTimeout(500);
    if (shot.view) await page.click(`[data-view=${shot.view}]`);
    if (shot.scroll) await page.evaluate(([sel, y]) => (document.querySelector(sel).scrollTop = y), shot.scroll);
    const box = await page.locator('#scene').boundingBox();
    for (let i = 0; i < (shot.tap || 0); i++) {
      await page.mouse.click(box.x + box.width * (0.4 + 0.04 * i), box.y + box.height * 0.55);
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(350);
    write(`store/screenshots/${d.dir}/${shot.name}.jpg`, await page.screenshot({ type: 'jpeg', quality: 92 }));
    await page.close();
  }
}

await browser.close();
server.close();
