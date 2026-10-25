// Cost model. All rates come from assumptions.cost.
const round2 = (x) => Math.round(x * 100) / 100;

// Bale revenue (v0.3): buyers pay only for the target resin, so revenue = correctly sorted kg x price per resin.
// `correctKgByResin` may be omitted (cost previews), which gives zero revenue.
export function computeCost(summaryParts, setup, assumptions) {
  const { routeDistanceKm, days, correctKgByResin = {} } = summaryParts;
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
  const total = round2(transport + bins + sorting);
  const price = assumptions.revenue.balePricePerKg.value;
  const baleRevenue = round2(['pet', 'hdpe', 'pp'].reduce((a, r) => a + (correctKgByResin[r] ?? 0) * price[r], 0));
  return { transport, bins, sorting, total, baleRevenue, net: round2(total - baleRevenue), currency: c.currency.value };
}
