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
  VEINS,
  VEIN_BY_ID,
  CACHE_AMOUNTS,
  RARITIES,
  SPECIMENS,
  DAILY_MODS,
  DAILY_MOD_BY_ID,
  DAILY_GOALS,
  DAILY_GOAL_BY_ID,
  ACHIEVEMENTS,
} from './data.js';

export const SAVE_VERSION = 2;

export const RESONANCE_PER_TAP = 0.05;
export const RESONANCE_DECAY = 0.1; // per second
export const RESONANCE_TAP_BONUS = 2; // taps are worth up to ×3 at full resonance
export const PRISM_BONUS = 0.05; // +5% per prism ever earned
export const PRISM_DIVISOR = 1e6;
export const RADIANCE_MULT = 7;
export const EDGE_MULT = 12;
export const DESCEND_PRISMS = 1000; // Prisms earned in this cavern before the first Heartstone
export const HEART_BONUS = 2; // +200% per Heartstone ever earned
export const SPECIMEN_BONUS = 0.02; // +2% per different rare crystal found
export const ACHIEVEMENT_BONUS = 0.01; // +1% per achievement
export const FIND_CHANCE_TAP = 1 / 350;
export const FIND_CHANCE_GLIMMER = 0.25;

const UPGRADES_BY_GEN = {};
for (const u of UPGRADES) {
  if (u.kind === 'gen') (UPGRADES_BY_GEN[u.gen] ||= []).push(u);
}

export function newState(now = Date.now()) {
  return {
    v: SAVE_VERSION,
    shards: 0,
    runShards: 0, // earned since the last shatter
    totalShards: 0, // earned in this cavern (since the last descent); drives Prisms
    allTimeShards: 0, // earned ever
    taps: 0,
    growthsBought: 0,
    playSeconds: 0, // active play time
    firstShatterSeconds: 0, // play time at the first ever shatter (0 = not yet)
    gens: {},
    upgrades: {},
    prisms: 0, // spendable
    prismsEarned: 0, // in this cavern, drives the bonus
    prismsAllTime: 0,
    facets: {},
    shatters: 0,
    hearts: 0, // Heartstones, spendable
    heartsEarned: 0, // lifetime, drives the bonus
    descents: 0,
    veins: {},
    specimens: {}, // id -> how many found
    achievements: {}, // id -> time earned
    daily: null, // { day, mod, goal, target, progress, claimed }
    lastGeodeDay: '',
    streak: 0,
    bestStreak: 0,
    geodesCracked: 0,
    resonance: 0,
    buffs: { radiance: 0, edge: 0 }, // seconds remaining
    glimmerIn: 50,
    glimmersCaught: 0,
    lastSeen: now,
    createdAt: now,
    settings: {
      sound: true,
      fps: 'auto', // 'auto', 60 or 30
      buyMode: 1,
      haptics: true,
      notify: false,
      music: 'off',
      skin: 'classic',
      backdrop: 'cavern',
      tapFx: 'shards',
      icon: 'default',
      supporterCrystal: true,
    },
  };
}

export const owned = (state, id) => state.gens[id] || 0;
export const facetLevel = (state, id) => state.facets[id] || 0;
export const hasUpgrade = (state, id) => !!state.upgrades[id];
export const veinLevel = (state, id) => state.veins[id] || 0;
export const dailyMod = (state) => (state.daily ? DAILY_MOD_BY_ID[state.daily.mod] : null) || null;

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

export function heartMultiplier(state) {
  return 1 + state.heartsEarned * HEART_BONUS;
}

export function collectionMultiplier(state) {
  return 1 + Object.keys(state.specimens).length * SPECIMEN_BONUS;
}

export function achievementMultiplier(state) {
  return 1 + Object.keys(state.achievements).length * ACHIEVEMENT_BONUS;
}

/** Everything permanent, multiplied together. Applies to growths and to taps. */
export function permanentMultiplier(state) {
  return prismMultiplier(state) * heartMultiplier(state) * collectionMultiplier(state) * achievementMultiplier(state);
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
  const perm = permanentMultiplier(state);
  const mod = dailyMod(state);
  const steady = base * globalUpgradeMult(state) * perm * (mod?.growth || 1);

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
  const tapSteady = (tapMult * perm + steady * tapPct) * (mod?.tap || 1);
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
  state.allTimeShards += amount;
  bumpDaily(state, 'shards', amount);
}

