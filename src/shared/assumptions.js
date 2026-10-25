// Runtime assumption overrides. Pure; used by the browser (store) and the server (LLM prompt).
// Contract: plan.md §3.1 "Assumption overrides".
// overrides: { "<dotted path to leaf>[.<key inside value>]": number }
//   e.g. { "cost.transportPerKm": 30, "cost.binPerDay.120": 4, "cost.sortingPerDay.manual_nir": 1500 }

/** Returns a deep copy of `assumptions` with overrides applied. Unknown or invalid paths are skipped. */
export function applyOverrides(assumptions, overrides) {
  const out = structuredClone(assumptions);
  for (const [path, v] of Object.entries(overrides ?? {})) {
    const ref = resolve(out, path);
    if (!ref || typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    if (ref.key === null) ref.leaf.value = v;
    else ref.leaf.value[ref.key] = v;
  }
  return out;
}

/** Lists override errors (unknown path, non-number, negative) for display. */
export function validateOverrides(assumptions, overrides) {
  const errors = [];
  for (const [path, v] of Object.entries(overrides ?? {})) {
    if (!resolve(assumptions, path)) errors.push(`Unknown assumption "${path}"`);
    else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`"${path}" must be a number ≥ 0`);
  }
  return errors;
}

// Finds the leaf ({value,...}) on the path; the remaining segment (if any) must be a numeric key of leaf.value.
function resolve(root, path) {
  const parts = path.split('.');
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    if (!node || typeof node !== 'object') return null;
    node = node[parts[i]];
    if (node && typeof node === 'object' && 'value' in node) {
      const rest = parts.slice(i + 1);
      if (rest.length === 0) return typeof node.value === 'number' ? { leaf: node, key: null } : null;
      if (rest.length === 1 && node.value && typeof node.value[rest[0]] === 'number') return { leaf: node, key: rest[0] };
      return null;
    }
  }
  return null;
}
