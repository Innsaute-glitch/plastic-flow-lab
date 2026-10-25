// Simulation engine. Pure: simulate(scenario, setup, assumptions, seed) -> Results. Contract: plan.md section 3.1.
// No DOM, no I/O, no Math.random, no Date. See docs/HOW-IT-WORKS.md.
import { mulberry32 } from './prng.js';
import { validateInputs } from './validate.js';
import { bestOrder } from './routing.js';
import { sortPools } from './sorting.js';
import { computeCost } from './cost.js';

export const SIM_VERSION = '1.0.0';
export { validateInputs, computeCost };

export class SimInputError extends Error {
  constructor(errors) {
    super(errors.join('; '));
    this.name = 'SimInputError';
    this.errors = errors;
  }
}

const RESINS = ['pet', 'hdpe', 'pp', 'mixed'];
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;
const zeroPool = () => ({ pet: 0, hdpe: 0, pp: 0, mixed: 0 });

export function simulate(scenario, setup, assumptions, seed) {
  const errors = validateInputs(scenario, setup, assumptions);
  if (errors.length) throw new SimInputError(errors);

  const A = assumptions;
  const days = A.simulation.days.value;
  const hpd = A.simulation.hoursPerDay.value;
  const [actStart, actEnd] = A.generation.activeHours.value;
  const noise = A.generation.dailyNoise.value;
  const lossFrac = A.overflow.lossFraction.value;
  const sideContam = A.contamination.sideWasteContaminated.value;
  const crossAdd = A.contamination.singleBinCrossContamination.value;
  const compliance = A.contamination.segregatedCompliance.value;
  const method = A.sorting.methods.value[setup.sortingMethod];
  const mPerPx = scenario.map.metresPerPixel * A.routing.detourFactor.value;
  const speedMPerMin = (A.routing.truckSpeedKmh.value * 1000) / 60;
  const stopMin = A.routing.stopMinutes.value;
  const fac = scenario.facility;
  const nodes = scenario.nodes;
  const N = nodes.length;

  // ---- per-node static data
  const nd = nodes.map((n) => {
    const s = setup.nodes[n.id];
    const capKg = s.binCount * s.binCapacityL * A.bins.bulkDensityKgPerL.value[n.wasteType];
    const base = A.contamination.baseFraction.value[n.wasteType] ?? 0;
    const add = s.binType === 'segregated' ? crossAdd * (1 - compliance) : crossAdd;
    const mix = A.resinMix[n.wasteType].value;
    // hourly weights: only active hours generate; peak hours weigh `multiplier`
    const w = [];
    let wsum = 0;
    for (let h = 0; h < hpd; h++) {
      let x = h >= actStart && h < actEnd ? 1 : 0;
      if (x && n.peak && h >= n.peak.startHour && h < n.peak.endHour) x = n.peak.multiplier;
      w.push(x); wsum += x;
    }
    return { n, s, capKg, contFrac: Math.min(1, base + add), mix, w: w.map((x) => (wsum > 0 ? x / wsum : 0)) };
  });

  // ---- state & accumulators
  const fill = new Array(N).fill(0);
  const side = new Array(N).fill(0);
  const pn = nodes.map(() => ({ generatedKg: 0, collectedKg: 0, litterKg: 0, overflowDays: 0, pickups: 0, fillSum: 0, maxFillPct: 0, loadSum: 0 }));
  const cycleKg = new Array(N).fill(0); // everything that arrived since the node's last pickup (bin + side + litter)
  const queue = { clean: zeroPool(), cont: zeroPool() };
  const sortedPools = { clean: zeroPool(), cont: zeroPool() };
  let queueKg = 0, sortedCum = 0, litterCum = 0, generated = 0, collectedTotal = 0;
  let overflowBinDays = 0, overflowCalendarDays = 0, routeM = 0, pickups = 0;
  const frames = [];
  const trips = [];
  const routeCache = new Map();
  const rng = mulberry32(seed);

  for (let d = 0; d < days; d++) {
    const factor = nodes.map(() => 1 + (2 * rng() - 1) * noise); // draw order: day, then node
    const overflowedToday = new Array(N).fill(false);
    for (let h = 0; h < hpd; h++) {
      const t = d * hpd + h;
      const fnodes = [];
      for (let i = 0; i < N; i++) {
        const x = nd[i];
        const gen = x.n.rateKgPerDay * factor[i] * x.w[h];
        generated += gen; pn[i].generatedKg += gen; cycleKg[i] += gen;
        let over = 0;
        fill[i] += gen;
        if (fill[i] > x.capKg) { over = fill[i] - x.capKg; fill[i] = x.capKg; }
        const lit = over * lossFrac;
        side[i] += over - lit;
        pn[i].litterKg += lit; litterCum += lit;
        if (over > 0) overflowedToday[i] = true;
        const pct = x.capKg > 0 ? Math.min(100, (fill[i] / x.capKg) * 100) : 100;
        if (pct > pn[i].maxFillPct) pn[i].maxFillPct = pct;
        fnodes.push({ genKg: r3(gen), fillKg: r3(fill[i]), fillPct: r3(pct), overflowKg: r3(over), litterKg: r3(lit) });
      }

      if (h === hpd - 1) {
        // ---- end of day: overflow tally, pickups, routing, facility sorting
        for (let i = 0; i < N; i++) if (overflowedToday[i]) { pn[i].overflowDays++; overflowBinDays++; }
        if (overflowedToday.some(Boolean)) overflowCalendarDays++;

        const due = [];
        for (let i = 0; i < N; i++) if ((d + 1) % nd[i].s.pickupIntervalDays === 0) due.push(i);
        if (due.length) {
          const key = due.join(',');
          let r = routeCache.get(key);
          if (!r) {
            const pts = [fac, ...due.map((i) => nodes[i])];
            const order = bestOrder(pts).map((k) => due[k - 1]);
            const seq = [fac, ...order.map((i) => nodes[i]), fac];
            let px = 0;
            for (let k = 0; k + 1 < seq.length; k++) px += Math.hypot(seq[k].x - seq[k + 1].x, seq[k].y - seq[k + 1].y);
            const m = px * mPerPx;
            r = { order, path: seq.map((p) => [p.x, p.y]), m, mins: m / speedMPerMin + order.length * stopMin };
            routeCache.set(key, r);
          }
          const collected = {};
          for (const i of r.order) {
            const x = nd[i];
            const pct = x.capKg > 0 ? Math.min(100, (fill[i] / x.capKg) * 100) : 100;
            pn[i].fillSum += pct; pn[i].pickups++; pickups++;
            pn[i].loadSum += x.capKg > 0 ? (cycleKg[i] / x.capKg) * 100 : 0;
            cycleKg[i] = 0;
            const binKg = fill[i], sideKg = side[i];
            const total = binKg + sideKg;
            const cont = binKg * x.contFrac + sideKg * sideContam;
            const clean = total - cont;
            for (const k of RESINS) {
              queue.clean[k] += clean * x.mix[k];
              queue.cont[k] += cont * x.mix[k];
            }
            queueKg += total; collectedTotal += total; pn[i].collectedKg += total;
            collected[x.n.id] = r3(total);
            fill[i] = 0; side[i] = 0;
          }
          routeM += r.m;
          trips.push({ day: d, t, route: ['facility', ...r.order.map((i) => nodes[i].id), 'facility'], path: r.path, distanceM: Math.round(r.m), durationMin: Math.round(r.mins), collectedKg: collected });
        }
        // facility sorts up to throughput each day (also on days with no pickup, to clear a backlog)
        if (queueKg > 0) {
          const f = Math.min(1, method.throughputKgPerDay / queueKg);
          for (const g of ['clean', 'cont']) for (const k of RESINS) {
            const take = queue[g][k] * f;
            queue[g][k] -= take; sortedPools[g][k] += take;
          }
          const sortedToday = queueKg * f;
          queueKg -= sortedToday; sortedCum += sortedToday;
        }
      }
      frames.push({ t, day: d, hour: h, nodes: fnodes, facility: { queueKg: r3(queueKg), sortedKgCum: r3(sortedCum) }, litterKgCum: r3(litterCum) });
    }
  }

  // ---- aggregate
  const inBinsEnd = fill.reduce((a, b) => a + b, 0) + side.reduce((a, b) => a + b, 0);
  const litter = litterCum;
  const backlog = queueKg;
  const so = sortPools(sortedPools, method, A);
  const baleMass = so.bale.pet + so.bale.hdpe + so.bale.pp;
  const mech = so.bale;

  const link = (source, target, kg) => ({ source, target, kg: r4(kg) });
  const flows = [
    link('generated', 'litter', litter), link('generated', 'in_bins_end', inBinsEnd), link('generated', 'collected', collectedTotal),
    link('collected', 'backlog_end', backlog), link('collected', 'sorted', so.sorted),
    link('sorted', 'bale_pet', mech.pet), link('sorted', 'bale_hdpe', mech.hdpe), link('sorted', 'bale_pp', mech.pp),
    link('sorted', 'residue_mixed', so.residue), link('sorted', 'contaminated', so.contaminated), link('sorted', 'rejected', so.rejected),
    link('bale_pet', 'route_mechanical', mech.pet), link('bale_hdpe', 'route_mechanical', mech.hdpe), link('bale_pp', 'route_mechanical', mech.pp),
    link('residue_mixed', 'route_chemical', so.residue),
    link('contaminated', 'route_chemical', so.contaminatedToChemical), link('contaminated', 'route_landfill', so.contaminatedToLandfill),
    link('rejected', 'route_landfill', so.rejected),
  ];

  const massBalanceErrorKg =
    Math.abs(generated - (litter + inBinsEnd + collectedTotal)) +
    Math.abs(collectedTotal - (backlog + so.sorted)) +
    Math.abs(so.sorted - (baleMass + so.residue + so.contaminated + so.rejected));

  const routeDistanceKm = routeM / 1000;
  const cost = computeCost({ routeDistanceKm, days }, setup, A);

  const summary = {
    generatedKg: r4(generated), collectedKg: r4(collectedTotal), litterKg: r4(litter), inBinsEndKg: r4(inBinsEnd), backlogEndKg: r4(backlog),
    recoveryRate: generated > 0 ? r4(so.correct / generated) : 0,
    purity: baleMass > 0 ? r4(so.correct / baleMass) : 1,
    contaminationRate: so.sorted > 0 ? r4(so.contaminated / so.sorted) : 0,
    overflowBinDays, overflowCalendarDays,
    routeDistanceKm: r3(routeDistanceKm), truckTrips: trips.length, pickups,
    cost, massBalanceErrorKg: Math.round(massBalanceErrorKg * 1e9) / 1e9,
  };

  const perNode = {};
  nodes.forEach((n, i) => {
    const p = pn[i];
    perNode[n.id] = {
      generatedKg: r3(p.generatedKg), collectedKg: r3(p.collectedKg), litterKg: r3(p.litterKg), overflowDays: p.overflowDays, pickups: p.pickups,
      avgFillPctAtPickup: p.pickups ? Math.round((p.fillSum / p.pickups) * 10) / 10 : 0,
      avgLoadPctAtPickup: p.pickups ? Math.round((p.loadSum / p.pickups) * 10) / 10 : 0, maxFillPct: Math.round(p.maxFillPct * 10) / 10,
    };
  });

  return {
    meta: { scenarioId: scenario.id, seed, days, simVersion: SIM_VERSION, label: 'model results' },
    summary, perNode, flows,
    timeline: { hoursPerFrame: 1, frameCount: frames.length, nodeOrder: nodes.map((n) => n.id), frames, trips },
  };
}
