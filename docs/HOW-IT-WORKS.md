# How the simulator works

*A guide for the three of us to explain aloud. Every number below is a placeholder estimate from `config/assumptions.json`; the model is the point, not the constants.*

## The one-sentence story
> We simulate 30 days of plastic waste on campus, hour by hour. We watch bins fill and overflow, trucks collect them, and a facility sort what arrives. Then an AI **proposes** better bin sizes and pickup schedules, and the **same simulation checks** whether the proposal really helps.

The AI never reports results. It only suggests settings. The simulation produces every number, and the animation just replays what the simulation recorded.

## The inputs
| Input | What it is |
|---|---|
| **Scenario** | The map, the sorting facility, up to 10 waste "nodes" (canteens, hostels...). Each node has a waste type and a kg/day rate, and some have a rush hour. |
| **Setup** | The choices we can change: per node, the bin type (single or segregated), how many bins, bin size in litres, and pickup interval in days. Plus one sorting method for the facility. |
| **Assumptions** | Every model number (densities, contamination, sorting accuracy, truck speed, costs), each with a unit and a source. |
| **Seed** | A number that fixes the randomness, so the same inputs always give the same result. |

## The 30 days, hour by hour (720 steps)
Each step is one hour. For every node, in this order:

1. **Generate.** People only throw plastic between 07:00 and 22:00. A node's daily total is its kg/day rate, spread over those hours, with rush hours counting 2-3x. Each day the total is nudged randomly by up to 15% (the *only* randomness).
2. **Fill the bin.** Capacity in kg = bins x litres x bulk density (food waste packs heavier than bottles).
3. **Overflow.** Anything beyond capacity is overflow. 40% of it becomes **litter** (lost: wind, animals, drains). The other 60% **lies beside the bin** and is picked up with the next collection, but it counts as **contaminated** because it is soiled.
4. **Pickup, at the end of the day.** A node with interval *k* is emptied at the end of day *d* when `(d+1) mod k = 0`. So interval 3 means days 2, 5, 8, ... (days count from 0). Bins start empty.

### Worked example (the first test we wrote)
A node makes 10 kg/day, its bins hold 25 kg, and the truck comes every 3 days.
- End of day 0: 10 kg. End of day 1: 20 kg. During day 2: 30 kg arrive, so **5 kg overflow**.
- 40% of 5 = 2 kg litter. The other 3 kg wait beside the bin. The truck takes 25 + 3 = **28 kg**.
- That repeats on days 2, 5, ... 29 = **10 overflow bin-days**, 300 kg generated = 280 collected + 20 litter. Nothing disappears.

## The truck
On a pickup day the truck visits **only the nodes due that day**, starting and ending at the facility. The sim finds the shortest loop: it checks every order exactly for up to 8 stops, and for 9-10 stops uses a nearest-neighbour tour improved by 2-opt swaps. Distance = straight-line pixels x metres-per-pixel x 1.3 (roads are not straight). Time = distance at 15 km/h plus 5 minutes per stop. Each trip is stored with the exact points it drives through, so the animation can draw it.

## The facility
Everything collected joins a queue and is sorted the same day, but only up to the method's **throughput** (kg per day). Whatever does not fit is the **backlog** and is sorted on later days. Sorting uses average (expected) values, not dice rolls:

1. **Process loss** (3-5%) is rejected and goes to landfill.
2. **Contaminated** material (food residue) is spotted with probability *detection*. Spotted material goes to the **contaminated** stream (half chemical recycling, half landfill). Missed material slips into a bale as an **impurity**.
3. **Clean** PET/HDPE/PP goes to the right bale with probability *accuracy*; the rest lands in a wrong bale. Clean mixed plastic becomes **residue** for chemical recycling.
4. Bales go to **mechanical recycling**.

Methods trade cost for quality: manual < manual + float tank < manual + NIR sensor.

## Where contamination comes from
`contaminated share = base for the waste type + cross-contamination`. Food-contaminated waste starts at 55% dirty, clean PET bottles at 5%. A **single** mixed bin adds 15 points. A **segregated** bin adds only 15 x (1 - 0.7) because 70% of users sort correctly. Overflow waste is 100% contaminated.

## What comes out
- **Recovery rate** = correctly sorted PET/HDPE/PP in bales / everything generated. This is the honest headline: litter, backlog and bad sorting all lower it.
- **Purity** = correctly sorted resin / total bale mass.
- **Contamination rate** = contaminated stream / sorted mass.
- **Overflow bin-days** = for each node, the number of days it overflowed, added up (calendar days with any overflow are also reported).
- **Cost** (INR) = transport (km x rate) + bins (count x per-day price x 30) + sorting (per-day price x 30).
- **Flows** feed the Sankey: generated -> litter / bins at end / collected -> backlog / sorted -> bales, residue, contaminated, rejected -> recycling routes. All 18 links are always present, with 0 where nothing flows.
- **Mass balance check.** `generated = litter + still in bins + collected`, `collected = backlog + sorted`, `sorted = everything it splits into`. The sim reports the error (always about 0) and the tests fail if it is not.

## What the animation replays
`results.timeline` holds 720 frames (one per hour). Each frame has, per node: plastic generated that hour, kg in the bin, fill % (0-100), overflow that hour, litter that hour; plus the facility queue and cumulative sorted kg, and cumulative litter. Node values describe the end of the hour **before** any pickup, so on a pickup day the bin shows full, and the next frame shows it empty. The facility values are taken **after** that evening's sorting. Trips list the day, route, the exact `path` points, distance, duration and kg collected per node. The player never calculates anything.

## Why trust it?
- **Pure and repeatable.** Same inputs plus same seed give the identical result. One run takes about 15 ms.
- **Hand-checked tests.** We computed three golden cases (overflow cycle, no-overflow daily pickup, throughput backlog) and a sorting case by hand, and the tests compare against those numbers.
- **Honest limits.** All constants are estimates until sourced; the five-seed sweep shows how much the answer moves with randomness.

## The optimise loop (how the AI fits in)
1. Run the **baseline** setup. Show where it overflows and what it costs.
2. Send the AI the scenario, the baseline summary and per-node stats. It replies with a new setup (bin type, count, size, interval per node, sorting method) and a short reason for each.
3. We **validate and clamp** the reply (intervals 1-14 days, 1-6 bins, real bin sizes only). If the AI fails, a simple rule-based heuristic takes over.
4. Run the **simulation on the proposal** with the same seed, then on 5 seeds for both setups. The results page compares before and after, and flags a proposal that costs more than 25% extra.

*The LLM proposes. The simulation verifies.*

## Reading the per-node table

- **Overflow days**: days (out of 30) on which that node's bins overflowed. The bar shows the same number.
- **Load at pickup**: how much plastic arrived between two pickups, as a % of the bin's capacity. A bin can never be more than 100% *full*, so the overflow beyond capacity is what pushes load above 100%. Example: Sports complex gets 4 kg/day into one 120 L bin that holds 3.6 kg of loose bottles, collected every 3 days, so about 12 kg arrives per cycle, or about 330% of capacity.
