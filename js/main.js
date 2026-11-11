// Crystal Cluster entry point: wires the game logic, canvas scene, UI and audio together.

import * as G from './game.js';
import { GEN_BY_ID, UPGRADE_BY_ID, FACET_BY_ID, VEIN_BY_ID, LEADERBOARDS } from './data.js';
import { fmt, fmtTime } from './format.js';
import { Scene } from './scene.js';
import { Sound } from './audio.js';
import { UI, el } from './ui.js';
import { Store } from './store.js';
import { BACKDROPS, PRODUCT_BY_ID, chosen, unlockHint } from './cosmetics.js';
import { isNative, haptics, gameCenter, cloud, notifications, appIcon } from './native.js';

const SAVE_KEY = 'crystal-cluster-save-v1';
const DEVICE_KEY = 'crystal-cluster-device-v1';
const CLOUD_DECLINED_KEY = 'crystal-cluster-cloud-declined-v1';
const CLOUD_SAVE_KEY = 'save';
const AUTOSAVE_MS = 10000;
const CLOUD_PUSH_S = 180;
const AWAY_THRESHOLD_S = 60;
const FULL_NOTICE_ID = 1;

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
haptics.enabled = game.state.settings.haptics;
const store = new Store();

const ui = new UI(game, {
  buyGenerator(id) {
    const n = G.buyGenerator(game.state, id, game.state.settings.buyMode);
    if (!n) {
      sound.deny();
      return false;
    }
    sound.buy();
    haptics.impact('LIGHT');
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
    haptics.impact('MEDIUM');
    ui.toast(`Carved: ${UPGRADE_BY_ID[id].name}`);
    ui.refresh();
  },
  buyFacet(id) {
    if (!G.buyFacet(game.state, id)) {
      sound.deny();
      return;
    }
    sound.upgrade();
    haptics.impact('MEDIUM');
    ui.toast(`${FACET_BY_ID[id].name} improved`);
    ui.refresh();
    save();
  },
  buyVein(id) {
    if (!G.buyVein(game.state, id)) {
      sound.deny();
      return;
    }
    sound.upgrade();
    haptics.impact('MEDIUM');
    ui.toast(`${VEIN_BY_ID[id].name} improved`);
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
            haptics.impact('HEAVY');
            scene.setGrowths(game.state.gens);
            scene.burst(`+${fmt(got)} Prisms`, 300);
            ui.invalidate();
            checkProgress();
            save();
            submitScores();
            cloudPush();
          },
        },
      ],
    });
  },
  descend() {
    const gain = G.heartGain(game.state);
    if (gain < 1) return;
    ui.modal({
      title: 'Descend to a deeper cavern?',
      body: [
        el('span', 'hero', `+${fmt(gain)} Heartstone${gain === 1 ? '' : 's'}`),
        'Your shards, growths, carvings, Prisms and Facets will be gone. Heartstones, Veins, your collection and your achievements stay with you forever.',
      ],
      actions: [
        { label: 'Not yet' },
        {
          label: 'Descend',
          kind: 'primary',
          onClick() {
            const got = G.descend(game.state);
            sound.unlock();
            sound.shatter();
            haptics.impact('HEAVY');
            scene.setGrowths(game.state.gens);
            scene.burst(`+${fmt(got)} Heartstones`, 350);
            ui.invalidate();
            checkProgress();
            applyLook();
            save();
            cloudPush();
          },
        },
      ],
    });
  },
  crackGeode() {
    const prize = G.crackGeode(game.state);
    if (!prize) return;
    sound.unlock();
    sound.shatter();
    haptics.notify('SUCCESS');
    scene.burst(`+${fmt(prize.shards)}`, 30);
    const { def, isNew } = prize.find;
    ui.modal({
      title: 'Geode cracked!',
      body: [
        el('span', 'hero', `+${fmt(prize.shards)}`),
        `Inside you also found ${isNew ? 'a new rare crystal' : 'another'}: ${def.name}.`,
        prize.streak > 1 ? `That is ${prize.streak} days in a row, so the shards were worth ×${prize.streakMult.toFixed(1)}.` : 'Come back tomorrow to start a streak.',
      ],
      actions: [{ label: 'Lovely', kind: 'primary' }],
    });
    ui.invalidate();
    checkProgress();
    save();
    submitScores();
    cloudPush();
  },
  setFps(fps) {
    game.state.settings.fps = fps;
    haptics.impact('LIGHT');
    ui.syncSettings();
    save();
  },
  setHaptics(on) {
    game.state.settings.haptics = on;
    haptics.enabled = on;
    haptics.impact('MEDIUM');
    save();
  },
  async setNotify(on) {
    if (on && !(await notifications.request())) {
      on = false;
      ui.toast('Notifications are off for Crystal Cluster. You can allow them in the Settings app.', 4200);
    }
    game.state.settings.notify = on;
    ui.syncSettings();
    save();
  },
  setSupporterCrystal(on) {
    game.state.settings.supporterCrystal = on;
    applyLook();
    save();
  },
  setLook(kind, id) {
    game.state.settings[kind] = id;
    haptics.impact('LIGHT');
    sound.unlock();
    applyLook();
    ui.refresh();
    save();
  },
  lockedLook(item) {
    const product = item.product && PRODUCT_BY_ID[item.product];
    const price = product && store.prices[product.id];
    if (product && store.available && price) {
      ui.modal({
        title: product.name,
        body: [`${item.name} is part of the ${product.name}.`, product.blurb, 'It only changes how the game looks and sounds.'],
        actions: [{ label: 'Not now' }, { label: `Buy for ${price}`, kind: 'primary', onClick: () => void buy(product.id) }],
      });
      return;
    }
    ui.modal({
      title: item.name,
      body: [product ? `${unlockHint(item)}, which is sold in the iOS app.` : `${unlockHint(item)} to unlock this.`],
      actions: [{ label: 'Close', kind: 'primary' }],
    });
  },
  buy: (id) => void buy(id),
  async restore() {
    try {
      const n = await store.restore();
      ui.toast(n > 0 ? `Restored ${n} pack${n === 1 ? '' : 's'}` : 'No earlier purchases were found for this Apple Account', 3600);
    } catch (err) {
      ui.toast(errorText(err, 'Could not reach the App Store'), 3600);
    }
  },
  async gameCenter(view) {
    if (!(await gameCenter.show(view))) ui.toast('Sign in to Game Center in the Settings app to use this', 3600);
    else syncGameCenter();
  },
  checkCloud: () => void cloudCheck(true),
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
            const fresh = G.newState();
            // Preferences are not progress, so they survive a reset.
            fresh.settings = { ...game.state.settings, buyMode: 1 };
            replaceState(fresh);
          },
        },
      ],
    });
  },
}, {
  store,
  haptics: haptics.supported,
  notifications: notifications.available,
  gameCenter: gameCenter.available,
  cloud: cloud.available,
  appIcon: appIcon.available,
});

