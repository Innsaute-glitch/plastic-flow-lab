// Expected-value sorting of everything that went through the facility (no random draws).
// pools: { clean: {pet,hdpe,pp,mixed}, cont: {pet,hdpe,pp,mixed} } in kg (the mass sorted, after the throughput cap).
// Rules (documented in docs/HOW-IT-WORKS.md):
//  - process loss is taken first: that share of all sorted mass is "rejected" (-> landfill);
//  - contaminated mass: `contaminantDetection` of it is pulled out into "contaminated"; the rest slips into the
//    bale of its resin (impurity), or into residue_mixed if it is mixed plastic;
//  - clean PET/HDPE/PP: `accuracy` goes to the right bale, the rest is split equally into the two wrong bales;
//  - clean mixed plastic: always residue_mixed.
const RES = ['pet', 'hdpe', 'pp'];

export function sortPools(pools, method, assumptions) {
  const keep = 1 - method.processLossFraction;
  const bale = { pet: 0, hdpe: 0, pp: 0 };
  const correctByResin = { pet: 0, hdpe: 0, pp: 0 };
  let residue = 0, contaminated = 0, correct = 0, sorted = 0;
  for (const r of ['pet', 'hdpe', 'pp', 'mixed']) sorted += pools.clean[r] + pools.cont[r];

  for (const r of RES) {
    const c = pools.clean[r] * keep;
    bale[r] += c * method.accuracy;
    correct += c * method.accuracy;
    correctByResin[r] += c * method.accuracy;
    const wrong = RES.filter((x) => x !== r);
    for (const w of wrong) bale[w] += (c * (1 - method.accuracy)) / wrong.length;
  }
  residue += pools.clean.mixed * keep;
  for (const r of ['pet', 'hdpe', 'pp', 'mixed']) {
    const k = pools.cont[r] * keep;
    contaminated += k * method.contaminantDetection;
    const slipped = k * (1 - method.contaminantDetection);
    if (r === 'mixed') residue += slipped; else bale[r] += slipped;
  }
  const rejected = sorted * method.processLossFraction;
  const chem = assumptions.sorting.contaminatedToChemicalFraction.value;
  return { sorted, bale, residue, contaminated, rejected, correct, correctByResin, contaminatedToChemical: contaminated * chem, contaminatedToLandfill: contaminated * (1 - chem) };
}
