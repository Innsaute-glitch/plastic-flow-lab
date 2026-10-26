# Plan: Plastic waste collection simulator ("the LLM proposes, the simulation verifies")

*Status (26 Oct 2026): built; contracts at v0.3. The task list (§3.2) is kept as the record of how the app was built, with facts updated to the current app: the real Thapar map, up to 40 nodes, and the explainer merged into `docs/TEAM-GUIDE.md`.*

Brief: `project-brief.md`. Decisions so far: vanilla JS (ES modules) + Vite, Node backend, Claude Sonnet 5.5 called by default through the local Claude Code subscription (`claude -p`), with the Anthropic API as a switchable fallback. Route order is NOT proposed by the LLM; the sim computes routes. A cost metric with a budget rule is added. Nodes are placed by clicking the map.

---

## 3.1 Shared contracts (do not change without orchestrator approval)

### Function signatures

**Simulation (`src/sim/index.js`, Task 1). Pure: no DOM, no network, no globals, no `Date`, no `Math.random`.**
- `simulate(scenario, setup, assumptions, seed) -> Results`
  The brief's `simulate(scenario, setup, seed)` gets `assumptions` passed in explicitly so it stays pure and runs in Node unchanged.
- `validateInputs(scenario, setup, assumptions) -> string[]` returns error messages (empty means valid). `simulate` calls it first and throws `SimInputError` (exported, `name === "SimInputError"`, `.errors: string[]`) if the list is not empty.
- `computeCost(summaryParts, setup, assumptions) -> Cost` (exported so the heuristic and UI can preview cost; `summaryParts = { routeDistanceKm, days }`).
- `SIM_VERSION` string constant, copied into `Results.meta.simVersion`.

**LLM, server side (`server/`, Task 2)**
- `server/api.js` exports `handleApi(req, res, next)`, a Connect-style middleware that handles `/api/*`. `vite.config.js` mounts it in dev; `server/index.js` mounts it in prod and also serves `dist/`.
- `server/providers/index.js` exports `callModel({ system, user, onDelta }) -> Promise<string>` (the full raw text). The provider is chosen by `config/llm.json`.
- `src/llm/schema.js` (pure, shared by browser and server) exports `validateAndClamp(rawObj, scenario, baselineSetup, assumptions) -> { ok: boolean, setup: Setup, rationales, sortingRationale, summary, clampNotes: string[], errors: string[] }`.
- `src/llm/heuristic.js` (pure) exports `heuristicProposal(scenario, baselineSetup, baselineResults, assumptions) -> Proposal` with `source: "heuristic"`.

**LLM, browser side (`src/llm/client.js`, Task 2)**
- `optimise({ scenario, baseline: { setup, results }, assumptions, demoMode, history = [], signal }, onEvent) -> Promise<Proposal | null>`. Cancel (v0.3): `signal` is an optional AbortSignal; a cancelled call resolves to `null` (no fallback, no `result` event). The server aborts the model call (kills `claude -p` / aborts the API fetch) and skips the retry when the client disconnects.
  - `onEvent(evt)` receives the `LlmEvent` objects below.
  - It never throws: on any failure it resolves with a heuristic proposal and emits an `error` event with `fallback: "heuristic"`.
  - `history` is `[]` for round 1. Each round is `{ setup, summary }`, which leaves room for the later 2–3 round loop.

**App (`src/app/`, Task 3)**
- `src/app/store.js`: `createStore(initialState) -> { get(): State, set(patch: Partial<State>), subscribe(fn: (state, prev) => void): unsubscribe }`. `set` makes a shallow merge, and subscribers fire synchronously.
- `src/app/notify.js`: `notify(level: "info"|"warn"|"error", message: string)`. This is the only way any module shows a toast.
- `src/app/actions.js`: `runBaseline(store)`, `runOptimise(store)`, `cancelOptimise()` (v0.3: aborts the in-flight AI request; the app returns to its previous state), `newScenario(store)` (v0.3: blank campus, keeps map and cost edits, with Undo), `loadScenario(store, scenarioObj)`, `exportScenario(store) -> Scenario`. `runOptimise` calls `optimise()`, then calls `simulate()` with the proposal setup, then runs the seed sweep and sets `mode: "compare"`.
- Every UI module exports `mount(el, store) -> unmount`. Modules subscribe to the store themselves and never call each other directly. The only cross-module links are store state and the functions listed in this section.

**Animation (`src/anim/player.js`, Task 4)**
- `mount(el, store)` follows the module rule above. Internally it uses `createPlayer(canvas, { scenario, results, ui }) -> { play(), pause(), setSpeed(1|2|4), seek(t), skipToEnd(), destroy() }`.
- It replays `results.timeline` and **never computes outcomes**.
- It writes `playback: { t, playing, speed, done }` to the store. When `done` becomes true, it sets `mode` to `"results"` (or keeps `"compare"` when it was replaying the optimised run).

### JSON shapes

All examples use real field names. Fields marked `?` may be `null`.

