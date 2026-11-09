// Static game data: growths (generators), carvings (upgrades) and facets (prestige perks).

export const COST_GROWTH = 1.15;

/** Owning this many of a growth doubles its output each time. */
export const MILESTONES = [25, 50, 100, 150, 200, 250, 300, 400, 500];

export const GENERATORS = [
  { id: 'moss', name: 'Glow Moss', desc: 'Soft lichen that sheds glittering dust.', baseCost: 15, baseProd: 0.2, hue: 150, sat: 70, lig: 58 },
  { id: 'quartz', name: 'Quartz Bud', desc: 'A clear little bud, humming quietly.', baseCost: 120, baseProd: 1.5, hue: 195, sat: 75, lig: 68 },
  { id: 'amethyst', name: 'Amethyst Spire', desc: 'Violet spires that reach for the dark.', baseCost: 1300, baseProd: 10, hue: 272, sat: 72, lig: 60 },
  { id: 'geode', name: 'Geode Nest', desc: 'Crack one open and more spill out.', baseCost: 15000, baseProd: 62, hue: 325, sat: 78, lig: 62 },
  { id: 'loom', name: 'Prism Loom', desc: 'Weaves stray light into solid shards.', baseCost: 180000, baseProd: 390, hue: 44, sat: 92, lig: 62 },
  { id: 'aurora', name: 'Aurora Vein', desc: 'A ribbon of sky caught in stone.', baseCost: 2.4e6, baseProd: 2500, hue: 168, sat: 88, lig: 56 },
  { id: 'star', name: 'Star Seed', desc: 'Planted at dusk, blazing by dawn.', baseCost: 3.5e7, baseProd: 17000, hue: 215, sat: 92, lig: 64 },
  { id: 'moon', name: 'Moon Lattice', desc: 'Cold, pale and perfectly ordered.', baseCost: 5.5e8, baseProd: 120000, hue: 238, sat: 45, lig: 80 },
  { id: 'heart', name: 'Cluster Heart', desc: 'It beats. Everything grows in time.', baseCost: 9e9, baseProd: 880000, hue: 352, sat: 85, lig: 60 },
  { id: 'void', name: 'Singing Void', desc: 'A hollow note that crystallises space.', baseCost: 1.6e11, baseProd: 7e6, hue: 292, sat: 95, lig: 48 },
];

export const GEN_BY_ID = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));

const GEN_UPGRADE_NAMES = {
  moss: ['Dewy Spores', 'Lantern Lichen', 'Evergleam'],
  quartz: ['Clear Cut', 'Twin Points', 'Flawless Lattice'],
  amethyst: ['Deep Violet', 'Royal Spires', 'Dusk Crown'],
  geode: ['Thin Shells', 'Nested Nests', 'Bottomless Hollow'],
  loom: ['Finer Thread', 'Rainbow Warp', 'Loom of Dawn'],
  aurora: ['Bright Ribbon', 'Polar Drift', 'Midnight Sun'],
  star: ['Rich Soil', 'Binary Bloom', 'Supernova Garden'],
  moon: ['Waxing Grid', 'Tidal Order', 'Eclipse Frame'],
  heart: ['Steady Pulse', 'Second Chamber', 'Undying Beat'],
  void: ['Low Hum', 'Perfect Fifth', 'Endless Chord'],
};

// Each growth has three carvings: [owned needed, cost multiplier, output multiplier].
const GEN_UPGRADE_TIERS = [
  [10, 12, 2],
  [40, 800, 2],
  [80, 50000, 3],
];

function genUpgrades() {
  const out = [];
  for (const g of GENERATORS) {
    GEN_UPGRADE_TIERS.forEach(([reqOwned, costMult, mult], i) => {
      out.push({
        id: `${g.id}${i + 1}`,
        kind: 'gen',
        gen: g.id,
        name: GEN_UPGRADE_NAMES[g.id][i],
        desc: `${g.name} output ×${mult}`,
        cost: g.baseCost * costMult,
        mult,
        reqOwned,
      });
    });
  }
  return out;
}

