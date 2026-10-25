import test from 'node:test';
import assert from 'node:assert/strict';
import { optimise, timing } from '../client.js';
import { scenario, baseline, assumptions, cached } from './fixtures.mjs';

Object.assign(timing, { totalMs: 200, statusMs: [10, 10], tailMs: 10 });
const args = (extra) => ({ scenario, baseline: { setup: scenario.baselineSetup, results: baseline }, assumptions, demoMode: true, history: [], ...extra });
const withFetch = async (fn, impl) => { const old = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = old; } };
const okJson = (obj) => async () => ({ ok: true, status: 200, json: async () => obj });

test('demo replay emits status -> delta... -> result and reassembles raw', async () => {
  const evts = [];
  const p = await withFetch(() => optimise(args(), (e) => evts.push(e)), okJson(cached));
  assert.deepEqual(evts.slice(0, 2).map((e) => e.stage), ['sending', 'thinking']);
  const deltas = evts.filter((e) => e.type === 'delta');
  assert.ok(deltas.length >= 30);
  assert.equal(deltas.map((d) => d.text).join(''), cached.raw);
  const ri = evts.findIndex((e) => e.type === 'result');
  assert.ok(ri > evts.findLastIndex((e) => e.type === 'delta'));
  assert.equal(evts.at(-1).stage, 'done');
  assert.equal(p.source, 'cached');
  assert.equal(p.scenarioId, scenario.id);
  assert.ok(!evts.some((e) => e.type === 'error'));
});

test('demo mode with a mismatched scenario falls back to heuristic with an error event', async () => {
  const evts = [];
  const other = { ...scenario, nodes: scenario.nodes.slice(0, 5) };
  const p = await withFetch(() => optimise(args({ scenario: other }), (e) => evts.push(e)), okJson(cached));
  assert.equal(p.source, 'heuristic');
  const err = evts.find((e) => e.type === 'error');
  assert.equal(err.fallback, 'heuristic');
});

test('demo mode on an edited scenario (same ids, changed rate or cost override) falls back to heuristic', async () => {
  for (const edited of [
    { ...scenario, nodes: scenario.nodes.map((n, i) => (i === 0 ? { ...n, rateKgPerDay: n.rateKgPerDay + 5 } : n)) },
    { ...scenario, assumptionOverrides: { 'cost.transportPerKm': 50 } },
  ]) {
    const evts = [];
    const p = await withFetch(() => optimise(args({ scenario: edited }), (e) => evts.push(e)), okJson(cached));
    assert.equal(p.source, 'heuristic');
    assert.match(evts.find((e) => e.type === 'error').message, /edited/);
  }
});

test('live call that cannot connect resolves to the heuristic and never throws', async () => {
  const evts = [];
  const p = await withFetch(() => optimise(args({ demoMode: false }), (e) => evts.push(e)), async () => { throw new TypeError('fetch failed'); });
  assert.equal(p.source, 'heuristic');
  assert.equal(evts.find((e) => e.type === 'error').fallback, 'heuristic');
});

test('live SSE stream is parsed into events and returns the proposal', async () => {
  const proposal = { ...cached, source: 'llm' };
  const sse = `event: status\ndata: {"stage":"sending"}\n\nevent: delta\ndata: {"text":"{\\n"}\n\nevent: result\ndata: ${JSON.stringify({ proposal })}\n\nevent: status\ndata: {"stage":"done"}\n\n`;
  const bytes = new TextEncoder().encode(sse);
  const body = (async function* () { yield bytes.slice(0, 40); yield bytes.slice(40); })();
  const evts = [];
  const p = await withFetch(() => optimise(args({ demoMode: false }), (e) => evts.push(e)), async () => ({ ok: true, status: 200, body }));
  assert.equal(p.source, 'llm');
  assert.deepEqual(evts.map((e) => e.type), ['status', 'delta', 'result', 'status']);
});

test('server error event leads to heuristic fallback', async () => {
  const sse = 'event: error\ndata: {"message":"boom","fallback":"heuristic"}\n\n';
  const body = (async function* () { yield new TextEncoder().encode(sse); })();
  const evts = [];
  const p = await withFetch(() => optimise(args({ demoMode: false }), (e) => evts.push(e)), async () => ({ ok: true, status: 200, body }));
  assert.equal(p.source, 'heuristic');
  assert.match(evts.find((e) => e.type === 'error').message, /boom/);
});

test('cancel: an aborted demo replay returns null with no result event', async () => {
  const ctl = new AbortController();
  const events = [];
  const p = await withFetch(() => optimise(args({ signal: ctl.signal }), (e) => {
    events.push(e.type);
    if (e.type === 'delta') ctl.abort();
  }), okJson(cached));
  assert.equal(p, null);
  assert.ok(events.includes('delta'));
  assert.ok(!events.includes('result'));
  assert.ok(!events.includes('error'));
});

test('cancel: an aborted live call returns null instead of falling back', async () => {
  const ctl = new AbortController();
  const hang = (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const p = await withFetch(() => {
    const run = optimise(args({ demoMode: false, signal: ctl.signal }));
    ctl.abort();
    return run;
  }, hang);
  assert.equal(p, null);
});
