// Prints baseline vs proposal for the demo scenario (npm run test:sim). Also reports simulate() timing.
import { simulate } from '../index.js';
import { loadAll } from './helpers.mjs';

const { scenario, proposal, assumptions } = loadAll();
const seed = scenario.settings.seed;
const time = (setup) => {
  simulate(scenario, setup, assumptions, seed); // warm-up
  const t0 = performance.now();
  const r = simulate(scenario, setup, assumptions, seed);
  return { r, ms: performance.now() - t0 };
};
const b = time(scenario.baselineSetup);
const o = time(proposal.setup);
const rows = [
  ['Generated (kg)', (s) => s.generatedKg.toFixed(1)],
  ['Collected (kg)', (s) => s.collectedKg.toFixed(1)],
  ['Litter (kg)', (s) => s.litterKg.toFixed(1)],
  ['Backlog at end (kg)', (s) => s.backlogEndKg.toFixed(1)],
  ['Overflow bin-days', (s) => s.overflowBinDays],
  ['Overflow calendar days', (s) => s.overflowCalendarDays],
  ['Recovery rate', (s) => (s.recoveryRate * 100).toFixed(1) + '%'],
  ['Purity', (s) => (s.purity * 100).toFixed(1) + '%'],
  ['Contamination rate', (s) => (s.contaminationRate * 100).toFixed(1) + '%'],
  ['Truck trips', (s) => s.truckTrips],
  ['Route distance (km)', (s) => s.routeDistanceKm.toFixed(1)],
  ['Total cost (INR)', (s) => Math.round(s.cost.total)],
];
console.info(`\n[sim] ${scenario.name}, seed ${seed}, simulate() ${b.ms.toFixed(1)} ms / ${o.ms.toFixed(1)} ms`);
console.info('Metric'.padEnd(26) + 'Baseline'.padStart(12) + 'Proposal'.padStart(12));
for (const [label, f] of rows) console.info(label.padEnd(26) + String(f(b.r.summary)).padStart(12) + String(f(o.r.summary)).padStart(12));
if (!(o.r.summary.overflowBinDays < b.r.summary.overflowBinDays)) {
  console.error('[sim] expected overflow bin-days to fall under the proposal');
  process.exit(1);
}
