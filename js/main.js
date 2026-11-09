// Crystal Cluster entry point: wires the game logic, canvas scene, UI and audio together.

import * as G from './game.js';
import { GEN_BY_ID, UPGRADE_BY_ID, FACET_BY_ID } from './data.js';
import { fmt, fmtTime } from './format.js';
import { Scene } from './scene.js';
import { Sound } from './audio.js';
import { UI, el } from './ui.js';

const SAVE_KEY = 'crystal-cluster-save-v1';
const AUTOSAVE_MS = 10000;
const AWAY_THRESHOLD_S = 60;

// ---------- State ----------

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return G.deserialize(raw);
  } catch (err) {
    console.warn('Could not load save, starting fresh.', err);
  }
  return G.newState();
}

const game = { state: load() };

function save() {
  try {
    game.state.lastSeen = Date.now();
    localStorage.setItem(SAVE_KEY, G.serialize(game.state));
  } catch {
    // Storage can be unavailable (private mode, full disk). The game still plays.
  }
}

// ---------- Systems ----------

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const hudEl = document.getElementById('hud');
const scene = new Scene(canvas);
const sound = new Sound();
sound.enabled = game.state.settings.sound;

const ui = new UI(game, {
  buyGenerator(id) {
    const n = G.buyGenerator(game.state, id, game.state.settings.buyMode);
    if (!n) {
      sound.deny();
      return false;
    }
    sound.buy();
    scene.setGrowths(game.state.gens);
    const have = G.owned(game.state, id);
    const before = G.nextMilestone(have - n);
    if (before.next && have >= before.next) ui.toast(`${GEN_BY_ID[id].name} ×2: you own ${before.next}!`);
    ui.refresh();
    return true;
  },
  buyUpgrade(id) {
    if (!G.buyUpgrade(game.state, id)) {
      sound.deny();
      return;
    }
    sound.upgrade();
    ui.toast(`Carved: ${UPGRADE_BY_ID[id].name}`);
    ui.refresh();
  },
  buyFacet(id) {
    if (!G.buyFacet(game.state, id)) {
      sound.deny();
      return;
    }
    sound.upgrade();
    ui.toast(`${FACET_BY_ID[id].name} improved`);
    ui.refresh();
    save();
  },
  shatter() {
    const gain = G.prismGain(game.state);
    if (gain < 1) return;
    ui.modal({
      title: 'Shatter the cluster?',
      body: [
        el('span', 'hero', `+${fmt(gain)} Prism${gain === 1 ? '' : 's'}`),
        'Your shards, growths and carvings will be gone. Prisms and Facets stay with you forever.',
      ],
      actions: [
        { label: 'Not yet' },
        {
          label: 'Shatter',
          kind: 'primary',
          onClick() {
            const got = G.shatter(game.state);
            sound.unlock();
            sound.shatter();
            scene.setGrowths(game.state.gens);
            scene.burst(`+${fmt(got)} Prisms`, 300);
            ui.invalidate();
            save();
          },
        },
      ],
    });
  },
  setSound(on) {
    game.state.settings.sound = on;
    sound.setEnabled(on);
    if (on) {
      sound.unlock();
      sound.buy();
    }
    save();
  },
  exportSave() {
    save();
    const code = btoa(G.serialize(game.state));
    const area = el('textarea');
    area.value = code;
    area.readOnly = true;
    ui.modal({
      title: 'Export save',
      body: ['Copy this code and keep it somewhere safe. Use Import to restore it on any device.', area],
      actions: [
        { label: 'Close' },
        {
          label: 'Copy',
          kind: 'primary',
          onClick() {
            area.select();
            const done = () => ui.toast('Save code copied');
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done, () => document.execCommand('copy') && done());
            else if (document.execCommand('copy')) done();
            return false;
          },
        },
      ],
    });
  },
  importSave() {
    const area = el('textarea');
    area.placeholder = 'Paste a save code here';
    ui.modal({
      title: 'Import save',
      body: ['This replaces your current cluster with the one in the code.', area],
      actions: [
        { label: 'Cancel' },
        {
          label: 'Load',
          kind: 'primary',
          onClick() {
            try {
              const next = G.deserialize(atob(area.value.trim()));
              next.lastSeen = Date.now();
              replaceState(next);
              ui.toast('Save loaded');
            } catch {
              ui.toast('That code does not look right');
              return false;
            }
          },
        },
      ],
    });
  },
  reset() {
    ui.modal({
      title: 'Reset everything?',
      body: ['This wipes all progress on this device, including Prisms and Facets. It cannot be undone.'],
      actions: [
        { label: 'Keep playing', kind: 'primary' },
        {
          label: 'Reset',
          kind: 'danger',
          onClick() {
            const sound_ = game.state.settings.sound;
            const fresh = G.newState();
            fresh.settings.sound = sound_;
            replaceState(fresh);
          },
        },
      ],
    });
  },
});

