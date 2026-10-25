import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHandler } from '../api.js';

const j = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
// frozen 10-node inputs: the sizing assertion below is hand-computed from them (fixtures/golden/README.md)
const scenario = j('fixtures/golden/scenario.demo.json');
const results = j('fixtures/golden/results.baseline.json');
const good = j('fixtures/golden/proposal.json').raw;
const body = { scenario, baselineSetup: scenario.baselineSetup, baselineSummary: results.summary, perNode: results.perNode, history: [] };

async function withServer(callModel, fn) {
  const h = createHandler({ callModel });
  const srv = http.createServer((req, res) => h(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise((r) => srv.listen(0, r));
  try { return await fn(`http://127.0.0.1:${srv.address().port}`); } finally { srv.close(); }
}
const parseSse = (t) => t.trim().split('\n\n').map((b) => ({ event: b.match(/event: (.*)/)[1], data: JSON.parse(b.match(/data: (.*)/)[1]) }));
const post = (url) => fetch(`${url}/api/optimise`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.text()).then(parseSse);

test('health', async () => {
  await withServer(null, async (u) => {
    const h = await (await fetch(`${u}/api/health`)).json();
    assert.equal(h.ok, true);
    assert.equal(h.provider, 'claude-cli');
  });
});

test('optimise streams status/delta/result, user message has metres and prices', async () => {
  let seenUser = '';
  await withServer(async ({ user, onDelta }) => { seenUser = user; onDelta(good.slice(0, 10)); onDelta(good.slice(10)); return good; }, async (u) => {
    const ev = await post(u);
    assert.deepEqual(ev.filter((e) => e.event === 'status').map((e) => e.data.stage), ['sending', 'thinking', 'validating', 'done']);
    assert.equal(ev.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), good);
    const r = ev.find((e) => e.event === 'result').data.proposal;
    assert.equal(r.source, 'llm');
    assert.equal(r.round, 1);
    assert.equal(r.setup.sortingMethod, 'manual_float');
    assert.equal(r.raw, good);
  });
  assert.match(seenUser, /roadDistanceToFacilityM/);
  assert.match(seenUser, /transportInrPerKm/);
  assert.match(seenUser, /maxNetCostInr/);
  assert.match(seenUser, /baleSalePriceInrPerKg/);
});

test('invalid reply triggers one retry with the errors fed back, then succeeds', async () => {
  const prompts = [];
  await withServer(async ({ user }) => { prompts.push(user); return prompts.length === 1 ? 'sorry, here you go: nope' : good; }, async (u) => {
    const ev = await post(u);
    assert.ok(ev.some((e) => e.event === 'status' && e.data.stage === 'retrying'));
    assert.ok(ev.some((e) => e.event === 'result'));
  });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Problems:/);
});

test('provider failure and double-invalid both give an error event with heuristic fallback', async () => {
  await withServer(async () => { throw new Error('claude CLI not found on PATH'); }, async (u) => {
    const ev = await post(u);
    const e = ev.find((x) => x.event === 'error');
    assert.equal(e.data.fallback, 'heuristic');
    assert.ok(!ev.some((x) => x.event === 'result'));
  });
  await withServer(async () => 'garbage', async (u) => {
    const ev = await post(u);
    assert.equal(ev.find((x) => x.event === 'error').data.fallback, 'heuristic');
  });
});

test('assumptionOverrides reach the prompt (transportPerKm) and the sizing field is present', async () => {
  let seen = '';
  const b2 = { ...body, scenario: { ...scenario, assumptionOverrides: { 'cost.transportPerKm': 77, 'cost.binPerDay.240': 9 } } };
  await withServer(async ({ user }) => { seen = user; return good; }, async (u) => {
    await fetch(`${u}/api/optimise`, { method: 'POST', body: JSON.stringify(b2) }).then((r) => r.text());
  });
  const input = JSON.parse(seen.slice(seen.indexOf('{')));
  assert.equal(input.unitPrices.transportInrPerKm, 77);
  assert.equal(input.unitPrices.binInrPerDayByCapacityL['240'], 9);
  assert.equal(input.unitPrices.segregatedBinMultiplier, 1.6);
  // n2: 6 kg/day PET: 6 x 1.15 / 0.03 / 0.8 = 287.5 L per day of interval
  assert.equal(input.nodes.find((n) => n.id === 'n2').neededLitresPerDay, 287.5);
});

test('client disconnect aborts the model call and skips the retry', async () => {
  let calls = 0;
  let aborted = false;
  let release;
  const gone = new Promise((r) => { release = r; });
  const slowModel = ({ signal }) => new Promise((_, reject) => {
    calls += 1;
    signal.addEventListener('abort', () => { aborted = true; const e = new Error('Cancelled by the user'); e.name = 'AbortError'; reject(e); release(); });
  });
  await withServer(slowModel, async (u) => {
    const ctl = new AbortController();
    const req = fetch(`${u}/api/optimise`, { method: 'POST', body: JSON.stringify(body), signal: ctl.signal }).then((r) => r.text()).catch(() => null);
    while (calls === 0) await new Promise((r) => setTimeout(r, 10));
    ctl.abort();
    await req;
    await gone;
  });
  assert.equal(aborted, true);
  assert.equal(calls, 1);
});
