// Copies the web game into www/, which is what Capacitor bundles into the iOS app.
// The web build itself needs no build step; this only gathers the files that ship.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
// The service worker is left out on purpose: the app's files are already on the device.
const SHIPPED = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const name of SHIPPED) fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
console.log(`Copied ${SHIPPED.join(', ')} to www/`);
