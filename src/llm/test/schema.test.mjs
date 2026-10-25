import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndClamp } from '../schema.js';
import { heuristicProposal } from '../heuristic.js';
import { scenario, baseline, assumptions, rawResponse } from './fixtures.mjs';

const bs = scenario.baselineSetup;
const mk = (over) => ({ ...rawResponse, nodes: rawResponse.nodes.map((n) => (n.id === 'n4' ? { ...n, ...over } : n)) });
const n4 = (r) => r.setup.nodes.n4;

test('fixture response passes with no clamp notes', () => {
  const r = validateAndClamp(rawResponse, scenario, bs, assumptions);
  assert.equal(r.ok, true);
  assert.deepEqual(r.clampNotes, []);
  assert.equal(r.setup.sortingMethod, 'manual_float');
});

test('interval 0 -> 1, 40 -> 14', () => {
  let r = validateAndClamp(mk({ pickupIntervalDays: 0 }), scenario, bs, assumptions);
  assert.equal(n4(r).pickupIntervalDays, 1);
  assert.deepEqual(r.clampNotes, ['n4.pickupIntervalDays 0 -> 1']);
  r = validateAndClamp(mk({ pickupIntervalDays: 40 }), scenario, bs, assumptions);
  assert.equal(n4(r).pickupIntervalDays, 14);
});

test('binCount 9 -> 6, rounding, capacity snap', () => {
  assert.equal(n4(validateAndClamp(mk({ binCount: 9 }), scenario, bs, assumptions)).binCount, 6);
  assert.equal(n4(validateAndClamp(mk({ binCount: 2.6 }), scenario, bs, assumptions)).binCount, 3);
  const r = validateAndClamp(mk({ binCapacityL: 200 }), scenario, bs, assumptions);
  assert.equal(n4(r).binCapacityL, 240);
  assert.ok(r.clampNotes.includes('n4.binCapacityL 200 -> 240'));
});

test('unknown enums fall back to baseline with notes', () => {
  const raw = { ...mk({ binType: 'weird' }), sortingMethod: 'laser' };
  const r = validateAndClamp(raw, scenario, bs, assumptions);
  assert.equal(n4(r).binType, bs.nodes.n4.binType);
  assert.equal(r.setup.sortingMethod, bs.sortingMethod);
  assert.equal(r.clampNotes.length, 2);
});

test('missing node keeps baseline, extra node ignored, missing rationale defaulted', () => {
  const raw = { ...rawResponse, nodes: [...rawResponse.nodes.filter((n) => n.id !== 'n3').map((n) => (n.id === 'n1' ? { ...n, rationale: undefined } : n)), { id: 'n99', binType: 'single', binCount: 1, binCapacityL: 120, pickupIntervalDays: 1 }] };
  const r = validateAndClamp(raw, scenario, bs, assumptions);
  assert.deepEqual(r.setup.nodes.n3, bs.nodes.n3);
  assert.equal(r.clampNotes.length, 1);
  assert.equal(r.setup.nodes.n99, undefined);
  assert.equal(r.rationales.n1, '(no rationale given)');
  assert.equal(Object.keys(r.setup.nodes).length, scenario.nodes.length);
});

test('garbage gives ok false', () => {
  for (const g of ['not json', null, 42, [], { nodes: 'x' }, {}]) {
    const r = validateAndClamp(g, scenario, bs, assumptions);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  }
});

test('heuristic passes validateAndClamp with zero clamp notes and fits the budget', () => {
  const p = heuristicProposal(scenario, bs, baseline, assumptions);
  assert.equal(p.source, 'heuristic');
  assert.deepEqual(p.clampNotes, []);
  const raw = { nodes: scenario.nodes.map((n) => ({ id: n.id, ...p.setup.nodes[n.id] })), sortingMethod: p.setup.sortingMethod };
  const v = validateAndClamp(raw, scenario, bs, assumptions);
  assert.equal(v.ok, true);
  assert.deepEqual(v.clampNotes, []);
  assert.deepEqual(v.setup, p.setup);
  // hand check: n9 (1.5 kg/day hdpe, 0.05 kg/L) at 7 d needs 1.5*7*1.15/0.05/0.8 = 302.25 L -> smallest total >= 302: 3x120 = 360 L
  assert.equal(p.setup.nodes.n9.pickupIntervalDays, 7);
  assert.equal(p.setup.nodes.n9.binCount * p.setup.nodes.n9.binCapacityL, 360);
  assert.equal(p.setup.nodes.n9.binCount, 3);
  for (const n of scenario.nodes) {
    const s = p.setup.nodes[n.id];
    const capKg = s.binCount * s.binCapacityL * assumptions.bins.bulkDensityKgPerL.value[n.wasteType];
    assert.ok((n.rateKgPerDay * s.pickupIntervalDays * 1.15) / capKg <= 0.85 + 1e-9, n.id);
    if (assumptions.contamination.baseFraction.value[n.wasteType] >= 0.2) assert.equal(s.binType, 'segregated', n.id);
  }
});

test('sizing: 2 kg/day PET at a 2-day interval gets exactly 1x240 L (needs ~192 L)', () => {
  const sc = structuredClone(scenario);
  sc.nodes.find((n) => n.id === 'n2').rateKgPerDay = 2;
  const setup = structuredClone(sc.baselineSetup);
  setup.nodes.n2.pickupIntervalDays = 2;
  const p = heuristicProposal(sc, setup, baseline, assumptions);
  const n2 = p.setup.nodes.n2;
  assert.deepEqual([n2.binCount, n2.binCapacityL, n2.pickupIntervalDays], [1, 240, 2]);
  assert.match(p.rationales.n2, /~192 L -> 1x240 L/);
});

test('heuristic never oversizes: no smaller total capacity would satisfy the need', () => {
  const p = heuristicProposal(scenario, scenario.baselineSetup, baseline, assumptions);
  const caps = assumptions.bins.allowedCapacitiesL.value;
  for (const n of scenario.nodes) {
    const s = p.setup.nodes[n.id];
    const need = (n.rateKgPerDay * s.pickupIntervalDays * 1.15) / assumptions.bins.bulkDensityKgPerL.value[n.wasteType] / 0.8;
    const total = s.binCount * s.binCapacityL;
    assert.ok(total >= need, n.id);
    for (let c = 1; c <= 6; c++) for (const cap of caps) if (c * cap >= need) assert.ok(c * cap >= total, `${n.id} ${c}x${cap}`);
  }
});
