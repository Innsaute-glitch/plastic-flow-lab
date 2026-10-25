// Cost model. All rates come from assumptions.cost.
const round2 = (x) => Math.round(x * 100) / 100;

export function computeCost(summaryParts, setup, assumptions) {
  const { routeDistanceKm, days } = summaryParts;
  const c = assumptions.cost;
  const transport = round2(routeDistanceKm * c.transportPerKm.value);
  let bins = 0;
  for (const id of Object.keys(setup.nodes)) {
    const s = setup.nodes[id];
    const mult = s.binType === 'segregated' ? c.segregatedBinMultiplier.value : 1;
    bins += s.binCount * c.binPerDay.value[String(s.binCapacityL)] * mult * days;
  }
  bins = round2(bins);
  const sorting = round2(c.sortingPerDay.value[setup.sortingMethod] * days);
  return { transport, bins, sorting, total: round2(transport + bins + sorting), currency: c.currency.value };
}
