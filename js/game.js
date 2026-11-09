// Pure game logic. No DOM access here, so it can be unit tested in Node.

import {
  COST_GROWTH,
  MILESTONES,
  GENERATORS,
  GEN_BY_ID,
  UPGRADES,
  UPGRADE_BY_ID,
  FACETS,
  FACET_BY_ID,
  SEED_AMOUNTS,
} from './data.js';

export const SAVE_VERSION = 1;

export const RESONANCE_PER_TAP = 0.05;
export const RESONANCE_DECAY = 0.1; // per second
export const RESONANCE_TAP_BONUS = 2; // taps are worth up to ×3 at full resonance
export const PRISM_BONUS = 0.05; // +5% per prism ever earned
export const PRISM_DIVISOR = 1e6;
export const RADIANCE_MULT = 7;
export const EDGE_MULT = 12;

const UPGRADES_BY_GEN = {};
for (const u of UPGRADES) {
  if (u.kind === 'gen') (UPGRADES_BY_GEN[u.gen] ||= []).push(u);
}

export function newState(now = Date.now()) {
  return {
    v: SAVE_VERSION,
    shards: 0,
    runShards: 0, // earned since the last shatter
    totalShards: 0, // earned across all time
    taps: 0,
    gens: {},
    upgrades: {},
    prisms: 0, // spendable
    prismsEarned: 0, // lifetime, drives the bonus
    facets: {},
    shatters: 0,
    resonance: 0,
    buffs: { radiance: 0, edge: 0 }, // seconds remaining
    glimmerIn: 50,
    glimmersCaught: 0,
    lastSeen: now,
    createdAt: now,
    settings: { sound: true, buyMode: 1 },
  };
}

export const owned = (state, id) => state.gens[id] || 0;
export const facetLevel = (state, id) => state.facets[id] || 0;
export const hasUpgrade = (state, id) => !!state.upgrades[id];

// ---------- Costs ----------

/** Cost of buying `n` more of a growth when `have` are already owned. */
export function bulkCost(def, have, n = 1) {
  const raw = (def.baseCost * Math.pow(COST_GROWTH, have) * (Math.pow(COST_GROWTH, n) - 1)) / (COST_GROWTH - 1);
  return Math.ceil(raw - 1e-9);
}

/** The most of a growth that `shards` can pay for. */
export function maxAffordable(def, have, shards) {
  const first = def.baseCost * Math.pow(COST_GROWTH, have);
  if (shards < first) return 0;
  let n = Math.floor(Math.log((shards * (COST_GROWTH - 1)) / first + 1) / Math.log(COST_GROWTH));
  while (n > 0 && bulkCost(def, have, n) > shards) n--;
  return n;
}

/** Resolve a buy mode (1, 10 or 'max') into a concrete quantity and cost. */
export function purchasePlan(state, id, mode = 1) {
  const def = GEN_BY_ID[id];
  const have = owned(state, id);
  const n = mode === 'max' ? Math.max(1, maxAffordable(def, have, state.shards)) : mode;
  const cost = bulkCost(def, have, n);
  return { n, cost, affordable: state.shards >= cost };
}

// ---------- Multipliers ----------

export function genMultiplier(state, def) {
  const have = owned(state, def.id);
  let m = 1;
  for (const t of MILESTONES) if (have >= t) m *= 2;
  for (const u of UPGRADES_BY_GEN[def.id] || []) if (state.upgrades[u.id]) m *= u.mult;
  return m;
}

export function nextMilestone(have) {
  let prev = 0;
  for (const t of MILESTONES) {
    if (have < t) return { prev, next: t };
    prev = t;
  }
  return { prev, next: null };
}

export function prismMultiplier(state) {
  return 1 + state.prismsEarned * (PRISM_BONUS + 0.01 * facetLevel(state, 'core'));
}

function globalUpgradeMult(state) {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'global' && state.upgrades[u.id]) m *= u.mult;
  return m;
}

/** Production of one growth type per second, before resonance and buffs. */
export function genProduction(state, def) {
  return owned(state, def.id) * def.baseProd * genMultiplier(state, def);
}