function replaceState(next) {
  game.state = next;
  sound.setEnabled(next.settings.sound);
  haptics.enabled = next.settings.haptics;
  scene.signature = '';
  scene.setGrowths(next.gens);
  G.rollDaily(next);
  G.checkAchievements(next);
  applyLook();
  ui.invalidate();
  save();
}

const errorText = (err, fallback) => (err && typeof err.message === 'string' && err.message) || fallback;

// ---------- Looks ----------

let iconAsset;

/** Apply the chosen skin, backdrop, tap effect, soundscape and app icon. Locked choices fall back to the defaults. */
function applyLook() {
  const s = game.state;
  scene.setLook({
    skin: chosen('skin', s, store).id,
    tapFx: chosen('tapFx', s, store).id,
    supporter: store.supporter && s.settings.supporterCrystal,
  });
  const backdrop = chosen('backdrop', s, store).id;
  for (const b of BACKDROPS) document.body.classList.toggle(`bg-${b.id}`, b.id === backdrop);
  sound.setMusic(chosen('music', s, store).id);
  const asset = chosen('icon', s, store).asset;
  if (appIcon.available && asset !== iconAsset) {
    // Skip the very first call when the default is wanted: iOS shows an alert on every real change.
    if (iconAsset !== undefined || asset) appIcon.set(asset);
    iconAsset = asset;
  }
}

// ---------- Shop ----------

async function buy(id) {
  const product = PRODUCT_BY_ID[id];
  if (!product || !store.available) return;
  try {
    const status = await store.buy(id);
    if (status === 'purchased') {
      sound.unlock();
      sound.glimmer();
      haptics.notify('SUCCESS');
      scene.burst('Thank you!', 338);
      ui.modal({
        title: 'Thank you!',
        body: [
          product.kind === 'tip' ? product.blurb : `The ${product.name} is yours. Its looks are under Look and sound.`,
          'A rose-gold supporter crystal has joined your cluster.',
        ],
        actions: [{ label: 'Close', kind: 'primary' }],
      });
    } else if (status === 'pending') {
      ui.toast('Waiting for approval. It will unlock as soon as it goes through.', 4200);
    }
  } catch (err) {
    ui.toast(errorText(err, 'The purchase did not go through'), 4200);
  }
}

store.onChange(() => {
  applyLook();
  ui.refresh();
});

// ---------- Achievements, finds and Game Center ----------

