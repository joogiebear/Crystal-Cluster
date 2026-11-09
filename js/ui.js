// DOM side of the game: lists, tabs, HUD, toasts and modals.

import { GENERATORS, FACETS, UPGRADES } from './data.js';
import * as G from './game.js';
import { fmt, fmtTime } from './format.js';

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

export class UI {
  /**
   * @param {{state: object}} game holder whose `state` may be replaced (import, reset)
   * @param {object} actions callbacks: buyGenerator, buyUpgrade, buyFacet, shatter, setSound, exportSave, importSave, reset
   */
  constructor(game, actions) {
    this.game = game;
    this.actions = actions;
    this.view = 'grow';
    this.upgradeSig = null;
    this.facetSig = null;
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
    $('shatter-btn').addEventListener('click', () => this.actions.shatter());
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
  }

  /** Forget cached list contents (after a reset, import or shatter). */
  invalidate() {
    this.upgradeSig = null;
    this.facetSig = null;
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
    $('dot-shatter').hidden = !(gain >= Math.max(1, state.prismsEarned) || FACETS.some((f) => {
      const c = G.facetCost(state, f.id);
      return c != null && state.prisms >= c;
    }));

    if (this.view === 'grow') this.refreshGenerators(state, d);
    else if (this.view === 'carve') this.refreshUpgrades(state, upgrades);
    else if (this.view === 'shatter') this.refreshShatter(state, gain);
    else if (this.view === 'more') this.refreshStats(state, d);
  }

  refreshGenerators(state, d) {
    let base = 0;
    for (const def of GENERATORS) base += G.genProduction(state, def);
    const factor = base > 0 ? d.steady / base : G.prismMultiplier(state);
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
  }

  refreshStats(state, d) {
    const limits = G.offlineLimits(state);
    const rows = [
      ['Shards earned, all time', fmt(state.totalShards)],
      ['Shards earned, this cluster', fmt(state.runShards)],
      ['Per second', fmt(d.perSec, true)],
      ['Per tap', fmt(d.tap, true)],
      ['Taps', fmt(state.taps)],
      ['Glimmers caught', fmt(state.glimmersCaught)],
      ['Times shattered', fmt(state.shatters)],
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