/**
 * All the derived numbers the game needs each frame.
 * `steady` is production with no resonance or buffs (used for offline progress and percentage taps).
 */
export function derive(state) {
  let base = 0;
  for (const def of GENERATORS) base += genProduction(state, def);
  const steady = base * globalUpgradeMult(state) * prismMultiplier(state);

  const resCap = hasUpgrade(state, 'res1') ? 1 : 0.5;
  const resMult = 1 + state.resonance * resCap;
  const radiance = state.buffs.radiance > 0 ? RADIANCE_MULT : 1;
  const perSec = steady * resMult * radiance;

  let tapMult = 1;
  let tapPct = 0;
  for (const u of UPGRADES) {
    if (!state.upgrades[u.id]) continue;
    if (u.kind === 'tap') tapMult *= u.mult;
    else if (u.kind === 'tapPct') tapPct += u.pct;
  }
  const tapSteady = tapMult * prismMultiplier(state) + steady * tapPct;
  const edge = state.buffs.edge > 0 ? EDGE_MULT : 1;
  const tap = tapSteady * (1 + state.resonance * RESONANCE_TAP_BONUS) * edge;

  return { steady, perSec, resMult, tap, tapSteady: tapSteady * edge };
}

// ---------- Actions ----------

export function addShards(state, amount) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  state.shards += amount;
  state.runShards += amount;
  state.totalShards += amount;
}

export function tap(state) {
  const gain = derive(state).tap;
  addShards(state, gain);
  state.taps++;
  state.resonance = Math.min(1, state.resonance + RESONANCE_PER_TAP);
  return gain;
}

export function buyGenerator(state, id, mode = 1) {
  const plan = purchasePlan(state, id, mode);
  if (!plan.affordable) return 0;
  state.shards -= plan.cost;
  state.gens[id] = owned(state, id) + plan.n;
  return plan.n;
}

export function generatorUnlocked(state, index) {
  const def = GENERATORS[index];
  return index === 0 || owned(state, def.id) > 0 || state.runShards >= def.baseCost * 0.5;
}

export function upgradeVisible(state, u) {
  if (state.upgrades[u.id]) return false;
  if (u.kind === 'gen') return owned(state, u.gen) >= u.reqOwned;
  return state.runShards >= u.cost * 0.25;
}

export function visibleUpgrades(state) {
  return UPGRADES.filter((u) => upgradeVisible(state, u)).sort((a, b) => a.cost - b.cost);
}

export function buyUpgrade(state, id) {
  const u = UPGRADE_BY_ID[id];
  if (!u || !upgradeVisible(state, u) || state.shards < u.cost) return false;
  state.shards -= u.cost;
  state.upgrades[id] = true;
  return true;
}

// ---------- Time ----------

/** Advance the simulation by `dt` seconds of active play. */
export function tick(state, dt) {
  if (!(dt > 0)) return;
  const d = derive(state);
  let gain = d.perSec * dt;
  const chime = facetLevel(state, 'chime');
  if (chime > 0) gain += d.tapSteady * chime * dt;
  addShards(state, gain);

  const decay = RESONANCE_DECAY * (1 - 0.15 * facetLevel(state, 'sustain'));
  state.resonance = Math.max(0, state.resonance - decay * dt);
  state.buffs.radiance = Math.max(0, state.buffs.radiance - dt);
  state.buffs.edge = Math.max(0, state.buffs.edge - dt);
  state.glimmerIn -= dt;
}

export function offlineLimits(state) {
  const lvl = facetLevel(state, 'sleep');
  return { capSeconds: (4 + 2 * lvl) * 3600, efficiency: 0.5 + 0.1 * lvl };
}

/**
 * Credit progress for time spent away. Returns a summary, or null if nothing was earned.
 */
export function applyOffline(state, now = Date.now()) {
  const elapsed = (now - state.lastSeen) / 1000;
  state.lastSeen = now;
  if (!(elapsed > 0)) return null;
  state.resonance = 0;
  state.buffs.radiance = 0;
  state.buffs.edge = 0;
  const { capSeconds, efficiency } = offlineLimits(state);
  const counted = Math.min(elapsed, capSeconds);
  const d = derive(state);
  const gain = (d.steady + d.tapSteady * facetLevel(state, 'chime')) * counted * efficiency;
  addShards(state, gain);
  return gain > 0 ? { elapsed, counted, gain, efficiency, capped: elapsed > capSeconds } : null;
}

