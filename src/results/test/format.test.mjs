import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { METRICS, deltaFor, budgetStatus, parseRationales, setupChanges, sweepWins, formatMetric } from '../format.js';

const j = (p) => JSON.parse(readFileSync(new URL('../../../fixtures/' + p, import.meta.url), 'utf8'));
const M = Object.fromEntries(METRICS.map((m) => [m.key, m]));

test('overflow 96 -> 4 is a good down arrow of 96%', () => {
  const d = deltaFor(M.overflow, 96, 4);
  assert.equal(d.dir, 'down');
  assert.equal(d.tone, 'good');
  assert.equal(Math.round(d.pct * 100), 96);
});

test('recovery up good, cost up bad, equal flat', () => {
  assert.equal(deltaFor(M.recovery, 28.5, 52.5).tone, 'good');
  assert.equal(deltaFor(M.cost, 100, 120).tone, 'bad');
  assert.equal(deltaFor(M.km, 26.6, 26.6).dir, 'flat');
  assert.equal(deltaFor(M.purity, 0, 5).pct, null);
});

test('budget status', () => {
  assert.equal(budgetStatus(29016, 35378, 0.25).within, true);
  assert.equal(budgetStatus(29016, 35378, 0.25).text, 'Within budget +22%');
  assert.equal(budgetStatus(100, 130, 0.25).within, false);
});

test('parseRationales finds only complete strings, attaches ids', () => {
  const raw = '{"nodes":[{"id":"n1","binCount":3,"rationale":"Lunch \\"spike\\"."},{"id":"n2","rationale":"Bottles are bu';
  const r = parseRationales(raw);
  assert.deepEqual(r, [{ key: 'n1', text: 'Lunch "spike".' }]);
  const all = parseRationales(j('proposal.json').raw);
  assert.equal(all.length, 11);
  assert.equal(all[10].key, 'sorting');
});

test('fixture: summary metrics and diff', () => {
  const b = j('results.baseline.json').summary;
  const o = j('results.optimised.json').summary;
  assert.equal(formatMetric(M.overflow, M.overflow.get(b)), '162');
  assert.equal(deltaFor(M.overflow, b.overflowBinDays, o.overflowBinDays).tone, 'good');
  const s = j('scenario.demo.json');
  const p = j('proposal.json');
  const ch = setupChanges(s, s.baselineSetup, p.setup);
  assert.equal(ch.length, 10);
  assert.ok(ch[0].parts.some((x) => x.includes('interval 3→1')));
  const sw = sweepWins(j('sweep.json'), M.overflow);
  assert.equal(sw.total, 5);
  assert.equal(sw.wins, 5);
});
