// Input validation. Returns friendly messages; never throws.
const BIN_TYPES = ['single', 'segregated'];
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isInt = (x) => Number.isInteger(x);

export function validateInputs(scenario, setup, assumptions) {
  const e = [];
  if (!scenario || typeof scenario !== 'object') return ['No scenario provided.'];
  if (!assumptions || typeof assumptions !== 'object') return ['No assumptions provided.'];
  if (!setup || typeof setup !== 'object' || !setup.nodes) return ['No bin setup provided.'];

  if (!scenario.facility) e.push('Place the sorting facility first.');
  else if (!isNum(scenario.facility.x) || !isNum(scenario.facility.y)) e.push('The sorting facility has an invalid position.');
  const nodes = Array.isArray(scenario.nodes) ? scenario.nodes : [];
  if (nodes.length < 1) e.push('Add at least one node.');
  if (nodes.length > 10) e.push('At most 10 nodes are supported.');
  if (!(scenario.map && isNum(scenario.map.metresPerPixel) && scenario.map.metresPerPixel > 0)) e.push('Map scale (metres per pixel) must be a positive number.');

  const methods = assumptions.sorting?.methods?.value ?? {};
  if (!methods[setup.sortingMethod]) e.push(`Unknown sorting method "${setup.sortingMethod}".`);

  const allowed = assumptions.bins?.allowedCapacitiesL?.value ?? [];
  const density = assumptions.bins?.bulkDensityKgPerL?.value ?? {};
  const seen = new Set();
  for (const n of nodes) {
    const label = n?.name ? `${n.name} (${n.id})` : String(n?.id);
    if (!n || typeof n.id !== 'string') { e.push('A node is missing its id.'); continue; }
    if (seen.has(n.id)) e.push(`Duplicate node id ${n.id}.`);
    seen.add(n.id);
    if (!isNum(n.x) || !isNum(n.y)) e.push(`${label}: invalid position.`);
    if (!isNum(n.rateKgPerDay) || n.rateKgPerDay < 0) e.push(`${label}: rate must be a number >= 0 kg/day.`);
    if (density[n.wasteType] === undefined || !assumptions.resinMix?.[n.wasteType]) e.push(`${label}: unknown waste type "${n.wasteType}".`);
    if (n.peak) {
      const p = n.peak;
      if (!isNum(p.startHour) || !isNum(p.endHour) || p.startHour < 0 || p.endHour > 24 || p.startHour >= p.endHour) e.push(`${label}: peak window must satisfy 0 <= start < end <= 24.`);
      if (!isNum(p.multiplier) || p.multiplier <= 0) e.push(`${label}: peak multiplier must be > 0.`);
    }
    const s = setup.nodes[n.id];
    if (!s) { e.push(`${label}: no bin setup.`); continue; }
    if (!BIN_TYPES.includes(s.binType)) e.push(`${label}: bin type must be single or segregated.`);
    if (!isInt(s.binCount) || s.binCount < 1) e.push(`${label}: bin count must be a whole number >= 1.`);
    if (!allowed.includes(s.binCapacityL)) e.push(`${label}: bin size ${s.binCapacityL} L is not one of ${allowed.join(', ')}.`);
    else if (assumptions.cost?.binPerDay?.value?.[String(s.binCapacityL)] === undefined) e.push(`${label}: no bin price for ${s.binCapacityL} L in cost.binPerDay.`);
    if (!isInt(s.pickupIntervalDays) || s.pickupIntervalDays < 1) e.push(`${label}: pickup interval must be a whole number of days >= 1.`);
  }
  return e;
}