// ---------- Glimmers ----------

export function nextGlimmerDelay(state, rand = Math.random) {
  return (70 + rand() * 90) * Math.pow(0.85, facetLevel(state, 'sense'));
}

/** Resolve a caught glimmer into a reward. Returns a description for the UI. */
export function catchGlimmer(state, rand = Math.random) {
  const boost = hasUpgrade(state, 'wisp1') ? 2 : 1;
  const d = derive(state);
  state.glimmersCaught++;
  const roll = rand();
  if (roll < 0.45 || d.steady <= 0) {
    const gain = Math.max(d.steady * 90, d.tapSteady * 40) * boost;
    addShards(state, gain);
    return { type: 'rain', gain, title: 'Shard Rain' };
  }
  if (roll < 0.75) {
    state.buffs.radiance = 30 * boost;
    return { type: 'radiance', seconds: 30 * boost, title: `Radiance: growths ×${RADIANCE_MULT}` };
  }
  state.buffs.edge = 20 * boost;
  return { type: 'edge', seconds: 20 * boost, title: `Keen Edge: taps ×${EDGE_MULT}` };
}

// ---------- Shatter (prestige) ----------

export function prismGain(state) {
  return Math.max(0, Math.floor(Math.sqrt(state.totalShards / PRISM_DIVISOR)) - state.prismsEarned);
}

/** Total lifetime shards needed for the next prism beyond what a shatter would give right now. */
export function nextPrismAt(state) {
  const target = state.prismsEarned + prismGain(state) + 1;
  return target * target * PRISM_DIVISOR;
}

export function shatter(state) {
  const gain = prismGain(state);
  if (gain < 1) return 0;
  state.prisms += gain;
  state.prismsEarned += gain;
  state.shatters++;
  state.shards = SEED_AMOUNTS[facetLevel(state, 'seed')] || 0;
  state.runShards = 0;
  state.gens = {};
  state.upgrades = {};
  state.resonance = 0;
  state.buffs = { radiance: 0, edge: 0 };
  return gain;
}

export function facetCost(state, id) {
  const f = FACET_BY_ID[id];
  const lvl = facetLevel(state, id);
  return lvl >= f.costs.length ? null : f.costs[lvl];
}

export function buyFacet(state, id) {
  const cost = facetCost(state, id);
  if (cost == null || state.prisms < cost) return false;
  state.prisms -= cost;
  state.facets[id] = facetLevel(state, id) + 1;
  return true;
}

// ---------- Save / load ----------

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

export function serialize(state) {
  return JSON.stringify({ ...state, v: SAVE_VERSION });
}

/** Rebuild a state from saved JSON, ignoring anything unknown or malformed. Throws on unparseable input. */
export function deserialize(json, now = Date.now()) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (!raw || typeof raw !== 'object') throw new Error('Not a save');
  const s = newState(now);
  for (const k of ['shards', 'runShards', 'totalShards', 'taps', 'prisms', 'prismsEarned', 'shatters', 'glimmersCaught']) {
    s[k] = num(raw[k]);
  }
  for (const g of GENERATORS) {
    const n = Math.floor(num(raw.gens?.[g.id]));
    if (n > 0) s.gens[g.id] = n;
  }
  for (const u of UPGRADES) if (raw.upgrades?.[u.id]) s.upgrades[u.id] = true;
  for (const f of FACETS) {
    const lvl = Math.min(f.costs.length, Math.floor(num(raw.facets?.[f.id])));
    if (lvl > 0) s.facets[f.id] = lvl;
  }
  s.glimmerIn = num(raw.glimmerIn, 50);
  s.lastSeen = Math.min(now, num(raw.lastSeen, now));
  s.createdAt = num(raw.createdAt, now);
  s.settings.sound = raw.settings?.sound !== false;
  const mode = raw.settings?.buyMode;
  s.settings.buyMode = mode === 10 || mode === 'max' ? mode : 1;
  return s;
}