export function tap(state) {
  const gain = derive(state).tap;
  addShards(state, gain);
  state.taps++;
  bumpDaily(state, 'taps', 1);
  state.resonance = Math.min(1, state.resonance + RESONANCE_PER_TAP);
  return gain;
}

export function buyGenerator(state, id, mode = 1) {
  const plan = purchasePlan(state, id, mode);
  if (!plan.affordable) return 0;
  state.shards -= plan.cost;
  state.gens[id] = owned(state, id) + plan.n;
  state.growthsBought += plan.n;
  bumpDaily(state, 'growths', plan.n);
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

/** How much resonance fades per second. */
function resonanceDecay(state) {
  return RESONANCE_DECAY * (1 - 0.15 * facetLevel(state, 'sustain')) * (dailyMod(state)?.decay || 1);
}

/** Advance the simulation by `dt` seconds of active play. */
export function tick(state, dt) {
  if (!(dt > 0)) return;
  const d = derive(state);
  let gain = d.perSec * dt;
  const chime = facetLevel(state, 'chime');
  if (chime > 0) gain += d.tapSteady * chime * dt;
  addShards(state, gain);

  state.playSeconds += dt;
  state.resonance = Math.max(0, state.resonance - resonanceDecay(state) * dt);
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
  // Resonance and buffs run down over the time away, so a glance at another app does not wipe them.
  state.resonance = Math.max(0, state.resonance - resonanceDecay(state) * elapsed);
  state.buffs.radiance = Math.max(0, state.buffs.radiance - elapsed);
  state.buffs.edge = Math.max(0, state.buffs.edge - elapsed);
  const { capSeconds, efficiency } = offlineLimits(state);
  const counted = Math.min(elapsed, capSeconds);
  const d = derive(state);
  const gain = (d.steady + d.tapSteady * facetLevel(state, 'chime')) * counted * efficiency;
  addShards(state, gain);
  return gain > 0 ? { elapsed, counted, gain, efficiency, capped: elapsed > capSeconds } : null;
}

// ---------- Glimmers ----------

export function nextGlimmerDelay(state, rand = Math.random) {
  return (70 + rand() * 90) * Math.pow(0.85, facetLevel(state, 'sense')) * (dailyMod(state)?.glimmer || 1);
}

/** Resolve a caught glimmer into a reward. Returns a description for the UI. */
export function catchGlimmer(state, rand = Math.random) {
  const boost = hasUpgrade(state, 'wisp1') ? 2 : 1;
  const d = derive(state);
  state.glimmersCaught++;
  bumpDaily(state, 'glimmers', 1);
  const roll = rand();
  if (roll < 0.45 || d.steady <= 0) {
    const gain = Math.max(d.steady * 90, d.tapSteady * 40) * boost * (1 + veinLevel(state, 'echo'));
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

const lensMult = (state) => 1 + 0.25 * veinLevel(state, 'lens');

export function prismGain(state) {
  return Math.max(0, Math.floor(Math.sqrt(state.totalShards / PRISM_DIVISOR) * lensMult(state) + 1e-9) - state.prismsEarned);
}

/** Shards (earned in this cavern) needed for the next prism beyond what a shatter would give right now. */
export function nextPrismAt(state) {
  const target = (state.prismsEarned + prismGain(state) + 1) / lensMult(state);
  return target * target * PRISM_DIVISOR;
}

export function shatter(state) {
  const gain = prismGain(state);
  if (gain < 1) return 0;
  state.prisms += gain;
  state.prismsEarned += gain;
  state.prismsAllTime += gain;
  if (!state.firstShatterSeconds) state.firstShatterSeconds = Math.max(1, state.playSeconds);
  state.shatters++;
  state.shards = SEED_AMOUNTS[facetLevel(state, 'seed')] || 0;
  // Seed Stock counts as progress in the new cluster, so what it can pay for is discovered straight away.
  state.runShards = state.shards;
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

// ---------- Descend (second prestige layer) ----------

export function heartGain(state) {
  return Math.floor(Math.sqrt(state.prismsEarned / DESCEND_PRISMS) + 1e-9);
}

/** Prisms earned in this cavern needed for one more Heartstone than a descent would give right now. */
export function nextHeartAt(state) {
  const target = heartGain(state) + 1;
  return target * target * DESCEND_PRISMS;
}

/**
 * Leave this cavern for a deeper one. Everything from the first layer goes
 * (shards, growths, carvings, Prisms and Facets); Heartstones, Veins, the
 * collection book and achievements stay.
 */
export function descend(state) {
  const gain = heartGain(state);
  if (gain < 1) return 0;
  state.hearts += gain;
  state.heartsEarned += gain;
  state.descents++;
  state.shards = 0;
  state.runShards = 0;
  state.totalShards = 0;
  state.gens = {};
  state.upgrades = {};
  state.facets = {};
  state.prisms = CACHE_AMOUNTS[veinLevel(state, 'cache')] || 0;
  state.prismsEarned = 0;
  state.resonance = 0;
  state.buffs = { radiance: 0, edge: 0 };
  return gain;
}

export function veinCost(state, id) {
  const v = VEIN_BY_ID[id];
  const lvl = veinLevel(state, id);
  return lvl >= v.costs.length ? null : v.costs[lvl];
}

export function buyVein(state, id) {
  const cost = veinCost(state, id);
  if (cost == null || state.hearts < cost) return false;
  state.hearts -= cost;
  state.veins[id] = veinLevel(state, id) + 1;
  return true;
}

// ---------- Collection book ----------

/** Add one rare crystal to the book, chosen by rarity. Returns `{ def, isNew }`. */
export function rollSpecimen(state, rand = Math.random) {
  const pool = SPECIMENS.filter((s) => (s.depth || 0) <= state.descents);
  const tiers = Object.keys(RARITIES).filter((r) => pool.some((s) => s.rarity === r));
  let roll = rand() * tiers.reduce((sum, r) => sum + RARITIES[r].weight, 0);
  let tier = tiers[tiers.length - 1];
  for (const r of tiers) {
    roll -= RARITIES[r].weight;
    if (roll < 0) {
      tier = r;
      break;
    }
  }
  const options = pool.filter((s) => s.rarity === tier);
  const def = options[Math.min(options.length - 1, Math.floor(rand() * options.length))];
  const isNew = !state.specimens[def.id];
  state.specimens[def.id] = (state.specimens[def.id] || 0) + 1;
  return { def, isNew };
}

export function findChance(state, source) {
  const base = source === 'glimmer' ? FIND_CHANCE_GLIMMER : FIND_CHANCE_TAP;
  return Math.min(1, base * (1 + 0.5 * veinLevel(state, 'lode')) * (dailyMod(state)?.luck || 1));
}

/** Call after a tap or a caught glimmer. Returns a find, or null most of the time. */
export function tryFind(state, source, rand = Math.random) {
  return rand() < findChance(state, source) ? rollSpecimen(state, rand) : null;
}

// ---------- Daily Geode ----------

const pad2 = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** The player's local calendar day, as YYYY-MM-DD. */
export function dayKey(now = Date.now()) {
  return keyOf(new Date(now));
}

export function previousDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d - 1));
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Set up today's Geode if the day has changed. Returns true when a new one was rolled. */
export function rollDaily(state, day = dayKey()) {
  if (state.daily && state.daily.day === day) return false;
  state.daily = null; // so the target below is not skewed by yesterday's modifier
  const h = hashString(`geode:${day}`);
  const mod = DAILY_MODS[h % DAILY_MODS.length];
  const goal = DAILY_GOALS[(h >>> 8) % DAILY_GOALS.length];
  const target = goal.amounts
    ? goal.amounts[(h >>> 16) % goal.amounts.length]
    : Math.max(500, Math.ceil(derive(state).steady * 3600 * goal.hours));
  state.daily = { day, mod: mod.id, goal: goal.id, target, progress: 0, claimed: false };
  return true;
}

function bumpDaily(state, goal, amount) {
  const d = state.daily;
  if (d && !d.claimed && d.goal === goal) d.progress = Math.min(d.target, d.progress + amount);
}

export function dailyReady(state) {
  const d = state.daily;
  return !!d && !d.claimed && d.progress >= d.target;
}

/** The streak as of `day`: it lapses if a day goes by without cracking the Geode. */
export function currentStreak(state, day = dayKey()) {
  return state.lastGeodeDay === day || state.lastGeodeDay === previousDay(day) ? state.streak : 0;
}

/** Claim today's Geode: a lump of shards (bigger on a streak) and a rare crystal. */
export function crackGeode(state, rand = Math.random) {
  if (!dailyReady(state)) return null;
  const { day } = state.daily;
  state.streak = state.lastGeodeDay === previousDay(day) ? state.streak + 1 : 1;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.lastGeodeDay = day;
  state.geodesCracked++;
  state.daily.claimed = true;
  const d = derive(state);
  const streakMult = 1 + 0.1 * Math.min(10, state.streak - 1);
  const shards = Math.max(d.steady * 7200, d.tapSteady * 250, 250) * streakMult;
  addShards(state, shards);
  return { shards, streak: state.streak, streakMult, find: rollSpecimen(state, rand) };
}

// ---------- Achievements ----------

/** Award anything newly earned. Returns the definitions that were just unlocked. */
export function checkAchievements(state, now = Date.now()) {
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.test(state)) {
      state.achievements[a.id] = now;
      earned.push(a);
    }
  }
  return earned;
}