**Scenario** (save/load file, `public/demo/demo-scenario.json`, `fixtures/scenario.demo.json`)
```json
{
  "version": 1,
  "id": "campus-demo-v1",
  "name": "Campus baseline",
  "map": {
    "src": "maps/placeholder-campus.svg",
    "widthPx": 1600, "heightPx": 1000,
    "metresPerPixel": 0.5,
    "attribution": "Placeholder map. Replace with Google Maps screenshot (keep attribution)."
  },
  "facility": { "id": "facility", "name": "Sorting facility", "x": 1380, "y": 860 },
  "nodes": [
    {
      "id": "n1", "name": "Main canteen", "x": 520, "y": 330,
      "wasteType": "food_contaminated",
      "rateKgPerDay": 14,
      "peak": { "startHour": 12, "endHour": 14, "multiplier": 3 },
      "observed": { "overflowDays": 18, "fillPctAtPickup": 100 }
    }
  ],
  "baselineSetup": { "...": "Setup, see below" },
  "lastProposal": null,
  "assumptionOverrides": {},
  "settings": { "days": 30, "seed": 42 }
}
```
- `facility` is `null` until it is placed. The sim refuses to run without a facility and at least 1 node. There can be at most 40 nodes, and the facility does not count toward them.
- `peak?` and `observed?` may be `null`. `observed` is used only for an "observed vs model" note in the results; it never drives the sim.
- `assumptionOverrides` (may be missing in old files, so treat it as `{}`) holds runtime edits of assumptions, keyed by dotted path. See "Assumption overrides" below.
- Node ids are `n1`…`n40`, assigned in creation order and never reused within a scenario. The facility id is always `"facility"`.

**Setup** (what the user configures as the baseline, and what the LLM proposes)
```json
{
  "nodes": {
    "n1": { "binType": "single", "binCount": 2, "binCapacityL": 120, "pickupIntervalDays": 3 }
  },
  "sortingMethod": "manual"
}
```
- `binType`: `"single"` (one mixed bin) or `"segregated"` (a split-stream bin set; it changes contamination and cost, not capacity).
- Capacity per node = `binCount × binCapacityL` litres, converted to kg with `assumptions.bins.bulkDensityKgPerL[wasteType]`.
- `binCapacityL` must be one of `assumptions.bins.allowedCapacitiesL`.
- `sortingMethod`: `"manual" | "manual_float" | "manual_nir"`.

**Assumption overrides** (added v0.2; runtime-editable costs)
- Format: `{ "cost.transportPerKm": 30, "cost.binPerDay.120": 4, "cost.sortingPerDay.manual_nir": 1500, "llmLimits.budgetTolerance": 0.2 }`. The path is dotted to a leaf; one extra segment indexes into an object `value`. Only numbers ≥ 0 are allowed.
- `src/shared/assumptions.js` (orchestrator-owned, pure) exports `applyOverrides(assumptions, overrides) -> assumptions` (a deep copy) and `validateOverrides(assumptions, overrides) -> string[]`.
- **Effective assumptions** = `applyOverrides(config/assumptions.json, scenario.assumptionOverrides)`.
  - The browser keeps the unmodified config in `state.assumptionsBase` and the effective set in `state.assumptions`. `simulate`, `optimise` and the heuristic always receive the effective set.
  - The server applies the same function to the `scenario` it receives before building the prompt.
- The editable paths are listed in `config/ui.json` → `editableAssumptions` (leaf paths; an object-valued leaf means every key inside it is editable).

**Bin cost** (v0.2): the cost per bin per day = `cost.binPerDay.value[String(binCapacityL)]` × (`cost.segregatedBinMultiplier` if `binType === "segregated"`, else 1). Total bin cost = Σ nodes `binCount × that × days`.

**Revenue and environment** (v0.3): `cost.total` is spend (transport + bins + sorting). `cost.baleRevenue` = Σ resin (correctly sorted kg × `revenue.balePricePerKg`); impurities in a bale earn nothing. `cost.net = total − baleRevenue` (negative = surplus). `summary.recycledKg` = correctly sorted PET/HDPE/PP kg, `summary.landfillKg` = contaminated-to-landfill + process rejects, `summary.co2eAvoidedKg` = Σ correct kg × `revenue.co2eAvoidedKgPerKg`. `computeCost` takes an optional `correctKgByResin` in `summaryParts`; without it revenue is 0.

**Bin sizing rule** (v0.2; for the LLM prompt and the heuristic):
- Choose the **smallest** total capacity (`binCount × binCapacityL`) that holds the expected accumulation between pickups at peak-day rate with `bins.sizingHeadroom` spare, using `rateKgPerDay × intervalDays × (1 + dailyNoise) / bulkDensity / (1 − headroom)` litres.
- Use at most 3 bins per node. Among options within about 25% of the smallest capacity, prefer fewer bins (needs ~288 L → 3×120 L rather than 5×60 L).
- Never propose a bigger bin than this rule needs. Example: 2 kg/day of PET (0.03 kg/L) collected every 2 days needs ≈ 192 L, so 1×240 L, not 660 L.

**Results** (the output of `simulate`, in `fixtures/results.*.json`)
```json
{
  "meta": { "scenarioId": "campus-demo-v1", "seed": 42, "days": 30, "simVersion": "1.0.0", "label": "model results" },
  "summary": {
    "generatedKg": 2010.4, "collectedKg": 1630.2, "litterKg": 210.7, "inBinsEndKg": 169.5, "backlogEndKg": 0,
    "recoveryRate": 0.41, "purity": 0.78, "contaminationRate": 0.31,
    "overflowBinDays": 96, "overflowCalendarDays": 27,
    "routeDistanceKm": 31.8, "truckTrips": 15, "pickups": 88,
    "recycledKg": 820.4, "landfillKg": 95.1, "co2eAvoidedKg": 870.2,
    "cost": { "transport": 795, "bins": 1500, "sorting": 27000, "total": 29295, "baleRevenue": 31200, "net": -1905, "currency": "INR" },
    "massBalanceErrorKg": 0
  },
  "perNode": {
    "n1": { "generatedKg": 420, "collectedKg": 300, "litterKg": 60, "overflowDays": 20, "pickups": 10, "avgFillPctAtPickup": 100, "avgLoadPctAtPickup": 195.5, "maxFillPct": 100 }
  },
  "flows": [ { "source": "generated", "target": "litter", "kg": 210.7 } ],
  "timeline": { "...": "see Timeline" }
}
```

