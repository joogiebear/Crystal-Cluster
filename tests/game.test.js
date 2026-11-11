import test from 'node:test';
import assert from 'node:assert/strict';

import { GENERATORS, GEN_BY_ID, UPGRADES, SPECIMENS, ACHIEVEMENTS, DAILY_MODS, DAILY_GOALS, LEADERBOARDS } from '../js/data.js';
import { COSMETICS, PRODUCTS, PRODUCT_BY_ID, chosen, isUnlocked } from '../js/cosmetics.js';
import { composeCluster } from '../js/scene.js';
import * as G from '../js/game.js';
import { fmt, fmtTime } from '../js/format.js';

test('fmt truncates and uses suffixes', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(999.9), '999');
  assert.equal(fmt(1000), '1.00K');
  assert.equal(fmt(1999), '1.99K');
  assert.equal(fmt(999999), '999K');
  assert.equal(fmt(1.5e6), '1.50M');
  assert.equal(fmt(2.5e33), '2.50Dc');
  assert.equal(fmt(1e40), '1.00e40');
  assert.equal(fmt(0.25, true), '0.2');
  assert.equal(fmtTime(3725), '1h 2m');
});

test('bulk cost matches buying one at a time', () => {
  const def = GEN_BY_ID.moss;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += def.baseCost * Math.pow(1.15, 5 + i);
  assert.ok(Math.abs(G.bulkCost(def, 5, 10) - sum) <= 1);
});

test('maxAffordable never overspends and is maximal', () => {
  const def = GEN_BY_ID.quartz;
  for (const shards of [0, 119, 120, 500, 1e4, 1e9]) {
    const n = G.maxAffordable(def, 3, shards);
    if (n > 0) assert.ok(G.bulkCost(def, 3, n) <= shards);
    assert.ok(G.bulkCost(def, 3, n + 1) > shards);
  }
});

test('tapping earns shards and builds resonance', () => {
  const s = G.newState(0);
  assert.equal(G.tap(s), 1);
  assert.equal(s.shards, 1);
  assert.ok(s.resonance > 0);
  const second = G.tap(s);
  assert.ok(second > 1, 'resonance makes later taps stronger');
});

test('buying growths produces income over time', () => {
  const s = G.newState(0);
  s.shards = 15;
  assert.equal(G.buyGenerator(s, 'moss'), 1);
  assert.equal(s.shards, 0);
  G.tick(s, 10);
  assert.ok(Math.abs(s.shards - 2) < 1e-9);
  assert.equal(G.buyGenerator(s, 'moss'), 0, 'cannot afford another');
});

test('milestones and upgrades multiply output', () => {
  const s = G.newState(0);
  s.gens.moss = 25;
  assert.equal(G.genMultiplier(s, GEN_BY_ID.moss), 2);
  s.upgrades.moss1 = true;
  assert.equal(G.genMultiplier(s, GEN_BY_ID.moss), 4);
});

test('upgrades appear when relevant and can be bought once', () => {
  const s = G.newState(0);
  assert.equal(G.visibleUpgrades(s).length, 0);
  s.gens.moss = 10;
  s.shards = 1e6;
  assert.ok(G.visibleUpgrades(s).some((u) => u.id === 'moss1'));
  assert.equal(G.buyUpgrade(s, 'moss1'), true);
  assert.equal(G.buyUpgrade(s, 'moss1'), false);
});

test('upgrade ids are unique', () => {
  assert.equal(new Set(UPGRADES.map((u) => u.id)).size, UPGRADES.length);
});

test('offline progress is capped and scaled', () => {
  const s = G.newState(0);
  s.gens.moss = 10; // 2 per second
  const report = G.applyOffline(s, 10 * 3600 * 1000);
  assert.equal(report.counted, 4 * 3600);
  assert.equal(report.capped, true);
  assert.ok(Math.abs(report.gain - 2 * 4 * 3600 * 0.5) < 1e-6);
  assert.equal(s.lastSeen, 10 * 3600 * 1000);
});

