// Usage: node server/cli-optimise.mjs <scenario.json> <results.json>  -> Proposal JSON on stdout.
import { readFileSync } from 'node:fs';
import { runOptimisation } from './api.js';
import { scenarioFingerprint } from '../src/llm/fingerprint.js';

const [scenarioPath, resultsPath] = process.argv.slice(2);
if (!scenarioPath || !resultsPath) {
  console.error('[cli] usage: node server/cli-optimise.mjs <scenario.json> <results.json>');
  process.exit(2);
}
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
let n = 0;
const emit = (type, data) => {
  if (type === 'status') console.error(`[cli] ${data.stage}`);
  if (type === 'delta') n += data.text.length;
};
try {
  const proposal = await runOptimisation(
    { scenario, baselineSetup: scenario.baselineSetup, baselineSummary: results.summary, perNode: results.perNode, history: [] },
    emit
  );
  console.error(`[cli] streamed ${n} chars`);
  // fingerprint lets demo mode refuse to replay this proposal for an edited scenario
  process.stdout.write(JSON.stringify({ ...proposal, fingerprint: scenarioFingerprint(scenario) }, null, 2) + '\n');
} catch (e) {
  console.error('[cli] failed:', e.message);
  process.exit(1);
}
