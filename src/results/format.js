// Pure helpers for the results UI: formatting, deltas, setup diff, partial-JSON parsing.
// No DOM, no model numbers. Metrics are only formatted / differenced here, never computed.
import { budgetCheck } from '../shared/budget.js';

const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtInt = (n) => nf0.format(Math.round(n));
export const fmtDec1 = (n) => nf1.format(n);
export const fmtPct1 = (frac) => nf1.format(frac * 100); // fraction -> "28.5"
export const fmtKg = (n) => (n >= 100 ? nf0.format(n) : nf1.format(n)) + ' kg';
const MINUS = '\u2212';
/** Compact rupees: "₹850", "₹47.0k", "₹1.23M". Magnitude only (no sign). */
export function fmtInr(n) {
  const a = Math.abs(n);
  if (a < 1000) return '₹' + nf0.format(Math.round(a));
  if (a < 1e6) return '₹' + nf1.format(a / 1000) + 'k';
  return '₹' + (a / 1e6).toFixed(2) + 'M';
}
/** Signed compact rupees with a real minus sign: "−₹12.5k". */
export const fmtInrSigned = (n) => (Math.abs(n) < 0.5 ? '₹0' : (n < 0 ? MINUS : '') + fmtInr(n));
/** CO2e: kg below one tonne, tonnes above. */
export const fmtCo2 = (kg) => (Math.abs(kg) >= 1000 ? (kg / 1000).toFixed(2) + ' t' : nf0.format(Math.round(kg)) + ' kg');

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
  // cost = NET of bale revenue (spend - bale sales); negative = surplus
  { key: 'cost', label: 'Net cost (− = surplus)', short: 'Net cost', unit: 'INR', prefix: '₹', get: (s) => s.cost.net, decimals: 0, better: 'down', isCost: true },
];

export function formatMetric(m, value) {
  const s = m.decimals === 0 ? fmtInt(Math.abs(value)) : fmtDec1(Math.abs(value));
  return (value < 0 && Math.round(Math.abs(value) * 10 ** m.decimals) > 0 ? MINUS : '') + (m.prefix || '') + s;
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

/**
 * Budget line for the compare view (net rule, plan.md v0.3):
 * within budget when net(plan) - net(baseline) <= tolerance x baseline spend. Uses src/shared/budget.js.
 * Takes the two `summary.cost` objects. tolerance is a fraction (0.25).
 */
export function budgetStatus(baseCost, planCost, tolerance) {
  const { extraNet, allowance, within } = budgetCheck(baseCost, planCost, tolerance);
  const extraSpend = planCost.total - baseCost.total;
  const extraRevenue = (planCost.baleRevenue ?? 0) - (baseCost.baleRevenue ?? 0);
  const more = (x) => (Math.abs(x) < 0.5 ? 'about the same' : `${fmtInr(x)} ${x > 0 ? 'more' : 'less'}`);
  const detail = `spends ${more(extraSpend)}, earns ${more(extraRevenue)} in bales`;
  const over = extraNet - allowance;
  return {
    extraNet,
    allowance,
    within,
    text: within ? `Within budget \u00B7 ${detail}` : `Over budget by ${fmtInr(over)} \u00B7 ${detail}`,
    limitText: `net may rise by up to ${fmtInr(allowance)} (${Math.round(tolerance * 100)}% of baseline spend)`,
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

// ---------- gains ("i" popover) ----------
// Each row: { key, label, value, tone: 'good' | 'bad' | 'flat' | 'plain', icon }. Pure: the DOM lives in gains.js.
const signed = (n, f, eps) => (Math.abs(n) < eps ? null : (n > 0 ? '+' : MINUS) + f(Math.abs(n)));
const toneOf = (n, eps, goodWhenUp) => (Math.abs(n) < eps ? 'flat' : (n > 0) === goodWhenUp ? 'good' : 'bad');

/** Gains of one run, from its summary. */
export function gainsRows(s) {
  const c = s.cost;
  const net = c.net ?? c.total - (c.baleRevenue ?? 0);
  return [
    { key: 'revenue', label: 'Bale revenue', value: '+' + fmtInr(c.baleRevenue ?? 0), tone: 'good', icon: 'coin' },
    { key: 'net', label: net < 0 ? 'Net result (surplus)' : 'Net result (cost)', value: fmtInr(net), tone: net < 0 ? 'good' : 'plain', icon: 'scale' },
    { key: 'recycled', label: 'Plastic recycled', value: fmtKg(s.recycledKg ?? 0), tone: 'good', icon: 'recycle' },
    { key: 'co2e', label: 'CO\u2082e avoided', value: fmtCo2(s.co2eAvoidedKg ?? 0), tone: 'good', icon: 'leaf' },
    { key: 'landfill', label: 'Sent to landfill', value: fmtKg(s.landfillKg ?? 0), tone: 'plain', icon: 'bin' },
    { key: 'litter', label: 'Litter', value: fmtKg(s.litterKg ?? 0), tone: 'plain', icon: 'litter' },
  ];
}

/** Gains of the AI plan relative to the baseline (honest signs; good = green, worse = red). */
export function gainsDeltaRows(b, o) {
  const bc = b.cost, oc = o.cost;
  const bn = bc.net ?? bc.total - (bc.baleRevenue ?? 0), on = oc.net ?? oc.total - (oc.baleRevenue ?? 0);
  const row = (key, label, icon, d, f, eps, goodWhenUp) => ({
    key, label, icon, tone: toneOf(d, eps, goodWhenUp), value: signed(d, f, eps) ?? 'no change',
  });
  return [
    row('revenue', 'Bale revenue', 'coin', (oc.baleRevenue ?? 0) - (bc.baleRevenue ?? 0), fmtInr, 0.5, true),
    row('spend', 'Spend', 'spend', oc.total - bc.total, fmtInr, 0.5, false),
    row('net', 'Net cost (surplus if negative)', 'scale', on - bn, fmtInr, 0.5, false),
    row('recycled', 'Plastic recycled', 'recycle', (o.recycledKg ?? 0) - (b.recycledKg ?? 0), fmtKg, 0.05, true),
    row('co2e', 'CO\u2082e avoided', 'leaf', (o.co2eAvoidedKg ?? 0) - (b.co2eAvoidedKg ?? 0), fmtCo2, 0.5, true),
    row('landfill', 'Sent to landfill', 'bin', (o.landfillKg ?? 0) - (b.landfillKg ?? 0), fmtKg, 0.05, false),
    row('litter', 'Litter', 'litter', (o.litterKg ?? 0) - (b.litterKg ?? 0), fmtKg, 0.05, false),
    row('overflow', 'Overflow bin-days', 'overflow', o.overflowBinDays - b.overflowBinDays, fmtInt, 0.5, false),
  ];
}

export const GAINS_FOOTNOTE = 'Bale prices and CO\u2082e factors are estimates \u2014 see Assumptions.';