test('shatter grants prisms, resets the run and keeps facets', () => {
  const s = G.newState(0);
  G.addShards(s, 1e8);
  s.gens.moss = 50;
  s.upgrades.tap1 = true;
  assert.equal(G.prismGain(s), 10);
  assert.equal(G.shatter(s), 10);
  assert.equal(s.prisms, 10);
  assert.equal(s.shards, 0);
  assert.deepEqual(s.gens, {});
  assert.deepEqual(s.upgrades, {});
  assert.equal(G.prismGain(s), 0, 'no double dipping');
  assert.equal(G.prismMultiplier(s), 1.5);
  assert.equal(G.buyFacet(s, 'seed'), true);
  assert.equal(s.prisms, 9);
  G.addShards(s, 3e8);
  G.shatter(s);
  assert.equal(s.shards, 1000, 'seed stock applies');
});

test('glimmers always pay out something', () => {
  const s = G.newState(0);
  const r = G.catchGlimmer(s, () => 0.99);
  assert.equal(r.type, 'rain', 'falls back to shards when nothing is growing');
  s.gens.moss = 5;
  assert.equal(G.catchGlimmer(s, () => 0.5).type, 'radiance');
  assert.ok(G.derive(s).perSec > G.derive(s).steady);
  assert.equal(G.catchGlimmer(s, () => 0.9).type, 'edge');
});

test('save round-trips and tolerates junk', () => {
  const s = G.newState(1000);
  s.shards = 123.5;
  s.gens.geode = 7;
  s.upgrades.tap1 = true;
  s.facets.sleep = 2;
  s.settings.buyMode = 'max';
  const back = G.deserialize(G.serialize(s), 2000);
  assert.equal(back.shards, 123.5);
  assert.equal(back.gens.geode, 7);
  assert.equal(back.upgrades.tap1, true);
  assert.equal(back.facets.sleep, 2);
  assert.equal(back.settings.buyMode, 'max');

  const junk = G.deserialize('{"shards":"lots","gens":{"moss":-4,"nope":3},"facets":{"seed":99},"lastSeen":9e15}', 2000);
  assert.equal(junk.shards, 0);
  assert.deepEqual(junk.gens, {});
  assert.equal(junk.facets.seed, 5);
  assert.equal(junk.lastSeen, 2000);
  assert.throws(() => G.deserialize('not json'));
});

test('early game pacing: each growth pays for itself in a sane time', () => {
  for (const g of GENERATORS) {
    const payback = g.baseCost / g.baseProd;
    assert.ok(payback > 30 && payback < 1e6, `${g.name} payback ${payback}`);
  }
});

test('version 1 saves load with their progress intact', () => {
  const v1 = JSON.stringify({
    v: 1, shards: 5e6, runShards: 2e6, totalShards: 9e8, taps: 420, gens: { moss: 30, void: 2 }, upgrades: { tap1: true },
    prisms: 4, prismsEarned: 30, facets: { chime: 2 }, shatters: 3, glimmersCaught: 9, lastSeen: 1000, createdAt: 500,
    settings: { sound: false, buyMode: 10 },
  });
  const s = G.deserialize(v1, 2000);
  assert.equal(s.shards, 5e6);
  assert.equal(s.prismsEarned, 30);
  assert.equal(s.prismsAllTime, 30, 'lifetime prisms carried over');
  assert.equal(s.allTimeShards, 9e8, 'lifetime shards carried over');
  assert.equal(s.gens.void, 2);
  assert.equal(s.settings.sound, false);
  assert.equal(s.settings.haptics, true);
  assert.equal(s.settings.skin, 'classic');
  assert.equal(s.heartsEarned, 0);
  assert.equal(G.prismMultiplier(s), 2.5);
});

test('new growths are reachable and have carvings', () => {
  assert.equal(GENERATORS.length, 14);
  for (const g of GENERATORS) assert.equal(UPGRADES.filter((u) => u.gen === g.id).length, 3, g.name);
  for (let i = 1; i < GENERATORS.length; i++) assert.ok(GENERATORS[i].baseCost > GENERATORS[i - 1].baseCost);
});

