import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../store.js';
import { normaliseScenario, csvToNodes, nextNodeId, parseCsvRows } from '../scenario-utils.js';

const J = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const assumptions = J('../../../config/assumptions.json');
const ui = J('../../../config/ui.json');
const demo = J('../../../fixtures/scenario.demo.json');

test('store merges shallowly and notifies synchronously', () => {
  const s = createStore({ a: 1, b: 2 });
  const seen = [];
  const off = s.subscribe((st, prev) => seen.push([st.a, prev.a]));
  s.set({ a: 5 });
  assert.deepEqual(s.get(), { a: 5, b: 2 });
  assert.deepEqual(seen, [[5, 1]]);
  off();
  s.set({ a: 6 });
  assert.equal(seen.length, 1);
});

test('normaliseScenario is idempotent on a complete scenario (export/import deep-equal)', () => {
  const once = normaliseScenario(demo, assumptions);
  assert.deepEqual(once, { ...demo, assumptionOverrides: {} });
  assert.deepEqual(normaliseScenario(once, assumptions), once);
});

test('normaliseScenario rejects garbage', () => {
  assert.throws(() => normaliseScenario({}, assumptions));
  assert.throws(() => normaliseScenario(null, assumptions));
});

test('nextNodeId picks lowest free id and stops at 10', () => {
  assert.equal(nextNodeId([{ id: 'n1' }, { id: 'n3' }]), 'n2');
  assert.equal(nextNodeId(Array.from({ length: 10 }, (_, i) => ({ id: `n${i + 1}` }))), null);
});

test('CSV template imports; positions optional', () => {
  const text = readFileSync(new URL('../../../data/nodes.template.csv', import.meta.url), 'utf8');
  const { nodes, nodeSetups, warnings } = csvToNodes(text, assumptions, Object.keys(ui.wasteTypeLabels));
  assert.ok(nodes.length >= 1 && nodes.length <= 10);
  assert.equal(nodes[0].id, 'n1');
  assert.equal(nodes[0].name, 'Main canteen');
  assert.deepEqual(nodes[0].peak, { startHour: 12, endHour: 14, multiplier: 3 });
  assert.equal(nodes[0].x, null);
  assert.equal(nodeSetups.n1.binCapacityL, 120);
  assert.deepEqual(warnings, []);
});

test('CSV quoting and capacity snapping', () => {
  assert.deepEqual(parseCsvRows('a,"b,c"\n1,"x ""y"""\n'), [['a', 'b,c'], ['1', 'x "y"']]);
  const { nodes, nodeSetups, warnings } = csvToNodes('name,waste_type,bin_capacity_l,x,y\n"A, B",pp,200,10,20\n', assumptions, Object.keys(ui.wasteTypeLabels));
  assert.equal(nodes[0].name, 'A, B');
  assert.equal(nodes[0].x, 10);
  assert.equal(nodeSetups.n1.binCapacityL, 240);
  assert.equal(warnings.length, 1);
});