function replaceState(next) {
  game.state = next;
  sound.setEnabled(next.settings.sound);
  scene.signature = '';
  scene.setGrowths(next.gens);
  ui.invalidate();
  save();
}

// ---------- Away progress ----------

function welcomeBack() {
  const report = G.applyOffline(game.state);
  if (!report || report.elapsed < AWAY_THRESHOLD_S || report.gain < 1) return;
  const pct = Math.round(report.efficiency * 100);
  ui.modal({
    title: 'Welcome back',
    body: [
      `While you were away for ${fmtTime(report.elapsed)}, your cluster kept growing.`,
      el('span', 'hero', `+${fmt(report.gain)}`),
      report.capped
        ? `Away growth is ${pct}% speed for up to ${fmtTime(report.counted)}. The Deep Slumber facet extends it.`
        : `Away growth runs at ${pct}% speed.`,
    ],
    actions: [{ label: 'Collect', kind: 'primary' }],
  });
}

// ---------- Input ----------

function stagePoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function doTap(x, y) {
  if (scene.hitGlimmer(x, y)) {
    const reward = G.catchGlimmer(game.state);
    sound.glimmer();
    scene.burst(reward.type === 'rain' ? `+${fmt(reward.gain)}` : reward.title.split(':')[0], 46);
    ui.toast(reward.type === 'rain' ? `Shard Rain: +${fmt(reward.gain)} shards` : `${reward.title} for ${reward.seconds}s`);
    ui.refresh();
    return;
  }
  const gain = G.tap(game.state);
  sound.tap(game.state.resonance);
  scene.tapFx(x, y, `+${fmt(gain, true)}`, game.state.buffs.edge > 0);
}

stage.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  sound.unlock();
  const p = stagePoint(e);
  doTap(p.x, p.y);
});

window.addEventListener('keydown', (e) => {
  if (ui.modalOpen || e.repeat) return;
  if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    sound.unlock();
    doTap(scene.cx + (Math.random() - 0.5) * scene.R * 0.6, scene.cy - scene.R * (0.2 + Math.random() * 0.4));
  }
});

// Keep the page from zooming or bouncing like a document.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});
document.addEventListener('pointerdown', () => sound.unlock(), { passive: true });

// ---------- Layout ----------

function resize() {
  const stageTop = stage.getBoundingClientRect().top;
  const inset = hudEl.getBoundingClientRect().bottom - stageTop + 6;
  scene.resize(Math.max(70, inset));
}
new ResizeObserver(resize).observe(stage);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

// ---------- Main loop ----------

let last = performance.now();
let uiClock = 0;
let saveClock = 0;

function frame(now) {
  const dt = Math.min(1, Math.max(0, (now - last) / 1000));
  last = now;
  const state = game.state;

  G.tick(state, dt);
  if (state.glimmerIn <= 0 && !scene.glimmer) {
    scene.spawnGlimmer();
    state.glimmerIn = G.nextGlimmerDelay(state);
  }

  const d = G.derive(state);
  ui.hud(state, d);
  scene.frame(dt, { resonance: state.resonance, radiance: state.buffs.radiance > 0 });

  uiClock += dt;
  if (uiClock >= 0.2) {
    uiClock = 0;
    ui.refresh();
  }
  saveClock += dt * 1000;
  if (saveClock >= AUTOSAVE_MS) {
    saveClock = 0;
    save();
  }
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
  } else {
    welcomeBack();
    last = performance.now();
    ui.refresh();
  }
});
window.addEventListener('pagehide', save);

// ---------- Boot ----------

scene.setGrowths(game.state.gens);
resize();
welcomeBack();
ui.refresh();
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

// Offer the home screen tip on iOS Safari when not already installed.
if (navigator.standalone === false) document.getElementById('install-card').hidden = false;

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Handy for debugging from the console.
window.crystalCluster = game;
