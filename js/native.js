// The bridge to the iOS app. Inside the Capacitor shell these calls reach native code
// (haptics, Game Center, In-App Purchase, iCloud, notifications, app icons). On the web
// every one of them quietly does nothing, so the rest of the game never has to ask where it is running.
//
// Capacitor injects `window.Capacitor` and a proxy for each native plugin before the page's
// scripts run, so there is nothing to import or bundle here.

const cap = globalThis.Capacitor;

export const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

const plugin = (name) => (isNative && cap.Plugins && cap.Plugins[name]) || null;

/** Call a native method. Resolves with null on the web or if the plugin is missing; rejects if native code fails. */
async function call(name, method, args = {}) {
  const p = plugin(name);
  if (!p || typeof p[method] !== 'function') return null;
  return p[method](args);
}

/** Like `call`, but a native failure is logged and swallowed. For nice-to-haves such as haptics. */
async function quiet(name, method, args) {
  try {
    return await call(name, method, args);
  } catch (err) {
    console.warn(`${name}.${method} failed`, err);
    return null;
  }
}

function listen(name, event, handler) {
  const p = plugin(name);
  if (!p || typeof p.addListener !== 'function') return;
  try {
    p.addListener(event, handler);
  } catch (err) {
    console.warn(`Could not listen for ${name}.${event}`, err);
  }
}

// ---------- Haptics ----------

const canVibrate = typeof globalThis.navigator?.vibrate === 'function';
const VIBRATE = { LIGHT: 8, MEDIUM: 14, HEAVY: 24, SUCCESS: [12, 60, 18], WARNING: [18, 70, 18], ERROR: [24, 50, 24, 50, 24] };

function vibrate(pattern) {
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers refuse without a recent tap. Nothing to do.
  }
}

export const haptics = {
  enabled: true,
  /** The Taptic Engine in the app; the vibration motor on Android browsers; nothing in Safari. */
  supported: isNative || canVibrate,
  lastTap: 0,

  impact(style = 'LIGHT') {
    if (!this.enabled) return;
    if (isNative) quiet('Haptics', 'impact', { style });
    else if (canVibrate) vibrate(VIBRATE[style]);
  },

  /** For cluster taps, which can arrive many times a second. */
  tap(strong = false) {
    const now = Date.now();
    if (now - this.lastTap < 55) return;
    this.lastTap = now;
    this.impact(strong ? 'MEDIUM' : 'LIGHT');
  },

  /** type: 'SUCCESS' | 'WARNING' | 'ERROR' */
  notify(type = 'SUCCESS') {
    if (!this.enabled) return;
    if (isNative) quiet('Haptics', 'notification', { type });
    else if (canVibrate) vibrate(VIBRATE[type]);
  },
};

// ---------- Game Center ----------

export const ACHIEVEMENT_PREFIX = 'crystalcluster.achievement.';
export const LEADERBOARD_PREFIX = 'crystalcluster.leaderboard.';

export const gameCenter = {
  available: isNative,
  signedIn: false,

  /** Signs in (iOS shows its own sheet the first time). Resolves with whether the player is signed in. */
  async signIn() {
    const info = await quiet('CrystalNative', 'gcSignIn');
    this.signedIn = !!info?.signedIn;
    return this.signedIn;
  },

  /** @param {string[]} ids short achievement ids */
  async reportAchievements(ids) {
    if (!this.signedIn || !ids.length) return;
    await quiet('CrystalNative', 'gcReportAchievements', { ids: ids.map((id) => ACHIEVEMENT_PREFIX + id) });
  },

  async submitScore(id, score) {
    if (!this.signedIn || !(score > 0)) return;
    await quiet('CrystalNative', 'gcSubmitScore', { id: LEADERBOARD_PREFIX + id, score: Math.floor(score) });
  },

  /** view: 'dashboard' | 'achievements' | 'leaderboards'. Resolves with false if it could not be shown. */
  async show(view = 'dashboard') {
    if (!isNative) return false;
    if (!this.signedIn && !(await this.signIn())) return false;
    return (await quiet('CrystalNative', 'gcShow', { view })) !== null;
  },

  onChange(handler) {
    listen('CrystalNative', 'gameCenterChanged', (info) => {
      this.signedIn = !!info?.signedIn;
      handler(this.signedIn);
    });
  },
};

// ---------- In-App Purchase ----------

export const iap = {
  available: isNative,
  /** @returns {Promise<{id: string, title: string, description: string, price: string}[]>} */
  async products(ids) {
    return (await call('CrystalNative', 'iapProducts', { ids }))?.products || [];
  },
  /** @returns {Promise<{status: 'purchased'|'cancelled'|'pending', id: string}>} Rejects with a readable message on failure. */
  async purchase(id) {
    return (await call('CrystalNative', 'iapPurchase', { id })) || { status: 'cancelled', id };
  },
  /** @returns {Promise<string[]>} product ids of owned non-consumables */
  async entitlements() {
    return (await call('CrystalNative', 'iapEntitlements'))?.owned || [];
  },
  async restore() {
    return (await call('CrystalNative', 'iapRestore'))?.owned || [];
  },
  /** Purchases that complete later (Ask to Buy, another device) and refunds. */
  onUpdate(handler) {
    listen('CrystalNative', 'iapUpdated', handler);
  },
};

// ---------- iCloud key-value storage ----------

export const cloud = {
  available: isNative,
  async get(key) {
    const res = await quiet('CrystalNative', 'cloudGet', { key });
    return typeof res?.value === 'string' ? res.value : null;
  },
  async set(key, value) {
    await quiet('CrystalNative', 'cloudSet', { key, value });
  },
  /** Fires when another device changes something. */
  onChange(handler) {
    listen('CrystalNative', 'cloudChanged', (e) => handler(e?.keys || []));
  },
};

// ---------- Local notifications ----------

export const notifications = {
  available: isNative,
  /** Asks for permission if it has not been asked yet. Resolves with whether notifications are allowed. */
  async request() {
    let state = (await quiet('LocalNotifications', 'checkPermissions'))?.display;
    if (state && state !== 'granted' && state !== 'denied') {
      state = (await quiet('LocalNotifications', 'requestPermissions'))?.display;
    }
    return state === 'granted';
  },
  async schedule({ id, title, body, at }) {
    await quiet('LocalNotifications', 'schedule', { notifications: [{ id, title, body, schedule: { at } }] });
  },
  async cancel(id) {
    await quiet('LocalNotifications', 'cancel', { notifications: [{ id }] });
  },
};

// ---------- App icon ----------

export const appIcon = {
  available: isNative,
  /** @param {string|null} asset alternate icon set name, or null for the default icon */
  async set(asset) {
    await quiet('CrystalNative', 'setIcon', asset ? { name: asset } : {});
  },
};
