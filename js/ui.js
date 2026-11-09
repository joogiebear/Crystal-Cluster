// DOM side of the game: lists, tabs, HUD, toasts and modals.

import {
  GENERATORS,
  FACETS,
  UPGRADES,
  VEINS,
  SPECIMENS,
  SPECIMEN_BY_ID,
  RARITIES,
  ACHIEVEMENTS,
  DAILY_MOD_BY_ID,
  DAILY_GOAL_BY_ID,
} from './data.js';
import * as G from './game.js';
import { fmt, fmtTime } from './format.js';
import { COSMETICS, PRODUCTS, isUnlocked, chosen } from './cosmetics.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/** A little crystal icon in the given colour. */
function gemIcon(hue, sat, extraClass) {
  const gem = el('span', extraClass ? `gem ${extraClass}` : 'gem');
  gem.style.setProperty('--h', hue);
  gem.style.setProperty('--s', sat + '%');
  return gem;
}

const pct = (mult) => `+${fmt(Math.round((mult - 1) * 100))}%`;

function secondsToMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return (next - now) / 1000;
}

export class UI {
  /**
   * @param {{state: object}} game holder whose `state` may be replaced (import, reset)
   * @param {object} actions callbacks from main.js (buyGenerator, shatter, descend, crackGeode, setLook, buy and so on)
   * @param {{store: object, haptics: boolean, notifications: boolean, gameCenter: boolean, cloud: boolean, appIcon: boolean}} env
   *   the shop, and which device features exist here
   */
  constructor(game, actions, env) {
    this.game = game;
    this.actions = actions;
    this.env = env;
    this.store = env.store;
    this.view = 'grow';
    this.upgradeSig = null;
    this.facetSig = null;
    this.veinSig = null;
    this.collectionSig = null;
    this.achievementSig = null;
    this.lookSig = null;
    this.shopSig = null;
    this.toastTimer = 0;
    this.genRows = [];

    this.buildGenerators();
    this.bindTabs();
    this.bindControls();
    this.syncSettings();
  }

  // ---------- Building ----------

  buildGenerators() {
    const list = $('gen-list');
    GENERATORS.forEach((def, index) => {
      const row = el('button', 'gen');
      row.type = 'button';
      const gem = el('span', 'gem');
      gem.style.setProperty('--h', def.hue);
      gem.style.setProperty('--s', def.sat + '%');
      const info = el('span', 'info');
      const name = el('span', 'name');
      const title = el('span', null, def.name);
      const count = el('b');
      name.append(title, count);
      const sub = el('span', 'sub', def.desc);
      info.append(name, sub);
      const cost = el('span', 'cost');
      const amt = el('span', 'amt');
      const price = el('span', 'price');
      cost.append(amt, price);
      const bar = el('span', 'bar');
      const fill = el('i');
      bar.append(fill);
      row.append(gem, info, cost, bar);
      row.addEventListener('click', () => {
        if (row.classList.contains('locked')) return;
        if (this.actions.buyGenerator(def.id)) {
          row.classList.remove('bought');
          void row.offsetWidth;
          row.classList.add('bought');
        }
      });
      list.append(row);
      this.genRows.push({ def, index, row, title, count, sub, amt, price, fill });
    });
  }

  bindTabs() {
    for (const btn of document.querySelectorAll('#tabs button')) {
      btn.addEventListener('click', () => this.showView(btn.dataset.view));
    }
  }