test('descend trades the first layer for heartstones', () => {
  const s = G.newState(0);
  G.addShards(s, 1e12);
  assert.equal(G.heartGain(s), 0, 'prisms must be earned by shattering first');
  assert.equal(G.descend(s), 0);
  assert.equal(G.shatter(s), 1000);
  G.buyFacet(s, 'seed');
  s.specimens.rose = 1;
  s.achievements.tap100 = 1;
  s.gens.moss = 5;
  assert.equal(G.heartGain(s), 1);
  assert.equal(G.nextHeartAt(s), 4000);
  assert.equal(G.descend(s), 1);
  assert.equal(s.hearts, 1);
  assert.equal(s.descents, 1);
  assert.equal(s.prisms, 0);
  assert.equal(s.prismsEarned, 0);
  assert.equal(s.prismsAllTime, 1000);
  assert.equal(s.totalShards, 0);
  assert.equal(s.allTimeShards, 1e12);
  assert.deepEqual(s.facets, {});
  assert.deepEqual(s.gens, {});
  assert.equal(s.specimens.rose, 1, 'collection survives');
  assert.equal(s.achievements.tap100, 1, 'achievements survive');
  assert.equal(G.heartMultiplier(s), 3);
  assert.equal(G.prismGain(s), 0);

  assert.equal(G.buyVein(s, 'cache'), true);
  assert.equal(s.hearts, 0);
  assert.equal(G.buyVein(s, 'lens'), false, 'cannot afford');
  s.hearts = 1;
  G.buyVein(s, 'lens');
  G.addShards(s, 1e8);
  assert.equal(G.prismGain(s), 12, 'lens gives 25% more prisms');
  G.shatter(s);
  s.prismsEarned = 1000;
  G.descend(s);
  assert.equal(s.prisms, 10, 'prism cache applies');
});

test('permanent bonuses multiply together and reach taps', () => {
  const s = G.newState(0);
  s.heartsEarned = 1;
  s.specimens = { rose: 2, opal: 1 };
  s.achievements = { tap100: 1 };
  const want = 3 * 1.04 * 1.01;
  assert.ok(Math.abs(G.permanentMultiplier(s) - want) < 1e-9);
  assert.ok(Math.abs(G.tap(s) - want) < 1e-9);
});

test('rare crystals: rarity, depth gating and odds', () => {
  const s = G.newState(0);
  const seen = new Set();
  let seed = 12345;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let k = 0; k < 4000; k++) seen.add(G.rollSpecimen(s, rand).def.id);
  assert.ok(!seen.has('mountain') && !seen.has('fallen'), 'mythics need a descent');
  assert.equal(seen.size, SPECIMENS.length - 2);
  s.descents = 1;
  for (let k = 0; k < 20000; k++) seen.add(G.rollSpecimen(s, rand).def.id);
  assert.equal(seen.size, SPECIMENS.length);

  const fresh = G.newState(0);
  assert.equal(G.tryFind(fresh, 'tap', () => 0.9), null);
  const find = G.tryFind(fresh, 'tap', () => 0);
  assert.equal(find.isNew, true);
  assert.equal(fresh.specimens[find.def.id], 1);
  assert.equal(G.rollSpecimen(fresh, () => 0).isNew, false);
  fresh.veins.lode = 2;
  assert.ok(Math.abs(G.findChance(fresh, 'tap') - (G.FIND_CHANCE_TAP * 2)) < 1e-12);
});

test('daily geode: same for everyone on a day, tracks its goal, pays out once', () => {
  const a = G.newState(0);
  const b = G.newState(0);
  assert.equal(G.rollDaily(a, '2026-11-09'), true);
  assert.equal(G.rollDaily(a, '2026-11-09'), false);
  G.rollDaily(b, '2026-11-09');
  assert.deepEqual(a.daily, b.daily);
  assert.ok(G.dailyMod(a));

  // Every modifier and goal comes up over a couple of months.
  const mods = new Set();
  const goals = new Set();
  for (let d = 1; d <= 60; d++) {
    const s = G.newState(0);
    G.rollDaily(s, G.dayKey(new Date(2026, 0, d).getTime()));
    mods.add(s.daily.mod);
    goals.add(s.daily.goal);
    assert.ok(s.daily.target > 0);
  }
  assert.equal(mods.size, DAILY_MODS.length);
  assert.equal(goals.size, DAILY_GOALS.length);

  const s = G.newState(0);
  s.daily = { day: '2026-11-09', mod: 'keen', goal: 'taps', target: 3, progress: 0, claimed: false };
  assert.equal(G.tap(s), 3, 'Keen Day triples taps');
  assert.equal(G.crackGeode(s), null, 'not ready yet');
  G.tap(s);
  G.tap(s);
  assert.equal(G.dailyReady(s), true);
  const before = s.shards;
  const prize = G.crackGeode(s, () => 0);
  assert.ok(prize.shards >= 250);
  assert.equal(s.shards, before + prize.shards);
  assert.equal(prize.streak, 1);
  assert.equal(prize.find.isNew, true);
  assert.equal(s.geodesCracked, 1);
  assert.equal(G.crackGeode(s), null, 'only once a day');

  // Next day keeps the streak; skipping a day resets it.
  G.rollDaily(s, '2026-11-10');
  assert.equal(G.currentStreak(s, '2026-11-10'), 1);
  s.daily.progress = s.daily.target;
  assert.equal(G.crackGeode(s, () => 0).streak, 2);
  G.rollDaily(s, '2026-11-12');
  assert.equal(G.currentStreak(s, '2026-11-12'), 0);
  s.daily.progress = s.daily.target;
  assert.equal(G.crackGeode(s, () => 0).streak, 1);
  assert.equal(s.bestStreak, 2);
  assert.equal(G.previousDay('2026-03-01'), '2026-02-28');
});

