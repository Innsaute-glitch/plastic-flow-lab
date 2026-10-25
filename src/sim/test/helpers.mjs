import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
export const loadAll = () => ({
  scenario: readJson('fixtures/scenario.demo.json'),
  proposal: readJson('fixtures/proposal.json'),
  assumptions: readJson('config/assumptions.json'),
});

// Small hand-computable world: one node 300 px from the facility, no noise, capacity 25 kg
// (one 100 L bin of density 0.25 kg/L for waste type "mixed").
export function tiny({ rate = 10, interval = 3, capKg = 25, throughput = 1e9, method = 'manual', wasteType = 'mixed', binType = 'single', binCount = 1 } = {}) {
  const { assumptions: base } = loadAll();
  const a = structuredClone(base);
  a.generation.dailyNoise.value = 0;
  a.bins.allowedCapacitiesL.value = [100];
  a.cost.binPerDay.value['100'] = 3;
  a.bins.bulkDensityKgPerL.value[wasteType] = capKg / (100 * binCount);
  a.sorting.methods.value[method].throughputKgPerDay = throughput;
  const scenario = {
    version: 1, id: 'tiny', name: 'tiny',
    map: { src: 'x', widthPx: 1600, heightPx: 1000, metresPerPixel: 0.5 },
    facility: { id: 'facility', name: 'F', x: 1000, y: 500 },
    nodes: [{ id: 'n1', name: 'A', x: 700, y: 500, wasteType, rateKgPerDay: rate, peak: null, observed: null }],
    baselineSetup: null, lastProposal: null, settings: { days: 30, seed: 1 },
  };
  const setup = { nodes: { n1: { binType, binCount, binCapacityL: 100, pickupIntervalDays: interval } }, sortingMethod: method };
  return { scenario, setup, assumptions: a };
}
