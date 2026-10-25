// Generates shape-exact FAKE fixtures for UI/consumer tasks (plan.md §3.3).
// This is NOT the simulation: numbers are plausible-looking but not modelled.
// Run: npm run fixtures
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
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
// Thapar Institute (TIET), Patiala. Positions are pixels on public/maps/campus.jpg.
// Hostel rates scale with bed capacity (thapar.edu / Shiksha hostel list) at PLASTIC_KG_PER_BED;
// campus total ≈ 250 kg/day plastic (≈5–6% of 4.63 t/day total waste; ≥200 kg/day recycled, Thapar docs).
const PLASTIC_KG_PER_BED = 0.011;
const hostel = (id, name, x, y, beds) => ({ id, name, x, y, wasteType: 'mixed', rateKgPerDay: Math.round(beds * PLASTIC_KG_PER_BED * 10) / 10, peak: null, observed: null });
const node = (id, name, x, y, wasteType, rateKgPerDay, peak = null) => ({ id, name, x, y, wasteType, rateKgPerDay, peak, observed: null });
const lunch = { startHour: 12, endHour: 14, multiplier: 2.5 };
const dinner = { startHour: 19, endHour: 21, multiplier: 2.5 };
const evening = { startHour: 17, endHour: 19, multiplier: 2 };
const nodes = [
  node('n1', 'G Block Canteen', 1971, 1180, 'food_contaminated', 14, lunch),
  hostel('n2', 'Hostel J (Tejas Hall)', 934, 1163, 1170),
  hostel('n3', 'Hostel O (Vyom Hall)', 784, 1498, 928),
  node('n4', 'Nava Nalanda Library', 2088, 879, 'mixed', 4),
  node('n5', 'C Block', 2368, 1066, 'mixed', 5),
  node('n6', 'H canteen', 1225, 1261, 'food_contaminated', 10, dinner),
  node('n7', 'Badminton Hall', 1288, 744, 'pet_bottles', 4, evening),
  node('n8', 'Wrapchik', 678, 847, 'pp', 6, evening),
  node('n9', 'Health Center', 1918, 515, 'hdpe', 1.5),
  node('n10', 'Auditorium', 2335, 1359, 'pp', 2),
  hostel('n11', 'Hostel M (Anantam Hall)', 389, 1237, 1148),
  hostel('n12', 'Hostel B (Amritam Hall)', 899, 1550, 723),
  hostel('n13', 'Hostel H (Vyan Hall)', 1143, 1190, 680),
  hostel('n14', 'Hostel D (Neeram Hall)', 345, 1557, 928),
  hostel('n15', 'Hostel Q (Vahni Hall)', 1748, 1304, 928),
  node('n16', 'Guest House', 2068, 1362, 'mixed', 1.5),
  node('n17', 'TAN Auditorium', 1898, 1015, 'pp', 2),
  node('n18', 'B Block', 2400, 1138, 'mixed', 4),
  node('n19', 'D Block', 2326, 935, 'mixed', 4),
  node('n20', 'E Block', 2603, 1020, 'mixed', 3),
  node('n21', 'F Block', 2534, 960, 'mixed', 3),
  hostel('n22', 'Hostel K (Ambaram Hall)', 977, 274, 600),
  hostel('n23', 'Hostel L (Viyat Hall)', 1480, 207, 300),
  hostel('n24', 'Hostel E (Vasudha)', 1539, 740, 234),
  hostel('n25', 'Hostel G (Vasudha Hall)', 1554, 858, 234),
  hostel('n26', 'Hostel I (Ira Hall)', 1746, 725, 436),
  hostel('n27', 'Hostel N (Ananta Hall)', 1746, 851, 500),
  hostel('n28', 'Hostel C (Prithvi Hall)', 540, 1520, 387),
  hostel('n29', 'Hostel A (Agira Hall)', 1150, 1460, 928),
  hostel('n30', 'Hostel PG-1 (Dhriti Hall)', 1550, 1400, 928),
  hostel('n31', 'Hostel PG-2 (Pavani Hall)', 1376, 1406, 480),
  hostel('n32', 'Hostel F', 1760, 1040, 480),
  node('n33', 'Kravings food court', 1590, 1030, 'food_contaminated', 10, dinner),
  node('n34', 'TSLAS canteen', 2420, 330, 'food_contaminated', 5, lunch),
  node('n35', 'Aahar canteen', 2520, 1170, 'food_contaminated', 8, lunch),
  node('n36', 'G Block', 2050, 1030, 'mixed', 3),
  node('n37', 'Lecture complex (LT, LP, CS)', 2050, 700, 'mixed', 6),
  node('n38', 'Mechanical Workshop', 2400, 814, 'mixed', 2),
  node('n39', 'Faculty Residences (west)', 250, 850, 'mixed', 5),
  node('n40', 'Faculty Residences I/J', 1258, 281, 'mixed', 3),
];
const facility = { id: 'facility', name: 'MRF (sorting facility)', x: 510, y: 359 };

