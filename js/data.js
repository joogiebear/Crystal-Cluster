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
  { id: 'comet', name: 'Comet Root', desc: 'Ice from far away, taking hold.', baseCost: 3e12, baseProd: 6e7, hue: 185, sat: 85, lig: 72 },
  { id: 'nebula', name: 'Nebula Bloom', desc: 'A cloud of colour that never settles.', baseCost: 6e13, baseProd: 5.2e8, hue: 312, sat: 82, lig: 66 },
  { id: 'chrono', name: 'Time Crystal', desc: 'It finished growing before you planted it.', baseCost: 1.3e15, baseProd: 4.6e9, hue: 78, sat: 80, lig: 62 },
  { id: 'dawn', name: 'First Light', desc: 'The oldest glow there is, still arriving.', baseCost: 3e16, baseProd: 4.2e10, hue: 28, sat: 96, lig: 66 },
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
  comet: ['Longer Tail', 'Frozen Orbit', 'Return Visit'],
  nebula: ['Stellar Nursery', 'Pillars of Colour', 'Veil Unfolding'],
  chrono: ['Borrowed Minute', 'Closed Loop', 'Yesterday Again'],
  dawn: ['Pale Horizon', 'Golden Hour', 'Endless Morning'],
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

/** Permanent perks bought with Heartstones. They survive a Descent. */
export const VEINS = [
  { id: 'lens', name: 'Prism Lens', costs: [1, 2, 4, 8, 16], desc: () => 'Every Shatter gives 25% more Prisms per level' },
  { id: 'cache', name: 'Prism Cache', costs: [1, 3, 6], desc: (l) => `Start each Descent with ${[10, 40, 150][Math.min(l, 2)]} Prisms to spend` },
  { id: 'echo', name: 'Echoing Depths', costs: [2, 4, 8], desc: () => 'Shard Rain from Glimmers is worth +100% per level' },
  { id: 'lode', name: 'Rich Lode', costs: [1, 3, 6], desc: () => 'Rare crystals turn up 50% more often per level' },
];

export const VEIN_BY_ID = Object.fromEntries(VEINS.map((v) => [v.id, v]));

export const CACHE_AMOUNTS = [0, 10, 40, 150];

// ---------- Collection book ----------

export const RARITIES = {
  common: { name: 'Common', weight: 60 },
  uncommon: { name: 'Uncommon', weight: 28 },
  rare: { name: 'Rare', weight: 10 },
  mythic: { name: 'Mythic', weight: 2 },
};

/** Rare crystals that turn up now and then. `depth` is the Descents needed before one can appear. */
export const SPECIMENS = [
  { id: 'rose', name: 'Rose Quartz', rarity: 'common', hue: 340, sat: 70, lig: 80, note: 'Warm to hold, even down here.' },
  { id: 'smoky', name: 'Smoky Quartz', rarity: 'common', hue: 30, sat: 22, lig: 42, note: 'Looks like bottled woodsmoke.' },
  { id: 'citrine', name: 'Citrine', rarity: 'common', hue: 46, sat: 92, lig: 62, note: 'A drop of afternoon.' },
  { id: 'fluorite', name: 'Fluorite', rarity: 'common', hue: 160, sat: 62, lig: 62, note: 'Green at one end, violet at the other.' },
  { id: 'malachite', name: 'Malachite', rarity: 'common', hue: 150, sat: 82, lig: 36, note: 'Banded like a tiny green planet.' },
  { id: 'azurite', name: 'Azurite', rarity: 'common', hue: 222, sat: 86, lig: 48, note: 'Bluer than the sky has any right to be.' },
  { id: 'pyrite', name: 'Pyrite Sun', rarity: 'common', hue: 50, sat: 60, lig: 56, note: 'Not gold. Still wonderful.' },
  { id: 'selenite', name: 'Selenite Wand', rarity: 'common', hue: 210, sat: 18, lig: 90, note: 'Moonlight, more or less solid.' },
  { id: 'tiger', name: "Tiger's Eye", rarity: 'uncommon', hue: 32, sat: 86, lig: 48, note: 'It follows you around the cavern.' },
  { id: 'labradorite', name: 'Labradorite', rarity: 'uncommon', hue: 200, sat: 50, lig: 52, note: 'Dull until it catches the light just so.' },
  { id: 'moonstone', name: 'Moonstone', rarity: 'uncommon', hue: 228, sat: 38, lig: 84, note: 'A soft glow floats under the surface.' },
  { id: 'rhodo', name: 'Rhodochrosite', rarity: 'uncommon', hue: 352, sat: 78, lig: 64, note: 'Pink ripples, like a sliced sunrise.' },
  { id: 'celestite', name: 'Celestite', rarity: 'uncommon', hue: 204, sat: 60, lig: 78, note: 'Pale blue and very calm.' },
  { id: 'bismuth', name: 'Bismuth Stair', rarity: 'uncommon', hue: 285, sat: 80, lig: 62, note: 'Square steps in every colour at once.' },
  { id: 'opal', name: 'Black Opal', rarity: 'rare', hue: 262, sat: 90, lig: 34, note: 'A night sky with the fireworks left in.' },
  { id: 'alexandrite', name: 'Alexandrite', rarity: 'rare', hue: 168, sat: 76, lig: 44, note: 'Green by day, red by lamplight.' },
  { id: 'paraiba', name: 'Paraiba Tourmaline', rarity: 'rare', hue: 178, sat: 100, lig: 58, note: 'Glows like a swimming pool at night.' },
  { id: 'benitoite', name: 'Benitoite', rarity: 'rare', hue: 232, sat: 96, lig: 60, note: 'Rarer than diamond and twice as blue.' },
  { id: 'mountain', name: 'Heart of the Mountain', rarity: 'mythic', depth: 1, hue: 358, sat: 92, lig: 54, note: 'It was beating before the cavern formed.' },
  { id: 'fallen', name: 'Fallen Star', rarity: 'mythic', depth: 1, hue: 52, sat: 100, lig: 74, note: 'Still warm from the trip down.' },
];

