// Pure helpers (no DOM) so they can be tested under node:test.
export const MAX_NODES = 40;

export function emptyScenario(assumptions, mapDefaults = {}) {
  return {
    version: 1,
    id: 'scenario-new',
    name: 'New scenario',
    map: {
      src: 'maps/campus.jpg',
      widthPx: 2960,
      heightPx: 1840,
      metresPerPixel: assumptions?.map?.defaultMetresPerPixel?.value ?? 0.5153,
      attribution: 'Imagery ©2026 Airbus, Maxar Technologies · Map data ©2026 Google',
      ...mapDefaults,
    },
    facility: null,
    nodes: [],
    baselineSetup: { nodes: {}, sortingMethod: 'manual' },
    lastProposal: null,
    assumptionOverrides: {},
    settings: { days: 30, seed: 42 },
  };
}

export function defaultNodeSetup(assumptions) {
  return {
    binType: 'single',
    binCount: 1,
    binCapacityL: assumptions?.bins?.defaultCapacityL?.value ?? 120,
    pickupIntervalDays: 3,
  };
}

export function nextNodeId(nodes) {
  const used = new Set(nodes.map((n) => n.id));
  for (let i = 1; i <= MAX_NODES; i++) if (!used.has(`n${i}`)) return `n${i}`;
  return null;
}

/** Validate shape and fill only missing fields. Idempotent on complete scenarios. Throws Error with a readable message. */
export function normaliseScenario(obj, assumptions) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a scenario file.');
  if (!obj.map || !Array.isArray(obj.nodes)) throw new Error('Scenario file needs "map" and "nodes".');
  if (obj.nodes.length > MAX_NODES) throw new Error(`Scenario has more than ${MAX_NODES} nodes.`);
  const base = emptyScenario(assumptions);
  const s = structuredClone(obj);
  const out = {
    ...base,
    ...s,
    map: { ...base.map, ...s.map },
    settings: { ...base.settings, ...(s.settings ?? {}) },
    facility: s.facility ?? null,
    lastProposal: s.lastProposal ?? null,
    assumptionOverrides: s.assumptionOverrides ?? {},
  };
  const setup = { ...base.baselineSetup, ...(s.baselineSetup ?? {}) };
  setup.nodes = { ...(setup.nodes ?? {}) };
  for (const n of out.nodes) {
    if (!n.id) throw new Error('A node is missing its id.');
    if (!setup.nodes[n.id]) setup.nodes[n.id] = defaultNodeSetup(assumptions);
  }
  out.baselineSetup = setup;
  return out;
}

export function snapCapacity(value, allowed) {
  return allowed.reduce((best, c) => (Math.abs(c - value) < Math.abs(best - value) ? c : best), allowed[0]);
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

const num = (v) => (v === undefined || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** CSV text -> { nodes, nodeSetups, warnings }. Node ids are assigned n1.. in row order. Positions are null when absent. */
export function csvToNodes(text, assumptions, wasteTypes) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error('CSV has no data rows.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  if (!head.includes('name')) throw new Error('CSV needs a "name" column (see data/nodes.template.csv).');
  const warnings = [];
  const allowed = assumptions.bins.allowedCapacitiesL.value;
  const [ivMin, ivMax] = assumptions.llmLimits.pickupIntervalDays.value;
  const [bcMin, bcMax] = assumptions.llmLimits.binCount.value;
  let data = rows.slice(1);
  if (data.length > MAX_NODES) {
    warnings.push(`Only the first ${MAX_NODES} rows were imported.`);
    data = data.slice(0, MAX_NODES);
  }
  const nodes = [];
  const nodeSetups = {};
  data.forEach((cells, i) => {
    const r = {};
    head.forEach((h, k) => (r[h] = (cells[k] ?? '').trim()));
    const id = `n${i + 1}`;
    let wasteType = r.waste_type;
    if (!wasteTypes.includes(wasteType)) {
      if (wasteType) warnings.push(`Row ${i + 2}: unknown waste_type "${wasteType}", using mixed.`);
      wasteType = 'mixed';
    }
    const ps = num(r.peak_start_hour), pe = num(r.peak_end_hour), pm = num(r.peak_multiplier);
    const peak = ps !== null && pe !== null && pm !== null ? { startHour: ps, endHour: pe, multiplier: pm } : null;
    const od = num(r.observed_overflow_days);
    const observed = od !== null ? { overflowDays: od, fillPctAtPickup: num(r.observed_fill_pct_at_pickup) ?? 0 } : null;
    const x = num(r.x), y = num(r.y);
    nodes.push({
      id,
      name: r.name || `Node ${i + 1}`,
      x: x !== null && y !== null ? x : null,
      y: x !== null && y !== null ? y : null,
      wasteType,
      rateKgPerDay: Math.max(0, num(r.rate_kg_per_day) ?? 0),
      peak,
      observed,
    });
    const cap = num(r.bin_capacity_l) ?? assumptions.bins.defaultCapacityL.value;
    const snapped = snapCapacity(cap, allowed);
    if (snapped !== cap) warnings.push(`Row ${i + 2}: capacity ${cap} L snapped to ${snapped} L.`);
    nodeSetups[id] = {
      binType: r.bin_type === 'segregated' ? 'segregated' : 'single',
      binCount: Math.min(bcMax, Math.max(bcMin, Math.round(num(r.bin_count) ?? 1))),
      binCapacityL: snapped,
      pickupIntervalDays: Math.min(ivMax, Math.max(ivMin, Math.round(num(r.pickup_interval_days) ?? 3))),
    };
  });
  return { nodes, nodeSetups, warnings };
}

export const CALIBRATION_DEFAULTS = { minMapWidthM: 50, maxMapWidthM: 50000, minPointGapScreenPx: 24 };

/** "1.53 km", "20 m", "20 cm" */
export const fmtLength = (m) => (m >= 1000 ? `${+(m / 1000).toPrecision(3)} km` : m >= 1 ? `${+m.toPrecision(3)} m` : `${+(m * 100).toPrecision(3)} cm`);

/** Plausibility of a map scale: null if fine, else { widthM, text }. Limits from config/ui.json "calibration". */
export function mapScaleProblem(map, limits = {}) {
  const lim = { ...CALIBRATION_DEFAULTS, ...limits };
  const mpp = Number(map?.metresPerPixel);
  if (!(mpp > 0) || !(map?.widthPx > 0)) return { widthM: NaN, text: 'the map scale (metres per pixel) is missing or not a positive number' };
  const widthM = map.widthPx * mpp;
  if (widthM < lim.minMapWidthM || widthM > lim.maxMapWidthM) return { widthM, text: `the whole map would be ${fmtLength(widthM)} wide` };
  return null;
}
