# PROJECT BRIEF: AI-assisted plastic waste collection simulator

This file says **what** to build. **How** to organise the work (planning, subagents, tickets, bug loop) is covered by the workflow skills and agents already installed (`task-designer`, `builder`). Follow that workflow.

**Process for this session:**
1. Read this whole brief.
2. Ask me the open questions in section 11, all in one message.
3. Write `plan.md`, `CLAUDE.md`, and `fixtures/` per the workflow. Do not spawn any agents until I approve `plan.md`.

---

## 1. Context

College assignment: **"Plastic Waste Management: From Collection to Recycling"**. Its three bullets:
1. Study the lifecycle of plastic waste from collection to recycling.
2. Develop a project that focuses on setting up a plastic waste collection and sorting system.
3. Explore recycling methods (mechanical and chemical) and propose improvements to existing systems.

This app is the deliverable for **bullet 2**. Nothing physical is being built, so the app is a **simulation of the system we would set up in real life**. Its results feed bullets 1 and 3.

A separate PPT already narrates the lifecycle and recycling theory. So the app must **not** re-explain theory: no landing page, no lifecycle infographic, no educational text. It is a working tool, not a presentation.

Marking depends heavily on **visual polish** and **visible use of AI**. Both matter.

Team of three: one builds (me, working with you), one collects real campus data, one sources and validates the numbers. Their outputs arrive as data files (section 8).

---

## 2. What the app does

A single-page web app for a laptop and projector.

1. **Map.** A pre-taken screenshot of a real place (our university campus, from Google Maps) is the background. The image is swappable, so the tool is reusable for any location.
2. **Place nodes.** The user clicks the map to place up to **10 waste-generating nodes** (canteen, hostel, library, and so on). One extra **sorting facility** node is placed by the user and does not count toward the 10.
3. **Configure each node.**
   - name
   - waste type: PET bottles, HDPE, PP, mixed plastic, food-contaminated
   - generation rate in kg/day
   - optional peak window (for example a canteen lunch spike)
   - current setup: bin type (single mixed vs segregated), bin count, bin capacity, pickup interval in days
4. **Run baseline.** A 30-day simulation plays back visually in about 30 seconds.
   - Waste dots flow from each node into its bin at a speed matching its rate.
   - Bin fill meters rise and shift green, amber, red.
   - Overflowing bins pulse and leak "litter" dots.
   - A truck follows the collection route to the facility, where sorting happens.
5. **Results.** Metrics plus a Sankey-style flow diagram of where all generated plastic ends up: overflow/litter, collected, sorted by resin type, clean bales, contaminated, rejected.
   - Headline metrics: recovery rate, purity, contamination rate, overflow days, route distance.
6. **Optimise (the AI step).** One button. It sends the node data and baseline results to an LLM with a predefined system prompt. The LLM returns a proposed setup as JSON:
   - pickup interval per node
   - bin type and count per node
   - route order
   - sorting method at the facility
   - a one-line rationale per node

   The simulation then **re-runs with that setup** and shows before/after results side by side. The improvement is measured by the simulation and never claimed by the LLM. The story: *the LLM proposes, the simulation verifies.*
7. **Save/load.** Export and import the full scenario (map reference, nodes, settings, last LLM proposal) as JSON.

---

## 3. Architecture rules (these protect the project)

- **The simulation is a pure function:** `simulate(scenario, setup, seed) -> results`.
  - No DOM, no animation code, no global state.
  - Same inputs always give the same outputs. Use a seeded PRNG.
  - It outputs both summary results and a timeline that the animation replays.
  - The animation layer **replays** the timeline and never computes outcomes itself.
- **Correctness-critical core.** A wrong overflow count or a pickup off by one day produces believable but wrong numbers and breaks the before/after story. The sim gets the most careful design and a runnable test script that prints results for a sample scenario.
- **All assumptions in one config file** (for example `assumptions.json`). Each entry has a comment with its source, or marks it as a tuned estimate. Include:
  - resin mix by waste type
  - sorting accuracy and throughput per method
  - contamination penalties
  - default bin capacities
  - overflow loss fraction
  - truck speed
  - map pixels-per-metre scale
- The UI has an **Assumptions panel** that renders this config. All outputs are labeled "model results".
- **Sorting methods to model:** manual only, manual + float/density tank, manual + near-infrared (NIR) sensor. Each has an accuracy and a throughput cap.
- **Recycling route tagging in results** (output categories only, no theory text):
  - clean sorted PET/HDPE/PP → "mechanical route"
  - mixed, dirty, or multilayer residue → "chemical recycling candidate"
  - rejected → landfill
- **Routing:** simple nearest-neighbour or small brute-force route over pixel distances scaled to metres. No external routing API.
- **Stack:** dependency-light. See open questions.

---

## 4. LLM integration

