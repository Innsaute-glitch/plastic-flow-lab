// Generates shape-exact FAKE fixtures for UI/consumer tasks (plan.md §3.3).
// This is NOT the simulation: numbers are plausible-looking but not modelled.
// Run: npm run fixtures
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (rel, obj) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  console.info('[fixtures] wrote', rel);
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- Scenario ----------
const nodes = [
  { id: 'n1', name: 'Main canteen', x: 520, y: 330, wasteType: 'food_contaminated', rateKgPerDay: 14, peak: { startHour: 12, endHour: 14, multiplier: 3 }, observed: { overflowDays: 18, fillPctAtPickup: 100 } },
  { id: 'n2', name: 'Hostel A', x: 230, y: 180, wasteType: 'pet_bottles', rateKgPerDay: 6, peak: null, observed: null },
  { id: 'n3', name: 'Hostel B', x: 260, y: 560, wasteType: 'pet_bottles', rateKgPerDay: 5, peak: null, observed: null },
  { id: 'n4', name: 'Central library', x: 800, y: 300, wasteType: 'mixed', rateKgPerDay: 3, peak: null, observed: null },
  { id: 'n5', name: 'Academic block', x: 980, y: 480, wasteType: 'mixed', rateKgPerDay: 4, peak: null, observed: null },
  { id: 'n6', name: 'Food court', x: 700, y: 640, wasteType: 'food_contaminated', rateKgPerDay: 10, peak: { startHour: 19, endHour: 21, multiplier: 2.5 }, observed: null },
  { id: 'n7', name: 'Sports complex', x: 1250, y: 250, wasteType: 'pet_bottles', rateKgPerDay: 4, peak: { startHour: 17, endHour: 19, multiplier: 3 }, observed: null },
  { id: 'n8', name: 'Juice stall', x: 620, y: 470, wasteType: 'pp', rateKgPerDay: 3, peak: { startHour: 15, endHour: 17, multiplier: 2 }, observed: null },
  { id: 'n9', name: 'Admin building', x: 1100, y: 700, wasteType: 'hdpe', rateKgPerDay: 1.5, peak: null, observed: null },
  { id: 'n10', name: 'Print shop', x: 880, y: 820, wasteType: 'pp', rateKgPerDay: 1.5, peak: null, observed: null },
];
const facility = { id: 'facility', name: 'Sorting facility', x: 1380, y: 860 };

const bin = (binType, binCount, binCapacityL, pickupIntervalDays) => ({ binType, binCount, binCapacityL, pickupIntervalDays });
const baselineSetup = {
  nodes: {
    n1: bin('single', 2, 120, 3), n2: bin('single', 2, 120, 3), n3: bin('single', 2, 120, 3),
    n4: bin('single', 1, 120, 3), n5: bin('single', 2, 120, 3), n6: bin('single', 2, 120, 3),
    n7: bin('single', 1, 120, 3), n8: bin('single', 1, 120, 3), n9: bin('single', 1, 120, 7),
    n10: bin('single', 1, 120, 7),
  },
  sortingMethod: 'manual',
};
const optimisedSetup = {
  nodes: {
    n1: bin('segregated', 3, 240, 1), n2: bin('segregated', 2, 240, 2), n3: bin('segregated', 2, 240, 2),
    n4: bin('segregated', 1, 240, 3), n5: bin('segregated', 2, 240, 2), n6: bin('segregated', 3, 240, 1),
    n7: bin('single', 2, 240, 2), n8: bin('segregated', 1, 240, 2), n9: bin('single', 1, 120, 7),
    n10: bin('single', 1, 120, 7),
  },
  sortingMethod: 'manual_float',
};

const scenario = {
  version: 1,
  id: 'campus-demo-v1',
  name: 'Campus baseline',
  map: {
    src: 'maps/placeholder-campus.svg', widthPx: 1600, heightPx: 1000, metresPerPixel: 0.5,
    attribution: 'Placeholder map. Replace with Google Maps screenshot (keep attribution).',
  },
  facility,
  nodes,
  baselineSetup,
  lastProposal: null,
  settings: { days: 30, seed: 42 },
};

