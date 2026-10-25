// Budget rule (contract v0.3, plan.md §3.1): a plan may spend at most `tolerance` x baseline spend more than the
// baseline, after bale revenue. i.e. net(plan) <= net(baseline) + tolerance x total(baseline). Pure; browser + Node.
const netOf = (cost) => cost.net ?? cost.total - (cost.baleRevenue ?? 0);
const round2 = (x) => Math.round(x * 100) / 100;

/** Largest allowed net cost (INR) for a plan, given the baseline cost object. */
export function budgetCap(baseCost, tolerance) {
  return round2(netOf(baseCost) + tolerance * baseCost.total);
}

/** { extraNet, allowance, within } for a plan's cost against the baseline's. */
export function budgetCheck(baseCost, planCost, tolerance) {
  const extraNet = round2(netOf(planCost) - netOf(baseCost));
  const allowance = round2(tolerance * baseCost.total);
  return { extraNet, allowance, within: extraNet <= allowance + 1e-6 };
}