**perNode fill vs load** (v0.3):
- `avgFillPctAtPickup` = the bin's fill at pickup, **capped at 100**. A full bin cannot hold more.
- `avgLoadPctAtPickup` = everything that arrived since that node's previous pickup (bin + side waste + litter) ÷ bin capacity × 100, averaged over its pickups, and **uncapped**. Over 100 means the bin overflowed. The UI shows this one as "Load at pickup".

**Flow node ids** (a fixed set, so the Sankey layout and the colours are stable):
`generated, litter, in_bins_end, collected, backlog_end, sorted, bale_pet, bale_hdpe, bale_pp, residue_mixed, contaminated, rejected, route_mechanical, route_chemical, route_landfill`

Allowed links (emit every link, with `kg: 0` where nothing flows):
```
generated -> litter | in_bins_end | collected
collected -> backlog_end | sorted
sorted    -> bale_pet | bale_hdpe | bale_pp | residue_mixed | contaminated | rejected
bale_pet | bale_hdpe | bale_pp -> route_mechanical
residue_mixed -> route_chemical
contaminated  -> route_chemical | route_landfill
rejected      -> route_landfill
```
Display labels and route tags live in `config/ui.json` → `flowLabels`. Bale masses include mis-sorted impurity mass, so `purity` is reported separately.

**Metric definitions** (exact; the tests check these):
- `recoveryRate` = correctly sorted resin mass in the PET/HDPE/PP bales ÷ `generatedKg`
- `purity` = correctly sorted resin mass in bales ÷ total bale mass (1 if the bale mass is 0)
- `contaminationRate` = mass on `sorted -> contaminated` ÷ `sorted` mass (0 if `sorted` is 0)
- `overflowBinDays` = Σ over nodes of the days on which that node overflowed (> 0 kg). `overflowCalendarDays` = days on which ≥ 1 node overflowed. The headline uses `overflowBinDays`, labelled "overflow bin-days".
- `massBalanceErrorKg` = |generated − (litter + inBinsEnd + collected)| + |collected − (backlogEnd + sorted)| + |sorted − Σ sorted→*|. The tests require < 1e-6.

**Timeline** (`results.timeline`; the player only reads this)
```json
{
  "hoursPerFrame": 1,
  "frameCount": 720,
  "nodeOrder": ["n1", "n2"],
  "frames": [
    { "t": 0, "day": 0, "hour": 0,
      "nodes": [ { "genKg": 0.0, "fillKg": 0.0, "fillPct": 0, "overflowKg": 0, "litterKg": 0 } ],
      "facility": { "queueKg": 0, "sortedKgCum": 0 },
      "litterKgCum": 0 }
  ],
  "trips": [
    { "day": 2, "t": 71, "route": ["facility", "n3", "n1", "facility"],
      "path": [[1380, 860], [900, 420], [520, 330], [1380, 860]],
      "distanceM": 1530, "durationMin": 21, "collectedKg": { "n3": 8.1, "n1": 33.6 } }
  ]
}
```
- `frames[i].nodes[j]` belongs to `nodeOrder[j]`. Values describe the **end of that hour, before any pickup**. `fillPct` is 0–100 (capped); overflow appears as `overflowKg > 0`.
- A trip with `t = day*24 + 23` happens at the end of that day. The next frame shows the collected bins emptied.

**LLM raw response** (what the model must return; `fixtures/llm-raw-response.json`)
```json
{
  "nodes": [
    { "id": "n1", "binType": "segregated", "binCount": 3, "binCapacityL": 240, "pickupIntervalDays": 1,
      "rationale": "Lunch spike fills two 120 L bins by 2 pm; daily pickup with 3×240 L removes overflow." }
  ],
  "sortingMethod": "manual_float",
  "sortingRationale": "Float tank lifts purity without NIR's cost; throughput covers the collected volume.",
  "summary": "Shorter pickup intervals at high-rate nodes, segregated bins where contamination is high."
}
```

**Proposal** (after validation and clamping; stored in `scenario.lastProposal` and in `fixtures/proposal.json`)
```json
{
  "source": "llm",
  "model": "claude-sonnet-5-5",
  "createdAt": "2026-10-25T12:00:00Z",
  "round": 1,
  "scenarioId": "campus-demo-v1",
  "setup": { "...": "full Setup with every node present" },
  "rationales": { "n1": "Lunch spike fills…" },
  "sortingRationale": "…",
  "summary": "…",
  "clampNotes": ["n4.pickupIntervalDays 0 -> 1"],
  "raw": "<raw model text, shown in the 'what the AI saw/said' drawer>",
  "fingerprint": "378a203c"
}
```
- `source`: `"llm" | "cached" | "heuristic"`. The UI always shows the source.
- `fingerprint` (v0.3, optional) = `scenarioFingerprint(scenario)` from `src/llm/fingerprint.js`. It covers node rates, types and peaks, the baseline setup and assumptionOverrides. `server/cli-optimise.mjs` stamps it. Demo mode replays the cached proposal only if it matches; otherwise it falls back to the heuristic with a notice.
- `createdAt` is set by the server/client, never by the sim.