// ---------- Fake results ----------
const DENSITY = { pet_bottles: 0.03, hdpe: 0.05, pp: 0.06, mixed: 0.05, food_contaminated: 0.09 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fakeResults(setup, seed, quality) {
  const days = 30;
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const fill = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const side = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const perNode = Object.fromEntries(nodes.map((n) => [n.id, { generatedKg: 0, collectedKg: 0, litterKg: 0, overflowDays: 0, pickups: 0, fillAtPickupSum: 0, maxFillPct: 0 }]));
  const frames = [];
  const trips = [];
  let litterCum = 0, queue = 0, sortedCum = 0, collectedTotal = 0;
  const overflowDaySet = new Set();

  for (let d = 0; d < days; d++) {
    const dayFactor = Object.fromEntries(nodes.map((n) => [n.id, 1 + (rand() * 2 - 1) * 0.15]));
    const overflowedToday = new Set();
    for (let h = 0; h < 24; h++) {
      const frameNodes = nodes.map((n) => {
        const st = setup.nodes[n.id];
        const capKg = st.binCount * st.binCapacityL * DENSITY[n.wasteType];
        let w = h >= 7 && h < 22 ? 1 : 0;
        if (w && n.peak && h >= n.peak.startHour && h < n.peak.endHour) w = n.peak.multiplier;
        const pk = n.peak ? (n.peak.endHour - n.peak.startHour) * (n.peak.multiplier - 1) : 0;
        const genKg = (n.rateKgPerDay * dayFactor[n.id] * w) / (15 + pk);
        fill[n.id] += genKg;
        let overflowKg = 0, litterKg = 0;
        if (fill[n.id] > capKg) {
          overflowKg = fill[n.id] - capKg;
          fill[n.id] = capKg;
          litterKg = overflowKg * 0.4;
          side[n.id] += overflowKg - litterKg;
          overflowedToday.add(n.id);
        }
        litterCum += litterKg;
        const pn = perNode[n.id];
        pn.generatedKg += genKg;
        pn.litterKg += litterKg;
        const fillPct = Math.min(100, (fill[n.id] / capKg) * 100);
        pn.maxFillPct = Math.max(pn.maxFillPct, fillPct);
        return { genKg: r3(genKg), fillKg: r3(fill[n.id]), fillPct: r1(fillPct), overflowKg: r3(overflowKg), litterKg: r3(litterKg) };
      });
      frames.push({ t: d * 24 + h, day: d, hour: h, nodes: frameNodes, facility: { queueKg: r3(queue), sortedKgCum: r3(sortedCum) }, litterKgCum: r3(litterCum) });
    }
    for (const id of overflowedToday) { perNode[id].overflowDays++; overflowDaySet.add(d); }

    // end-of-day pickups: (d+1) % k === 0
    const due = nodes.filter((n) => (d + 1) % setup.nodes[n.id].pickupIntervalDays === 0);
    if (due.length) {
      const route = [];
      let cur = facility, left = [...due];
      while (left.length) {
        left.sort((a, b) => dist(cur, a) - dist(cur, b));
        cur = left.shift();
        route.push(cur);
      }
      const pts = [facility, ...route, facility];
      let px = 0;
      for (let i = 1; i < pts.length; i++) px += dist(pts[i - 1], pts[i]);
      const distanceM = px * 0.5 * 1.3;
      const collectedKg = {};
      for (const n of route) {
        const st = setup.nodes[n.id];
        const capKg = st.binCount * st.binCapacityL * DENSITY[n.wasteType];
        const kg = fill[n.id] + side[n.id];
        collectedKg[n.id] = r3(kg);
        perNode[n.id].collectedKg += kg;
        perNode[n.id].pickups++;
        perNode[n.id].fillAtPickupSum += Math.min(100, (fill[n.id] / capKg) * 100);
        collectedTotal += kg;
        queue += kg;
        fill[n.id] = 0; side[n.id] = 0;
      }
      trips.push({
        day: d, t: d * 24 + 23,
        route: ['facility', ...route.map((n) => n.id), 'facility'],
        path: pts.map((p) => [p.x, p.y]),
        distanceM: Math.round(distanceM),
        durationMin: Math.round((distanceM / 1000 / 15) * 60 + route.length * 5),
        collectedKg,
      });
    }
    const cap = setup.sortingMethod === 'manual' ? 90 : setup.sortingMethod === 'manual_float' ? 150 : 400;
    const sortedToday = Math.min(queue, cap);
    queue -= sortedToday;
    sortedCum += sortedToday;
  }

  const generatedKg = nodes.reduce((a, n) => a + perNode[n.id].generatedKg, 0);
  const inBinsEndKg = nodes.reduce((a, n) => a + fill[n.id] + side[n.id], 0);
  const litterKg = litterCum;
  const collectedKg = generatedKg - litterKg - inBinsEndKg; // force balance
  const backlogEndKg = queue;
  const sorted = collectedKg - backlogEndKg;
  const q = quality; // fake split fractions
  const split = {
    bale_pet: sorted * q.pet, bale_hdpe: sorted * q.hdpe, bale_pp: sorted * q.pp,
    residue_mixed: sorted * q.mixed, contaminated: sorted * q.contaminated,
  };
  split.rejected = sorted - Object.values(split).reduce((a, b) => a + b, 0);
  const bales = split.bale_pet + split.bale_hdpe + split.bale_pp;
  const correct = bales * q.purity;
  const routeDistanceKm = trips.reduce((a, t) => a + t.distanceM, 0) / 1000;
  const binsCost = nodes.reduce((a, n) => {
    const st = setup.nodes[n.id];
    return a + st.binCount * (st.binType === 'single' ? 3 : 5) * days;
  }, 0);
  const sortingCost = { manual: 900, manual_float: 1050, manual_nir: 1800 }[setup.sortingMethod] * days;
  const transport = routeDistanceKm * 25;

  const flows = [
    ['generated', 'litter', litterKg], ['generated', 'in_bins_end', inBinsEndKg], ['generated', 'collected', collectedKg],
    ['collected', 'backlog_end', backlogEndKg], ['collected', 'sorted', sorted],
    ['sorted', 'bale_pet', split.bale_pet], ['sorted', 'bale_hdpe', split.bale_hdpe], ['sorted', 'bale_pp', split.bale_pp],
    ['sorted', 'residue_mixed', split.residue_mixed], ['sorted', 'contaminated', split.contaminated], ['sorted', 'rejected', split.rejected],
    ['bale_pet', 'route_mechanical', split.bale_pet], ['bale_hdpe', 'route_mechanical', split.bale_hdpe], ['bale_pp', 'route_mechanical', split.bale_pp],
    ['residue_mixed', 'route_chemical', split.residue_mixed],
    ['contaminated', 'route_chemical', split.contaminated * 0.5], ['contaminated', 'route_landfill', split.contaminated * 0.5],
    ['rejected', 'route_landfill', split.rejected],
  ].map(([source, target, kg]) => ({ source, target, kg: r3(kg) }));

  return {
    meta: { scenarioId: scenario.id, seed, days, simVersion: 'fixture-fake', label: 'model results' },
    summary: {
      generatedKg: r1(generatedKg), collectedKg: r1(collectedKg), litterKg: r1(litterKg), inBinsEndKg: r1(inBinsEndKg), backlogEndKg: r1(backlogEndKg),
      recoveryRate: r3(correct / generatedKg), purity: r3(q.purity), contaminationRate: r3(split.contaminated / sorted),
      overflowBinDays: nodes.reduce((a, n) => a + perNode[n.id].overflowDays, 0),
      overflowCalendarDays: overflowDaySet.size,
      routeDistanceKm: r1(routeDistanceKm), truckTrips: trips.length,
      pickups: nodes.reduce((a, n) => a + perNode[n.id].pickups, 0),
      cost: { transport: Math.round(transport), bins: binsCost, sorting: sortingCost, total: Math.round(transport + binsCost + sortingCost), currency: 'INR' },
      massBalanceErrorKg: 0,
    },
    perNode: Object.fromEntries(nodes.map((n) => {
      const p = perNode[n.id];
      return [n.id, {
        generatedKg: r1(p.generatedKg), collectedKg: r1(p.collectedKg), litterKg: r1(p.litterKg), overflowDays: p.overflowDays,
        pickups: p.pickups, avgFillPctAtPickup: r1(p.pickups ? p.fillAtPickupSum / p.pickups : 0),
        avgLoadPctAtPickup: r1(p.pickups ? (p.collectedKg + p.litterKg) / p.pickups / ((setup.nodes[n.id].binCount * setup.nodes[n.id].binCapacityL * DENSITY[n.wasteType]) / 100) : 0), maxFillPct: r1(p.maxFillPct),
      }];
    })),
    flows,
    timeline: { hoursPerFrame: 1, frameCount: frames.length, nodeOrder: nodes.map((n) => n.id), frames, trips },
  };
}

const QB = { pet: 0.24, hdpe: 0.04, pp: 0.17, mixed: 0.2, contaminated: 0.31, purity: 0.78 };
const QO = { pet: 0.3, hdpe: 0.05, pp: 0.24, mixed: 0.2, contaminated: 0.17, purity: 0.9 };
const baseline = fakeResults(baselineSetup, 42, QB);
const optimised = fakeResults(optimisedSetup, 42, QO);

// ---------- LLM fixtures ----------
const rationale = {
  n1: 'Lunch spike overfills two 120 L bins by 2 pm; daily pickup with 3×240 L segregated bins.',
  n2: 'Bottles are bulky; 2×240 L every 2 days keeps fill under 85%.',
  n3: 'Same pattern as Hostel A at a slightly lower rate.',
  n4: 'Low rate; a bigger segregated bin on the existing 3-day cycle is enough.',
  n5: 'Steady mixed stream; segregation cuts cross-contamination.',
  n6: 'Evening spike plus food residue: daily pickup and segregated bins.',
  n7: 'Post-match bottle surge; double capacity on a 2-day cycle.',
  n8: 'Cups and straws pile up mid-afternoon; segregated 240 L every 2 days.',
  n9: 'Very low rate; current weekly pickup already fits.',
  n10: 'Very low rate; keep weekly pickup to save truck km.',
};
const raw = {
  nodes: nodes.map((n) => ({ id: n.id, ...optimisedSetup.nodes[n.id], rationale: rationale[n.id] })),
  sortingMethod: 'manual_float',
  sortingRationale: 'Float tank separates PET from PP/HDPE by density, lifting purity within budget; NIR exceeds it.',
  summary: 'Shorter intervals at high-rate food nodes, larger segregated bins elsewhere, float-tank sorting.',
};
const rawText = JSON.stringify(raw, null, 2);
const proposal = {
  source: 'llm', model: 'claude-sonnet-5-5', createdAt: '2026-10-25T12:00:00Z', round: 1, scenarioId: scenario.id,
  setup: optimisedSetup, rationales: rationale, sortingRationale: raw.sortingRationale, summary: raw.summary,
  clampNotes: [], raw: rawText,
};
const chunks = rawText.match(/[\s\S]{1,48}/g);
const events = [
  { type: 'status', stage: 'sending' },
  { type: 'status', stage: 'thinking' },
  ...chunks.map((text) => ({ type: 'delta', text })),
  { type: 'status', stage: 'validating' },
  { type: 'result', proposal },
  { type: 'status', stage: 'done' },
];

// Fake seed sweep (summaries only)
const seeds = [42, 43, 44, 45, 46];
const sweep = {
  seeds,
  baseline: seeds.map((sd) => fakeResults(baselineSetup, sd, QB).summary),
  optimised: seeds.map((sd) => fakeResults(optimisedSetup, sd, QO).summary),
};

out('fixtures/scenario.demo.json', scenario);
out('fixtures/results.baseline.json', baseline);
out('fixtures/results.optimised.json', optimised);
out('fixtures/proposal.json', proposal);
out('fixtures/llm-raw-response.json', raw);
out('fixtures/llm-stream-events.json', events);
out('fixtures/sweep.json', sweep);
// public/demo/* are real (demo scenario + live cached proposal) and are no longer generated here.
console.info('[fixtures] baseline overflowBinDays', baseline.summary.overflowBinDays, '-> optimised', optimised.summary.overflowBinDays);