function submitScores() {
  for (const board of LEADERBOARDS) {
    const score = board.score(game.state);
    if (score != null) gameCenter.submitScore(board.id, score);
  }
}

/** Send everything earned so far. Game Center ignores repeats, so this is safe to call often. */
function syncGameCenter() {
  if (!gameCenter.signedIn) return;
  gameCenter.reportAchievements(Object.keys(game.state.achievements));
  submitScores();
}

/** Award new achievements and roll the Daily Geode over at midnight. */
function checkProgress(quiet = false) {
  const state = game.state;
  if (G.rollDaily(state) && !quiet && state.taps > 0) ui.toast(`Today: ${G.dailyMod(state).name}. A new Geode is waiting in your Trove.`, 3600);
  const earned = G.checkAchievements(state);
  if (!earned.length) return;
  gameCenter.reportAchievements(earned.map((a) => a.id));
  applyLook(); // some looks unlock with achievements
  if (quiet) return;
  sound.upgrade();
  haptics.notify('SUCCESS');
  ui.toast(earned.length === 1 ? `Achievement: ${earned[0].name}` : `${earned.length} achievements earned`, 3200);
}

function announceFind(find) {
  if (!find) return;
  sound.glimmer();
  haptics.notify('SUCCESS');
  scene.burst(find.def.name, find.def.hue);
  ui.toast(find.isNew ? `New rare crystal: ${find.def.name}! It is in your Trove.` : `Found another ${find.def.name}`, 3600);
  checkProgress();
  ui.refresh();
}

// ---------- iCloud ----------

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}
const device = deviceId();

async function readCloud() {
  const raw = await cloud.get(CLOUD_SAVE_KEY);
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw);
    return { device: envelope.device, at: envelope.at, state: G.deserialize(envelope.save) };
  } catch {
    return null;
  }
}

/** Copy this device's save to iCloud, unless another device there is further along. */
async function cloudPush() {
  if (!cloud.available) return;
  const remote = await readCloud();
  if (remote && remote.device !== device && G.compareProgress(remote.state, game.state) > 0) return;
  await cloud.set(CLOUD_SAVE_KEY, JSON.stringify({ device, at: Date.now(), save: G.serialize(game.state) }));
}

/** Offer the iCloud save if it is further along than this device. Never replaces anything without asking. */
async function cloudCheck(manual = false) {
  if (!cloud.available) return;
  const remote = await readCloud();
  if (!remote) {
    if (manual) ui.toast('There is no iCloud save yet. This device will make one shortly.', 3600);
    return;
  }
  if (G.compareProgress(remote.state, game.state) <= 0) {
    if (manual) ui.toast('This device already has your furthest progress');
    return;
  }
  if (!manual) {
    if (remote.device === device || ui.modalOpen) return;
    try {
      if (localStorage.getItem(CLOUD_DECLINED_KEY) === remote.device) return;
    } catch {
      // Ask anyway.
    }
  }
  const r = remote.state;
  ui.modal({
    title: 'Use your iCloud save?',
    body: [
      'A cluster that is further along was found in iCloud, from another device or an earlier install.',
      el('span', 'tag', `${r.descents > 0 ? `Depth ${fmt(r.descents)} · ` : ''}${fmt(r.prismsAllTime)} Prisms · ${fmt(r.allTimeShards)} shards earned`),
      'Using it replaces the cluster on this device.',
    ],
    actions: [
      {
        label: 'Keep this one',
        onClick() {
          try {
            localStorage.setItem(CLOUD_DECLINED_KEY, remote.device);
          } catch {
            // Fine; it will just ask again next time.
          }
        },
      },
      {
        label: 'Use iCloud save',
        kind: 'primary',
        onClick() {
          r.lastSeen = Date.now();
          r.settings = { ...game.state.settings };
          replaceState(r);
          ui.toast('iCloud save loaded');
        },
      },
    ],
  });
}

// ---------- "Your cluster is full" notification ----------

function scheduleFullNotice() {
  const state = game.state;
  if (!notifications.available || !state.settings.notify) return;
  if (G.derive(state).steady <= 0) return;
  const { capSeconds } = G.offlineLimits(state);
  notifications.schedule({
    id: FULL_NOTICE_ID,
    title: 'Your cluster is full',
    body: 'It has grown as much as it can while you were away. Come and collect your shards.',
    at: new Date(Date.now() + capSeconds * 1000),
  });
}

// ---------- Away progress ----------