**Clamping rules** (in `validateAndClamp`; the limits come from `assumptions.llmLimits`):
- Integers get rounded.
- `pickupIntervalDays` is clamped to 1–14 and `binCount` to 1–6.
- `binCapacityL` snaps to the nearest allowed capacity.
- An unknown enum value falls back to the baseline value and adds a clamp note.
- A missing node keeps its baseline setup and adds a clamp note. Unknown node ids are ignored.
- A missing rationale becomes `"(no rationale given)"`.
- Any clamp adds a note in the form `"<id>.<field> <from> -> <to>"`.
- `ok` is false only when the JSON fails to parse or is not an object with a `nodes` array. That case triggers the single retry.

**Server API**
- `GET /api/health` → `{ "ok": true, "provider": "claude-cli", "model": "claude-sonnet-5-5" }`
- `POST /api/optimise`, body `{ scenario, baselineSetup, baselineSummary, perNode, history }`. The response is a `text/event-stream` of `LlmEvent`s:
```
event: status   data: {"stage":"sending"|"thinking"|"validating"|"retrying"|"done"}
event: delta    data: {"text":"<next chunk of raw model text>"}
event: result   data: {"proposal": Proposal}
event: error    data: {"message":"…","fallback":"heuristic"|null}
```
The browser `onEvent` receives `{ type: "status"|"delta"|"result"|"error", ...data }`. Demo mode emits the same event sequence by replaying `public/demo/cached-proposal.json` → `raw` over about 4 seconds, labelled `source: "cached"`.

**App state** (`store.get()`)
```js
{
  scenario,                      // Scenario
  assumptionsBase,               // config/assumptions.json as loaded (never mutated)
  assumptions,                   // effective = applyOverrides(assumptionsBase, scenario.assumptionOverrides)
  ui,                            // loaded from config/ui.json
  mode: "edit" | "running" | "results" | "optimising" | "compare",
  tool: "select" | "add-node" | "place-facility" | "calibrate",
  selectedNodeId: null,          // string|null
  baseline: null,                // { setup, results } | null
  optimised: null,               // { proposal, results } | null
  sweep: null,                   // { seeds: number[], baseline: Summary[], optimised: Summary[] } | null
  llm: { stage: null, text: "", error: null },   // live AI activity
  playback: { t: 0, playing: false, speed: 1, done: false, which: "baseline" },  // which: "baseline" | "optimised"
  demoMode: false,
  panel: null                    // null | "assumptions" | "ai-drawer"
}
```
Editing the scenario (nodes, setup, map, assumptionOverrides) sets `baseline`, `optimised` and `sweep` to `null` and returns `mode` to `"edit"`.

### Units and coordinates
- **Map coordinates:** pixels of the original image. The origin is top-left, x points right and y points down. Everything stored (node x/y, trip `path`) uses image pixels. Rendering scales by `displayWidth / map.widthPx`.
- **Distances:** `metres = pixelDistance × map.metresPerPixel × assumptions.routing.detourFactor.value`. Results report km (`routeDistanceKm`) and trips report metres (`distanceM`).
- **Mass:** kg. Rates are kg/day of **plastic only**. Bin capacity is in litres and converts to kg through bulk density.
- **Time:** 30 days × 24 one-hour steps, so 720 steps. Day index `d` runs 0–29 and hour 0–23; `t = d*24 + hour`. Generation happens only within `assumptions.generation.activeHours` (inclusive start, exclusive end). Peak hours weigh `multiplier×`. The hourly weights are normalised so a day's total equals `rateKgPerDay × dailyNoise`.
- **Pickup rule (off-by-one critical):** a node with interval `k` is collected at the **end of day d** when `(d + 1) % k === 0`. Bins start empty at t = 0. Collected mass reaches the facility the same day and joins the queue, and the facility sorts up to `throughputKgPerDay` that same day.
- **Overflow:** mass beyond capacity in an hour is overflow. `overflowLossFraction` of it becomes litter. The rest lies beside the bin, is picked up at the next pickup and counts as contaminated.
- **Randomness:** only the daily generation noise. Each node-day gets a factor drawn uniformly from `1 ± generation.dailyNoise`, using `mulberry32(seed)`, drawn in the order `for day, for node in scenario.nodes order`. Sorting uses expected values (no random draws).
- **Routing:** each day the sim visits only the nodes due that day. The truck starts and ends at the facility. Up to 8 stops use exact brute force; more use nearest-neighbour + 2-opt. Ties break by `scenario.nodes` order.
- **Days:** the single source is `assumptions.simulation.days` (sim, heuristic, prompt and UI via `results.meta.days`). `scenario.settings.days` is informational only.
- **Fractions** (rates, purity) are 0–1 in data and are formatted as % only in the UI. Currency is INR.

### Naming and file tree
- Files use `kebab-case.js`, functions `camelCase`, constants `UPPER_SNAKE`. JSON keys are `camelCase`. Enum values are `snake_case` strings.
- Waste types: `pet_bottles | hdpe | pp | mixed | food_contaminated`. Resin/colour keys: `pet | hdpe | pp | mixed | contaminated`.

