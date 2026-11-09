// Everything that changes how the game looks or sounds, and nothing that changes how it plays.
// Some of it is earned by playing; the rest comes in the cosmetic packs sold in the iOS app.
// No DOM access here, so it can be unit tested in Node.

/** In-App Purchase product ids are this prefix plus the short id below. */
export const PRODUCT_PREFIX = 'com.joogiebear.crystalcluster.';

/**
 * What is for sale. `price` is the price tier to choose in App Store Connect and is
 * never shown to players in the app: the App Store's own localized price is.
 * Tips are consumable, packs are non-consumable.
 */
export const PRODUCTS = [
  { id: 'tip.small', kind: 'tip', name: 'Small Tip', blurb: 'Thank you! Every bit helps keep the cavern lit.', price: '$0.99' },
  { id: 'tip.medium', kind: 'tip', name: 'Kind Tip', blurb: 'Thank you! That is a very kind thing to do.', price: '$2.99' },
  { id: 'tip.large', kind: 'tip', name: 'Generous Tip', blurb: 'Thank you! That is properly generous.', price: '$4.99' },
  { id: 'tip.huge', kind: 'tip', name: 'Enormous Tip', blurb: 'Thank you! You are keeping the whole cavern glowing.', price: '$9.99' },
  { id: 'pack.frost', kind: 'pack', name: 'Frostfall Pack', blurb: 'Frost crystals, the Glacier backdrop and Snowfall taps.', price: '$1.99' },
  { id: 'pack.obsidian', kind: 'pack', name: 'Obsidian Pack', blurb: 'Obsidian crystals, the Ember Hollow backdrop and Ember taps.', price: '$1.99' },
  { id: 'pack.aurora', kind: 'pack', name: 'Aurora Pack', blurb: 'Aurora crystals, the Northern Sky backdrop and Starburst taps.', price: '$1.99' },
  { id: 'pack.patron', kind: 'pack', name: 'Patron Pack', blurb: 'Gilded crystals, two extra soundscapes and a golden app icon.', price: '$4.99' },
];

export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const productId = (shortId) => PRODUCT_PREFIX + shortId;

const wrap = (h) => ((h % 360) + 360) % 360;
const found = (s) => Object.keys(s.specimens || {}).length;
const earned = (s) => Object.keys(s.achievements || {}).length;

/**
 * Crystal skins. `tint(crystal, index)` returns the colour to draw that crystal in.
 * An item is unlocked by owning `product`, or by `free(state)` being true, or always if it has neither.
 */
export const SKINS = [
  { id: 'classic', name: 'Classic', swatch: [188, 60, 74], tint: (c) => c },
  {
    id: 'moonlit', name: 'Moonlit', swatch: [228, 34, 80], how: 'Earn 8 achievements', free: (s) => earned(s) >= 8,
    tint: (c) => ({ hue: 222 + (wrap(c.hue) % 16), sat: 30, lig: 70 + (wrap(c.hue) % 14) }),
  },
  {
    id: 'curio', name: 'Curio', swatch: [320, 95, 66], how: 'Find 12 different rare crystals', free: (s) => found(s) >= 12,
    tint: (c, i) => ({ hue: wrap(c.hue + i * 47), sat: 96, lig: 64 }),
  },
  {
    id: 'frost', name: 'Frost', swatch: [198, 45, 86], product: 'pack.frost',
    tint: (c) => ({ hue: 192 + (wrap(c.hue) % 22), sat: 38, lig: Math.min(90, 76 + (wrap(c.hue) % 12)) }),
  },
  {
    id: 'obsidian', name: 'Obsidian', swatch: [268, 30, 26], product: 'pack.obsidian',
    tint: (c, i) => (i % 5 === 2 ? { hue: 14, sat: 95, lig: 52 } : { hue: 262 + (wrap(c.hue) % 18), sat: 22, lig: 22 + (wrap(c.hue) % 9) }),
  },
  {
    id: 'aurora', name: 'Aurora', swatch: [150, 90, 60], product: 'pack.aurora',
    tint: (c) => ({ hue: wrap(215 + (c.angle / 1.7) * 105), sat: 90, lig: 60 }),
  },
  {
    id: 'gilded', name: 'Gilded', swatch: [44, 90, 60], product: 'pack.patron',
    tint: (c) => ({ hue: 38 + (wrap(c.hue) % 12), sat: 88, lig: 54 + (wrap(c.hue) % 12) }),
  },
];

