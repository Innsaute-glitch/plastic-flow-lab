// Fingerprint of everything a proposal depends on, so demo mode only replays a cached
// proposal for the exact scenario it was generated for. Pure; browser + Node.

export function scenarioFingerprint(scenario) {
  const nodes = [...scenario.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => [n.id, n.wasteType, n.rateKgPerDay, n.peak ? [n.peak.startHour, n.peak.endHour, n.peak.multiplier] : null]);
  const setup = Object.keys(scenario.baselineSetup?.nodes ?? {})
    .sort()
    .map((id) => {
      const s = scenario.baselineSetup.nodes[id];
      return [id, s.binType, s.binCount, s.binCapacityL, s.pickupIntervalDays];
    });
  const overrides = Object.entries(scenario.assumptionOverrides ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const text = JSON.stringify([scenario.id, nodes, setup, scenario.baselineSetup?.sortingMethod, overrides]);
  // FNV-1a 32-bit: short, stable, no crypto dependency
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
