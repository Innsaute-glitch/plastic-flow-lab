// Pure, shared by browser and server. Contract: plan.md §3.1 validateAndClamp.
const NO_RATIONALE = '(no rationale given)';
const BIN_TYPES = ['single', 'segregated'];

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function snapCapacity(v, allowed) {
  let best = allowed[0];
  for (const c of allowed) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

function str(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Pull a JSON object out of raw model text (tolerates code fences and prose). Returns object or null. */
export function parseModelJson(text) {
  if (isObj(text)) return text;
  if (typeof text !== 'string') return null;
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      return isObj(v) ? v : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const v = tryParse(fence[1].trim());
    if (v) return v;
  }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  return a >= 0 && b > a ? tryParse(text.slice(a, b + 1)) : null;
}

export function validateAndClamp(rawObj, scenario, baselineSetup, assumptions) {
  const empty = (errors) => ({
    ok: false,
    setup: baselineSetup,
    rationales: {},
    sortingRationale: NO_RATIONALE,
    summary: '',
    clampNotes: [],
    errors,
  });
  const obj = typeof rawObj === 'string' ? parseModelJson(rawObj) : rawObj;
  if (!isObj(obj)) return empty(['Response is not a JSON object.']);
  if (!Array.isArray(obj.nodes)) return empty(['Response has no "nodes" array.']);

  const lim = assumptions.llmLimits;
  const [minInt, maxInt] = lim.pickupIntervalDays.value;
  const [minCnt, maxCnt] = lim.binCount.value;
  const allowedCaps = assumptions.bins.allowedCapacitiesL.value;
  const methods = Object.keys(assumptions.sorting.methods.value);
  const notes = [];
  const rawById = new Map();
  for (const n of obj.nodes) if (isObj(n) && typeof n.id === 'string') rawById.set(n.id, n);

  const intField = (id, field, raw, base, lo, hi) => {
    const num = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      if (raw !== undefined) notes.push(`${id}.${field} ${str(raw)} -> ${base}`);
      else notes.push(`${id}.${field} (missing) -> ${base}`);
      return base;
    }
    const out = Math.min(hi, Math.max(lo, Math.round(num)));
    if (out !== num) notes.push(`${id}.${field} ${num} -> ${out}`);
    return out;
  };

  const nodes = {};
  const rationales = {};
  for (const sn of scenario.nodes) {
    const id = sn.id;
    const base = baselineSetup.nodes[id];
    const r = rawById.get(id);
    if (!r) {
      nodes[id] = { ...base };
      rationales[id] = NO_RATIONALE;
      notes.push(`${id} missing from response -> baseline kept`);
      continue;
    }
    let binType = r.binType;
    if (!BIN_TYPES.includes(binType)) {
      notes.push(`${id}.binType ${binType === undefined ? '(missing)' : str(binType)} -> ${base.binType}`);
      binType = base.binType;
    }
    const binCount = intField(id, 'binCount', r.binCount, base.binCount, minCnt, maxCnt);
    let cap = base.binCapacityL;
    const rc = typeof r.binCapacityL === 'string' && r.binCapacityL.trim() !== '' ? Number(r.binCapacityL) : r.binCapacityL;
    if (typeof rc === 'number' && Number.isFinite(rc)) {
      cap = snapCapacity(rc, allowedCaps);
      if (cap !== rc) notes.push(`${id}.binCapacityL ${rc} -> ${cap}`);
    } else {
      notes.push(`${id}.binCapacityL ${rc === undefined ? '(missing)' : str(rc)} -> ${cap}`);
    }
    const pickupIntervalDays = intField(id, 'pickupIntervalDays', r.pickupIntervalDays, base.pickupIntervalDays, minInt, maxInt);
    nodes[id] = { binType, binCount, binCapacityL: cap, pickupIntervalDays };
    rationales[id] = typeof r.rationale === 'string' && r.rationale.trim() ? r.rationale.trim() : NO_RATIONALE;
  }

  let sortingMethod = obj.sortingMethod;
  if (!methods.includes(sortingMethod)) {
    notes.push(`sortingMethod ${sortingMethod === undefined ? '(missing)' : str(sortingMethod)} -> ${baselineSetup.sortingMethod}`);
    sortingMethod = baselineSetup.sortingMethod;
  }
  const sortingRationale =
    typeof obj.sortingRationale === 'string' && obj.sortingRationale.trim() ? obj.sortingRationale.trim() : NO_RATIONALE;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';

  return { ok: true, setup: { nodes, sortingMethod }, rationales, sortingRationale, summary, clampNotes: notes, errors: [] };
}