```
plastic_project/
  package.json  vite.config.js  index.html*  .env.example  .gitignore
  CLAUDE.md  plan.md  notes.md  project-brief.md  README.md  GETTING-STARTED.md
  start-windows.bat  start-mac.command
  config/            assumptions.json  ui.json  llm.json
  data/              README.md  nodes.template.csv
  docs/              TEAM-GUIDE.md  FIELD-DATA-GUIDE.md  TEAMMATE-TASKS.md  images/
  fixtures/          (see 3.3)
  public/
    maps/            campus.jpg  campus-labelled.jpg  campus-reference.jpg  placeholder-campus.svg  README.md
    demo/            demo-scenario.json  demo-scenario-after.json  cached-proposal.json
  server/            index.js  api.js  providers/  prompts/optimise.system.md  cli-optimise.mjs  test/
  src/
    main.js*         entry: loads config, creates the store, mounts modules
    app/             store.js notify.js actions.js io.js(csv+json import/export) layout.css + controls/ map-editor/
    sim/             index.js + internals + test/
    llm/             client.js schema.js heuristic.js + test/
    anim/            player.js + helpers
    results/         results panel, sankey, compare, ai-activity, ai-drawer
    assumptions/     assumptions panel
    styles/          tokens.css base.css fonts.css
    shared/          assumptions.js (applyOverrides) budget.js (budgetCap, budgetCheck)
```
`*` = owned by Task 3.

### File ownership
| Task | Owns |
|---|---|
| Orchestrator | `package.json`, `vite.config.js`, `config/*`, `src/shared/*`, `data/*`, `fixtures/*`, `public/maps/*`, `public/demo/demo-scenario.json`, `public/demo/demo-scenario-after.json`, `plan.md`, `CLAUDE.md`, `.env.example`, top-level docs (`README.md`, `GETTING-STARTED.md`, `project-brief.md`, `notes.md`), `docs/**`, start scripts |
| 1 Sim | `src/sim/**` |
| 2 LLM | `server/**`, `src/llm/**`, `public/demo/cached-proposal.json` |
| 3 App shell & editor | `index.html`, `src/main.js`, `src/app/**` |
| 4 Animation | `src/anim/**` |
| 5 Results & AI views | `src/results/**` |
| 6 Assumptions & design system | `src/assumptions/**`, `src/styles/**` |

Nobody edits another task's files. The stubs in `src/sim/index.js` and `src/llm/client.js` exist so consumers can import the real paths from day one; their owners replace them.

### Error handling and logging
- **Sim:** throws `SimInputError` for invalid input and nothing else. It never logs.
- **UI:** catches errors at the action level (`actions.js`) and calls `notify("error", msg)`. Nothing ever fails silently.
- **LLM:** the server retries once with the validation errors fed back. A second failure sends an `error` event with `fallback: "heuristic"`. The client never throws (see `optimise`).
- **Logging:** use `console.info/warn/error` with a module prefix: `[sim]`, `[llm]`, `[server]`, `[app]`, `[anim]`, `[results]`. The server logs one line per request (provider, ms, ok/retry/fallback). **Never log the API key or the full scenario.**
- **Missing assets** (map image fails to load): show a dark grid background plus a notice instead of crashing.

### Single-source constants
- `config/assumptions.json`: **every** model number. Each leaf is `{ "value", "unit", "source", "estimate": true|false }`. The sim reads `.value`, and the Assumptions panel renders all four fields. Code must contain no model numbers.
- `config/ui.json`: resin/flow colours and labels, fill thresholds (green/amber/red), `playbackSeconds` (30), `sweepSeeds` (5), and waste type → colour key.
- `config/llm.json`: provider (`"claude-cli" | "anthropic-api"`), model, timeout, max retries.
- `src/styles/tokens.css`: CSS custom properties (palette, radii, spacing, fonts). Resin colours appear there as `--resin-pet` etc. **with the same hex values as `config/ui.json`**.
- The system prompt lives only in `server/prompts/optimise.system.md`.

---

## 3.2 Task list

## Task 1: Simulation engine            [complex]
Depends on: nothing (contracts + `config/assumptions.json` + `fixtures/scenario.demo.json`)
Owns: `src/sim/**`

Accepts:     `scenario`, `setup`, `assumptions`, `seed`, as specified in §3.1
Produces:    `Results` exactly as specified in §3.1 (summary, perNode, flows, timeline)
Does:
- Seeded PRNG (mulberry32), hourly generation with an active-hours and peak profile, bin fill and overflow, litter vs side waste, the end-of-day pickup rule, daily routing (brute force ≤ 8 stops / NN + 2-opt), facility queue with a throughput cap, sorting by method (accuracy, contaminant detection, process loss), flow aggregation, metrics, and cost through `computeCost`.
- Contamination model: base fraction per waste type + a single-bin cross-contamination add-on (segregated bins reduce it by the compliance factor) + side waste that counts as fully contaminated. All parameters come from `assumptions.json`.
- `npm run test:sim` runs the tests and prints a readable summary table for `fixtures/scenario.demo.json` (baseline vs `fixtures/proposal.json` setup).
- Wrote `docs/HOW-IT-WORKS.md`, a one-page plain-words explainer of the sim and the optimise loop. It has since been merged into `docs/TEAM-GUIDE.md` (sections 5 and 13).
Does NOT:    touch the DOM, use `Math.random`/`Date`, read files inside `simulate` (the test script reads files), or call the LLM
Tools:       plain JS, Node's built-in `node:test` + `node:assert` (no test framework)
Done-check:  `npm run test:sim` passes all of these:
- **Golden case A** (hand-computed): 1 node, 10 kg/day, no noise, no peak, capacity 25 kg, interval 3 gives `overflowBinDays = 10`, overflow 5 kg per cycle, and pickups on days 2, 5, …, 29.
- **Golden case B:** interval 1 with enough capacity gives zero overflow and 30 pickups.
- **Golden case C:** throughput below the collected volume gives `backlogEndKg > 0`.
- Mass balance holds (< 1e-6) on the demo scenario for seeds 1–5.
- Determinism: the same inputs give deep-equal results, and a different seed gives a different `generatedKg`.
- Every flow link listed in §3.1 is present.
- The printed table shows baseline vs proposal, with overflow bin-days falling.