test('daily modifiers change the right numbers', () => {
  const s = G.newState(0);
  s.gens.moss = 10;
  const base = G.derive(s);
  s.daily = { day: '2026-11-09', mod: 'heavy', goal: 'taps', target: 300, progress: 0, claimed: false };
  const heavy = G.derive(s);
  assert.ok(Math.abs(heavy.steady - base.steady * 2) < 1e-9);
  assert.ok(Math.abs(heavy.tapSteady - base.tapSteady * 0.5) < 1e-9);
  s.daily.mod = 'wisp';
  assert.equal(G.nextGlimmerDelay(s, () => 0), 35);
});

test('achievements are awarded once and are well formed', () => {
  const s = G.newState(0);
  assert.deepEqual(G.checkAchievements(s, 5), []);
  s.taps = 100;
  s.glimmersCaught = 1;
  const earned = G.checkAchievements(s, 5).map((a) => a.id);
  assert.deepEqual(earned.sort(), ['glim1', 'tap100']);
  assert.deepEqual(G.checkAchievements(s, 6), []);
  assert.equal(s.achievements.tap100, 5);
  assert.equal(G.achievementMultiplier(s), 1.02);

  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  assert.ok(ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0) <= 1000, 'Game Center allows 1000 points');
  for (const a of ACHIEVEMENTS) assert.ok(a.points > 0 && a.points <= 100 && a.name.length <= 30, a.id);
});

test('leaderboard scores appear only when there is something to submit', () => {
  const s = G.newState(0);
  for (const b of LEADERBOARDS) assert.equal(b.score(s), null, b.id);
  G.addShards(s, 4e6);
  G.tick(s, 90.4);
  G.shatter(s);
  const scores = Object.fromEntries(LEADERBOARDS.map((b) => [b.id, b.score(s)]));
  assert.equal(scores.prisms, 2);
  assert.equal(scores.first_shatter, 91);
  assert.equal(scores.geodes, null);
});

test('cloud saves: the further-along cluster wins the comparison', () => {
  const a = G.newState(0);
  const b = G.newState(0);
  assert.equal(G.compareProgress(a, b), 0);
  G.addShards(a, 100);
  assert.equal(G.compareProgress(a, b), 1);
  b.prismsAllTime = 1;
  assert.equal(G.compareProgress(a, b), -1);
  a.heartsEarned = 1;
  assert.equal(G.compareProgress(a, b), 1);
});

test('new progress and settings survive a save round trip', () => {
  const s = G.newState(1000);
  s.heartsEarned = 3;
  s.hearts = 2;
  s.descents = 2;
  s.veins = { lens: 2, cache: 99, bogus: 1 };
  s.specimens = { opal: 3, nope: 4 };
  s.achievements = { tap100: 1234, madeup: 1 };
  s.daily = { day: '2026-11-09', mod: 'keen', goal: 'taps', target: 300, progress: 12, claimed: false };
  s.lastGeodeDay = '2026-11-08';
  s.streak = 4;
  s.settings.skin = 'frost';
  s.settings.music = 'cavern';
  s.settings.notify = true;
  const back = G.deserialize(G.serialize(s), 2000);
  assert.equal(back.heartsEarned, 3);
  assert.deepEqual(back.veins, { lens: 2, cache: 3 });
  assert.deepEqual(back.specimens, { opal: 3 });
  assert.deepEqual(back.achievements, { tap100: 1234 });
  assert.deepEqual(back.daily, s.daily);
  assert.equal(back.streak, 4);
  assert.equal(back.settings.skin, 'frost');
  assert.equal(back.settings.notify, true);

  const junk = G.deserialize('{"daily":{"day":"today","mod":"keen","goal":"taps","target":5},"settings":{"skin":"<b>"},"lastGeodeDay":7}', 2000);
  assert.equal(junk.daily, null);
  assert.equal(junk.settings.skin, 'classic');
  assert.equal(junk.lastGeodeDay, '');
});

