# Field data guide: what to collect, and why

The simulator runs on the real Thapar campus map. Most model numbers now come from Thapar's own waste-management documents or published Indian sources. Each one carries its source, and an amber **estimate** tag in the app's Assumptions panel when it isn't sourced. A few numbers can only come from looking at the campus. This guide lists them in priority order, so even one short visit helps.

Nothing in the code needs to change when this data arrives. Values go into `config/assumptions.json`, or into each node's `observed` field via the CSV template, `data/nodes.template.csv`.

---

## Priority 1: ask the MRF (one conversation, most value)

The MRF is near the STP in the north-west corner of campus, and Saahas runs it with 21 TIET staff. The case study says it has (or planned) **IoT weighing**, so daily logs may already exist. Ask the supervisor:

| Question | Feeds into | Why it matters |
|---|---|---|
| Daily dry-waste intake (kg), ideally a week of weigh logs | total generation, `rateKgPerDay` | Our ~200 kg/day plastic figure is derived. A real log replaces it. |
| Plastic share of dry waste, by type if they know (PET bottles, HDPE, PP, films, multilayer) | `resinMix`, rates | Sets the recovery ceiling |
| How many workers sort plastic, and kg per worker per day | `sorting.methods.manual.throughputKgPerDay` | Decides whether sorting is a bottleneck |
| Share of plastic rejected as too dirty, sent to co-processing | `contamination.baseFraction`, `sorting.contaminatedToChemicalFraction` | Drives bale purity and recovery |
| Collection schedule: which areas, how often, what time of day | baseline `pickupIntervalDays` | The baseline currently assumes this |
| Vehicle type (e-rickshaw, tipper?), capacity, number of trips per day | `routing.*`, `cost.transportPerKm` | Transport cost and time |
| Monthly running cost of the MRF, or wages, if they'll share | `cost.sortingPerDay` | Makes the cost comparison real |

## Priority 2: bin survey at 4–6 nodes (about 20 minutes)

Pick at least one **hostel**, one **canteen or food court** and one **academic block**. For each:

1. **Bins:** how many, what size (litres are often printed on the lid or body; otherwise compare against the 120 L and 240 L wheelie bins), single mixed or colour-coded segregated.
2. **Fill level:** a rough % before the collection round, ideally at the same time on 2–3 days. Note any overflow or waste lying beside the bin.
3. **Collection:** ask the housekeeping staff how often bins are emptied and when.
4. **Wrong-bin rate:** in a segregated set, a quick look at how much plastic sits in the wet bin and how much food is in the dry bin. The case study claims 90% correct segregation, and a spot check tells us whether that holds.
5. **Photo** of each bin set. Useful for the report and the viva.

Record it in `data/nodes.template.csv`. The columns `bin_type`, `bin_count`, `bin_capacity_l`, `pickup_interval_days`, `observed_overflow_days` and `observed_fill_pct_at_pickup` exist for this. The app shows "observed vs model" for any node with observed values.

## Priority 3: headcounts (desk research, no walk needed)

| Item | Where to look | Feeds into |
|---|---|---|
| Beds per hostel (all 18, including PG-1 and PG-2) | hostel office, thapar.edu hostel pages, warden notices | per-hostel `rateKgPerDay` (plastic scales with residents) |
| Meals per day at each canteen or food court | mess or canteen managers | canteen rates and lunch/dinner peaks |
| Students and staff per academic block on a teaching day | timetable or department office | academic block rates |
| Faculty-residence households | estate office | residence rates |

## Priority 4: nice to have

- **Peak hours** at 2–3 food outlets: when the bins fill fastest (currently assumed to be 12–14 h lunch and 19–21 h dinner).
- **Litter:** after an overflow day, roughly how much waste scatters, blows away or is pulled out by animals. There's no source for this anywhere, so even "most of it stays next to the bin" helps.
- **Before-Saahas photos or records** (pre-2024): the bins and collection as they were. The app's baseline models this period.

---

## How the data is used

- **Baseline = Thapar before the Saahas programme** (2023 audit): one unlabelled bin per point, mixed collection.
- **AI proposal = Claude's plan** for bins, sizes, pickup intervals and sorting method, checked by the simulation.
- **Reference = what Thapar actually did** (2024): labelled 3-stream bins at every point and an on-site MRF.

If Claude's plan lands close to what Thapar implemented, that supports the method. Better field data makes that comparison more convincing.