- A small backend proxy (about 30-50 lines) so the API key never reaches the browser. The key comes from an env var. Provide `.env.example`.
- Model name and provider configurable in one place.
- The **system prompt lives in its own file**. It tells the LLM:
  - it is a waste-logistics planner
  - it receives nodes (rates, types, peaks, positions), the current setup, and baseline results
  - it must return **only JSON** matching the schema
  - it should prioritise fewer overflow days and less contamination first, then higher recovery, while keeping pickups and cost reasonable
  - it must include a one-line rationale per node
- **Strict JSON schema** for the response, validated on arrival.
  - **Clamp** values to sane ranges (pickup interval 1-14 days, bin count 1-6, and so on) so the LLM cannot propose 40 daily pickups.
  - On invalid JSON, retry once with the error fed back, then fall back gracefully.
- **Cached fallback and demo mode.** Save one good response to disk. A "demo mode" toggle uses it with no network. This is insurance for the live presentation.
- Show an **AI-activity moment** in the UI while waiting (thinking/streaming indicator), and show the per-node rationales next to the results. This is what shows off the AI usage.
- Build the single-round version first, but structure the code so a 2-3 round refinement loop (feeding the new sim score back to the LLM) can be added later.

---

## 5. Visual design

- **Palette:** deep ink-green background, warm off-white text, **one** mint/lime accent. Fixed color per resin type (PET, HDPE, PP, mixed, contaminated), used identically on dots, bins, flow diagram, and legends.
- **Type:** a characterful display font for headings (Space Grotesk or Fraunces), Inter for UI text.
- **Map:** the screenshot slightly darkened and desaturated, with glowing nodes on top. Keep Google's attribution visible in a corner.
- **Layout:** controls panel on the left, animated map in the center, results on the right or below. Rounded cards, generous spacing, short labels, icons over words.
- **Motion budget:** flowing waste dots, filling bin meters, the truck route drawing itself, the flow diagram redrawing when results change, and counters ticking up. Everything else stays calm and still.
- **Before/after view:** baseline and optimised side by side, with deltas highlighted (for example overflow days 9 → 1).
- **Rendering:** canvas or SVG overlay on the static image, smooth on a normal laptop.

---

## 6. Suggested task breakdown (refine as you see fit)

| # | Task | Likely type | Notes |
|---|---|---|---|
| 1 | Simulation engine: pure function, seeded RNG, timeline output, test script | complex | Correctness-critical core |
| 2 | LLM integration: proxy, system prompt, schema, validation + clamping, retry, cached fallback, demo mode | complex | |
| 3 | Map, node placement, settings panel, save/load | simple | Builds against fixtures |
| 4 | Animation layer that replays the sim timeline | complex | Builds against fixtures |
| 5 | Results panel, flow diagram, before/after view | complex | Builds against fixtures |
| 6 | Assumptions panel and styling polish | simple | |

Tasks 3, 4, and 5 should be able to start immediately against `fixtures/` (fake sim output in the exact final shape) while tasks 1 and 2 are built.

---

## 7. Build priorities

If scope gets tight, cut in this order: multi-round LLM loop, peak-hour spikes, animated truck (a static drawn route is fine).

**Never cut:** node placement, the sim, optimise, before/after numbers.

---

## 8. Data coming from the team

Design the app so these drop in with no code changes:

- **`data/nodes.*`** (from the field-data teammate): the real node list with positions, names, waste types, estimated rates, peak windows, and the current setup (bins, capacities, pickup interval). The baseline scenario is **calibrated against what was observed on campus**.
- **Map screenshot** and a **known real-world distance** for the pixel-per-metre scale. If these are not available yet, use a placeholder image and make the scale a setting.
- **Assumptions with sources** (from the research teammate): values for the config file in section 3. Until they arrive, use clearly marked placeholder estimates.

---

## 9. Demo path (about 3 minutes)

Load the campus map → place or load nodes → run baseline → point at where plastic leaks in the flow diagram → click Optimise (show the AI activity and rationales) → watch the sim re-run → read the before/after numbers. Works in demo mode with no network.

---

## 10. Definition of done

- A user can load the campus map, place 10 nodes, set types and rates, run a baseline, click Optimise, see the LLM's proposal, see the sim re-run with it, and read clear before/after numbers.
- It works offline in demo mode.
- Same inputs always give identical results.
- Every number in the Assumptions panel has a source or is marked as an estimate.
- It looks like a polished product.
- All three of us can explain the sim logic in plain words, so include a one-page "how this works" explainer in the repo.

---

## 11. Ask me these before planning (one message)

1. **Stack:** vanilla JS + Vite, or React? (Recommend whichever you judge simplest to get right.)
2. **Backend:** Node or Python for the proxy?
3. **LLM provider and model** for the Optimise call. I will supply the API key via env var.
4. **Map screenshot:** is it ready, and what is its approximate real-world width in metres?
5. Anything in this brief that you think is over-scoped, ambiguous, or likely to cause trouble.