test('cosmetics: paid looks need their pack, earned looks need play, and nothing is pay-to-win', () => {
  const s = G.newState(0);
  const none = { has: () => false };
  const frost = { has: (id) => id === 'pack.frost' };
  s.settings.skin = 'frost';
  assert.equal(chosen('skin', s, none).id, 'classic', 'locked choice falls back');
  assert.equal(chosen('skin', s, frost).id, 'frost');
  s.settings.skin = 'moonlit';
  assert.equal(chosen('skin', s, none).id, 'classic');
  for (let i = 0; i < 8; i++) s.achievements[ACHIEVEMENTS[i].id] = 1;
  assert.equal(chosen('skin', s, none).id, 'moonlit');

  for (const [kind, list] of Object.entries(COSMETICS)) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, kind);
    assert.ok(isUnlocked(list[0], s, none), `${kind} default is free`);
    for (const item of list) if (item.product) assert.equal(PRODUCT_BY_ID[item.product].kind, 'pack', item.id);
  }
  for (const pack of PRODUCTS.filter((p) => p.kind === 'pack')) {
    assert.ok(Object.values(COSMETICS).flat().some((x) => x.product === pack.id), `${pack.name} unlocks something`);
  }

  // Buying everything changes no numbers.
  const all = { has: () => true };
  const rich = G.newState(0);
  rich.gens.moss = 10;
  const before = JSON.stringify(G.derive(rich));
  for (const kind of Object.keys(COSMETICS)) rich.settings[kind] = COSMETICS[kind].at(-1).id;
  for (const kind of Object.keys(COSMETICS)) chosen(kind, rich, all);
  assert.equal(JSON.stringify(G.derive(rich)), before);
});

test('skins recolour the cluster without changing its shape', () => {
  const gens = { moss: 30, quartz: 15, void: 5 };
  const plain = composeCluster(gens);
  for (const skin of COSMETICS.skin) {
    const skinned = composeCluster(gens, { skin: skin.id });
    assert.equal(skinned.length, plain.length, skin.id);
    skinned.forEach((c, i) => {
      assert.equal(c.len, plain[i].len);
      assert.ok(Number.isFinite(c.hue) && c.sat >= 0 && c.sat <= 100 && c.lig > 0 && c.lig < 100, `${skin.id} colour`);
    });
  }
  assert.equal(composeCluster(gens, { supporter: true }).length, plain.length + 1);
});

test('a short absence runs buffs and resonance down instead of wiping them', () => {
  const s = G.newState(0);
  s.buffs.radiance = 30;
  s.buffs.edge = 5;
  s.resonance = 1;
  G.applyOffline(s, 4000);
  assert.equal(s.buffs.radiance, 26);
  assert.equal(s.buffs.edge, 1);
  assert.ok(s.resonance > 0 && s.resonance < 1);
  G.applyOffline(s, 3600 * 1000);
  assert.deepEqual(s.buffs, { radiance: 0, edge: 0 });
  assert.equal(s.resonance, 0);
});

test('Seed Stock shards discover growths and carvings straight after a shatter', () => {
  const s = G.newState(0);
  s.totalShards = 1e8;
  s.prisms = 100;
  for (let i = 0; i < 4; i++) G.buyFacet(s, 'seed');
  G.shatter(s);
  assert.equal(s.shards, 1e6);
  assert.equal(G.generatorUnlocked(s, 4), true, 'Prism Loom (180K) is on offer');
  assert.ok(G.visibleUpgrades(s).some((u) => u.id === 'all1'));
});

test('every daily goal reads as a real number', () => {
  for (const goal of DAILY_GOALS) {
    const text = goal.text(12345, fmt);
    assert.match(text, /12\.3K/);
  }
});

test('the frame rate setting survives a save and rejects junk', () => {
  const s = G.newState(0);
  assert.equal(s.settings.fps, 'auto');
  s.settings.fps = 30;
  assert.equal(G.deserialize(G.serialize(s)).settings.fps, 30);
  s.settings.fps = 60;
  assert.equal(G.deserialize(G.serialize(s)).settings.fps, 60);
  assert.equal(G.deserialize('{"settings":{"fps":240}}').settings.fps, 'auto');
});
