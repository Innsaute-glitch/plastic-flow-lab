# Plastic Flow Lab — Team Guide

*Last updated 25 Oct 2026. Beginner setup: [GETTING-STARTED.md](../GETTING-STARTED.md).*

Plastic Flow Lab simulates a campus plastic-waste collection and sorting system for 30 days, asks an AI to propose a better setup, then re-runs the simulation to measure whether the proposal actually helps. This guide explains what it does, how to run it, how every part works, and how to answer viva questions about it.

## 1. What the project is

Plastic Flow Lab is our deliverable for bullet 2 of the assignment "Plastic Waste Management: From Collection to Recycling": *develop a project that sets up a plastic waste collection and sorting system*. We cannot build bins, trucks and a sorting shed, so we built a **simulation of the system we would set up**, on a map of our campus.

The assignment's three bullets and where this app fits:

| Bullet | What it asks | Where it is covered |
| --- | --- | --- |
| 1 | Study the lifecycle of plastic waste, collection to recycling | The PPT. The app's results (litter, sorted bales, recycling routes) give real numbers for it. |
| 2 | Set up a collection and sorting system | **This app.** It models the bins, the collection truck and the sorting facility, day by day. |
| 3 | Explore mechanical and chemical recycling, propose improvements | The PPT. The app tags every kg as mechanical route, chemical recycling candidate or landfill, and the AI-proposed setup is a measured "improvement to the existing system". |

### The one-line idea: the AI proposes, the simulation verifies

1. We describe the campus as it is today: up to 40 places that produce plastic waste (hostels, canteens, academic blocks, library...), how much each produces, what bins they have and how often they are emptied.
2. The app simulates 30 days of that setup, hour by hour, and shows where every kilogram ends up: in the bin, overflowing as litter, collected, sorted into bales, or rejected.
3. We press **Optimise**. An AI (Claude Sonnet) reads the campus data and the baseline results and proposes a better setup: pickup intervals, bin types and sizes, and the sorting method.
4. The **same simulation re-runs with the AI's setup** and shows before vs after. The AI never reports results. Every number comes from the simulation.

That last point is the heart of the project and the answer to "how do you know the AI is right?": we don't trust it, we test it.

### Headline result on the demo campus

The demo is the real Thapar Institute (TIET), Patiala campus: 40 real buildings (18 hostels, six canteens or food courts, academic blocks, library, lecture complex, sports, health centre, guest house, faculty residences) and the real sorting facility (the MRF near the STP). The campus makes about 238 kg of plastic a day. There are two demo campuses in the **Load demo** menu:

- **Thapar 2023 · before Saahas:** one unlabelled mixed bin type per point, daily pickup (our estimate), bins sized to an average day.
- **Thapar 2024 · after Saahas:** same capacity and schedule, but labelled segregated bin sets, as Thapar did with Saahas Zero Waste.

The cached AI answer is a real Claude Sonnet 5.5 answer for the 2023 campus. Results over 30 days, seed 42, are model results from partly estimated assumptions:

| | Before Saahas (2023) | After Saahas (real, 2024) | AI plan (Claude) |
|---|---|---|---|
| Bins segregated | 0 of 40 | 40 of 40 | 35 of 40 |
| Overflow bin-days | 44 | 44 | 0 |
| Recovery rate | 18.4% | 26.1% | 28.0% |
| Bale purity | 59.5% | 71.1% | 82.5% |
| Plastic recycled | 1,322 kg | 1,875 kg | 2,010 kg |
| CO₂e avoided | 1.25 t | 1.77 t | 1.90 t |
| Sent to landfill | 484 kg | 391 kg | 494 kg |
| Spend | ₹47.0k | ₹47.7k | ₹57.0k |
| Bale revenue | ₹51.6k | ₹73.1k | ₹78.5k |
| Net | ₹4.5k surplus | ₹25.4k surplus | ₹21.4k surplus |

Reading it honestly: given the 2023 campus, the AI independently proposed nearly what Thapar actually did with Saahas (segregation at 35 of the 40 points). It went further on overflow, recovery and CO₂e by right-sizing bins and adding a float-tank sorter. Saahas's real plan ends with a slightly larger surplus and less landfill, because it segregates everywhere without any extra sorting cost. The AI's float-tank sorter loses a little more in processing, so its landfill is about the same as before (494 vs 484 kg). So the AI matches the real decision and beats it on some measures, not all. Both numbers come from our model with estimated inputs, not from measurements. The AI's improvement is also checked on 5 random seeds.

Screenshots in `docs/images/` were taken before the real map and may look different.

### What the app is not

- Not a presentation: it has no landing page or theory text. The PPT covers the theory; the app is a working tool.
- Not a real-time tracker: it does not connect to real bins. It answers "what would happen if..." questions.
- Not an AI that makes claims: the AI only suggests settings, and the simulation measures them.

## 2. At a glance

![How the parts fit together: inputs, simulation, displays, AI loop](images/architecture.png)

The three inputs go into one simulation function; the animation and results panel only display what it returns. The AI reads the baseline results and sends back a new setup, which goes through the same simulation, so the before and after are measured the same way.

## 3. Running it

You need Node.js 20 or newer (we use Node 22). For the live AI you also need Claude Code installed and logged in on the laptop. Demo mode needs neither the AI nor the internet.

### First-time setup

```bash
cd plastic_project
npm install
```

This installs the only dependencies: Vite (the dev server and bundler), d3-sankey and d3-shape (flow diagram layout) and two local font packages (Inter and Space Grotesk, bundled so the app works offline).

### Everyday commands

| Command | What it does | When to use it |
| --- | --- | --- |
| `npm run dev` | Starts the app at http://localhost:5173 with the AI endpoint built in | While working on it, and for most demos |
| `npm start` | Builds an optimised version into `dist/` and serves it at http://localhost:8787 | The presentation laptop, or to check the final build |
| `npm test` | Runs all 50 automated tests (simulation, AI layer, app, animation, results) | After any change, before presenting |
| `npm run test:sim` | Simulation tests only, then prints a baseline-vs-proposal table | To show the sim's numbers in a terminal |
| `node server/cli-optimise.mjs <scenario.json> <results.json>` | Makes one live AI call from the terminal and prints the proposal | To regenerate the cached demo answer |
| `npm run fixtures` | Rebuilds the fake test data in `fixtures/` | Rarely; only the developer test pages use it |

### Demo mode vs live AI

The **Demo** switch in the top bar decides where the AI's answer comes from.

- **Demo on:** the app replays a real AI answer saved earlier in `public/demo/cached-proposal.json`. It streams onto the screen over about 4 seconds, exactly as a live answer would, and is labelled **Cached (demo)**. No internet or login needed. **Use this in the viva.**
- **Demo off:** the app sends the scenario to our small server, which asks Claude Sonnet through the logged-in Claude Code subscription. The answer streams live and takes about **30-40 seconds**. It is labelled **LLM**.

If the live call fails for any reason (no internet, not logged in, bad answer twice), the app does not break: it shows a rule-based plan labelled **Heuristic fallback** and says why. Demo mode also falls back to the heuristic if you have edited the scenario, because the saved answer was made for the unedited demo campus.

### Using an API key instead of the subscription

Open `config/llm.json` and change `"provider": "claude-cli"` to `"provider": "anthropic-api"`. Copy `.env.example` to `.env` and put the key after `ANTHROPIC_API_KEY=`. The key stays on the server and never reaches the browser.

### Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Optimise shows "Heuristic fallback" with Demo off | Claude Code not logged in, or no internet | Run `claude` once in a terminal to log in, or switch Demo on |
| Demo mode shows "the scenario was edited" | You changed a rate, bin, or cost after loading the demo | Click **Load demo** again, then Run and Optimise |
| Map is a dark grid | Map image failed to load | Check `map.src` in the scenario points at a file in `public/maps/` |
| `npm start` says dist/ not built | Build step failed | Run `npm run build` and read the error |
| Port already in use | Another dev server is running | Close it, or run `npx vite --port 5174` |

## 4. Using the app

The screen has three columns: **controls on the left**, the **map in the centre**, **results on the right**. The top bar shows the current mode (Editing, Running, Results, Optimising, Compare), the Demo switch, Load demo, Import, Export and Assumptions.

### The 3-minute demo path (rehearse this)

1. **Load demo, "before" (Thapar 2023).** 40 campus nodes and the sorting facility (the MRF) appear on the real satellite map. Each node's colour is its waste type.
2. **Switch Demo on** (top bar) so nothing depends on the internet.
3. **Run.** The 30 days replay in about 30 seconds. Waste dots flow into bins, bin meters rise green → amber → red, overflowing bins pulse red and drop litter specks, and the truck draws its route to the facility on pickup days. The HUD (bottom-left) shows the day, how many bins are full, kg of litter and kg sorted. Use **2× / 4×** or **Skip to end** if short on time.
4. **Read the baseline results** (right column). Point at overflow bin-days (44), recovery (18.4%) and the flow diagram: the red band from Generated to "Overflow → litter" is plastic lost to the environment.
5. **Optimise.** The AI card shows the stages (Sending → Thinking → Validating) and the AI's answer streaming in, with each node's reason popping out as it arrives. Pressed it by mistake? **Cancel** (the Optimise button turns into it, there's one on the AI card, or press Esc) stops the request at once: the server stops Claude so no more tokens are used, there is no retry, and the app goes back to the baseline results.
6. **Before → after.** The map replays the AI's plan. The right column shows the big headline (44 → 0 overflow bin-days), each metric with its change, the budget check, the 5-seed check, the flow diagram (toggle Before/After, or expand to side by side) and the list of changes with the AI's reason for each.
7. **Then load "after" (Thapar 2024) and press Run** to show what Thapar really did with Saahas, and compare it with the AI's plan using the table in section 1.
8. Optional: click **What the AI saw / said** to show the exact data sent and the raw reply. This proves the AI only suggested settings.

### Editing the campus (Edit mode)

| Tool or control | What it does |
| --- | --- |
| **Select** | Click a node to edit it in the left panel; drag a node to move it. Delete key removes the selected node; Esc deselects. |
| **Add** | Click the map to place a new node (maximum 40). |
| **Place** | Click the map to place the sorting facility (it does not count toward the 40). |
| **Calibrate** (Map card) | Click two points on the map, then type the real distance between them in metres. This sets the map scale used for truck distances, so it rescales every distance and cost. The Thapar map is already calibrated, so this is only needed after **Change image**. |
| **Change image** | Load a different map screenshot (any campus or town). |
| Node editor | Name, waste type (icon chips), rate in kg/day, optional peak window (start hour, end hour, multiplier), bin type (single or segregated), bin count, bin size (60/120/240/660 L), pickup interval in days. |
| Sorting facility | Manual (350 kg/day), Manual + float tank (500 kg/day), Manual + NIR sensor (1,200 kg/day). |

Any edit clears old results, because they no longer match the campus. Press **Edit** in the top bar during a replay to go back to editing (the results are kept until you change something).

### Saving and loading

- **Export** (download icon) saves the whole scenario as one JSON file: map, nodes, bins, settings, edited costs and the last AI proposal.
- **Import** (upload icon) loads a scenario JSON, or a CSV of nodes from the field survey (see section 8). Nodes without map positions are placed one by one: the app says "Place: Main canteen" and you click its spot.
- Export then Import gives back exactly the same scenario (this is tested).

### The Assumptions panel

Opens from the top bar. It lists every number the model uses (34 values), each with its unit, its source and an amber **estimate** tag where it is not directly sourced (24 of the 34 today); the reasoning for each estimate is shown in the panel. Cost values are editable: change one, re-run and the costs and the AI's budget update. Edited values show an **edited** tag and a reset arrow; edits are saved with the scenario.

## 5. How the simulation works

The simulation is one function: `simulate(scenario, setup, assumptions, seed) → results`. Give it the same four inputs and it always gives exactly the same results. It has no screen code inside it; it only calculates. The animation and the results panel only display what it returns.

### The four inputs

| Input | What it contains |
| --- | --- |
| **Scenario** | The map (image, size, metres per pixel), the facility position, and up to 40 nodes. Each node has a position, a waste type, a rate in kg/day and an optional peak window. |
| **Setup** | The choices that can change. Per node: bin type, bin count, bin size in litres, pickup interval in days. For the facility: the sorting method. The baseline setup is what campus has today; the AI proposes a new setup. |
| **Assumptions** | Every model number (densities, contamination, sorting accuracy, truck speed, costs) from `config/assumptions.json`, after any edits. |
| **Seed** | A number that fixes the randomness. Same seed, same "random" days. |

### Time: 30 days × 24 hours = 720 steps

Each step is one hour, numbered `t = day × 24 + hour`, with days 0 to 29. Every hour, for every node, the sim does steps 1-3 below. At the end of each day it does steps 4-6.

**1. Generate waste.** People only throw plastic away between 07:00 and 22:00 (the "active hours"). The node's daily total is its kg/day rate times a random factor between 0.85 and 1.15 (±15% day-to-day variation). That total is spread over the active hours; hours inside a peak window get extra weight (e.g. 3× at the canteen from 12:00 to 14:00). The peak moves waste into those hours, it does not add extra.

**2. Fill the bin.** Bin capacity in kg = bin count × bin size in litres × bulk density of that waste. Loose bottles are light (0.03 kg/L), food-soiled packaging is heavier (0.09 kg/L). So one 120 L bin holds 3.6 kg of PET bottles but 10.8 kg of food-contaminated plastic.

**3. Overflow.** Anything above capacity is overflow. **20%** of it becomes **litter**, lost to wind, animals and drains. The other **80%** lies beside the bin; the truck picks it up at the next collection, but it counts as **contaminated** because it has been on the ground.

**4. Pickup (end of day).** A node with pickup interval *k* is emptied at the end of day *d* when `(d + 1) mod k = 0`. Interval 3 means days 2, 5, 8 ... 29; interval 1 means every day. Bins start empty on day 0.

**5. The truck route.** On each pickup day the truck starts at the facility, visits only the nodes due that day, and returns. The sim finds the shortest loop: it tries every order for up to 8 stops; for more stops it uses a nearest-neighbour tour improved by 2-opt swaps (within 0.4% of the best possible on the earlier 10-node demo). Distance = straight-line pixels × metres per pixel × 1.3 (roads are not straight lines). Trip time = distance at 10 km/h + 2 minutes per stop.

**6. Sorting at the facility.** Everything collected joins a queue and is sorted the same day, up to the method's throughput (kg/day). What doesn't fit is **backlog**, sorted on later days. Sorting uses expected values (averages), not dice rolls:

1. **Process loss** (3-5% depending on method) is rejected → landfill.
2. **Contaminated** plastic is detected with the method's detection rate (60% manual, 75% float tank, 90% NIR). Detected material goes to the contaminated stream: 90% is a chemical recycling / co-processing candidate (Thapar sends MRF rejects to a co-processing vendor), 10% goes to landfill. Undetected material slips into a bale as impurity.
3. **Clean PET, HDPE and PP** go to the correct bale with the method's accuracy (80% manual, 90% float tank, 96% NIR); the rest lands in a wrong bale (impurity).
4. **Clean mixed / multilayer plastic** becomes residue → chemical recycling candidate.
5. Bales → **mechanical recycling route**.

### Where contamination comes from

Each waste type starts with a base share of contaminated material: PET bottles 5%, HDPE 8%, PP 10%, mixed plastic 15%, food-contaminated 55%. A **single mixed bin** adds 25 percentage points of cross-contamination (people throw everything in together). A **segregated** bin set adds only 25 × (1 − 0.9) = 2.5 points, because 90% of people use the right slot (Thapar case study: "90% segregation at source"). Overflow that lay on the ground counts as 100% contaminated.

Each waste type is also split into resins: for example PET bottles are 90% PET, 8% PP (caps) and 2% other. The mixed-plastic split comes from CPCB: PET 14%, HDPE 12%, PP 16%, the rest films and multilayer.

### The only randomness

The ±15% daily variation is the only random part. It uses a seeded random number generator (mulberry32), drawn in a fixed order: day by day, then node by node. So a given seed always produces the same 30 days, and changing the setup does not change the waste that is generated, only what happens to it. This is what makes before/after a fair comparison.

### Worked example (our first test, done by hand)

A node makes 10 kg/day (no randomness, no peak), its bins hold 25 kg, and the truck comes every 3 days.

| Day | In the bin at end of day | What happens |
| --- | --- | --- |
| 0 | 10 kg | — |
| 1 | 20 kg | — |
| 2 | 25 kg (full) | 30 kg arrived, so 5 kg overflowed: 2 kg litter, 3 kg beside the bin (this test case uses 40% litter; the live config uses 20%). Truck takes 25 + 3 = 28 kg. |

This repeats on days 2, 5 ... 29, giving 10 overflow bin-days. Over 30 days: 300 kg generated = 280 kg collected + 20 kg litter. Nothing disappears. The "load at pickup" is 30 ÷ 25 = 120% while the bin itself is 100% full.

### What comes out

- **Summary:** generated, collected, litter, still in bins, backlog, recovery rate, purity, contamination rate, overflow bin-days, overflow calendar days, route distance, truck trips, pickups, spend (transport, bins, sorting), bale revenue, net cost, recycled kg, landfill kg, CO₂e avoided and a mass-balance error that must be 0.
- **Per node:** generated, collected, litter, overflow days, pickups, average bin fill at pickup (capped at 100%), average load at pickup (uncapped), maximum fill.
- **Flows:** 18 links that feed the flow diagram (every one always present, 0 kg where nothing flows).
- **Timeline:** 720 frames (per node: waste generated that hour, kg in the bin, fill %, overflow, litter; plus the facility queue and running totals) and a list of truck trips with their exact path. The animation only replays this. It never calculates anything itself.

One run of the 40-node demo takes about 30 milliseconds, so the 11 runs after you press Optimise (the proposal, plus the 5-seed check of baseline and proposal) finish instantly.

## 6. Reading the results

Every number on screen is labelled **model results**: it is what our model predicts under our assumptions, not a measurement.

### The metrics

| Metric | Exact definition | What it tells you | 2023 baseline → AI plan |
| --- | --- | --- | --- |
| **Overflow bin-days** (headline) | For each node, count the days its bins overflowed; add them up over all nodes | How often bins spill. 40 nodes × 30 days = 1,200 is the maximum. | 44 → 0 |
| Overflow calendar days | Days on which at least one bin overflowed | Shown under the headline | see the app → 0 |
| **Recovery rate** | Correctly sorted PET + HDPE + PP in bales ÷ all plastic generated | The honest end-to-end score: litter, backlog, contamination and sorting errors all lower it | 18.4% → 28.0% |
| **Bale purity** | Correctly sorted resin in bales ÷ total bale mass | Quality of what we sell to recyclers | 59.5% → 82.5% |
| **Contamination rate** | Plastic pulled out as contaminated ÷ everything sorted | How dirty the collected stream is | shown in the app |
| **Route distance** | Total truck km over 30 days | Collection effort | shown in the app |
| **Spend** (INR) | Transport (km × ₹12) + bins (count × price per day by size × 30) + sorting (price per day × 30) | What the setup costs for 30 days | ₹47.0k → ₹57.0k |
| **Bale revenue** (INR) | Correctly sorted PET / HDPE / PP kg × bale price (PET ₹40, HDPE ₹45, PP ₹35 per kg). Impurities earn nothing. | What the bales sell for | ₹51.6k → ₹78.5k |
| **Net cost** (INR) | Spend − bale revenue. Negative means a surplus. | The number the budget rule uses | ₹4.5k surplus → ₹21.4k surplus |
| **Gains** (ⓘ popover) | Plastic recycled, plastic sent to landfill, CO₂e avoided (kg recycled × US EPA WARM factor) | Environmental outcome | 1,322 → 2,010 kg recycled; 1.25 → 1.90 t CO₂e |

Why recovery is only about 28% even with zero overflow: most mixed and food-contaminated packaging is multilayer or film (goes to chemical recycling, not bales), contaminated material is removed, sorting is not 100% accurate and some is lost in processing. Recovery measures only clean, correctly baled PET/HDPE/PP.

### The flow diagram (Sankey)

It shows where every kilogram went, left to right. Band width = kg.

- **Generated** splits into **Overflow → litter** (lost), **Still in bins** (waiting at day 30) and **Collected**.
- **Collected** splits into **Unsorted backlog** (facility couldn't keep up) and **Sorted**.
- **Sorted** splits into **PET / HDPE / PP bales**, **Mixed / multilayer residue**, **Contaminated** and **Rejected**.
- The right-most column is the recycling route: bales → **Mechanical route**; residue and half of the contaminated → **Chemical recycling candidate**; the other half of contaminated and rejected → **Landfill**.

In the 2023 baseline the story is visible at a glance: a red band goes to litter and some plastic piles up as backlog. In the AI plan the overflow band disappears.

The colours are fixed across the whole app: PET blue, HDPE purple, PP orange, mixed grey, contaminated brown-red. The same colour is used for that material on the map dots, the bins, the flow diagram and the legends.

### The per-node table

| Column | Meaning |
| --- | --- |
| kg | Plastic that node generated over 30 days |
| Overflow days | Days (out of 30) its bins overflowed; the bar shows the same number |
| Load at pickup | Plastic that arrived between two pickups, as % of the bin's capacity, averaged over pickups. A bin can never be more than 100% full, so anything over 100% is overflow. |

Example (illustrative): a node makes 4 kg/day of bottles into one 120 L bin (3.6 kg) emptied every 3 days. About 12 kg arrives per cycle, so its load is about 326% and it overflows on most days. A node whose load is near 98% has bins just big enough on average, and overflows only on the busier days.

If the scenario has observed values from the field survey, a note under that node compares them with the model (e.g. "Observed 18 overflow days... Model: 20 days"). This is our calibration check.

### The before/after view

- **Headline card:** overflow bin-days before → after, and the % reduction.
- **Metric rows:** before → after with a change pill. Rates (recovery, purity, contamination) change in **percentage points (pp)**: 18.4% → 28.0% is +9.6 pp. Route distance changes in %. Green = better, red = worse.
- **Budget line:** the cost change against the allowed limit (for example "Within budget"). The rule is on **net** cost: net(plan) ≤ net(baseline) + 0.25 × spend(baseline).
- **Holds across 5 seeds:** the before and after are re-run with 5 different random seeds. It shows the range for each, and "better in 5/5 seeds". This shows the improvement is not luck.
- **Changes made:** for every node, what changed (e.g. "interval 3 → 1 d", "bins 2×120 L → 1×240 L", "single → segregated") with the AI's one-line reason, plus the sorting method change and its reason.
- **What the AI saw / said:** the input facts sent to the AI and its raw reply.

### The animation HUD

Bottom-left of the map: day and hour, **bins full** (bins at 100% at that moment), cumulative kg of litter, cumulative kg sorted, play/pause, a scrubber, speed (1× 2× 4×) and skip to end.

## 7. The AI optimiser

The AI is **Claude Sonnet 5.5** (model `claude-sonnet-5-5`), set in `config/llm.json`. Its job is narrow: read the campus and the baseline results, and propose settings. It never runs the simulation and its claims are never shown as results.

### What happens when you press Optimise (live mode)

1. The browser sends the scenario, the baseline setup, the baseline summary and per-node results to our server (`POST /api/optimise`).
2. The server applies any edited costs, then builds the message for the AI: every node with its rate, waste type, peak, distance from the facility in metres, current bins and interval, baseline overflow days, and a precomputed `neededLitresPerDay`; the allowed values and limits; the price table; and the budget.
3. The server sends it to Claude with the system prompt from `server/prompts/optimise.system.md`. By default it runs Claude Code in headless mode (`claude -p`) using the laptop's logged-in subscription, in an empty folder with all tools switched off, so the AI sees only our prompt.
4. The AI's reply streams back word by word. The server forwards each piece to the browser, which shows it live in the AI card.
5. When the reply is complete, the server checks it against the schema, fixes out-of-range values, and sends the cleaned proposal.
6. The browser runs the simulation with the proposed setup, runs the 5-seed check, and shows before vs after.

### The rules the AI is given (system prompt, in short)

- **Role:** a waste-logistics planner for a campus. "A separate simulator will verify your proposal; never claim or predict simulation results."
- **Priorities, in order:** (1) remove overflow and litter, (2) reduce contamination (segregated bins where contamination is high, a better sorting method), (3) raise recovery.
- **Budget:** the plan's net cost (spend minus bale revenue) may rise by at most 25% of baseline spend. It gets the unit prices and the bale prices so it can estimate both sides, and is told that only correctly sorted PET/HDPE/PP earns money.
- **Smallest bin that works:** after choosing a node's pickup interval, needed litres = rate × interval × 1.15 ÷ bulk density ÷ 0.8 (15% for busy days, 20% spare room). Choose the smallest bin set that holds it, at most 3 bins per node, preferring fewer bins when sizes are within about 25%. Oversizing is a worse proposal even inside the budget.
- **Output:** one JSON object only, pretty-printed, in a fixed key order, with a one-line reason per node (max 20 words) that cites the node's own numbers, e.g. *"6 kg/day PET overflowed 20 of 30 days; daily pickup: needs \~288 L → 3×120 L."*

Worked sizing example from the prompt: 2 kg/day of PET (0.03 kg/L) collected every 2 days needs 2 × 2 × 1.15 ÷ 0.03 ÷ 0.8 ≈ 192 L, so one 240 L bin, not a 660 L one. We added this rule after the first live test proposed 660 L bins nearly everywhere: bins were priced the same regardless of size, so the AI correctly exploited it. We fixed both the price model and the prompt.

### What the AI returns

```json
{
  "nodes": [
    {
      "id": "n1",
      "binType": "segregated",
      "binCount": 1,
      "binCapacityL": 240,
      "pickupIntervalDays": 1,
      "rationale": "14 kg/day food waste, 18-20 overflow days; daily pickup: needs ~224 L -> 1x240 L."
    }
  ],
  "sortingMethod": "manual_float",
  "sortingRationale": "Peak daily load ~52 kg, within 150 kg/day throughput; float raises accuracy to 0.9 for 1050 INR/day.",
  "summary": "Daily pickups at most nodes, minimum-fit bins, segregated bins at food nodes, float sorting."
}
```

Note what is *not* in it: no route (the simulation plans routes itself), and no predicted results.

### Safety nets

| Problem | What the app does |
| --- | --- |
| A value out of range (e.g. pickup every 0 or 40 days, 9 bins, a 200 L bin) | **Clamped**: interval to 1-14 days, bins to 1-6, size snapped to the nearest allowed (60/120/240/660 L). Each fix is listed as a clamp note in the results. |
| Unknown value (e.g. a sorting method that doesn't exist) | Keeps the baseline value, adds a note |
| A node missing from the answer | Keeps that node's baseline setup, adds a note |
| Reply is not valid JSON | **Retries once**, sending the error back to the AI |
| Still invalid, network down, not logged in | **Falls back** to the rule-based heuristic, labelled "Heuristic fallback" |

The app's Optimise step can never crash: the browser-side function is written so it always returns a proposal (or nothing, if you cancel it).

### The rule-based fallback (heuristic)

A plain algorithm, no AI. For each node it keeps the current pickup interval if some allowed bin set (up to 6 bins) can hold the needed litres, otherwise shortens it a day at a time; then it takes the smallest bin set that holds the need. It uses segregated bins where base contamination is 20% or more, and the cheapest sorting method whose throughput covers the busiest collection day. If the cost exceeds the budget it first steps the sorting method down, then drops segregation on the least-contaminated nodes. It also reaches 0 overflow on the demo. It exists so the demo always works, and it is a useful comparison: the AI's value is reasoning across all nodes at once and explaining each choice.

### Demo mode and the cached answer

`public/demo/cached-proposal.json` is a **real** answer from Claude, generated against the real baseline of the demo campus. Demo mode replays it in about 4 seconds with the same stages and streaming. It carries a *fingerprint* of the scenario it was made for (node rates, waste types, peaks, baseline bins and edited costs). If any of those have changed, demo mode refuses to replay it and uses the heuristic, with a message. So the app never shows an AI answer for a different campus. To refresh it after changing the demo data: run the baseline, then `node server/cli-optimise.mjs public/demo/demo-scenario.json <baseline-results.json>` and save the output there with `"source": "cached"`.

### Built for multiple rounds later

The code passes a `history` list and a `round` number. Today it is one round. A future version can feed the simulation's score back to the AI for 2-3 refinement rounds without changing the structure.

## 8. Assumptions, costs and data

Every number the model uses lives in **one file**, `config/assumptions.json`. Nothing is hard-coded in the program. Each value is stored with four fields: `value`, `unit`, `source`, and `estimate` (true until a real source replaces it). The Assumptions panel in the app shows all of them.

**Status today:** 34 values, 24 of them still marked as estimates. Most placeholders have been replaced by sourced or reasoned values (see the table below). Everything not directly sourced keeps the amber "estimate" tag, with its reasoning in the Assumptions panel. To replace one, change the value and its source and set `estimate` to false. No code changes are needed. What to collect next: [FIELD-DATA-GUIDE.md](FIELD-DATA-GUIDE.md).

### The key values

| Group | Value now | Unit / meaning |
| --- | --- | --- |
| Active hours | 07:00–22:00 | When waste is generated (estimate) |
| Daily variation | ±15% | Day-to-day randomness in generation (estimate) |
| Bulk density | PET bottles 0.03, HDPE 0.05, PP 0.06, mixed 0.05, food-contaminated 0.09 | kg per litre, loose |
| Bin sizes allowed | 60, 120, 240, 660 | litres |
| Hostel rate | 0.011 kg plastic per bed per day | scales with bed capacity (assumes full occupancy) |
| Contamination at source | PET bottles 5%, HDPE 8%, PP 10%, mixed 15%, food-contaminated 55% | share already dirty (estimate) |
| Single-bin cross-contamination | +25 points | added when everything goes in one bin (estimate) |
| Segregation compliance | 90% | people using the right slot (Thapar case study: "90% segregation at source") |
| Resin mix of mixed plastic | PET 14%, HDPE 12%, PP 16%, rest films/multilayer | CPCB |
| Overflow lost as litter | 20% | the rest is picked up later, as contaminated (estimate) |
| Sorting: manual | 80% accuracy, 60% detection, 350 kg/day, 4% loss | MRF handles 1.5–1.75 t/day dry waste with 21 workers |
| Sorting: manual + float tank | 90% accuracy, 75% detection, 500 kg/day, 5% loss | estimate |
| Sorting: manual + NIR | 96% accuracy, 90% detection, 1,200 kg/day, 3% loss | estimate |
| Contaminated → chemical route | 90% | Thapar sends rejects to co-processing (case study p16); the rest to landfill (estimate) |
| Road detour factor | 1.3 | road distance ÷ straight-line distance (estimate) |
| Truck speed, stop time | 10 km/h, 2 min | estimate |
| Transport cost | ₹12 | per km, e-loader |
| Bin cost | 60 L ₹0.4, 120 L ₹0.7, 240 L ₹1.2, 660 L ₹6.5; segregated ×1.6 | per bin per day, amortised from IndiaMART prices |
| Sorting cost | Manual ₹1,450, float ₹1,750, NIR ₹3,000 | per day; manual is Punjab minimum wage × workers |
| Bale prices | PET ₹40, HDPE ₹45, PP ₹35 | per kg of correctly sorted resin; conservative vs dealer prices (estimate) |
| CO₂e avoided | PET 1.15, HDPE 0.85, PP 0.85 | kg CO₂e per kg recycled, US EPA WARM (estimate) |
| Budget tolerance | 25% | net cost may rise by at most 25% of baseline spend |
| Bin sizing headroom | 20% | spare room kept when sizing bins |

### Editing costs while the app runs

In the Assumptions panel, transport cost, bin costs, the segregated multiplier, sorting costs and the budget tolerance are editable. An edit is stored in the scenario as an *override* (e.g. `"cost.transportPerKm": 30`), so the original file is untouched, the edit survives Export/Import, and the simulation, the heuristic and the AI prompt all use the edited value. This lets us test "what if bins were cheaper" or "what if the budget were 10%" live, or plug in real prices from the field.

### Field data from our teammate

The field-data teammate fills `data/nodes.template.csv` (copy to `nodes.csv`), one row per collection point, max 40. Columns: name, waste type (`pet_bottles`, `hdpe`, `pp`, `mixed`, `food_contaminated`), rate in kg/day, optional peak start/end hour and multiplier, bin type, bin count, bin size in litres, pickup interval, and optionally **observed overflow days** and **observed fill % at pickup**. Map positions are left blank; after **Import → CSV** the app asks you to click each place on the map. Full column guide: `data/README.md`.

The observed columns never drive the simulation. They are shown next to the model's numbers, so we can say how close the baseline is to what we saw on campus. If the model is far off, adjust the rates or assumptions (not the code) until the baseline matches; that is calibration.

### The campus map, and swapping it

The map is the real Thapar Institute (TIET), Patiala campus: `public/maps/campus.jpg`, a Google satellite image, 2960 × 1840 px, at 0.5153 m per pixel (zoom 17 at 30.354°N, captured at 2× density; it matches the 100 m scale bar within 2%). `campus-labelled.jpg` (Google's labels) and `campus-reference.jpg` (every node id drawn) share the same pixel grid. Attribution: *Imagery ©2026 Airbus, Maxar Technologies · Map data ©2026 Google*. The sorting facility is the real MRF near the STP, in the north-west corner (30.356775, 76.361124).

To re-capture or use another campus (full steps in `public/maps/README.md`):

1. Take a Google Maps satellite screenshot of the campus, keeping the attribution visible.
2. Save it as `public/maps/campus.jpg`.
3. In `public/demo/demo-scenario.json` and `public/demo/demo-scenario-after.json`, set `map.src`, the image width and height in pixels, and the attribution text.
4. Set the scale: either compute metres ÷ pixels from Google's scale bar, or use **Calibrate** in the app (click two landmarks, type the distance).
5. Move the nodes and the facility onto their real spots, then Export and copy the result back.
6. Regenerate the cached AI answer (section 7), because the scenario changed.

Or skip editing files entirely: **Change image** in the app, calibrate, place nodes, Export.

## 9. How it was built

The code was written by Claude Code (an AI coding agent), not by hand. Claude Code acted as a technical lead. It wrote a plan with shared rules, six AI sub-agents built separate parts at the same time, and the lead reviewed, connected and tested everything. It also ran the web and document research behind the numbers, and wrote these docs.

Our side (the project lead ran the build with Claude Code):

- **Brief and decisions.** We wrote the brief and made the design decisions. Many of the options were proposed by the AI, and we chose between them.
- **Real-world grounding.** Thapar's waste-management documents, the official campus map, the MRF's location, the hostel and block identification, and student numbers.
- **The big framing calls.** The real campus with up to 40 points, two demo campuses before and after Saahas, bale revenue and a net-cost budget, and cancellable AI requests.
- **Hands-on testing.** It found many of the bugs listed below.
- **Field data and the video.** Coordinated within the group; see `docs/TEAMMATE-TASKS.md`.

### Tech stack and why

| Part | Choice | Why |
| --- | --- | --- |
| Front end | Plain JavaScript modules, no framework | The hard parts are a pure calculation and a canvas animation; a framework like React would add complexity without helping either |
| Dev server / bundler | Vite | Instant reloads, one command to run, builds a small production bundle |
| Map overlay | SVG for editable markers, Canvas 2D for the animation | SVG is easy to click and drag; canvas draws hundreds of moving dots smoothly at 60 fps |
| Flow diagram | d3-sankey + d3-shape | Standard, small libraries for Sankey layout; we draw the SVG ourselves |
| Backend | Node.js, built-in modules only (about 60 lines for the server) | Same language as the front end; keeps the AI key/login on the server, never in the browser |
| AI | Claude Sonnet 5.5, via Claude Code subscription (`claude -p`) or the Anthropic API | Fast enough for a live demo, reliable at producing structured JSON |
| Tests | Node's built-in test runner | No extra test framework to install |
| Fonts | Inter and Space Grotesk, bundled locally | Works offline; no Google Fonts download at the presentation |

### The process

1. **Brief.** We wrote `project-brief.md`: what to build, the architecture rules (the simulation must be a pure function, all assumptions in one file, the AI proposes and the simulation verifies), the visual style and the demo path.
2. **Questions and decisions.** Before planning, open questions were settled: the stack, Node backend, Claude Sonnet via the subscription, routes computed by the simulation (not the AI), a cost metric with a budget, nodes placed by clicking the map, and a bundled demo scenario.
3. **The plan (`plan.md`).** The most important part is section 3.1, the *shared contracts*: the exact shape of every piece of data (scenario, setup, results, timeline, AI response), units (kg, litres, image pixels, hours), the pickup rule, metric definitions and who owns which folder. Because every agent follows the same contracts, the parts fit together without negotiation.
4. **Fake data first (`fixtures/`).** Example data in the exact final shapes, so the animation, map editor and results screens could be built before the real simulation existed.
5. **Six parts built in parallel.** Each by its own agent, each owning separate folders, each with a "done-check" that proves it works:

| # | Part | Owns |
| --- | --- | --- |
| 1 | Simulation engine, tests, plain-words explainer | `src/sim/`, `docs/HOW-IT-WORKS.md` |
| 2 | AI integration: server, prompt, validation, fallback, demo mode | `server/`, `src/llm/` |
| 3 | App layout, map editor, settings, save/load | `index.html`, `src/main.js`, `src/app/` |
| 4 | Animation that replays the simulation | `src/anim/` |
| 5 | Results, flow diagram, before/after, AI activity card | `src/results/` |
| 6 | Assumptions panel and the shared visual style | `src/assumptions/`, `src/styles/` |

6. **Integration.** The lead connected the parts, generated the real cached AI answer, and ran the full demo in a browser at 1366×768 and 1920×1080, fixing what it found (the animation was misaligned with the map, markers disappeared during replay, metric rows overflowed, flow diagram labels collided).
7. **Independent review.** A separate AI agent was asked to find errors. It rebuilt the simulation from scratch and compared every number: all matched. It found presentation issues (below), which were fixed.
8. **Second phase: the real campus.**
   - **Map and campus.** The placeholder map was replaced by a satellite capture of Thapar. We supplied the official campus map, the MRF coordinates and screenshots identifying the buildings; Claude Code captured and calibrated the map and placed the 40 points.
   - **Real numbers.** We found Thapar's waste-management documents. AI research agents read them and searched published Indian sources, and every value in the Assumptions panel now cites its source or is marked as an estimate.
   - **Ideas from testing.** These came from our own testing and questions: the two-campus before/after-Saahas demo (building on an AI suggestion to model Thapar before Saahas), bale revenue and the net budget, cancel, rename and the blank campus. So did a series of bug fixes (calibration limits, label clipping, the Assumptions panel styling, undo behaviour), each reported with a screenshot and fixed by Claude Code.

### Changes made along the way (and why)

| Change | Why |
| --- | --- |
| Added a **cost metric and budget** | Without it, the AI could "win" by scheduling daily pickups everywhere. Now improvements must be affordable. |
| Routes computed by the simulation, not the AI | With different pickup intervals, each day visits a different set of nodes, so a single AI route order would not make sense |
| **Bin cost by size** + **smallest-bin rule** | The first live AI test chose a 660 L bin almost everywhere because every bin size cost the same. Fixed in the price model and in the prompt. |
| **Editable costs** at runtime | So real prices can be tested live without editing files |
| Rationales must not predict results | The AI wrote things like "fixes 20 overflow days"; only the simulation may claim outcomes |
| "Fill at pickup" → **"Load at pickup"** | Fill was capped at 100%, so every overflowing node showed 100%. Load shows how far over capacity the bin was (e.g. 326%). |
| HUD "overflowing" → **"bins full"** | Overflow is counted per hour and no waste is generated at night, so the counter read 0 every night |
| Rate changes in **percentage points** | "Recovery +120%" was misleading next to values already in %; now "+22.4 pp" |
| Demo **fingerprint** | Demo mode used to replay the saved AI answer even after the scenario was edited |

## 10. Code map: which file does what

If a reviewer asks "show me where X happens", this is where to look.

### Configuration and data

| File | What it holds |
| --- | --- |
| `config/assumptions.json` | Every model number, each with unit, source and estimate flag |
| `config/ui.json` | Colours (resins, fill levels, flows), labels, fill thresholds, playback length (30 s), number of seeds in the check (5), which assumptions are editable |
| `config/llm.json` | AI provider (`claude-cli` or `anthropic-api`), model name, timeout, retries |
| `public/demo/demo-scenario.json` | The 2023 demo campus (before Saahas): map, facility, 40 nodes, baseline setup |
| `public/demo/demo-scenario-after.json` | The 2024 demo campus (after Saahas): same capacity and schedule, labelled segregated bins |
| `public/demo/cached-proposal.json` | A real saved Claude Sonnet 5.5 answer for the 2023 demo campus, with its fingerprint |
| `public/maps/` | The real Thapar satellite map (`campus.jpg`), its labelled and node-id versions, and the guide to replacing it |
| `data/nodes.template.csv`, `data/README.md` | Field survey template and its column guide |
| `plan.md` | The full design: shared contracts (section 3.1), the task list, fixtures |
| `CLAUDE.md` | Short version of the rules every agent followed |
| `docs/HOW-IT-WORKS.md` | Short plain-words explainer of the simulation |

### Simulation (`src/sim/`)

| File | What it does |
| --- | --- |
| `index.js` | `simulate()`: the hourly loop, bins, overflow, pickups, facility queue, metrics, flows, timeline |
| `validate.js` | Checks the inputs before a run (facility placed, at least 1 node, every bin size has a price...) |
| `prng.js` | The seeded random number generator (mulberry32) |
| `routing.js` | Shortest truck loop: exact search up to 8 stops, nearest-neighbour + 2-opt above |
| `sorting.js` | What the facility does with sorted mass: loss, contaminant detection, accuracy, bales, residue |
| `cost.js` | Transport, bin and sorting costs |
| `test/sim.test.mjs`, `test/run-sample.mjs` | 15 tests (hand-calculated cases, mass balance, determinism) and the printed comparison table |

### AI layer

| File | What it does |
| --- | --- |
| `server/api.js` | The `/api/health` and `/api/optimise` endpoints; validation, one retry, fallback; streams events to the browser |
| `server/user-message.js` | Builds the data message sent to the AI (nodes, needed litres, prices, budget, limits) |
| `server/prompts/optimise.system.md` | The system prompt: role, priorities, budget, bin sizing rule, output format |
| `server/providers/claude-cli.js` | Calls Claude through the logged-in Claude Code (`claude -p`), streaming |
| `server/providers/anthropic-api.js` | Calls the Anthropic API with a key, streaming |
| `server/index.js` | Production server: serves the built app and the API on port 8787 |
| `server/cli-optimise.mjs` | One live AI call from the terminal (regenerates the cached answer) |
| `src/llm/client.js` | Browser side: calls the server, replays demo mode, never throws |
| `src/llm/schema.js` | Validates and clamps the AI's answer |
| `src/llm/heuristic.js` | The rule-based fallback plan |
| `src/llm/fingerprint.js` | Fingerprint of a scenario, so demo mode only replays a matching answer |
| `src/shared/assumptions.js` | Applies edited costs (overrides) on top of the assumptions file |

### Screens

| File | What it does |
| --- | --- |
| `index.html`, `src/main.js` | The page layout and start-up: loads config, creates the store, mounts every panel |
| `src/app/store.js` | The single shared state (scenario, results, mode...); every panel reads and writes through it |
| `src/app/actions.js` | Run, Optimise, Load, Export: the steps that call the simulation and the AI |
| `src/app/map-editor/` | Clickable, draggable node and facility markers; calibrate tool |
| `src/app/controls/` | Left panel: tools, Run/Optimise, sorting method, node list and node editor |
| `src/app/topbar.js`, `io.js`, `notify.js` | Top bar; JSON/CSV import and export; pop-up messages |
| `src/anim/` | Canvas animation that replays the timeline (dots, bin meters, litter, truck, HUD) |
| `src/results/` | Metric cards, flow diagram, per-node table, before/after view, AI activity card, "what the AI saw" drawer |
| `src/assumptions/` | The Assumptions panel with editable costs |
| `src/styles/` | Colours, fonts, spacing and shared components (buttons, cards, chips) |

## 11. How we know the numbers are right

A simulation can produce numbers that look believable but are wrong (a pickup one day late, a kilogram counted twice). We guard against that in five ways.

**1. Hand-calculated test cases.** The tests run tiny scenarios whose answers we worked out on paper, and fail if the simulation disagrees:

| Case | Setup | Expected (by hand) |
| --- | --- | --- |
| A | 10 kg/day, bins hold 25 kg, pickup every 3 days | Overflow on days 2, 5 ... 29 = 10 overflow bin-days; 28 kg per pickup; bin 100% full, load 120% |
| B | Daily pickup, bins big enough | 30 pickups, zero overflow |
| C | Facility slower than collection | Unsorted backlog of 150 kg at the end |
| Pickup timing | Interval 3 | Bin full at 23:00 on day 2, empty at 00:00 on day 3 |
| Sorting | Known PET input | Rejected 12 kg, contaminated 34.56 kg, recovery 180.63 of 300 kg |
| Cost | Segregated 2×240 L for 30 days | 2 × ₹5 × 1.6 × 30 = ₹480 |
| Route | Square of 4 points | Exact search equals checking every order |

**2. Mass balance.** Every run checks that nothing appears or disappears: generated = litter + still in bins + collected; collected = backlog + sorted; sorted = everything it splits into. The error must be 0 (the tests require less than 0.000001 kg) for seeds 1-5 on both setups.

**3. Determinism.** The same inputs must give identical results; a different seed must give different generation. Both are tested.

**4. Independent rebuild.** A separate AI reviewer, told to find errors, wrote its own simulation from the rules alone and compared it with ours on the baseline and the AI plan at three seeds. Every summary number, every per-node value, every pickup and every cost matched to within 0.001.

**5. End-to-end browser checks.** The full demo was run in a real browser at 1366×768 and 1920×1080 with screenshots, and the console was checked for errors (none).

In total `npm test` runs **50 automated tests**: 15 simulation, 20 AI layer (clamping, retry, fallback, demo replay, fingerprint, server), and 15 app, animation and results tests.

**What the tests cannot prove:** that our assumptions match reality. The model is only as good as its inputs, which is why every input is in one visible file with its source, and why the field survey includes observed overflow days to compare against.

## 12. Limitations and improvement ideas

Say these before the reviewer does. Knowing the limits of your own model is a strength in a viva.

### Limitations

| Limitation | Why it matters | How we handle it |
| --- | --- | --- |
| 24 of the 34 assumptions are still estimates | Absolute numbers (₹, %, kg) may be off | Each is tagged "estimate" with its reasoning in the Assumptions panel; the rest are sourced (Thapar case study, CPCB, US EPA WARM, IndiaMART, Punjab minimum wage); the *comparison* between setups is still meaningful. What to collect next: `docs/FIELD-DATA-GUIDE.md` |
| Bale prices and CO₂e factors are estimates | Revenue, net cost and CO₂e avoided could move | Prices are set conservatively against dealer prices; CO₂e factors are US EPA WARM, not Indian-specific; both are editable |
| Collection frequency before and after Saahas is assumed daily | The real schedule may differ, which changes overflow and transport | Marked as an estimate; the MRF supervisor can confirm it (field data guide) |
| Hostel rates assume full occupancy (0.011 kg per bed per day) | Real rates are lower in vacations and exam breaks | Rates are editable per node |
| PG-2 (Pavani Hall) sits on a plot shown as construction in the satellite imagery | Its map position may not match a finished building | Position is approximate; noted so nobody is surprised |
| Node rates come from capacity and a sourced campus total, not from weighing | The 238 kg/day campus total is a model figure | Field weighing replaces it with no code change |
| One dominant waste type per node | A canteen really produces a mix | The resin mix per waste type splits it into PET/HDPE/PP/mixed |
| Only daily generation is random | Real sorting quality also varies day to day | Sorting uses averages so before/after comparisons are not blurred by noise; the 5-seed check covers generation randomness |
| One truck, no capacity or shift limit | A real truck may need two trips | The campus makes about 238 kg/day of plastic, which is still small for a vehicle; could be added |
| Straight-line distance × 1.3 | Not real road routes | No external routing service needed, works offline; detour factor is an assumption |
| No behaviour change modelled | Better bins may change how people dispose | Segregation compliance (90%) comes from the Thapar case study but is a claim, not a measurement; we can vary it |
| Overflow of 20% to litter is an estimate | Drives the litter numbers | Visible and editable in the assumptions file |
| The AI is not guaranteed optimal | It proposes, it doesn't search every option | That is why the simulation verifies; the heuristic gives a second, non-AI comparison |
| Live AI call takes 30-40 s | Long pause in a live demo | Demo mode replays a real saved answer in 4 s |

### Improvements we could propose (useful for bullet 3)

- **Multi-round optimisation:** feed the simulation's score back to the AI for 2-3 rounds; the code already passes a history and round number.
- **Sensitivity analysis:** sweep one assumption (e.g. compliance 50-90%) and show how the best setup changes.
- **Fill sensors:** model smart bins that request pickup when 80% full instead of fixed intervals.
- **Truck capacity and shifts**, and multiple vehicles.
- **Real road routing** from map data.
- **Calibration helper:** automatically tune rates until the model's overflow days match the observed ones.
- **Per-node results for the AI plan** in the before/after view (today it shows the changes and the reasons, but the per-node table only for the baseline).

## 13. Viva questions and answers

Model answers in plain words. Learn the idea, not the wording.

### About the project

**Q: What does your project do, in one sentence?** It simulates 30 days of plastic waste collection and sorting on our campus, lets an AI propose a better setup, and re-runs the simulation to measure whether the proposal really helps.

**Q: Why a simulation and not a real system?** We can't install bins, trucks and a sorting line for an assignment. A simulation lets us test the system we would set up, compare alternatives safely, and give numbers for the lifecycle and recycling parts of the assignment.

**Q: Which part of the assignment does it answer?** Bullet 2, setting up a collection and sorting system. Its outputs (litter, bales, recycling routes) feed bullets 1 and 3, which the PPT covers.

**Q: Who is it for?** A campus facilities team deciding how many bins, what kind, and how often to collect, and what sorting equipment to buy. Our demo is Thapar's own campus. The map is swappable, so it works for any campus or town.

### About the simulation

**Q: How does the simulation work?** It steps through 720 hours. Each hour every node generates waste into its bins; anything over capacity overflows (20% litter, 80% picked up later as contaminated). At the end of each day, due nodes are collected by a truck on the shortest route, and the facility sorts up to its daily capacity into bales, residue, contaminated and rejected. It reports where every kilogram went.

**Q: Why hourly and not daily?** Peaks matter. A canteen's lunch rush can overflow a bin at 2 pm even if the daily total would fit. Hourly steps catch that.

**Q: What is random in it, and how do you get the same answer every time?** Only the ±15% day-to-day variation in waste. It uses a seeded random generator, so the same seed gives the same 30 days. Both before and after use the same seed, so they face the exact same waste and the comparison is fair.

**Q: How do you know the improvement isn't just luck?** We re-run before and after with 5 different seeds. The AI plan is better in all 5 (overflow 145-160 bin-days before, 0 after).

**Q: When exactly does a pickup happen?** At the end of day d when (d + 1) is divisible by the interval. Interval 3 means days 2, 5, 8 and so on (days count from 0). This rule is tested because being one day off would silently change every result.

**Q: How do you calculate bin capacity?** Number of bins × litres × bulk density of that waste. Loose bottles weigh about 0.03 kg per litre, so a 120 L bin holds only 3.6 kg of them.

**Q: How is the truck route chosen?** On each pickup day it visits only the nodes due that day, starting and ending at the facility. For up to 8 stops it tries every order and takes the shortest; for more it uses nearest-neighbour then 2-opt improvement. Distance is straight-line × 1.3 for roads.

**Q: What do the three sorting methods mean?** Manual: people pick by hand (80% accuracy, 350 kg/day). Float tank: plastics separated by density in water; PET sinks, PP and HDPE float (90%, 500 kg/day). NIR: a near-infrared sensor identifies resin types automatically (96%, 1,200 kg/day). Better methods cost more per day.

**Q: What is "load at pickup" and why can it be over 100%?** It is how much plastic arrived since the last pickup, as a % of the bin's capacity. The bin itself can't be more than 100% full; the excess is the overflow. 326% means three times more waste arrived than the bin can hold.

**Q: Why is recovery only 41% when overflow is zero?** Recovery counts only clean, correctly sorted PET, HDPE and PP. Multilayer packaging goes to chemical recycling instead, contaminated material is removed, sorting is not perfect, and a few % is lost in processing.

**Q: What is the difference between mechanical and chemical recycling in your results?** Clean, sorted PET/HDPE/PP bales go to the mechanical route (shredded, washed, re-melted). Mixed, multilayer and dirty plastic that mechanical recycling can't handle is tagged as a chemical recycling candidate (e.g. pyrolysis). Rejected material goes to landfill.

### About the AI

**Q: Where is the AI used, exactly?** Only in Optimise. It receives the campus data and baseline results and returns a proposed setup with a reason per node. Everything else (simulation, routing, metrics) is ordinary code.

**Q: How do you know the AI's answer is good?** We don't take its word for it. The simulation runs its proposal and measures the result. The AI is told never to claim results, and its reasons only cite input numbers.

**Q: What if the AI gives a nonsense answer?** The answer is validated against a strict format. Out-of-range values are clamped (pickup 1-14 days, 1-6 bins, allowed sizes only) and listed as notes. Invalid JSON gets one retry with the error. If that fails, a rule-based plan is used and labelled as such.

**Q: Couldn't the AI just schedule daily pickups everywhere?** It would blow the budget. Every proposal has a cost (transport, bins, sorting), and the AI must keep its plan's net cost (spend minus bale revenue) within 25% of baseline spend above today's net. The before/after view shows whether it did.

**Q: Why does it pick such small bins?** We tell it to use the smallest bin that holds the expected waste between pickups plus 20% spare. An early test chose huge 660 L bins because all sizes cost the same; we fixed the price model and the prompt.

**Q: Which model, and why?** Claude Sonnet 5.5. It is fast enough for a live demo and reliable at structured JSON. The provider and model are one setting in `config/llm.json`.

**Q: Is the API key safe?** The browser never sees a key. Calls go through our small server. By default it uses the laptop's Claude Code login; with the API option the key sits in a server-side `.env` file.

**Q: What is demo mode? Isn't that faking it?** It replays a real answer the AI gave for this exact campus, saved to disk, so the presentation doesn't depend on the internet. It is clearly labelled "Cached (demo)", and it refuses to replay if the scenario has been edited. We can switch it off and make a live call.

**Q: Is the AI better than a simple rule?** On the 2023 demo both reach zero overflow, but the AI's plan ends with a ₹21.4k surplus against ₹7.9k for the rule-based plan, because it weighs extra bale revenue against extra spend node by node. The AI's value is also that it balances all nodes against one budget, picks the sorting method with a reason, and explains every choice in words a facilities team can act on. The rule-based plan is our non-AI baseline and backup.

### About the data and results

**Q: Where do your numbers come from?** Every assumption is in one file with its unit and source. Most are now sourced (the Thapar case study, CPCB, US EPA WARM, IndiaMART, Punjab minimum wage); 24 of 34 are still estimates and are marked amber with their reasoning. Node rates come from bed capacity and campus totals, and the next step is real weighing (see `docs/FIELD-DATA-GUIDE.md`).

**Q: If the assumptions are estimates, are the results meaningless?** The absolute values will move, but the comparison between setups is robust because both use the same assumptions. Since every value can be edited, we can show how sensitive the conclusion is.

**Q: How did you validate against reality?** The field survey records observed overflow days and fill at pickup. The app shows them next to the model's values for each node. We tune rates and assumptions until the baseline matches what we saw.

**Q: Why does spend go up with the AI plan?** Spend rises from about ₹47.0k to ₹57.0k because of right-sized bins and the float-tank sorter. Bale revenue rises more, from ₹51.6k to ₹78.5k for the correct reasons, so the net is still a surplus (₹21.4k). The budget rule looks at net cost, not spend.

### About how it was built

**Q: Did you write the code?** No, and we say so openly. The code was written by an AI coding agent (Claude Code). Our part was:

- **The project itself.** The brief, the design decisions (many chosen from options the AI proposed), and the real-campus data and sources.
- **The framing.** The before/after-Saahas comparison and counting bale revenue in the net-cost budget.
- **Testing.** Hands-on testing that found and drove the fixes for many bugs, and the field data.

We can explain how every part works and why it was designed that way, which is what this guide is for.

**Q: How did multiple agents build one app without conflicts?** A shared plan defined the exact data formats, units and rules first (`plan.md` section 3.1), and each agent owned separate folders. Fake data in the final format let the screens be built before the simulation existed.

**Q: What was the hardest bug?** Good answers: the animation drawn 100 px off the map (it measured its position from the wrong container); or the "fill at pickup" column showing 100% for every bin, which was correct but misleading, so we added "load at pickup".

## 14. Glossary

| Term | Meaning |
| --- | --- |
| Node | A place that generates plastic waste and has bins (hostel, canteen, library...). Up to 40. |
| Facility | The sorting facility where the truck delivers and plastic is sorted. Also the truck's depot. |
| Scenario | Everything about the campus: map, facility, nodes, baseline setup, edited costs, last AI proposal. Saved by Export. |
| Setup | The choices that can change: per node bin type, count, size, pickup interval; plus the facility's sorting method. |
| Baseline | The setup campus uses today, and its simulated results. |
| Proposal | A new setup suggested by the AI (or by the heuristic). |
| Pickup interval | Days between collections at a node (1 = daily). |
| Single / segregated bin | One mixed bin, or a set split by material. Segregated reduces contamination but costs 1.6×. |
| Bulk density | How many kg of loose waste fit in one litre. Converts bin litres to kg. |
| Overflow | Waste arriving when the bin is already full. 20% becomes litter, 80% is picked up later as contaminated. |
| Overflow bin-days | Sum over nodes of the days each node overflowed. The headline metric. |
| Load at pickup | Plastic that arrived since the last pickup as % of capacity. Over 100% means overflow. |
| Backlog | Collected plastic the facility could not sort yet because it hit its daily capacity. |
| Throughput | Kg per day a sorting method can process. |
| Accuracy | Share of clean plastic a sorting method puts in the correct bale. |
| Contaminant detection | Share of dirty plastic a sorting method spots and removes before baling. |
| Bale | A compressed block of one sorted resin (PET, HDPE or PP), sold to recyclers. |
| Purity | Share of a bale that is the right resin. |
| Recovery rate | Correctly baled PET/HDPE/PP as a share of everything generated. |
| PET, HDPE, PP | The three main recyclable resins: PET (bottles), HDPE (milk jugs, containers), PP (caps, takeaway boxes, cups). |
| Multilayer / mixed residue | Packaging made of several bonded layers (chip packets) or unidentified plastic; not mechanically recyclable, a chemical recycling candidate. |
| Mechanical route | Recycling by shredding, washing and re-melting clean sorted plastic. |
| Chemical recycling candidate | Plastic suitable for chemical processes (e.g. pyrolysis) that break it down to raw materials. |
| Float tank | Water tank that separates plastics by density: PET sinks, PP and HDPE float. |
| NIR | Near-infrared sensor that identifies resin types from their light signature, used in automated sorting. |
| Sankey diagram | A flow chart where band width is proportional to quantity (here, kg). |
| Seed | The number that fixes the random generator, so results can be repeated exactly. |
| Mass balance | The check that every kg generated is accounted for somewhere. |
| Clamping | Forcing an out-of-range AI value back into the allowed range. |
| Heuristic | The rule-based (non-AI) planner used as a fallback. |
| Demo mode / cached proposal | Replaying a real saved AI answer instead of making a live call. |
| Fingerprint | A short code computed from the scenario, so a saved AI answer is only replayed for the scenario it was made for. |
| Override | An edited assumption value stored in the scenario, applied on top of `config/assumptions.json`. |
| Model results | Numbers produced by the simulation under our assumptions, not measurements. |
