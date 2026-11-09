// The tip jar and cosmetic packs. In the iOS app this talks to the App Store through
// js/native.js, and the App Store is the source of truth for what is owned. On the web
// there is no shop: packs show as "in the iOS app" and nothing here can be bought.
//
// For trying the shop screens in a browser, open http://localhost:8080/?devstore
// (localhost only). Purchases there are pretend and cost nothing.

import { PRODUCTS, PRODUCT_BY_ID, PRODUCT_PREFIX, productId } from './cosmetics.js';
import { iap, cloud, isNative } from './native.js';

const KEY = 'crystal-cluster-entitlements-v1';
const TIPS_CLOUD_KEY = 'tips';

const DEV =
  !isNative &&
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
  new URLSearchParams(location.search).has('devstore');

const shortId = (fullId) => (fullId.startsWith(PRODUCT_PREFIX) ? fullId.slice(PRODUCT_PREFIX.length) : fullId);

export class Store {
  constructor() {
    /** Whether anything can be bought here. */
    this.available = isNative || DEV;
    this.dev = DEV;
    this.owned = new Set(); // short ids of owned packs
    this.tips = 0; // how many tips have ever been left
    this.prices = {}; // short id -> localized price from the App Store
    this.ready = false; // prices have loaded
    this.listeners = [];
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      // The cache lets owned looks show straight away at launch; init() then asks the App Store.
      if (this.available && Array.isArray(saved.owned)) for (const id of saved.owned) if (PRODUCT_BY_ID[id]) this.owned.add(id);
      if (this.available && saved.tips > 0) this.tips = Math.floor(saved.tips);
    } catch {
      // No cache; init() fills everything in.
    }
  }

  has(id) {
    return this.owned.has(id);
  }

  get supporter() {
    return this.tips > 0 || this.owned.size > 0;
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  changed() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ owned: [...this.owned], tips: this.tips }));
    } catch {
      // Storage unavailable; the App Store still remembers packs.
    }
    for (const fn of this.listeners) fn();
  }

  setOwned(fullIds) {
    this.owned = new Set(fullIds.map(shortId).filter((id) => PRODUCT_BY_ID[id]?.kind === 'pack'));
    this.changed();
  }

  async init() {
    if (DEV) {
      for (const p of PRODUCTS) this.prices[p.id] = p.price;
      this.ready = true;
      this.changed();
      return;
    }
    if (!isNative) return;
    iap.onUpdate((e) => this.onNativeUpdate(e));
    cloud.onChange((keys) => {
      if (keys.includes(TIPS_CLOUD_KEY)) this.syncTips();
    });
    try {
      this.setOwned(await iap.entitlements());
    } catch (err) {
      console.warn('Could not read purchases', err);
    }
    await this.syncTips();
    await this.loadPrices();
  }

  async loadPrices() {
    try {
      const products = await iap.products(PRODUCTS.map((p) => productId(p.id)));
      for (const p of products) this.prices[shortId(p.id)] = p.price;
      this.ready = products.length > 0;
    } catch (err) {
      console.warn('Could not load the shop', err);
    }
    this.changed();
  }

  /** Tips are consumables, which the App Store does not restore, so the count rides along in iCloud. */
  async syncTips() {
    const remote = Math.floor(Number(await cloud.get(TIPS_CLOUD_KEY)) || 0);
    if (remote > this.tips) {
      this.tips = remote;
      this.changed();
    } else if (this.tips > remote) {
      cloud.set(TIPS_CLOUD_KEY, String(this.tips));
    }
  }

  grant(id) {
    const product = PRODUCT_BY_ID[id];
    if (!product) return;
    if (product.kind === 'tip') {
      this.tips++;
      cloud.set(TIPS_CLOUD_KEY, String(this.tips));
    } else {
      this.owned.add(id);
    }
    this.changed();
  }

  async onNativeUpdate(e) {
    const id = shortId(e?.id || '');
    const product = PRODUCT_BY_ID[id];
    if (!product) return;
    if (product.kind === 'tip') {
      if (!e.revoked) this.grant(id);
      return;
    }
    try {
      this.setOwned(await iap.entitlements());
    } catch (err) {
      console.warn('Could not refresh purchases', err);
    }
  }

  /**
   * @param {string} id short product id
   * @returns {Promise<'purchased'|'cancelled'|'pending'>} Rejects with a readable message if the purchase fails.
   */
  async buy(id) {
    if (!this.available || !PRODUCT_BY_ID[id]) return 'cancelled';
    if (DEV) {
      this.grant(id);
      return 'purchased';
    }
    const result = await iap.purchase(productId(id));
    if (result.status === 'purchased') this.grant(id);
    return result.status;
  }

  /** "Restore Purchases". Resolves with how many packs are owned afterwards. */
  async restore() {
    if (DEV) return this.owned.size;
    if (!isNative) return 0;
    this.setOwned(await iap.restore());
    await this.syncTips();
    return this.owned.size;
  }
}