## Task 2: LLM integration            [complex]
Depends on: fixtures (`scenario.demo.json`, `results.baseline.json`, `llm-raw-response.json`). For the final cached response it needs Task 1 (the orchestrator regenerates it at integration).
Owns: `server/**`, `src/llm/**`, `public/demo/cached-proposal.json`

Accepts:     `POST /api/optimise` body as in §3.1; `optimise()` args as in §3.1
Produces:    the `LlmEvent` stream and a `Proposal`
Does:
- `server/api.js` (health + optimise endpoints; SSE). `server/index.js` is the prod server: static `dist/` + api, port `PORT || 8787`, under 60 lines.
- Providers:
  - `claude-cli` (default) spawns `claude -p --model <model> --output-format stream-json --include-partial-messages --verbose --system-prompt-file server/prompts/optimise.system.md`, with tools disabled and the prompt sent on stdin. It runs **in an empty temp working directory** so the project's CLAUDE.md is not loaded, which means the file path must be absolute. It uses the user's logged-in Claude Code subscription. Check the exact flags with `claude --help` (v2.1.x) and consider `--json-schema` (still validate server-side).
  - `anthropic-api` uses `fetch` to the Messages API with streaming, `ANTHROPIC_API_KEY` from env, and no SDK.
- `server/prompts/optimise.system.md`:
  - Role: a waste-logistics planner.
  - Inputs: nodes (rates, types, peaks, positions in metres), the current setup, baseline summary + perNode, and the allowed values and limits taken from assumptions.
  - Output: JSON only, matching the raw response schema.
  - Priorities, in order: overflow, then contamination, then recovery.
  - **Budget rule (v0.3, net of bale revenue):** `net(plan) ≤ net(baseline) + llmLimits.budgetTolerance × total(baseline)`, where `net = total − baleRevenue` (helper: `src/shared/budget.js` `budgetCap`/`budgetCheck`). The prompt includes the cost unit prices and bale sale prices.
  - One-line rationale per node.
- User message builder: compact JSON input with positions converted to metres from the facility.
- `src/llm/schema.js` `validateAndClamp`; `src/llm/heuristic.js` `heuristicProposal` (rule-based: an interval that keeps the expected fill ≤ 85% at peak-adjusted rates, segregated bins where base contamination is ≥ 0.2, and the cheapest sorting method whose throughput covers the peak daily collection while staying within budget).
- Retry once with the errors fed back. Fall back to the heuristic.
- `src/llm/client.js` `optimise()`: SSE parsing, demo mode (replays `cached-proposal.json` if its `scenarioId` matches and every node id matches, otherwise falls back to the heuristic with a clear notice), and the never-throws guarantee.
- `server/cli-optimise.mjs <scenario.json> <results.json>` runs one live call from the terminal and writes the proposal to stdout. It is used to (re)generate `public/demo/cached-proposal.json`.
- `.env.example` content is listed in the task report; the orchestrator owns the file.
Does NOT:    run the simulation on the server; let the LLM claim results; touch the UI beyond `client.js`'s event stream; add the multi-round loop (keep the `history` and `round` hooks only)
Tools:       Node built-ins only (`http`, `child_process`, `fetch`), plus `node:test`
Done-check:
1. `npm run test:llm` passes: clamping cases (interval 0 → 1, 40 → 14, binCount 9 → 6, capacity 200 → 240, unknown enum, missing node, extra node, garbage JSON gives `ok: false`), heuristic output passes `validateAndClamp` with zero clamp notes, and demo-mode replay emits status → delta… → result.
2. `node server/cli-optimise.mjs fixtures/scenario.demo.json fixtures/results.baseline.json` makes a real call through `claude-cli` and prints a valid Proposal with `source: "llm"`.
3. With the network unplugged (or the provider forced to fail), `optimise()` resolves to the heuristic proposal.