function welcomeBack() {
  notifications.cancel(FULL_NOTICE_ID);
  const state = game.state;
  const report = G.applyOffline(state);
  const newDay = G.rollDaily(state);
  checkProgress(true);
  if (!report || report.elapsed < AWAY_THRESHOLD_S || report.gain < 1) {
    if (newDay && state.taps > 0) ui.toast(`Today: ${G.dailyMod(state).name}. A new Geode is waiting in your Trove.`, 3600);
    return;
  }
  const pct = Math.round(report.efficiency * 100);
  const body = [
    `While you were away for ${fmtTime(report.elapsed)}, your cluster kept growing.`,
    el('span', 'hero', `+${fmt(report.gain)}`),
    report.capped
      ? `It filled up after ${fmtTime(report.counted)} at ${pct}% speed. The Deep Slumber facet lets it grow for longer.`
      : `Away growth runs at ${pct}% speed for up to ${fmtTime(G.offlineLimits(state).capSeconds)}.`,
  ];
  if (report.capped && notifications.available && !state.settings.notify) {
    body.push('Want a nudge next time? Turn on "Tell me when the cluster is full" under More.');
  }
  if (newDay) {
    const mod = G.dailyMod(state);
    body.push(el('span', 'tag', `Today: ${mod.name}`), `${mod.desc}. A new Geode is waiting in your Trove.`);
  }
  haptics.notify('SUCCESS');
  ui.modal({ title: 'Welcome back', body, actions: [{ label: 'Collect', kind: 'primary' }] });
}

// ---------- Input ----------

function stagePoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function doTap(x, y) {
  if (scene.hitGlimmer(x, y)) {
    lastActive = performance.now();
    const reward = G.catchGlimmer(game.state);
    sound.glimmer();
    haptics.notify('SUCCESS');
    scene.burst(reward.type === 'rain' ? `+${fmt(reward.gain)}` : reward.title.split(':')[0], 46);
    ui.toast(reward.type === 'rain' ? `Shard Rain: +${fmt(reward.gain)} shards` : `${reward.title} for ${reward.seconds}s`);
    announceFind(G.tryFind(game.state, 'glimmer'));
    ui.refresh();
    return;
  }
  lastActive = performance.now();
  const gain = G.tap(game.state);
  sound.tap(game.state.resonance);
  haptics.tap(game.state.buffs.edge > 0);
  scene.tapFx(x, y, `+${fmt(gain, true)}`, game.state.buffs.edge > 0);
  announceFind(G.tryFind(game.state, 'tap'));
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
const layoutWatcher = new ResizeObserver(resize);
layoutWatcher.observe(stage);
layoutWatcher.observe(hudEl); // buff chips make the HUD taller
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

// ---------- Main loop ----------

const IDLE_AFTER_MS = 4000;
let lastActive = performance.now(); // the last tap on the stage

/**
 * Frames per second to draw at. Auto is 60 while the cluster is being tapped
 * or something is flying about, and 30 once it is resting.
 */
function targetFps(now) {
  const { fps } = game.state.settings;
  if (fps !== 'auto') return fps;
  return now - lastActive < IDLE_AFTER_MS || scene.busy ? 60 : 30;
}

let last = performance.now();
let uiClock = 0;
let saveClock = 0;
let slowClock = 0;
let cloudClock = 0;

function frame(now) {
  requestAnimationFrame(frame);
  // Skip display refreshes that come sooner than the chosen frame rate (2ms of slack for timer jitter).
  if (now - last < 1000 / targetFps(now) - 2) return;
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
  slowClock += dt;
  if (slowClock >= 1) {
    slowClock = 0;
    checkProgress();
  }
  cloudClock += dt;
  if (cloudClock >= CLOUD_PUSH_S) {
    cloudClock = 0;
    cloudPush();
  }
  saveClock += dt * 1000;
  if (saveClock >= AUTOSAVE_MS) {
    saveClock = 0;
    save();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    scheduleFullNotice();
    cloudPush();
  } else {
    welcomeBack();
    last = performance.now();
    ui.refresh();
    cloudCheck();
  }
});
window.addEventListener('pagehide', save);

// ---------- Boot ----------

scene.setGrowths(game.state.gens);
applyLook();
resize();
welcomeBack();
ui.refresh();
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

// Native services. Each of these does nothing on the web.
store.init();
cloud.onChange((keys) => {
  if (keys.includes(CLOUD_SAVE_KEY)) cloudCheck();
});
cloudCheck();
gameCenter.onChange(syncGameCenter);
if (gameCenter.available) gameCenter.signIn().then(syncGameCenter);

// Offer the home screen tip on iOS Safari when not already installed.
if (!isNative && navigator.standalone === false) document.getElementById('install-card').hidden = false;

// The app carries its own files, so only the web build needs the offline cache.
if (!isNative && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Handy for debugging from the console.
window.crystalCluster = game;
game.store = store;