const bin = (binType, binCount, binCapacityL, pickupIntervalDays) => ({ binType, binCount, binCapacityL, pickupIntervalDays });
const ASSUMPTIONS = JSON.parse(readFileSync(join(ROOT, 'config/assumptions.json'), 'utf8'));
const BULK = ASSUMPTIONS.bins.bulkDensityKgPerL.value;
// Smallest standard single-type bin set (120/240/660 L, at most 6 bins) holding `litres`; ties -> fewer bins.
function binsFor(litres) {
  let best = null;
  for (const cap of [120, 240, 660]) for (let n = 1; n <= 6; n++) {
    const total = n * cap;
    if (total >= litres && (!best || total < best.total || (total === best.total && n < best.n))) best = { n, cap, total };
  }
  return best ?? { n: 6, cap: 660 };
}
// Before Saahas (2023 audit): one unlabelled mixed bin type per point, emptied daily (frequency is an estimate),
// sized to an average day's volume with no headroom for peaks or busy days.
const beforeSize = (n) => binsFor(n.rateKgPerDay / BULK[n.wasteType]);
const baselineSetup = {
  nodes: Object.fromEntries(nodes.map((n) => { const b = beforeSize(n); return [n.id, bin('single', b.n, b.cap, 1)]; })),
  sortingMethod: 'manual',
};
// After Saahas (2024): labelled wet/dry/hazardous sets at every point (case study p16), same capacity and schedule.
const afterSaahasSetup = {
  nodes: Object.fromEntries(nodes.map((n) => [n.id, { ...baselineSetup.nodes[n.id], binType: 'segregated' }])),
  sortingMethod: 'manual',
};
// Fake "optimised" fixture for UI tests only: segregated, one size up, small nodes every 2 days.
const optimisedSetup = {
  nodes: Object.fromEntries(nodes.map((n) => {
    const b = binsFor((n.rateKgPerDay / BULK[n.wasteType]) * 1.3);
    return [n.id, bin('segregated', b.n, b.cap, n.rateKgPerDay < 2 ? 2 : 1)];
  })),
  sortingMethod: 'manual',
};

const scenario = {
  version: 1,
  id: 'thapar-2023-before-saahas',
  name: 'Thapar 2023 · before Saahas',
  map: {
    src: 'maps/campus.jpg', widthPx: 2960, heightPx: 1840, metresPerPixel: 0.5153,
    attribution: 'Imagery ©2026 Airbus, Maxar Technologies · Map data ©2026 Google',
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
      recycledKg: r1(correct), landfillKg: r1(split.rejected + split.contaminated * 0.5), co2eAvoidedKg: r1(correct * 1),
      cost: (() => {
        const total = Math.round(transport + binsCost + sortingCost);
        const baleRevenue = Math.round(correct * 40);
        return { transport: Math.round(transport), bins: binsCost, sorting: sortingCost, total, baleRevenue, net: total - baleRevenue, currency: 'INR' };
      })(),
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
  n3: 'Same pattern as Hostel J at a slightly lower rate.',
  n4: 'Low rate; a bigger segregated bin on the existing 3-day cycle is enough.',
  n5: 'Steady mixed stream; segregation cuts cross-contamination.',
  n6: 'Evening spike plus food residue: daily pickup and segregated bins.',
  n7: 'Post-match bottle surge; double capacity on a 2-day cycle.',
  n8: 'Cups and straws pile up mid-afternoon; segregated 240 L every 2 days.',
  n9: 'Very low rate; current weekly pickup already fits.',
  n10: 'Very low rate; keep weekly pickup to save truck km.',
  n11: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n12: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n13: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n14: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n15: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n16: 'Very low rate; weekly pickup already fits.',
  n17: 'Event cups pile up; segregated bin on a 2-day cycle.',
  n18: 'Steady mixed stream; segregation cuts cross-contamination.',
  n19: 'Steady mixed stream; segregation cuts cross-contamination.',
  n20: 'Steady mixed stream; segregation cuts cross-contamination.',
  n21: 'Steady mixed stream; segregation cuts cross-contamination.',
  n22: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n23: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n24: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n25: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n26: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n27: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n28: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n29: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n30: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n31: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n32: 'Bulky bottles from a full hostel; segregated 2×240 L every 2 days.',
  n33: 'Food residue and a meal-time spike: daily pickup, segregated bins.',
  n34: 'Food residue and a meal-time spike: daily pickup, segregated bins.',
  n35: 'Food residue and a meal-time spike: daily pickup, segregated bins.',
  n36: 'Steady mixed stream; segregation cuts cross-contamination.',
  n37: 'Steady mixed stream; segregation cuts cross-contamination.',
  n38: 'Steady mixed stream; segregation cuts cross-contamination.',
  n39: 'Steady mixed stream; segregation cuts cross-contamination.',
  n40: 'Steady mixed stream; segregation cuts cross-contamination.',
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
out('public/demo/demo-scenario.json', scenario);
out('public/demo/demo-scenario-after.json', {
  ...scenario,
  id: 'thapar-2024-after-saahas',
  name: 'Thapar 2024 · after Saahas',
  baselineSetup: afterSaahasSetup,
});
out('fixtures/results.baseline.json', baseline);
out('fixtures/results.optimised.json', optimised);
out('fixtures/proposal.json', proposal);
out('fixtures/llm-raw-response.json', raw);
out('fixtures/llm-stream-events.json', events);
out('fixtures/sweep.json', sweep);
// public/demo/* are real (demo scenario + live cached proposal) and are no longer generated here.
console.info('[fixtures] baseline overflowBinDays', baseline.summary.overflowBinDays, '-> optimised', optimised.summary.overflowBinDays);