export const UPGRADES = [
  // Tap strength
  { id: 'tap1', kind: 'tap', name: 'Steady Hands', desc: 'Taps are worth ×2', cost: 100, mult: 2 },
  { id: 'tap2', kind: 'tap', name: 'Tuning Fork', desc: 'Taps are worth ×2', cost: 2500, mult: 2 },
  { id: 'tap3', kind: 'tapPct', name: 'Echo Chisel', desc: 'Each tap also gives 2% of your shards per second', cost: 40000, pct: 0.02 },
  { id: 'tap4', kind: 'tap', name: 'Diamond Tip', desc: 'Taps are worth ×3', cost: 1e6, mult: 3 },
  { id: 'tap5', kind: 'tapPct', name: 'Sympathetic Strike', desc: 'Each tap gives a further 3% of your shards per second', cost: 5e7, pct: 0.03 },
  { id: 'tap6', kind: 'tap', name: 'Starlit Knuckles', desc: 'Taps are worth ×5', cost: 5e9, mult: 5 },
  { id: 'tap7', kind: 'tapPct', name: 'Chorus Strike', desc: 'Each tap gives a further 5% of your shards per second', cost: 1e12, pct: 0.05 },
  // Whole-cluster boosts
  { id: 'all1', kind: 'global', name: 'Harmonic Hum', desc: 'All growths produce ×1.5', cost: 5e4, mult: 1.5 },
  { id: 'all2', kind: 'global', name: 'Cavern Choir', desc: 'All growths produce ×1.5', cost: 5e6, mult: 1.5 },
  { id: 'all3', kind: 'global', name: 'Lattice Accord', desc: 'All growths produce ×2', cost: 1e9, mult: 2 },
  { id: 'all4', kind: 'global', name: 'Deep Resonance', desc: 'All growths produce ×2', cost: 1e12, mult: 2 },
  { id: 'all5', kind: 'global', name: 'One Great Crystal', desc: 'All growths produce ×2', cost: 1e15, mult: 2 },
  // Mechanics
  { id: 'res1', kind: 'resonance', name: 'Clear Tone', desc: 'Full resonance boosts growths by +100% instead of +50%', cost: 2.5e5 },
  { id: 'wisp1', kind: 'glimmer', name: 'Wisp Lantern', desc: 'Glimmers give twice as much and last twice as long', cost: 1e7 },
  ...genUpgrades(),
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Permanent perks bought with Prisms. `costs[level]` is the price of the next level. */
export const FACETS = [
  { id: 'seed', name: 'Seed Stock', costs: [1, 3, 8, 20, 50], desc: (l) => `Start each cluster with ${['1K', '10K', '100K', '1M', '10M'][Math.min(l, 4)]} shards` },
  { id: 'sustain', name: 'Long Sustain', costs: [1, 3, 6, 12, 25], desc: () => 'Resonance fades 15% slower per level' },
  { id: 'sleep', name: 'Deep Slumber', costs: [2, 4, 8, 16, 32], desc: () => 'Away time: +2 hours and +10% efficiency per level' },
  { id: 'sense', name: 'Wisp Whisper', costs: [2, 5, 10, 20, 40], desc: () => 'Glimmers arrive 15% sooner per level' },
  { id: 'chime', name: 'Wind Chime', costs: [3, 8, 20, 45, 100], desc: () => 'Taps the cluster for you once per second per level' },
  { id: 'core', name: 'Prismatic Core', costs: [10, 30, 90, 270, 800], desc: () => 'Every Prism you have ever earned gives +1% more per level' },
];

export const FACET_BY_ID = Object.fromEntries(FACETS.map((f) => [f.id, f]));

export const SEED_AMOUNTS = [0, 1e3, 1e4, 1e5, 1e6, 1e7];