  showView(view) {
    this.view = view;
    for (const btn of document.querySelectorAll('#tabs button')) {
      const on = btn.dataset.view === view;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${view}`;
    this.refresh(true);
  }

  bindControls() {
    for (const btn of document.querySelectorAll('#buy-mode button')) {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode === 'max' ? 'max' : Number(btn.dataset.mode);
        this.game.state.settings.buyMode = mode;
        this.syncSettings();
        this.refresh(true);
      });
    }
    $('upgrade-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-upgrade]');
      if (row) this.actions.buyUpgrade(row.dataset.upgrade);
    });
    $('facet-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-facet]');
      if (row) this.actions.buyFacet(row.dataset.facet);
    });
    $('vein-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-vein]');
      if (row) this.actions.buyVein(row.dataset.vein);
    });
    $('shatter-btn').addEventListener('click', () => this.actions.shatter());
    $('descend-btn').addEventListener('click', () => this.actions.descend());
    $('geode-btn').addEventListener('click', () => this.actions.crackGeode());
    $('collection-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-specimen]');
      if (cell) this.showSpecimen(cell.dataset.specimen);
    });
    $('gc-achievements-btn').addEventListener('click', () => this.actions.gameCenter('achievements'));
    $('gc-leaderboards-btn').addEventListener('click', () => this.actions.gameCenter('leaderboards'));
    $('haptics-toggle').addEventListener('change', (e) => this.actions.setHaptics(e.target.checked));
    $('notify-toggle').addEventListener('change', (e) => this.actions.setNotify(e.target.checked));
    $('supporter-toggle').addEventListener('change', (e) => this.actions.setSupporterCrystal(e.target.checked));
    for (const kind of Object.keys(COSMETICS)) {
      $(`look-${kind}`).addEventListener('click', (e) => {
        const chip = e.target.closest('[data-id]');
        if (!chip) return;
        const item = COSMETICS[kind].find((x) => x.id === chip.dataset.id);
        if (isUnlocked(item, this.game.state, this.store)) this.actions.setLook(kind, item.id);
        else this.actions.lockedLook(item);
      });
    }
    $('shop').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-product]');
      if (btn && !btn.classList.contains('owned')) this.actions.buy(btn.dataset.product);
    });
    $('restore-btn').addEventListener('click', () => this.actions.restore());
    $('cloud-btn').addEventListener('click', () => this.actions.checkCloud());
    $('sound-toggle').addEventListener('change', (e) => this.actions.setSound(e.target.checked));
    $('export-btn').addEventListener('click', () => this.actions.exportSave());
    $('import-btn').addEventListener('click', () => this.actions.importSave());
    $('reset-btn').addEventListener('click', () => this.actions.reset());
  }

  syncSettings() {
    const { settings } = this.game.state;
    for (const btn of document.querySelectorAll('#buy-mode button')) {
      btn.classList.toggle('active', String(settings.buyMode) === btn.dataset.mode);
    }
    $('sound-toggle').checked = settings.sound;
    $('haptics-toggle').checked = settings.haptics;
    $('notify-toggle').checked = settings.notify;
    $('supporter-toggle').checked = settings.supporterCrystal;
    $('haptics-row').hidden = !this.env.haptics;
    $('notify-row').hidden = !this.env.notifications;
    $('gc-row').hidden = !this.env.gameCenter;
    $('cloud-btn').hidden = !this.env.cloud;
    $('look-icon-row').hidden = !this.env.appIcon;
    $('shop').hidden = !this.store.available;
    $('shop-web').hidden = this.store.available;
    setText($('save-note'), this.env.cloud ? 'Progress saves on this device automatically and follows you to your other devices through iCloud.' : 'Progress saves on this device automatically.');
  }

  /** Forget cached list contents (after a reset, import or shatter). */
  invalidate() {
    this.upgradeSig = null;
    this.facetSig = null;
    this.veinSig = null;
    this.collectionSig = null;
    this.achievementSig = null;
    this.lookSig = null;
    this.shopSig = null;
    this.syncSettings();
    this.refresh(true);
  }

  // ---------- Per-frame HUD ----------

  hud(state, d) {
    setText($('shards'), fmt(state.shards));
    setText($('rate'), fmt(d.perSec, true));
  }

  // ---------- Slower refresh (a few times a second) ----------

  refresh() {
    const state = this.game.state;
    const d = G.derive(state);

    // Buff chips
    const buffs = [];
    if (state.buffs.radiance > 0) buffs.push(`Radiance ×${G.RADIANCE_MULT} · ${Math.ceil(state.buffs.radiance)}s`);
    if (state.buffs.edge > 0) buffs.push(`Keen Edge ×${G.EDGE_MULT} · ${Math.ceil(state.buffs.edge)}s`);
    const mod = G.dailyMod(state);
    if (mod) buffs.push(mod.name);
    const buffBox = $('buffs');
    while (buffBox.children.length > buffs.length) buffBox.lastChild.remove();
    buffs.forEach((text, i) => {
      if (!buffBox.children[i]) buffBox.append(el('span', 'buff'));
      setText(buffBox.children[i], text);
    });

    // Resonance label
    const res = $('resonance');
    res.hidden = state.resonance < 0.02;
    setText($('resonance-mult'), `×${(1 + state.resonance * G.RESONANCE_TAP_BONUS).toFixed(1)} taps`);
    $('resonance-fill').style.width = `${Math.round(state.resonance * 100)}%`;

    $('hint').classList.toggle('gone', state.taps >= 5 || state.totalShards > 20);

    // Tab badges
    const upgrades = G.visibleUpgrades(state);
    $('dot-carve').hidden = !upgrades.some((u) => state.shards >= u.cost);
    const gain = G.prismGain(state);
    const canFacet = FACETS.some((f) => {
      const c = G.facetCost(state, f.id);
      return c != null && state.prisms >= c;
    });
    const canVein = VEINS.some((v) => {
      const c = G.veinCost(state, v.id);
      return c != null && state.hearts >= c;
    });
    $('dot-shatter').hidden = !(gain >= Math.max(1, state.prismsEarned) || canFacet || canVein || G.heartGain(state) >= Math.max(1, state.heartsEarned));
    $('dot-trove').hidden = !G.dailyReady(state);

    if (this.view === 'grow') this.refreshGenerators(state, d);
    else if (this.view === 'carve') this.refreshUpgrades(state, upgrades);
    else if (this.view === 'shatter') this.refreshShatter(state, gain);
    else if (this.view === 'trove') this.refreshTrove(state);
    else if (this.view === 'more') this.refreshMore(state, d);
  }

  refreshGenerators(state, d) {
    let base = 0;
    for (const def of GENERATORS) base += G.genProduction(state, def);
    const factor = base > 0 ? d.steady / base : G.permanentMultiplier(state);
    const mode = state.settings.buyMode;
    let shownLocked = false;

    for (const r of this.genRows) {
      const unlocked = G.generatorUnlocked(state, r.index);
      if (!unlocked) {
        r.row.hidden = shownLocked;
        if (shownLocked) continue;
        shownLocked = true;
        r.row.className = 'gen locked';
        setText(r.title, '???');
        setText(r.count, '');
        setText(r.sub, `Earn ${fmt(r.def.baseCost * 0.5)} shards to discover`);
        setText(r.amt, '');
        setText(r.price, fmt(r.def.baseCost));
        r.fill.style.width = '0%';
        continue;
      }
      r.row.hidden = false;
      const have = G.owned(state, r.def.id);
      const plan = G.purchasePlan(state, r.def.id, mode);
      r.row.classList.remove('locked');
      r.row.classList.toggle('can', plan.affordable);
      setText(r.title, r.def.name);
      setText(r.count, have > 0 ? String(have) : '');
      const each = r.def.baseProd * G.genMultiplier(state, r.def) * factor;
      setText(r.sub, have > 0 ? `${fmt(each * have, true)}/s · ${fmt(each, true)} each` : `${r.def.desc} ${fmt(each, true)}/s`);
      setText(r.amt, `Buy ×${plan.n}`);
      setText(r.price, fmt(plan.cost));
      const ms = G.nextMilestone(have);
      r.fill.style.width = ms.next ? `${Math.round(((have - ms.prev) / (ms.next - ms.prev)) * 100)}%` : '100%';
      r.row.setAttribute('aria-label', `${r.def.name}, owned ${have}, buy ${plan.n} for ${fmt(plan.cost)} shards`);
    }
  }

  refreshUpgrades(state, upgrades) {
    const list = $('upgrade-list');
    const sig = upgrades.map((u) => u.id).join(',');
    if (sig !== this.upgradeSig) {
      this.upgradeSig = sig;
      list.textContent = '';
      if (!upgrades.length) {
        list.append(el('div', 'empty', 'Nothing to carve yet. Keep growing your cluster and new carvings will appear here.'));
      }
      for (const u of upgrades) {
        const row = el('button', 'row');
        row.type = 'button';
        row.dataset.upgrade = u.id;
        const info = el('span');
        info.append(el('span', 'name', u.name), el('span', 'sub', u.desc));
        row.append(info, el('span', 'price', fmt(u.cost)));
        list.append(row);
      }
    }
    for (const row of list.querySelectorAll('[data-upgrade]')) {
      const u = upgrades.find((x) => x.id === row.dataset.upgrade);
      row.classList.toggle('can', !!u && state.shards >= u.cost);
    }
    const bought = Object.keys(state.upgrades).length;
    setText($('carve-count'), `${bought} / ${UPGRADES.length} carved`);
  }

  refreshShatter(state, gain) {
    setText($('prisms'), fmt(state.prisms));
    const pct = Math.round((G.prismMultiplier(state) - 1) * 100);
    setText(
      $('prism-bonus'),
      state.prismsEarned > 0
        ? `${fmt(state.prismsEarned)} Prisms earned so far: +${fmt(pct)}% to everything.`
        : 'Each Prism gives +5% to everything.'
    );
    const btn = $('shatter-btn');
    btn.disabled = gain < 1;
    setText(btn, gain >= 1 ? `Shatter for +${fmt(gain)} Prism${gain === 1 ? '' : 's'}` : 'Not enough shards yet');
    const need = G.nextPrismAt(state) - state.totalShards;
    setText($('prism-next'), `Next Prism in ${fmt(Math.max(0, need))} more shards earned`);

    const list = $('facet-list');
    const sig = FACETS.map((f) => G.facetLevel(state, f.id)).join(',');
    if (sig !== this.facetSig) {
      this.facetSig = sig;
      list.textContent = '';
      for (const f of FACETS) {
        const lvl = G.facetLevel(state, f.id);
        const cost = G.facetCost(state, f.id);
        const row = el('button', 'row');
        row.type = 'button';
        row.dataset.facet = f.id;
        const info = el('span');
        const name = el('span', 'name', f.name);
        name.append(el('small', null, `Lv ${lvl}/${f.costs.length}`));
        info.append(name, el('span', 'sub', f.desc(lvl)));
        const price = el('span', 'price', cost == null ? 'Max' : `${fmt(cost)} ◆`);
        row.append(info, price);
        if (cost == null) row.classList.add('maxed');
        list.append(row);
      }
    }
    for (const row of list.querySelectorAll('[data-facet]')) {
      const cost = G.facetCost(state, row.dataset.facet);
      row.classList.toggle('can', cost != null && state.prisms >= cost);
    }
    this.refreshDeep(state);
  }

  /** The second prestige layer. It stays out of sight until the player is some way toward it. */
  refreshDeep(state) {
    const known = state.descents > 0 || state.prismsEarned >= G.DESCEND_PRISMS / 10;
    $('deep').hidden = !known;
    if (!known) return;
    const gain = G.heartGain(state);
    setText($('hearts'), fmt(state.hearts));
    setText(
      $('heart-bonus'),
      state.heartsEarned > 0
        ? `${fmt(state.heartsEarned)} Heartstones earned so far: ${pct(G.heartMultiplier(state))} to everything. Depth ${state.descents}.`
        : `Each Heartstone gives +${G.HEART_BONUS * 100}% to everything.`
    );
    const btn = $('descend-btn');
    btn.disabled = gain < 1;
    setText(btn, gain >= 1 ? `Descend for +${fmt(gain)} Heartstone${gain === 1 ? '' : 's'}` : `Needs ${fmt(G.DESCEND_PRISMS)} Prisms earned in this cavern`);
    const need = G.nextHeartAt(state) - state.prismsEarned;
    setText($('heart-next'), `${fmt(state.prismsEarned)} Prisms earned in this cavern. Next Heartstone in ${fmt(Math.max(0, need))} more.`);

    $('veins').hidden = state.heartsEarned < 1;
    const list = $('vein-list');
    const sig = VEINS.map((v) => G.veinLevel(state, v.id)).join(',');
    if (sig !== this.veinSig) {
      this.veinSig = sig;
      list.textContent = '';
      for (const v of VEINS) {
        const lvl = G.veinLevel(state, v.id);
        const cost = G.veinCost(state, v.id);
        const row = el('button', 'row');
        row.type = 'button';
        row.dataset.vein = v.id;
        const info = el('span');
        const name = el('span', 'name', v.name);
        name.append(el('small', null, `Lv ${lvl}/${v.costs.length}`));
        info.append(name, el('span', 'sub', v.desc(lvl)));
        row.append(info, el('span', 'price', cost == null ? 'Max' : `${fmt(cost)} ♥`));
        if (cost == null) row.classList.add('maxed');
        list.append(row);
      }
    }
    for (const row of list.querySelectorAll('[data-vein]')) {
      const cost = G.veinCost(state, row.dataset.vein);
      row.classList.toggle('can', cost != null && state.hearts >= cost);
    }
  }

  // ---------- Trove: daily geode, collection book, achievements ----------

  refreshTrove(state) {
    const bonus = G.collectionMultiplier(state) * G.achievementMultiplier(state);
    setText($('trove-bonus'), bonus > 1 ? `${pct(bonus)} to everything` : '');

    const daily = state.daily;
    $('geode-card').hidden = !daily;
    if (daily) {
      const mod = DAILY_MOD_BY_ID[daily.mod];
      const goal = DAILY_GOAL_BY_ID[daily.goal];
      const ready = G.dailyReady(state);
      setText($('geode-mod'), mod.name);
      setText($('geode-mod-desc'), `${mod.desc}.`);
      setText($('geode-goal'), `${goal.text(fmt(daily.target), fmt)} to crack today's Geode.`);
      $('geode-fill').style.width = `${Math.floor((daily.progress / daily.target) * 100)}%`;
      const btn = $('geode-btn');
      btn.disabled = !ready;
      btn.classList.toggle('ready', ready);
      if (daily.claimed) setText(btn, `Cracked. Next Geode in ${fmtTime(secondsToMidnight())}`);
      else if (ready) setText(btn, 'Crack it open');
      else setText(btn, `${fmt(daily.progress)} / ${fmt(daily.target)}`);
      const streak = G.currentStreak(state, daily.day);
      setText(
        $('geode-streak'),
        streak > 0
          ? `Streak: ${streak} day${streak === 1 ? '' : 's'}. Inside: shards and a rare crystal. Each day in a row adds 10% more shards, up to double.`
          : 'Inside: shards and a rare crystal. Crack one every day and each day in a row adds 10% more shards, up to double.'
      );
    }

    // Collection book
    const foundCount = Object.keys(state.specimens).length;
    setText($('collection-count'), `${foundCount} / ${SPECIMENS.length}`);
    const grid = $('collection-grid');
    const cSig = SPECIMENS.map((s) => state.specimens[s.id] || 0).join(',') + `|${state.descents}`;
    if (cSig !== this.collectionSig) {
      this.collectionSig = cSig;
      grid.textContent = '';
      for (const s of SPECIMENS) {
        const n = state.specimens[s.id] || 0;
        const cell = el('button', `spec ${s.rarity}${n ? '' : ' unknown'}`);
        cell.type = 'button';
        cell.dataset.specimen = s.id;
        cell.append(gemIcon(s.hue, s.sat), el('span', 'spec-name', n ? s.name : '???'));
        cell.append(el('span', 'spec-rarity', n > 1 ? `${RARITIES[s.rarity].name} ×${n}` : RARITIES[s.rarity].name));
        grid.append(cell);
      }
    }

    // Achievements
    const earned = Object.keys(state.achievements).length;
    setText($('achievement-count'), `${earned} / ${ACHIEVEMENTS.length}`);
    const list = $('achievement-list');
    const aSig = ACHIEVEMENTS.map((a) => (state.achievements[a.id] ? 1 : 0)).join('');
    if (aSig !== this.achievementSig) {
      this.achievementSig = aSig;
      list.textContent = '';
      for (const a of ACHIEVEMENTS) {
        const done = !!state.achievements[a.id];
        const row = el('div', `row ach${done ? ' done' : ''}`);
        const info = el('span');
        info.append(el('span', 'name', a.name), el('span', 'sub', a.desc));
        row.append(info, el('span', 'price', done ? '✓' : ''));
        list.append(row);
      }
    }
  }

