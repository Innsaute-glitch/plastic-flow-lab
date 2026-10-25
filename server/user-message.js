// Builds the compact JSON user message. Positions are converted to metres from the facility.
import { readFileSync } from 'node:fs';
import { budgetCap } from '../src/shared/budget.js';

const ROOT = new URL('..', import.meta.url);
export const loadJson = (rel) => JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8'));

const neededLitresPerDay = (n, a) =>
  (n.rateKgPerDay * (1 + a.generation.dailyNoise.value)) / a.bins.bulkDensityKgPerL.value[n.wasteType] / (1 - a.bins.sizingHeadroom.value);

const r1 = (v) => Math.round(v * 10) / 10;

export function buildUserMessage({ scenario, baselineSetup, baselineSummary, perNode, history = [] }, assumptions) {
  const a = assumptions;
  const mpp = scenario.map.metresPerPixel * a.routing.detourFactor.value;
  const f = scenario.facility;
  const nodes = scenario.nodes.map((n) => {
    const px = Math.hypot(n.x - f.x, n.y - f.y);
    return {
      id: n.id,
      name: n.name,
      wasteType: n.wasteType,
      rateKgPerDay: n.rateKgPerDay,
      peak: n.peak ?? null,
      roadDistanceToFacilityM: Math.round(px * mpp),
      offsetFromFacilityM: { east: Math.round((n.x - f.x) * scenario.map.metresPerPixel), south: Math.round((n.y - f.y) * scenario.map.metresPerPixel) },
      bulkDensityKgPerL: a.bins.bulkDensityKgPerL.value[n.wasteType],
      neededLitresPerDay: Math.round(neededLitresPerDay(n, a) * 10) / 10,
      baseContamination: a.contamination.baseFraction.value[n.wasteType],
      current: baselineSetup.nodes[n.id],
      baseline: perNode?.[n.id] ?? null,
      observed: n.observed ?? null,
    };
  });
  const s = baselineSummary;
  const input = {
    days: a.simulation.days.value,
    nodes,
    currentSortingMethod: baselineSetup.sortingMethod,
    baselineSummary: {
      overflowBinDays: s.overflowBinDays, overflowCalendarDays: s.overflowCalendarDays, litterKg: s.litterKg,
      generatedKg: s.generatedKg, recoveryRate: s.recoveryRate, purity: s.purity, contaminationRate: s.contaminationRate,
      routeDistanceKm: s.routeDistanceKm, truckTrips: s.truckTrips, cost: s.cost,
      recycledKg: s.recycledKg, landfillKg: s.landfillKg, co2eAvoidedKg: s.co2eAvoidedKg,
    },
    budget: {
      rule: 'netCost = total spend - bale revenue; your plan must have netCost <= maxNetCostInr',
      baselineSpendInr: s.cost.total,
      baselineBaleRevenueInr: s.cost.baleRevenue,
      baselineNetCostInr: s.cost.net,
      tolerance: a.llmLimits.budgetTolerance.value,
      maxNetCostInr: budgetCap(s.cost, a.llmLimits.budgetTolerance.value),
    },
    unitPrices: { transportInrPerKm: a.cost.transportPerKm.value, binInrPerDayByCapacityL: a.cost.binPerDay.value, segregatedBinMultiplier: a.cost.segregatedBinMultiplier.value, sortingInrPerDay: a.cost.sortingPerDay.value, baleSalePriceInrPerKg: a.revenue.balePricePerKg.value, co2eAvoidedKgPerKgRecycled: a.revenue.co2eAvoidedKgPerKg.value },
    limits: {
      pickupIntervalDays: a.llmLimits.pickupIntervalDays.value,
      binCount: a.llmLimits.binCount.value,
      allowedCapacitiesL: a.bins.allowedCapacitiesL.value,
      binTypes: ['single', 'segregated'],
      sortingMethods: Object.fromEntries(
        Object.entries(a.sorting.methods.value).map(([k, m]) => [k, { accuracy: m.accuracy, contaminantDetection: m.contaminantDetection, throughputKgPerDay: m.throughputKgPerDay }])
      ),
    },
    sizing: { headroom: a.bins.sizingHeadroom.value, formula: 'neededLitres = neededLitresPerDay x pickupIntervalDays; choose the smallest binCount x binCapacityL >= neededLitres' },
    pickupRule: 'Interval k collects at the end of day d when (d+1) % k === 0. Bins start empty. Generation happens only between hours ' + a.generation.activeHours.value.join(' and ') + '.',
    previousRounds: history,
  };
  return 'Propose an improved setup for this network. Input:\n' + JSON.stringify(input);
}

export function buildRetryMessage(userMessage, rawText, errors) {
  return `${userMessage}\n\nYour previous reply was rejected:\n${(rawText || '').slice(0, 600)}\n\nProblems:\n- ${errors.join('\n- ')}\n\nReturn the complete corrected JSON object only.`;
}
