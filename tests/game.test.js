import test from 'node:test';
import assert from 'node:assert/strict';

import { GENERATORS, GEN_BY_ID, UPGRADES } from '../js/data.js';
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
    assert.ok(payback > 30 && payback < 30000, `${g.name} payback ${payback}`);
  }
});