// ---------- Cloud saves ----------

/** Positive when `a` is further along than `b`, negative when behind, 0 when level. */
export function compareProgress(a, b) {
  for (const k of ['heartsEarned', 'descents', 'prismsAllTime', 'allTimeShards']) {
    const diff = (a[k] || 0) - (b[k] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// ---------- Save / load ----------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[a-z0-9_-]{1,24}$/;
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

export function serialize(state) {
  return JSON.stringify({ ...state, v: SAVE_VERSION });
}

/** Rebuild a state from saved JSON, ignoring anything unknown or malformed. Throws on unparseable input. */
export function deserialize(json, now = Date.now()) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (!raw || typeof raw !== 'object') throw new Error('Not a save');
  const s = newState(now);
  const NUMBERS = [
    'shards', 'runShards', 'totalShards', 'taps', 'prisms', 'prismsEarned', 'shatters', 'glimmersCaught',
    'growthsBought', 'playSeconds', 'firstShatterSeconds', 'hearts', 'heartsEarned', 'descents',
    'streak', 'bestStreak', 'geodesCracked',
  ];
  for (const k of NUMBERS) s[k] = num(raw[k]);
  // Version 1 saves had a single cavern, so their lifetime totals are the cavern totals.
  s.allTimeShards = Math.max(num(raw.allTimeShards), s.totalShards);
  s.prismsAllTime = Math.max(num(raw.prismsAllTime), s.prismsEarned);
  for (const g of GENERATORS) {
    const n = Math.floor(num(raw.gens?.[g.id]));
    if (n > 0) s.gens[g.id] = n;
  }
  for (const u of UPGRADES) if (raw.upgrades?.[u.id]) s.upgrades[u.id] = true;
  for (const f of FACETS) {
    const lvl = Math.min(f.costs.length, Math.floor(num(raw.facets?.[f.id])));
    if (lvl > 0) s.facets[f.id] = lvl;
  }
  for (const v of VEINS) {
    const lvl = Math.min(v.costs.length, Math.floor(num(raw.veins?.[v.id])));
    if (lvl > 0) s.veins[v.id] = lvl;
  }
  for (const sp of SPECIMENS) {
    const n = Math.floor(num(raw.specimens?.[sp.id]));
    if (n > 0) s.specimens[sp.id] = n;
  }
  for (const a of ACHIEVEMENTS) {
    const at = raw.achievements?.[a.id];
    if (at) s.achievements[a.id] = num(at, now) || now;
  }
  const d = raw.daily;
  if (d && DAY_RE.test(d.day) && DAILY_MOD_BY_ID[d.mod] && DAILY_GOAL_BY_ID[d.goal] && num(d.target) > 0) {
    s.daily = { day: d.day, mod: d.mod, goal: d.goal, target: num(d.target), progress: Math.min(num(d.target), num(d.progress)), claimed: !!d.claimed };
  }
  s.lastGeodeDay = DAY_RE.test(raw.lastGeodeDay) ? raw.lastGeodeDay : '';
  s.glimmerIn = num(raw.glimmerIn, 50);
  s.lastSeen = Math.min(now, num(raw.lastSeen, now));
  s.createdAt = num(raw.createdAt, now);
  s.settings.sound = raw.settings?.sound !== false;
  const mode = raw.settings?.buyMode;
  s.settings.buyMode = mode === 10 || mode === 'max' ? mode : 1;
  const fps = raw.settings?.fps;
  s.settings.fps = fps === 30 || fps === 60 ? fps : 'auto';
  s.settings.haptics = raw.settings?.haptics !== false;
  s.settings.notify = raw.settings?.notify === true;
  s.settings.supporterCrystal = raw.settings?.supporterCrystal !== false;
  for (const k of ['music', 'skin', 'backdrop', 'tapFx', 'icon']) {
    const v = raw.settings?.[k];
    if (typeof v === 'string' && NAME_RE.test(v)) s.settings[k] = v;
  }
  return s;
}
