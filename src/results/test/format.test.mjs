import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { METRICS, deltaFor, budgetStatus, gainsRows, gainsDeltaRows, fmtInr, parseRationales, setupChanges, sweepWins, formatMetric } from '../format.js';

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

test('budget status uses the NET rule (hand-computed)', () => {
  // baseline: spend 37,433, bales 37,908 -> net -475; allowance 25% x 37,433 = 9,358.25
  const base = { total: 37433, baleRevenue: 37908, net: -475 };
  // plan spends 10,000 more but earns 60,000 more in bales -> extra net -50,000 + 10,000 = -40,000: within
  const good = budgetStatus(base, { total: 47433, baleRevenue: 97908, net: -50475 }, 0.25);
  assert.equal(good.within, true);
  assert.equal(good.extraNet, -50000);
  assert.equal(good.text, 'Within budget \u00B7 spends \u20B910.0k more, earns \u20B960.0k more in bales');
  // plan spends 20,000 more and earns only 500 more -> extra net 19,500 > 9,358.25 -> over by 10,141.75
  const bad = budgetStatus(base, { total: 57433, baleRevenue: 38408, net: 19025 }, 0.25);
  assert.equal(bad.within, false);
  assert.equal(bad.allowance, 9358.25);
  assert.equal(bad.text, 'Over budget by \u20B910.1k \u00B7 spends \u20B920.0k more, earns \u20B9500 more in bales');
  // exactly at the cap is still within
  assert.equal(budgetStatus(base, { total: 37433 + 9358.25, baleRevenue: 37908, net: -475 + 9358.25 }, 0.25).within, true);
});

test('compact rupee formatting', () => {
  assert.equal(fmtInr(850), '\u20B9850');
  assert.equal(fmtInr(-47012), '\u20B947.0k');
  assert.equal(fmtInr(170234), '\u20B9170.2k');
  assert.equal(fmtInr(2500000), '\u20B92.50M');
});

test('gains rows: single run', () => {
  const s = { cost: { total: 47000, baleRevenue: 170200, net: -123200 }, recycledKg: 947.7, landfillKg: 526.5, co2eAvoidedKg: 1420, litterKg: 4.7 };
  const r = Object.fromEntries(gainsRows(s).map((x) => [x.key, x]));
  assert.equal(r.revenue.value, '+\u20B9170.2k');
  assert.equal(r.net.value, '\u20B9123.2k');
  assert.match(r.net.label, /surplus/);
  assert.equal(r.net.tone, 'good');
  assert.equal(r.recycled.value, '948 kg');
  assert.equal(r.co2e.value, '1.42 t');
  assert.equal(r.landfill.value, '527 kg');
});

test('gains rows: compare shows honest signs and tones', () => {
  const b = { overflowBinDays: 39, recycledKg: 100, landfillKg: 50, co2eAvoidedKg: 100, litterKg: 5, cost: { total: 40000, baleRevenue: 30000, net: 10000 } };
  const o = { overflowBinDays: 4, recycledKg: 160, landfillKg: 30, co2eAvoidedKg: 160, litterKg: 5, cost: { total: 52000, baleRevenue: 90000, net: -38000 } };
  const r = Object.fromEntries(gainsDeltaRows(b, o).map((x) => [x.key, x]));
  assert.deepEqual([r.revenue.value, r.revenue.tone], ['+\u20B960.0k', 'good']);
  assert.deepEqual([r.spend.value, r.spend.tone], ['+\u20B912.0k', 'bad']); // spending more is a loss
  assert.deepEqual([r.net.value, r.net.tone], ['\u2212\u20B948.0k', 'good']); // net fell by 48,000
  assert.deepEqual([r.recycled.value, r.recycled.tone], ['+60.0 kg', 'good']);
  assert.deepEqual([r.landfill.value, r.landfill.tone], ['\u221220.0 kg', 'good']);
  assert.deepEqual([r.litter.value, r.litter.tone], ['no change', 'flat']);
  assert.deepEqual([r.overflow.value, r.overflow.tone], ['\u221235', 'good']);
});

test('formatMetric puts the minus before the currency symbol', () => {
  assert.equal(formatMetric(M.cost, -475), '\u2212\u20B9475');
  assert.equal(formatMetric(M.cost, 1234), '\u20B91,234');
});

test('parseRationales finds only complete strings, attaches ids', () => {
  const raw = '{"nodes":[{"id":"n1","binCount":3,"rationale":"Lunch \\"spike\\"."},{"id":"n2","rationale":"Bottles are bu';
  const r = parseRationales(raw);
  assert.deepEqual(r, [{ key: 'n1', text: 'Lunch "spike".' }]);
  const all = parseRationales(j('proposal.json').raw);
  const n = j('scenario.demo.json').nodes.length;
  assert.equal(all.length, n + 1);
  assert.equal(all[n].key, 'sorting');
});

test('fixture: summary metrics and diff', () => {
  const b = j('results.baseline.json').summary;
  const o = j('results.optimised.json').summary;
  assert.equal(formatMetric(M.overflow, M.overflow.get(b)), String(b.overflowBinDays));
  assert.equal(deltaFor(M.overflow, b.overflowBinDays, o.overflowBinDays).tone, 'good');
  const s = j('scenario.demo.json');
  const p = j('proposal.json');
  const ch = setupChanges(s, s.baselineSetup, p.setup);
  const differs = s.nodes.filter((n) => JSON.stringify(s.baselineSetup.nodes[n.id]) !== JSON.stringify(p.setup.nodes[n.id])).length;
  assert.equal(ch.length, s.nodes.length);
  assert.equal(ch.filter((c) => c.changed).length, differs);
  assert.ok(ch.filter((c) => c.changed).every((c) => c.parts.length > 0));
  const sw = sweepWins(j('sweep.json'), M.overflow);
  assert.equal(sw.total, 5);
  assert.equal(sw.wins, 5);
});