export const SPECIMEN_BY_ID = Object.fromEntries(SPECIMENS.map((s) => [s.id, s]));

// ---------- Daily Geode ----------

/** One of these is in effect all day. Mostly a gift, sometimes a trade. */
export const DAILY_MODS = [
  { id: 'bright', name: 'Bright Day', desc: 'Growths produce ×1.5 today', growth: 1.5 },
  { id: 'keen', name: 'Keen Day', desc: 'Taps are worth ×3 today', tap: 3 },
  { id: 'wisp', name: 'Wisp Storm', desc: 'Glimmers arrive twice as often today', glimmer: 0.5 },
  { id: 'echo', name: 'Long Echo', desc: 'Resonance fades half as fast today', decay: 0.5 },
  { id: 'lucky', name: 'Lucky Seam', desc: 'Rare crystals turn up three times as often today', luck: 3 },
  { id: 'heavy', name: 'Heavy Air', desc: 'Growths produce ×2 today, but taps are worth half', growth: 2, tap: 0.5 },
];

export const DAILY_MOD_BY_ID = Object.fromEntries(DAILY_MODS.map((m) => [m.id, m]));

/** What cracks the Geode. `amounts` are picked from by the day's seed; `hours` scales to the player's own rate. */
export const DAILY_GOALS = [
  { id: 'taps', amounts: [300, 500, 800], text: (n) => `Tap the cluster ${n} times` },
  { id: 'glimmers', amounts: [3, 4, 6], text: (n) => `Catch ${n} Glimmers` },
  { id: 'growths', amounts: [40, 80, 120], text: (n) => `Plant ${n} growths` },
  { id: 'shards', hours: 1, text: (n, fmt) => `Earn ${fmt(n)} shards` },
];

export const DAILY_GOAL_BY_ID = Object.fromEntries(DAILY_GOALS.map((g) => [g.id, g]));

// ---------- Achievements ----------

const totalOwned = (s) => Object.values(s.gens).reduce((a, b) => a + b, 0);
const kindsOwned = (s) => Object.values(s.gens).filter((n) => n > 0).length;
const mostOwned = (s) => Math.max(0, ...Object.values(s.gens));
const found = (s) => Object.keys(s.specimens).length;

/**
 * Each achievement gives a small permanent bonus and is mirrored to Game Center in the iOS app.
 * `points` are Game Center points (they must total 1000 or less). Ids are permanent: once an
 * achievement is live in App Store Connect its id cannot change.
 */