/** Cavern backdrops. The colours live in css/style.css under `body.bg-<id>`. */
export const BACKDROPS = [
  { id: 'cavern', name: 'Cavern', swatch: [258, 60, 30] },
  { id: 'deep', name: 'The Deep', swatch: [215, 70, 18], how: 'Descend once', free: (s) => (s.descents || 0) >= 1 },
  { id: 'glacier', name: 'Glacier', swatch: [200, 60, 38], product: 'pack.frost' },
  { id: 'ember', name: 'Ember Hollow', swatch: [14, 75, 28], product: 'pack.obsidian' },
  { id: 'northern', name: 'Northern Sky', swatch: [160, 70, 28], product: 'pack.aurora' },
];

/**
 * Tap effects: what flies off the cluster when it is tapped.
 * shape: 'shard' | 'dot' | 'star'. gravity is in px/s² (negative floats up).
 * hue/lig override the tapped crystal's own colour when present.
 */
export const TAP_FX = [
  { id: 'shards', name: 'Shards', swatch: [190, 80, 70], shape: 'shard', gravity: 520, speed: 1 },
  { id: 'motes', name: 'Glow Motes', swatch: [150, 80, 62], how: 'Crack 3 Daily Geodes', free: (s) => (s.geodesCracked || 0) >= 3, shape: 'dot', gravity: -60, speed: 0.55, life: 1.5, hue: 150, hueSpread: 50, lig: 66, glow: true },
  { id: 'snow', name: 'Snowfall', swatch: [205, 40, 92], product: 'pack.frost', shape: 'dot', gravity: 150, speed: 0.6, life: 1.7, hue: 205, hueSpread: 10, lig: 92 },
  { id: 'embers', name: 'Embers', swatch: [22, 100, 58], product: 'pack.obsidian', shape: 'dot', gravity: -220, speed: 0.6, life: 1.4, hue: 24, hueSpread: 26, lig: 60, glow: true },
  { id: 'stars', name: 'Starburst', swatch: [50, 100, 72], product: 'pack.aurora', shape: 'star', gravity: 240, speed: 0.9, life: 1.2, hue: 150, hueSpread: 160, lig: 72 },
];

/** Ambient soundscapes. The synthesis settings live in js/audio.js. */
export const MUSIC = [
  { id: 'off', name: 'Off' },
  { id: 'cavern', name: 'Cavern' },
  { id: 'tide', name: 'Undertide', product: 'pack.patron' },
  { id: 'starfield', name: 'Starfield', product: 'pack.patron' },
];

/** App icons (iOS app only). `asset` is the alternate icon set in the Xcode asset catalog; null is the default. */
export const ICONS = [
  { id: 'default', name: 'Crystal', swatch: [258, 70, 40], asset: null },
  { id: 'patron', name: 'Golden', swatch: [44, 90, 60], asset: 'AppIcon-Patron', product: 'pack.patron' },
];

export const COSMETICS = { skin: SKINS, backdrop: BACKDROPS, tapFx: TAP_FX, music: MUSIC, icon: ICONS };

/** @param {{has: (id: string) => boolean}} store */
export function isUnlocked(item, state, store) {
  if (item.product) return !!store && store.has(item.product);
  if (item.free) return !!item.free(state);
  return true;
}

/** The chosen item of a kind, falling back to the default when the choice is unknown or locked. */
export function chosen(kind, state, store) {
  const list = COSMETICS[kind];
  const item = list.find((x) => x.id === state.settings[kind]);
  return item && isUnlocked(item, state, store) ? item : list[0];
}

/** Where a locked item comes from, for the UI. */
export function unlockHint(item) {
  if (item.product) return `Part of the ${PRODUCT_BY_ID[item.product].name}`;
  return item.how || '';
}
