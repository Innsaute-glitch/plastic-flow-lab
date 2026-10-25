import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, validateInputs, computeCost, SimInputError, SIM_VERSION } from '../index.js';
import { loadAll, tiny } from './helpers.mjs';

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b}, got ${a}`);
const LINKS = [
  'generated>litter', 'generated>in_bins_end', 'generated>collected', 'collected>backlog_end', 'collected>sorted',
  'sorted>bale_pet', 'sorted>bale_hdpe', 'sorted>bale_pp', 'sorted>residue_mixed', 'sorted>contaminated', 'sorted>rejected',
  'bale_pet>route_mechanical', 'bale_hdpe>route_mechanical', 'bale_pp>route_mechanical', 'residue_mixed>route_chemical',
  'contaminated>route_chemical', 'contaminated>route_landfill', 'rejected>route_landfill',
];

test('golden A: 10 kg/day, cap 25 kg, interval 3 -> overflow on days 2,5,..,29, 5 kg per cycle', () => {
  const { scenario, setup, assumptions } = tiny({ rate: 10, interval: 3, capKg: 25 });
  const r = simulate(scenario, setup, assumptions, 1);
  assert.equal(r.summary.overflowBinDays, 10);
  assert.equal(r.summary.overflowCalendarDays, 10);
  assert.equal(r.perNode.n1.overflowDays, 10);
  // bin is capped at 100% at pickup, but 30 kg arrived per cycle into a 25 kg bin: load 120%
  assert.equal(r.perNode.n1.avgFillPctAtPickup, 100);
  assert.equal(r.perNode.n1.avgLoadPctAtPickup, 120);
  assert.deepEqual(r.timeline.trips.map((t) => t.day), [2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
  assert.ok(r.timeline.trips.every((t) => t.t === t.day * 24 + 23));
  assert.equal(r.summary.pickups, 10);
  // per cycle: 30 generated, 25 in bin, 5 overflow = 2 litter (40%) + 3 side waste collected next time (same cycle: picked up at end of day 2)
  near(r.summary.generatedKg, 300, 1e-9);
  near(r.summary.litterKg, 20, 1e-9);
  near(r.summary.collectedKg, 280, 1e-9);
  near(r.summary.inBinsEndKg, 0, 1e-9);
  for (const t of r.timeline.trips) near(t.collectedKg.n1, 28, 1e-9);
  // overflow appears only on days 2,5,.. in frames: sum of overflowKg that day = 5
  const byDay = {};
  for (const f of r.timeline.frames) byDay[f.day] = (byDay[f.day] ?? 0) + f.nodes[0].overflowKg;
  near(byDay[2], 5, 1e-2); near(byDay[1], 0, 0); near(byDay[3], 0, 0);
});

test('pickup rule: bin is still full in the last frame of the pickup day and empty in the next frame', () => {
  const { scenario, setup, assumptions } = tiny({ rate: 10, interval: 3, capKg: 25 });
  const r = simulate(scenario, setup, assumptions, 1);
  const f = r.timeline.frames;
  assert.equal(f[2 * 24 + 23].nodes[0].fillPct, 100);
  assert.equal(f[3 * 24 + 0].nodes[0].fillKg, 0);
  assert.equal(f[3 * 24 + 0].nodes[0].fillPct, 0);
  // days 0 and 1 are never picked up
  assert.ok(r.timeline.trips.every((t) => t.day >= 2));
  // end of day 1: 20 kg, 80%
  near(f[1 * 24 + 23].nodes[0].fillKg, 20, 1e-9); near(f[1 * 24 + 23].nodes[0].fillPct, 80, 1e-9);
});

test('golden B: interval 1 with enough capacity -> no overflow, 30 pickups', () => {
  const { scenario, setup, assumptions } = tiny({ rate: 10, interval: 1, capKg: 25 });
  const r = simulate(scenario, setup, assumptions, 1);
  assert.equal(r.summary.overflowBinDays, 0);
  assert.equal(r.summary.pickups, 30);
  assert.equal(r.summary.truckTrips, 30);
  near(r.summary.litterKg, 0, 1e-12);
  near(r.summary.collectedKg, 300, 1e-9);
});

test('golden C: throughput below collected volume -> backlog', () => {
  const { scenario, setup, assumptions } = tiny({ rate: 10, interval: 1, capKg: 25, throughput: 5 });
  const r = simulate(scenario, setup, assumptions, 1);
  near(r.summary.collectedKg, 300, 1e-9);
  near(r.summary.backlogEndKg, 150, 1e-9); // sorts 5/day x 30 = 150
  near(r.flows.find((f) => f.target === 'sorted').kg, 150, 1e-9);
  near(r.timeline.frames[719].facility.queueKg, 150, 1e-9);
  near(r.timeline.frames[719].facility.sortedKgCum, 150, 1e-9);
  assert.ok(r.summary.massBalanceErrorKg < 1e-6);
});

test('hand-computed sorting: 300 kg of PET bottles in single bins, manual method', () => {
  // contFrac = 0.05 + 0.15 = 0.2 -> 60 kg contaminated, 240 clean. mix pet .9 pp .08 mixed .02.
  // clean pet 216, pp 19.2, mixed 4.8. keep = 0.96, accuracy .8, detection .6, loss .04.
  const { scenario, setup, assumptions } = tiny({ rate: 10, interval: 1, capKg: 1000, wasteType: 'pet_bottles' });
  const r = simulate(scenario, setup, assumptions, 1);
  const fl = (s, t) => r.flows.find((f) => f.source === s && f.target === t).kg;
  near(fl('generated', 'collected'), 300, 1e-9);
  near(fl('sorted', 'rejected'), 12, 1e-3);
  near(fl('sorted', 'contaminated'), 60 * 0.96 * 0.6, 1e-3); // 34.56
  near(fl('sorted', 'residue_mixed'), (4.8 + 1.2 * 0.4) * 0.96, 1e-3); // clean mixed + undetected mixed contaminated
  const correct = (216 + 19.2) * 0.96 * 0.8; // 180.6336
  near(r.summary.recoveryRate, correct / 300, 1e-4);
  const bales = fl('sorted', 'bale_pet') + fl('sorted', 'bale_hdpe') + fl('sorted', 'bale_pp');
  near(r.summary.purity, correct / bales, 1e-4);
  near(r.summary.contaminationRate, 34.56 / 300, 1e-4);
  near(fl('contaminated', 'route_chemical'), 34.56 / 2, 1e-3);
});

test('segregated bins reduce contamination by the compliance factor', () => {
  const a = tiny({ rate: 10, interval: 1, capKg: 1000, wasteType: 'pet_bottles', binType: 'segregated' });
  const r = simulate(a.scenario, a.setup, a.assumptions, 1);
  // contFrac = 0.05 + 0.15*(1-0.7) = 0.095 -> detected 95*0.96*0.6/ ... = 300*0.095*0.96*0.6
  near(r.flows.find((f) => f.target === 'contaminated').kg, 300 * 0.095 * 0.96 * 0.6, 1e-3);
});

test('route geometry and cost are hand-checkable', () => {
  const { scenario, setup, assumptions } = tiny({ rate: 10, interval: 1, capKg: 1000 });
  const r = simulate(scenario, setup, assumptions, 1);
  const trip = r.timeline.trips[0];
  assert.deepEqual(trip.route, ['facility', 'n1', 'facility']);
  assert.deepEqual(trip.path, [[1000, 500], [700, 500], [1000, 500]]);
  assert.equal(trip.distanceM, 390); // 600 px * 0.5 m/px * 1.3
  assert.equal(trip.durationMin, 7); // 390 / 250 m/min = 1.56 + 5 stop = 6.56
  near(r.summary.routeDistanceKm, 0.39 * 30, 1e-9);
  assert.deepEqual(r.summary.cost, { transport: 292.5, bins: 90, sorting: 27000, total: 27382.5, currency: 'INR' });
  assert.deepEqual(computeCost({ routeDistanceKm: 10, days: 30 }, setup, assumptions), { transport: 250, bins: 90, sorting: 27000, total: 27340, currency: 'INR' });
});

test('hourly generation profile: active hours only, peak weighted, day total = rate', () => {
  const { scenario, setup, assumptions } = tiny({ rate: 15, interval: 1, capKg: 1000 });
  scenario.nodes[0].peak = { startHour: 12, endHour: 14, multiplier: 3 };
  const r = simulate(scenario, setup, assumptions, 1);
  const day = r.timeline.frames.slice(0, 24).map((f) => f.nodes[0].genKg);
  // weights: 13 normal + 2 x3 = 19 -> 15/19 per normal hour
  near(day[6], 0, 0); near(day[22], 0, 0); near(day[7], 15 / 19, 5e-4); near(day[12], 45 / 19, 5e-4);
  near(day.reduce((a, b) => a + b, 0), 15, 0.02);
});

test('mass balance on demo scenario, seeds 1-5, baseline and proposal', () => {
  const { scenario, proposal, assumptions } = loadAll();
  for (const setup of [scenario.baselineSetup, proposal.setup]) {
    for (let seed = 1; seed <= 5; seed++) {
      const s = simulate(scenario, setup, assumptions, seed).summary;
      assert.ok(s.massBalanceErrorKg < 1e-6, `seed ${seed}: ${s.massBalanceErrorKg}`);
    }
  }
});

test('determinism: same inputs deep-equal, different seed differs', () => {
  const { scenario, assumptions } = loadAll();
  const a = simulate(scenario, scenario.baselineSetup, assumptions, 42);
  const b = simulate(scenario, scenario.baselineSetup, assumptions, 42);
  const c = simulate(scenario, scenario.baselineSetup, assumptions, 43);
  assert.deepEqual(a, b);
  assert.notEqual(a.summary.generatedKg, c.summary.generatedKg);
  assert.equal(a.meta.simVersion, SIM_VERSION);
});

test('every flow link is present, in the documented order', () => {
  const { scenario, assumptions } = loadAll();
  const r = simulate(scenario, scenario.baselineSetup, assumptions, 42);
  assert.deepEqual(r.flows.map((f) => `${f.source}>${f.target}`), LINKS);
  // zero-valued links are still emitted
  const t = tiny({ interval: 1, capKg: 1000 });
  const z = simulate(t.scenario, t.setup, t.assumptions, 1);
  assert.equal(z.flows.length, LINKS.length);
  assert.equal(z.flows.find((f) => f.target === 'backlog_end').kg, 0);
});

test('timeline has the contract shape and bounded values', () => {
  const { scenario, assumptions } = loadAll();
  const r = simulate(scenario, scenario.baselineSetup, assumptions, 42);
  const tl = r.timeline;
  assert.equal(tl.hoursPerFrame, 1);
  assert.equal(tl.frameCount, 720);
  assert.equal(tl.frames.length, 720);
  assert.deepEqual(tl.nodeOrder, scenario.nodes.map((n) => n.id));
  tl.frames.forEach((f, i) => {
    assert.equal(f.t, i); assert.equal(f.day, Math.floor(i / 24)); assert.equal(f.hour, i % 24);
    assert.equal(f.nodes.length, 10);
    for (const n of f.nodes) {
      assert.deepEqual(Object.keys(n), ['genKg', 'fillKg', 'fillPct', 'overflowKg', 'litterKg']);
      assert.ok(n.fillPct >= 0 && n.fillPct <= 100);
      assert.equal(n.genKg, Math.round(n.genKg * 1000) / 1000);
    }
  });
  assert.ok(tl.frames.some((f) => f.nodes.some((n) => n.overflowKg > 0)), 'overflow must be visible in frames');
  for (const trip of tl.trips) {
    assert.equal(trip.route[0], 'facility'); assert.equal(trip.route.at(-1), 'facility');
    assert.equal(trip.path.length, trip.route.length);
    trip.route.forEach((id, k) => {
      const p = id === 'facility' ? scenario.facility : scenario.nodes.find((n) => n.id === id);
      assert.deepEqual(trip.path[k], [p.x, p.y]);
    });
    assert.deepEqual(Object.keys(trip.collectedKg).sort(), trip.route.slice(1, -1).sort());
  }
  // litter cumulative and facility cumulative are monotone and end at the summary values
  for (let i = 1; i < 720; i++) {
    assert.ok(tl.frames[i].litterKgCum >= tl.frames[i - 1].litterKgCum);
    assert.ok(tl.frames[i].facility.sortedKgCum >= tl.frames[i - 1].facility.sortedKgCum);
  }
  near(tl.frames[719].litterKgCum, r.summary.litterKg, 2e-3);
  near(tl.frames[719].facility.sortedKgCum, r.flows.find((f) => f.target === 'sorted').kg, 2e-3);
  // trips: collectedKg totals match perNode
  for (const n of scenario.nodes) {
    const sum = tl.trips.reduce((a, t) => a + (t.collectedKg[n.id] ?? 0), 0);
    near(sum, r.perNode[n.id].collectedKg, 0.01, n.id);
  }
});

test('routing: exact route beats a worse order; > 8 stops still valid', () => {
  const { scenario, assumptions } = loadAll();
  // all 10 nodes due every day -> 10 stops -> NN + 2-opt
  const setup = structuredClone(scenario.baselineSetup);
  for (const id of Object.keys(setup.nodes)) setup.nodes[id].pickupIntervalDays = 1;
  const r = simulate(scenario, setup, assumptions, 1);
  const trip = r.timeline.trips[0];
  assert.equal(trip.route.length, 12);
  assert.equal(new Set(trip.route.slice(1, -1)).size, 10);
  // 2-opt tour must be no longer than the naive scenario-order tour
  const px = (path) => path.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
  const naive = [[1380, 860], ...scenario.nodes.map((n) => [n.x, n.y]), [1380, 860]];
  assert.ok(px(trip.path) <= px(naive));
  // exact for 4 stops on a square: perimeter
  const sq = structuredClone(scenario);
  sq.nodes = [
    { ...scenario.nodes[0], id: 'n1', x: 0, y: 0 }, { ...scenario.nodes[1], id: 'n2', x: 100, y: 100 },
    { ...scenario.nodes[2], id: 'n3', x: 100, y: 0 }, { ...scenario.nodes[3], id: 'n4', x: 0, y: 100 },
  ];
  sq.facility = { id: 'facility', name: 'F', x: 50, y: -50 };
  const s2 = { nodes: Object.fromEntries(sq.nodes.map((n) => [n.id, { ...setup.nodes.n1 }])), sortingMethod: 'manual' };
  const t2 = simulate(sq, s2, assumptions, 1).timeline.trips[0];
  const best = px(t2.path);
  // optimal = go to one corner, around the square, return: 2*sqrt(50^2+50^2) + 100*3 ... check against brute force
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const pts = sq.nodes.map((n) => [n.x, n.y]);
  const bruteBest = Math.min(...perms(pts).map((p) => px([[50, -50], ...p, [50, -50]])));
  near(best, bruteBest, 1e-9);
});

test('v0.2 bin cost: by capacity, segregated multiplier, missing price is an error', () => {
  const { scenario, assumptions } = loadAll();
  const setup = { nodes: { n1: { binType: 'segregated', binCount: 2, binCapacityL: 240, pickupIntervalDays: 1 } }, sortingMethod: 'manual' };
  assert.equal(computeCost({ routeDistanceKm: 0, days: 30 }, setup, assumptions).bins, 480); // 2 x 5 x 1.6 x 30
  setup.nodes.n1.binType = 'single';
  assert.equal(computeCost({ routeDistanceKm: 0, days: 30 }, setup, assumptions).bins, 300);
  const a = structuredClone(assumptions);
  delete a.cost.binPerDay.value['240'];
  const errs = validateInputs(scenario, { nodes: { ...scenario.baselineSetup.nodes, n1: { binType: 'single', binCount: 1, binCapacityL: 240, pickupIntervalDays: 1 } }, sortingMethod: 'manual' }, a);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /no bin price/);
});

test('validateInputs / SimInputError', () => {
  const { scenario, assumptions } = loadAll();
  assert.deepEqual(validateInputs(scenario, scenario.baselineSetup, assumptions), []);
  const noFac = { ...scenario, facility: null };
  assert.throws(() => simulate(noFac, scenario.baselineSetup, assumptions, 1), (e) => e instanceof SimInputError && e.name === 'SimInputError' && e.errors.length === 1);
  assert.ok(validateInputs({ ...scenario, nodes: [] }, scenario.baselineSetup, assumptions).length >= 1);
  const bad = structuredClone(scenario.baselineSetup);
  bad.nodes.n1.binCapacityL = 77; bad.nodes.n2.pickupIntervalDays = 0; delete bad.nodes.n3; bad.sortingMethod = 'x';
  assert.equal(validateInputs(scenario, bad, assumptions).length, 4);
});