export const ACHIEVEMENTS = [
  { id: 'tap100', name: 'First Chips', desc: 'Tap the cluster 100 times', points: 10, hue: 190, test: (s) => s.taps >= 100 },
  { id: 'tap5k', name: 'Steady Rhythm', desc: 'Tap the cluster 5,000 times', points: 25, hue: 190, test: (s) => s.taps >= 5000 },
  { id: 'tap50k', name: 'Tireless Hands', desc: 'Tap the cluster 50,000 times', points: 50, hue: 190, test: (s) => s.taps >= 50000 },
  { id: 'kinds5', name: 'Mixed Bed', desc: 'Grow 5 different kinds of growth at once', points: 15, hue: 150, test: (s) => kindsOwned(s) >= 5 },
  { id: 'kinds10', name: 'Full Chorus', desc: 'Grow 10 different kinds of growth at once', points: 30, hue: 150, test: (s) => kindsOwned(s) >= 10 },
  { id: 'kinds14', name: 'Nothing Left to Plant', desc: 'Grow every kind of growth at once', points: 50, hue: 150, test: (s) => kindsOwned(s) >= GENERATORS.length },
  { id: 'own100', name: 'Century', desc: 'Own 100 of a single growth', points: 25, hue: 272, test: (s) => mostOwned(s) >= 100 },
  { id: 'shards1m', name: 'Glittering', desc: 'Earn a million shards in total', points: 10, hue: 44, test: (s) => s.allTimeShards >= 1e6 },
  { id: 'shards1t', name: 'Dazzling', desc: 'Earn a trillion shards in total', points: 30, hue: 44, test: (s) => s.allTimeShards >= 1e12 },
  { id: 'shards1qi', name: 'Blinding', desc: 'Earn a quintillion shards in total', points: 50, hue: 44, test: (s) => s.allTimeShards >= 1e18 },
  { id: 'glim1', name: 'Wisp Catcher', desc: 'Catch a Glimmer', points: 10, hue: 48, test: (s) => s.glimmersCaught >= 1 },
  { id: 'glim50', name: 'Wisp Whisperer', desc: 'Catch 50 Glimmers', points: 30, hue: 48, test: (s) => s.glimmersCaught >= 50 },
  { id: 'shatter1', name: 'Clean Break', desc: 'Shatter the cluster', points: 20, hue: 325, test: (s) => s.shatters >= 1 },
  { id: 'shatter10', name: 'Practised Breaker', desc: 'Shatter the cluster 10 times', points: 40, hue: 325, test: (s) => s.shatters >= 10 },
  { id: 'prism100', name: 'Prismatic', desc: 'Earn 100 Prisms in total', points: 30, hue: 300, test: (s) => s.prismsAllTime >= 100 },
  { id: 'prism10k', name: 'Spectrum', desc: 'Earn 10,000 Prisms in total', points: 60, hue: 300, test: (s) => s.prismsAllTime >= 10000 },
  { id: 'facetmax', name: 'Flawless Facet', desc: 'Raise any Facet to its highest level', points: 30, hue: 215, test: (s) => FACETS.some((f) => (s.facets[f.id] || 0) >= f.costs.length) },
  { id: 'descend1', name: 'Into the Deep', desc: 'Descend to a deeper cavern', points: 60, hue: 238, test: (s) => s.descents >= 1 },
  { id: 'descend5', name: 'Five Fathoms', desc: 'Descend 5 times', points: 80, hue: 238, test: (s) => s.descents >= 5 },
  { id: 'find1', name: 'Curious Find', desc: 'Find a rare crystal', points: 10, hue: 168, test: (s) => found(s) >= 1 },
  { id: 'find12', name: 'Collector', desc: 'Find 12 different rare crystals', points: 40, hue: 168, test: (s) => found(s) >= 12 },
  { id: 'findall', name: 'Curator', desc: 'Complete the collection book', points: 80, hue: 168, test: (s) => found(s) >= SPECIMENS.length },
  { id: 'geode1', name: 'Daily Crack', desc: 'Crack a Daily Geode', points: 10, hue: 20, test: (s) => s.geodesCracked >= 1 },
  { id: 'geode7', name: 'Seven Seams', desc: 'Crack the Daily Geode 7 days in a row', points: 40, hue: 20, test: (s) => s.bestStreak >= 7 },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Game Center leaderboards. `score(state)` returns a whole number, or null when there is nothing to submit yet. */
export const LEADERBOARDS = [
  { id: 'prisms', name: 'Most Prisms', desc: 'Prisms earned across every cluster', format: 'Integer, high to low', score: (s) => (s.prismsAllTime > 0 ? Math.floor(s.prismsAllTime) : null) },
  { id: 'first_shatter', name: 'Fastest First Shatter', desc: 'Play time before your first Shatter', format: 'Elapsed time to the second, low to high', score: (s) => (s.firstShatterSeconds > 0 ? Math.ceil(s.firstShatterSeconds) : null) },
  { id: 'geodes', name: 'Geodes Cracked', desc: 'Daily Geodes cracked', format: 'Integer, high to low', score: (s) => (s.geodesCracked > 0 ? s.geodesCracked : null) },
];
