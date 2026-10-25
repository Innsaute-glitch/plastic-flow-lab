// Pure helpers for the results UI: formatting, deltas, setup diff, partial-JSON parsing.
// No DOM, no model numbers. Metrics are only formatted / differenced here, never computed.

const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtInt = (n) => nf0.format(Math.round(n));
export const fmtDec1 = (n) => nf1.format(n);
export const fmtPct1 = (frac) => nf1.format(frac * 100); // fraction -> "28.5"
export const fmtKg = (n) => (n >= 100 ? nf0.format(n) : nf1.format(n)) + ' kg';

/**
 * Metric table. `get` reads the summary, `scale` converts fraction -> % for the UI,
 * `better` says which direction is an improvement.
 */
export const METRICS = [
  { key: 'overflow', label: 'Overflow bin-days', short: 'Overflow', unit: '', get: (s) => s.overflowBinDays, decimals: 0, better: 'down', hero: true },
  { key: 'recovery', label: 'Recovery rate', short: 'Recovery', unit: '%', get: (s) => s.recoveryRate * 100, decimals: 1, better: 'up' },
  { key: 'purity', label: 'Bale purity', short: 'Purity', unit: '%', get: (s) => s.purity * 100, decimals: 1, better: 'up' },
  { key: 'contamination', label: 'Contamination', short: 'Contam.', unit: '%', get: (s) => s.contaminationRate * 100, decimals: 1, better: 'down' },
  { key: 'km', label: 'Route distance', short: 'Route', unit: 'km', get: (s) => s.routeDistanceKm, decimals: 1, better: 'down' },
  { key: 'cost', label: 'Total cost', short: 'Cost', unit: 'INR', prefix: '₹', get: (s) => s.cost.total, decimals: 0, better: 'down', isCost: true },
];

export function formatMetric(m, value) {
  const s = m.decimals === 0 ? fmtInt(value) : fmtDec1(value);
  return (m.prefix || '') + s;
}

/**
 * Delta between two metric values.
 * dir: "up" | "down" | "flat"; tone: "good" | "bad" | "flat".
 * pct is relative change (0.83 = 83%); null when before is 0.
 */
export function deltaFor(m, before, after) {
  const abs = after - before;
  const eps = 0.5 * Math.pow(10, -m.decimals);
  const flat = Math.abs(abs) < eps;
  const dir = flat ? 'flat' : abs > 0 ? 'up' : 'down';
  let tone = 'flat';
  if (!flat) tone = (m.better === 'up') === (dir === 'up') ? 'good' : 'bad';
  const pct = before === 0 ? null : Math.abs(abs) / Math.abs(before);
  return { abs, dir, tone, pct };
}

/** "Within budget +22%" status for the cost line. tolerance is a fraction (0.25). */
export function budgetStatus(baseTotal, optTotal, tolerance) {
  const change = baseTotal === 0 ? 0 : (optTotal - baseTotal) / baseTotal;
  const within = change <= tolerance + 1e-9;
  const sign = change >= 0 ? '+' : '−';
  return {
    change,
    within,
    text: `${within ? 'Within budget' : 'Over budget'} ${sign}${Math.round(Math.abs(change) * 100)}%`,
    limitText: `limit +${Math.round(tolerance * 100)}%`,
  };
}

/** min/max of a metric across the sweep summaries. */
export function sweepRange(summaries, m) {
  const vals = (summaries || []).map((s) => m.get(s));
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), vals };
}

/** How many seeds the optimised run beats the baseline on a metric. */
export function sweepWins(sweep, m) {
  if (!sweep || !sweep.baseline || !sweep.optimised) return { wins: 0, total: 0 };
  const n = Math.min(sweep.baseline.length, sweep.optimised.length);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const d = deltaFor(m, m.get(sweep.baseline[i]), m.get(sweep.optimised[i]));
    if (d.tone === 'good') wins++;
  }
  return { wins, total: n };
}

/** Per-node setup diff. Returns [{id, name, changed, parts: string[]}]. */
export function setupChanges(scenario, baseSetup, newSetup) {
  const out = [];
  for (const node of scenario.nodes) {
    const a = baseSetup.nodes[node.id];
    const b = newSetup.nodes[node.id];
    const parts = [];
    if (a && b) {
      if (a.pickupIntervalDays !== b.pickupIntervalDays) parts.push(`interval ${a.pickupIntervalDays}→${b.pickupIntervalDays} d`);
      if (a.binCount !== b.binCount || a.binCapacityL !== b.binCapacityL) {
        parts.push(`bins ${a.binCount}×${a.binCapacityL} L → ${b.binCount}×${b.binCapacityL} L`);
      }
      if (a.binType !== b.binType) parts.push(`${a.binType} → ${b.binType}`);
    }
    out.push({ id: node.id, name: node.name, changed: parts.length > 0, parts });
  }
  return out;
}

/**
 * Pull completed `"rationale": "..."` strings out of a partial raw JSON stream.
 * Returns [{key: nodeId | "sorting", text}] in stream order, complete strings only.
 */
export function parseRationales(text) {
  const out = [];
  if (!text) return out;
  const re = /"id"\s*:\s*"([^"]+)"|"rationale"\s*:\s*"((?:[^"\\]|\\.)*)"|"sortingRationale"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let lastId = null;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) lastId = m[1];
    else if (m[2] !== undefined) out.push({ key: lastId, text: unescapeJson(m[2]) });
    else out.push({ key: 'sorting', text: unescapeJson(m[3]) });
  }
  return out;
}

function unescapeJson(s) {
  try {
    return JSON.parse('"' + s + '"');
  } catch {
    return s;
  }
}

export function sourceBadge(source) {
  if (source === 'cached') return { label: 'Cached (demo)', tone: 'cached' };
  if (source === 'heuristic') return { label: 'Heuristic fallback', tone: 'heuristic' };
  return { label: 'LLM', tone: 'llm' };
}