  showSpecimen(id) {
    const s = SPECIMEN_BY_ID[id];
    const n = this.game.state.specimens[id] || 0;
    const rarity = RARITIES[s.rarity].name;
    if (!n) {
      const where = (s.depth || 0) > this.game.state.descents ? 'It only turns up in deeper caverns. Descend to have a chance of finding it.' : 'Keep tapping and catching Glimmers. The Daily Geode always has a rare crystal inside.';
      this.modal({ title: 'Not found yet', body: [el('span', 'tag', rarity), where], actions: [{ label: 'Close', kind: 'primary' }] });
      return;
    }
    this.modal({
      title: s.name,
      body: [gemIcon(s.hue, s.sat, 'big'), el('span', 'tag', rarity), s.note, `Found ${n} time${n === 1 ? '' : 's'}.`],
      actions: [{ label: 'Close', kind: 'primary' }],
    });
  }

  // ---------- More: looks, shop, stats ----------

  refreshMore(state, d) {
    this.refreshLooks(state);
    this.refreshShop();
    this.refreshStats(state, d);
  }

  refreshLooks(state) {
    const store = this.store;
    const kinds = Object.keys(COSMETICS);
    const sig = kinds.map((k) => COSMETICS[k].map((x) => (isUnlocked(x, state, store) ? 1 : 0)).join('') + chosen(k, state, store).id).join('|');
    $('supporter-row').hidden = !store.supporter;
    if (sig === this.lookSig) return;
    this.lookSig = sig;
    for (const kind of kinds) {
      const box = $(`look-${kind}`);
      const current = chosen(kind, state, store).id;
      box.textContent = '';
      for (const item of COSMETICS[kind]) {
        const open = isUnlocked(item, state, store);
        const chip = el('button', `chip${item.id === current ? ' active' : ''}${open ? '' : ' locked'}`);
        chip.type = 'button';
        chip.dataset.id = item.id;
        if (item.swatch) {
          const dot = el('i', 'swatch');
          dot.style.background = `hsl(${item.swatch[0]}, ${item.swatch[1]}%, ${item.swatch[2]}%)`;
          chip.append(dot);
        }
        chip.append(el('span', null, item.name));
        chip.setAttribute('aria-pressed', item.id === current ? 'true' : 'false');
        if (!open) chip.setAttribute('aria-label', `${item.name}, locked`);
        box.append(chip);
      }
    }
  }

