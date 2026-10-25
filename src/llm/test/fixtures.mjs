import { readFileSync } from 'node:fs';
const j = (p) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8'));
export const scenario = j('fixtures/scenario.demo.json');
export const baseline = j('fixtures/results.baseline.json');
export const assumptions = j('config/assumptions.json');
export const rawResponse = j('fixtures/llm-raw-response.json');
export const cached = j('public/demo/cached-proposal.json');
