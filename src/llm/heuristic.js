// Pure rule-based fallback. Contract: plan.md §3.1 heuristicProposal. source: "heuristic".
import { validateAndClamp } from './schema.js';


export function binCostPerDay(s, a) {
  const mult = s.binType === 'segregated' ? a.cost.segregatedBinMultiplier.value : 1;
  return a.cost.binPerDay.value[String(s.binCapacityL)] * mult;
}

/** Litres needed at pickup: rate x interval x (1 + noise) / bulk density / (1 - headroom). */
export function neededLitres(n, intervalDays, a) {
  return (n.rateKgPerDay * intervalDays * (1 + a.generation.dailyNoise.value)) / a.bins.bulkDensityKgPerL.value[n.wasteType] / (1 - a.bins.sizingHeadroom.value);
}

function projectedCost(setup, scenario, baselineSetup, baselineResults, a) {
  const days = a.simulation.days.value;
  let bins = 0;
  let invK = 0;
  let invK0 = 0;
  for (const n of scenario.nodes) {
    const s = setup.nodes[n.id];
    bins += s.binCount * binCostPerDay(s, a) * days;
    invK += 1 / s.pickupIntervalDays;
    invK0 += 1 / baselineSetup.nodes[n.id].pickupIntervalDays;
  }
  // Transport scales with the number of pickups; stops dominate the route length.
  const transport = baselineResults.summary.cost.transport * (invK0 > 0 ? invK / invK0 : 1);
  return transport + bins + a.cost.sortingPerDay.value[setup.sortingMethod] * days;
}

function peakDailyCollectionKg(setup, scenario, a) {
  const days = a.simulation.days.value;
  const noise = 1 + a.generation.dailyNoise.value;
  let peak = 0;
  for (let d = 0; d < days; d++) {
    let kg = 0;
    for (const n of scenario.nodes) {
      const k = setup.nodes[n.id].pickupIntervalDays;
      if ((d + 1) % k === 0) kg += n.rateKgPerDay * k * noise;
    }
    peak = Math.max(peak, kg);
  }
  return peak;
}

function chooseNode(n, base, a, segregate) {
  const [minCnt, maxCnt] = a.llmLimits.binCount.value;
  const [minInt] = a.llmLimits.pickupIntervalDays.value;
  const caps = [...a.bins.allowedCapacitiesL.value].sort((x, y) => x - y);
  const binType = segregate ? 'segregated' : base.binType;
  // Interval first: the longest one (<= baseline) that some allowed bin set can hold.
  // Then the smallest total capacity that covers the need; ties go to fewer bins.
  for (let k = base.pickupIntervalDays; k >= minInt; k--) {
    const need = neededLitres(n, k, a);
    let best = null;
    for (let cnt = minCnt; cnt <= maxCnt; cnt++) {
      for (const cap of caps) {
        const total = cnt * cap;
        if (total >= need && (!best || total < best.total)) best = { total, binType, binCount: cnt, binCapacityL: cap, pickupIntervalDays: k };
      }
    }
    if (best) {
      const { total, ...setup } = best;
      return setup;
    }
  }
  return { binType, binCount: maxCnt, binCapacityL: caps[caps.length - 1], pickupIntervalDays: minInt };
}

export function heuristicProposal(scenario, baselineSetup, baselineResults, assumptions) {
  const a = assumptions;
  const tol = a.llmLimits.budgetTolerance.value;
  const budget = baselineResults.summary.cost.total * (1 + tol);
  const base = a.contamination.baseFraction.value;
  const nodes = {};
  const why = {};
  for (const n of scenario.nodes) {
    const segregate = base[n.wasteType] >= 0.2;
    nodes[n.id] = chooseNode(n, baselineSetup.nodes[n.id], a, segregate);
  }
  const setup = { nodes, sortingMethod: baselineSetup.sortingMethod };

  // Cheapest sorting method that covers the peak daily collection.
  const methods = a.sorting.methods.value;
  const order = Object.keys(methods).sort((x, y) => a.cost.sortingPerDay.value[x] - a.cost.sortingPerDay.value[y]);
  const peakKg = peakDailyCollectionKg(setup, scenario, a);
  setup.sortingMethod = order.find((m) => methods[m].throughputKgPerDay >= peakKg) ?? order[order.length - 1];

  // Budget: first step the sorter down, then drop segregation on the least-contaminated nodes.
  const droppable = scenario.nodes
    .filter((n) => nodes[n.id].binType === 'segregated' && baselineSetup.nodes[n.id].binType === 'single')
    .sort((x, y) => base[x.wasteType] - base[y.wasteType]);
  while (projectedCost(setup, scenario, baselineSetup, baselineResults, a) > budget && order.indexOf(setup.sortingMethod) > 0) {
    setup.sortingMethod = order[order.indexOf(setup.sortingMethod) - 1];
  }
  while (projectedCost(setup, scenario, baselineSetup, baselineResults, a) > budget && droppable.length) {
    nodes[droppable.shift().id].binType = 'single';
  }
  const cost = projectedCost(setup, scenario, baselineSetup, baselineResults, a);

  const rationales = {};
  for (const n of scenario.nodes) {
    const s = nodes[n.id];
    const need = Math.round(neededLitres(n, s.pickupIntervalDays, a));
    rationales[n.id] = `${n.rateKgPerDay} kg/day over ${s.pickupIntervalDays} d needs ~${need} L -> ${s.binCount}x${s.binCapacityL} L${s.binType === 'segregated' ? ' (segregated)' : ''}.`;
  }
  const m = methods[setup.sortingMethod];
  const sortingRationale = `${m.label} handles the peak collection day (about ${Math.round(peakKg)} kg vs ${m.throughputKgPerDay} kg/day) at the lowest cost.`;

  // Self-check through the shared validator so the output is guaranteed in range.
  const v = validateAndClamp(
    { nodes: scenario.nodes.map((n) => ({ id: n.id, ...nodes[n.id] })), sortingMethod: setup.sortingMethod },
    scenario, baselineSetup, a
  );
  return {
    source: 'heuristic',
    model: 'rule-based',
    createdAt: new Date().toISOString(),
    round: 1,
    scenarioId: scenario.id,
    setup: v.setup,
    rationales,
    sortingRationale,
    summary: `Rule-based plan: size each bin set to the smallest that fits with ${Math.round(a.bins.sizingHeadroom.value * 100)}% headroom, segregate high-contamination streams. Estimated cost INR ${Math.round(cost)} vs budget ${Math.round(budget)}.`,
    clampNotes: v.clampNotes,
    raw: '',
  };
}