  refreshShop() {
    const store = this.store;
    if (!store.available) return;
    const sig = PRODUCTS.map((p) => `${store.prices[p.id] || ''}${store.has(p.id) ? '*' : ''}`).join('|') + store.tips;
    if (sig === this.shopSig) return;
    this.shopSig = sig;
    const tips = $('tip-list');
    const packs = $('pack-list');
    tips.textContent = '';
    packs.textContent = '';
    for (const p of PRODUCTS) {
      const price = store.prices[p.id];
      if (p.kind === 'tip') {
        const btn = el('button', 'tip');
        btn.type = 'button';
        btn.dataset.product = p.id;
        btn.disabled = !price;
        btn.append(el('span', null, p.name), el('b', null, price || '…'));
        tips.append(btn);
      } else {
        const owned = store.has(p.id);
        const row = el('button', `row${owned ? ' owned' : ' can'}`);
        row.type = 'button';
        row.dataset.product = p.id;
        row.disabled = !owned && !price;
        const info = el('span');
        info.append(el('span', 'name', p.name), el('span', 'sub', p.blurb));
        row.append(info, el('span', 'price', owned ? 'Owned' : price || '…'));
        packs.append(row);
      }
    }
  }

  refreshStats(state, d) {
    const limits = G.offlineLimits(state);
    const rows = [
      ['Shards earned, all time', fmt(state.allTimeShards)],
      ['Shards earned, this cluster', fmt(state.runShards)],
      ['Per second', fmt(d.perSec, true)],
      ['Per tap', fmt(d.tap, true)],
      ['Taps', fmt(state.taps)],
      ['Glimmers caught', fmt(state.glimmersCaught)],
      ['Times shattered', fmt(state.shatters)],
      ['Prisms earned, all time', fmt(state.prismsAllTime)],
      ['Cavern depth', fmt(state.descents)],
      ['Rare crystals found', `${Object.keys(state.specimens).length} / ${SPECIMENS.length}`],
      ['Daily Geodes cracked', fmt(state.geodesCracked)],
      ['Permanent bonus', `×${fmt(G.permanentMultiplier(state), true)}`],
      ['Away earnings', `${Math.round(limits.efficiency * 100)}% for up to ${fmtTime(limits.capSeconds)}`],
    ];
    const box = $('stats');
    if (box.children.length !== rows.length * 2) {
      box.textContent = '';
      for (const [k] of rows) box.append(el('span', null, k), el('span'));
    }
    rows.forEach(([, v], i) => setText(box.children[i * 2 + 1], v));
  }

  // ---------- Toast and modal ----------

  toast(text, ms = 2600) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /**
   * @param {{title: string, body?: (string|Node)[], actions: {label: string, kind?: string, onClick?: Function}[]}} opts
   */
  modal({ title, body = [], actions }) {
    const root = $('modal-root');
    root.textContent = '';
    const box = el('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.append(el('h2', null, title));
    const content = el('div', 'body');
    for (const part of body) content.append(typeof part === 'string' ? el('p', null, part) : part);
    box.append(content);
    const row = el('div', 'btn-row');
    for (const a of actions) {
      const btn = el('button', `btn ${a.kind || ''}`.trim(), a.label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const keepOpen = a.onClick?.() === false;
        if (!keepOpen) this.closeModal();
      });
      row.append(btn);
    }
    box.append(row);
    root.append(box);
    root.hidden = false;
    return box;
  }

  closeModal() {
    const root = $('modal-root');
    root.hidden = true;
    root.textContent = '';
  }

  get modalOpen() {
    return !$('modal-root').hidden;
  }
}

export { el };