## Task 3: App shell, map editor, settings, save/load            [complex]
(Complex because of its size and because it owns the action pipeline. Wiring bugs here would show the wrong run's numbers.)
Depends on: fixtures; the stubs `src/sim/index.js` and `src/llm/client.js`
Owns: `index.html`, `src/main.js`, `src/app/**`

Accepts:     `config/*.json`, Scenario files, CSV per `data/nodes.template.csv`
Produces:    the State and store (§3.1); the mounted layout; the actions
Does:
- `index.html` + `layout.css`: a three-column layout of controls (left, about 320px), map stage (centre, flexible) and results (right, about 400px), plus a top bar with the title, the scenario name (click to rename), the mode chip, Demo-mode toggle, a Load demo menu (the two Thapar campuses, or Blank campus with Undo), Import/Export and Assumptions buttons.
- Mount points with these ids: `#controls`, `#map-stage` (containing `<img id="map-image">`, `<svg id="map-edit-layer">`, `<canvas id="map-anim-layer">`), `#results`, `#overlay-root` (for drawers/modals), `#toast-root`. `main.js` mounts `src/anim/player.js` on `#map-stage`, `src/results/index.js` on `#results` and `src/assumptions/index.js` on `#overlay-root`.
- The map stage keeps the image aspect ratio and applies the darkened/desaturated CSS filter. Google attribution stays visible bottom-right, taken from `scenario.map.attribution`.
- Edit layer (SVG, in image-pixel viewBox):
  - Click to add a node (max 40; adding is disabled with a toast when full).
  - A separate tool places the facility.
  - Nodes can be dragged to move, show glowing markers coloured by waste type, and show their name labels.
  - Select a node to edit it; delete is available.
- Calibrate tool (in the Map card, not the toolbar, because it rescales every distance): click two points, enter the metres between them, and it sets `map.metresPerPixel`; scales that make the map narrower than 50 m or wider than 50 km are refused (limits in `config/ui.json`). A "Change image" option (also in the Map card) takes a file input and sets `map.src` (object URL / data URL), `widthPx` and `heightPx`.
- Node editor in the controls panel: name, waste type (icon chips), rate kg/day, peak toggle with start/end/multiplier, bin type, bin count, capacity (allowed values), and pickup interval. The facility gets a sorting method selector. Labels are short, with icons.
- Run button → `runBaseline`. Optimise button (enabled once a baseline exists) → `runOptimise`, which runs `optimise()`, then `simulate` on the proposal, then the sweep over `ui.sweepSeeds` seeds for both setups, then `mode: "compare"`, then a playback of the optimised run.
- `io.js`: export/import of the full Scenario JSON (including `lastProposal`), CSV import (positions optional; nodes without x/y are placed by clicking, one by one, with a "Place: <name>" prompt), and Load demo (fetches `demo/demo-scenario.json` or `demo/demo-scenario-after.json`).
- `notify.js` toasts.
Does NOT:    compute any outcome itself (calls `simulate`), draw animation (Task 4), or render results or the AI activity (Task 5)
Tools:       vanilla DOM + SVG; no framework
Done-check:  `npm run dev`, then in the browser:
- Load demo shows 40 nodes and the facility on the Thapar map.
- Add, drag and delete a node, and edit its fields.
- Run → the store has `baseline.results` (taken from the stub or the real sim).
- Export and then import give a deep-equal scenario.
- CSV import of `data/nodes.template.csv` works.
- The calibrate tool sets `metresPerPixel`.
- No console errors.

## Task 4: Animation player            [complex]
Depends on: `fixtures/results.baseline.json`, `fixtures/scenario.demo.json`, `config/ui.json`
Owns: `src/anim/**`

Accepts:     `results.timeline` + scenario (via store: `baseline`/`optimised`, `playback`)
Produces:    the canvas animation; `playback` updates in the store
Does:
- Plays the 720 frames in `ui.playbackSeconds` at speed 1×, interpolating between frames.
- Waste dots flow from each node to its bin marker, with spawn rate ∝ `genKg` and colour from `ui.wasteTypeColorKey`.
- Bin fill meter next to each node, coloured by `ui.fillThresholds`. A bin pulses while `overflowKg > 0` and spills litter dots that stay faded on the ground (capped count).
- Trucks: on each trip the route line draws itself along `path` and the truck icon travels it during a short pause at the end of the day. Collected bins drop to empty.
- Facility glow and queue meter.
- HUD: day counter "Day 12 / 30", play/pause, speed 1×/2×/4×, skip-to-end.
- Smooth at 60 fps on a laptop: one canvas, devicePixelRatio aware, object pooling for dots, and `requestAnimationFrame` only while playing.
- Respects `prefers-reduced-motion` (shows the final frame directly).
Does NOT:    compute fills, overflow or routes (reads them only), draw the edit-mode markers (Task 3), or use any library
Tools:       Canvas 2D
Done-check:  a standalone harness page `src/anim/dev.html` (served by Vite at `/src/anim/dev.html`) plays `fixtures/results.baseline.json` on the campus map. It finishes in 30 s ± 1 at 1× with day 30 shown. Bins go red and leak on overflow days, trucks follow paths, and DevTools Performance shows no long frames over 50 ms.

## Task 5: Results panel, Sankey, before/after, AI activity            [complex]
Depends on: `fixtures/results.baseline.json`, `fixtures/results.optimised.json`, `fixtures/proposal.json`, `fixtures/sweep.json`, `fixtures/llm-stream-events.json`, `config/ui.json`
Owns: `src/results/**`

Accepts:     store `baseline`, `optimised`, `sweep`, `llm`, `mode`, `panel`
Produces:    the results UI (mounted by `src/results/index.js` on `#results`, with drawers in `#overlay-root`)
Does:
- **Results mode:** headline metric cards (recovery, purity, contamination, overflow bin-days, route km, cost) with ticking counters. All are labelled "model results". A Sankey of the flows (d3-sankey) with fixed colours from `ui.json`, redrawing with a transition when the results change. Route tags (mechanical / chemical candidate / landfill) appear as the right-most column. Per-node table (compact). An "observed vs model" note appears when `node.observed` is present.
- **Optimising mode:** the AI-activity card shows the stage steps (sending → thinking → validating), a live monospace stream of `llm.text`, and pulled-out rationales popping in as each `"rationale": "…"` completes (parsed from partial text). A source badge reads LLM / Cached (demo) / Heuristic fallback.
- **Compare mode:** before/after columns with deltas highlighted (e.g. "Overflow bin-days 96 → 4 ▼96%"), with green for improvement and red for regression. The cost line shows budget status ("within budget +8%" / "over budget"). Seed-sweep robustness shows "holds across 5 seeds: min–max". There are two Sankeys or a toggle, per-node rationale list beside the setup changes (e.g. "n1 interval 3→1, bins 2×120 → 3×240"), clamp notes if any, and the sorting-method change with its rationale.
- **"What the AI saw / said" drawer:** the request summary and `proposal.raw`.
Does NOT:    compute metrics (only formats them and computes deltas between two given summaries), call the LLM, or run the sim
Tools:       `d3-sankey` + `d3-shape` for layout and paths only (render with plain SVG DOM); vanilla DOM
Done-check:  a harness page `src/results/dev.html` has buttons to set the store to results / optimising (replays `fixtures/llm-stream-events.json`) / compare using the fixtures. Each state renders without console errors, the Sankey link widths match the fixture kg values (spot-check 3), and the deltas show the correct arrows and colours.

## Task 6: Assumptions panel and design system            [simple]
Depends on: `config/assumptions.json`, `config/ui.json`, the seed `src/styles/tokens.css`
Owns: `src/assumptions/**`, `src/styles/**`

Accepts:     `config/assumptions.json` (via store `assumptions`)
Produces:    an Assumptions drawer; global styles used by every module
Does:
- An Assumptions drawer, opened when `panel === "assumptions"`, grouped by section. Each row shows the label, value, unit and source, with an amber "estimate" pill where `estimate: true`. A footer reads "All outputs are model results computed from these assumptions." Read-only.
- `tokens.css`: a refinement of the seed tokens (names stay fixed). `base.css`: reset, typography (Space Grotesk headings, Inter UI), cards, buttons, chips, inputs, toggles, drawers, toasts, focus rings, and projector-readable sizes (min 14px UI text).
- `fonts.css` uses the local `@fontsource` packages, **with no Google Fonts CDN**, so the app works offline.
Does NOT:    edit other tasks' CSS (list polish requests in its report instead) or change token names
Tools:       plain CSS custom properties
Done-check:  `npm run dev` → clicking Assumptions opens a drawer listing every leaf in `assumptions.json` (the count matches `node -e` leaf count), each with a source, and estimates are pilled. With DevTools offline the fonts still render as Space Grotesk/Inter.

---

## Integration (orchestrator, during /dispatch, after tasks report)
1. Replace the stub imports. The real `simulate` and `optimise` already live at the same paths, so nothing should need rewiring.
2. Run the real sim on the demo scenario. Generate `public/demo/cached-proposal.json` with `server/cli-optimise.mjs` from the **real** baseline results, and check that the optimised run improves the numbers.
3. Run the demo path end-to-end with Playwright at 1366×768 and 1920×1080: Load demo → Run → Optimise (demo mode on, network off) → compare. Take screenshots and do a visual review.
4. Polish pass via `/bugfix` tickets.

## Cut order (if scope gets tight)
Multi-round loop (not in v1 anyway) → seed sweep → peak windows → animated truck (draw static route) → CSV import. **Never cut:** node placement, the sim, optimise, before/after numbers, demo mode.

## Risks
- **Sim correctness:** believable-but-wrong numbers. Mitigated by the golden hand-computed tests, the mass-balance invariant and determinism tests.
- **`claude -p` on the demo laptop:** it needs to be logged in, and it adds startup latency (about 3–10 s). Mitigated by demo mode (cached), the heuristic fallback and the `anthropic-api` switch. The subscription route is only for this local, personal tool.
- **The optimiser "winning" by brute force:** mitigated by the cost metric and the budget rule in both the prompt and the compare view.
- **Estimated numbers in `assumptions.json`:** every value without a source is marked `estimate: true` (24 of 34 today, each with its reasoning).
- **Polish with Haiku builders:** visual quality needs an orchestrator review pass with screenshots.

---

## 3.3 Fixtures
Fixture numbers are **fake but shape-exact**. `fixtures/make-fixtures.mjs` regenerates them; it is not a simulation. It is also the **source of truth for the demo campuses** (`npm run fixtures`). Hand-computed tests read the frozen copies in `fixtures/golden/` (the original 10-node scenario and placeholder assumptions), which are never regenerated.

| File | Mirrors | Used by |
|---|---|---|
| `scenario.demo.json` | Scenario (the 40-node Thapar 2023 campus + facility, baseline setup) | 1, 2, 3, 4, 5 |
| `results.baseline.json` | Results incl. a 720-frame timeline (lots of overflow) | 3, 4, 5, 2 |
| `results.optimised.json` | Results (little overflow) | 4, 5 |
| `proposal.json` | Proposal (`source: "llm"`) | 1 (test table), 3, 5 |
| `llm-raw-response.json` | LLM raw response | 2 |
| `llm-stream-events.json` | an array of `LlmEvent`s for replay | 2, 5 |
| `sweep.json` | `state.sweep` | 5 |

Also written by the same script: `public/demo/demo-scenario.json` (a copy of `scenario.demo.json`) and `public/demo/demo-scenario-after.json` (same campus, all segregated). `public/demo/cached-proposal.json` is a real Claude answer, regenerated with `server/cli-optimise.mjs` whenever the demo changes. `data/nodes.template.csv` holds three example Thapar rows.

## Parallelism
All six tasks start at once. Tasks 3, 4 and 5 build against the fixtures and stubs, and Task 2 uses the fixture baseline. The only late dependency is regenerating the cached proposal from real sim output, which the orchestrator does at integration. Task 6's tokens are seeded now, so the other tasks can use the variable names immediately.
