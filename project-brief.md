# PROJECT BRIEF: AI-assisted plastic waste collection simulator

This file says **what** to build. **How** to organise the work (planning, subagents, tickets, bug loop) is covered by the workflow skills and agents already installed (`task-designer`, `builder`). Follow that workflow.

**Status (updated 26 Oct 2026):** the app is built. This brief started the project and has since been updated to the current scope: the real Thapar campus, up to 40 nodes, a cost metric with a net budget, and routes computed by the simulation. The technical design is in `plan.md`; how everything works is in `docs/TEAM-GUIDE.md`. The decisions taken on the original open questions are in section 11.

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

1. **Map.** A Google Maps satellite capture of our campus, the Thapar Institute (TIET), Patiala, is the background. The image is swappable (with a calibrate tool for the scale), so the tool is reusable for any location.
2. **Place nodes.** The user clicks the map to place up to **40 waste-generating nodes** (canteen, hostel, library, and so on). One extra **sorting facility** node is placed by the user and does not count toward the 40. The demo ships with 40 real Thapar buildings and the real MRF.
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
   - Headline metrics: overflow bin-days, recovery rate, purity, contamination rate, route distance, and cost (spend, bale revenue, net cost), plus plastic recycled, landfill and CO₂e avoided.
6. **Optimise (the AI step).** One button. It sends the node data and baseline results to an LLM with a predefined system prompt. The LLM returns a proposed setup as JSON:
   - pickup interval per node
   - bin type, count and size per node
   - sorting method at the facility
   - a one-line rationale per node

   It does **not** propose a route order: with different pickup intervals each day visits a different set of nodes, so the simulation plans every day's route itself. The plan must stay within a **net-cost budget** (spend minus bale revenue may rise by at most 25% of baseline spend).

   The simulation then **re-runs with that setup** and shows before/after results side by side. The improvement is measured by the simulation and never claimed by the LLM. The story: *the LLM proposes, the simulation verifies.*
7. **Save/load.** Export and import the full scenario (map reference, nodes, settings, edited costs, last LLM proposal) as JSON, and import nodes from a field-survey CSV.
8. **Two demo campuses.** "Thapar 2023 · before Saahas" (mixed bins) and "Thapar 2024 · after Saahas" (segregated bins, as Thapar did with Saahas Zero Waste), so the AI's plan can be compared with the real intervention.

---

## 3. Architecture rules (these protect the project)

- **The simulation is a pure function:** `simulate(scenario, setup, assumptions, seed) -> results`.
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
- **Routing:** exact brute force up to 8 stops, nearest-neighbour + 2-opt above that, over pixel distances scaled to metres (× a road detour factor). No external routing API.
- **Cost:** transport, bins (priced by size) and sorting, minus revenue from correctly sorted PET/HDPE/PP bales. Costs are editable in the Assumptions panel at runtime.
- **Stack:** dependency-light: vanilla JS + Vite, Node backend (section 11).

---

## 4. LLM integration

- A small Node backend (about 120 lines) so no key or login ever reaches the browser. By default it calls Claude through the laptop's logged-in Claude Code subscription (`claude -p`); the Anthropic API with a key from an env var is a one-line switch. Provide `.env.example`.
- Model name and provider configurable in one place.
- The **system prompt lives in its own file**. It tells the LLM:
  - it is a waste-logistics planner
  - it receives nodes (rates, types, peaks, positions), the current setup, and baseline results
  - it must return **only JSON** matching the schema
  - it should prioritise fewer overflow days and less contamination first, then higher recovery, within the net-cost budget, and pick the smallest bins that work
  - it must include a one-line rationale per node
- **Strict JSON schema** for the response, validated on arrival.
  - **Clamp** values to sane ranges (pickup interval 1-14 days, bin count 1-6, and so on) so the LLM cannot propose 40 daily pickups.
  - On invalid JSON, retry once with the error fed back, then fall back gracefully.
- **Cached fallback and demo mode.** Save one good response to disk. A "demo mode" toggle uses it with no network. This is insurance for the live presentation.
- Show an **AI-activity moment** in the UI while waiting (thinking/streaming indicator), and show the per-node rationales next to the results. This is what shows off the AI usage.
- Build the single-round version first, but structure the code so a 2-3 round refinement loop (feeding the new sim score back to the LLM) can be added later.
- The user can **cancel** a request in flight; the server then stops the model call.

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

## 6. Task breakdown (as built; details in `plan.md` §3.2)

| # | Task | Likely type | Notes |
|---|---|---|---|
| 1 | Simulation engine: pure function, seeded RNG, timeline output, test script | complex | Correctness-critical core |
| 2 | LLM integration: proxy, system prompt, schema, validation + clamping, retry, cached fallback, demo mode | complex | |
| 3 | Map, node placement, settings panel, save/load | complex | Builds against fixtures; owns the action pipeline |
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

- **Field data** (from the field-data teammates; pending, see `docs/TEAMMATE-TASKS.md` and `docs/FIELD-DATA-GUIDE.md`): bin counts, sizes, collection times and observed overflow at the hostels and canteens, via `data/nodes.template.csv` or straight into the demo data. The baseline is then **calibrated against what was observed on campus**.
- **Map and scale:** done. `public/maps/campus.jpg` is a Thapar satellite capture at 0.5153 m per pixel, checked against the 100 m scale bar.
- **Assumptions with sources:** 34 values in `config/assumptions.json`; 10 are sourced (Thapar case study, CPCB, US EPA WARM, IndiaMART, Punjab minimum wage) and 24 are still marked as estimates, each with its reasoning.

---

## 9. Demo path (about 3 minutes)

Load demo (Thapar 2023 · before Saahas) → run baseline → point at where plastic is lost in the flow diagram → click Optimise (show the AI activity and rationales) → watch the sim re-run → read the before/after numbers → load Thapar 2024 · after Saahas and run it to compare with what Thapar really did. Works in demo mode with no network.

---

## 10. Definition of done

- A user can load the campus map, place up to 40 nodes, set types and rates, run a baseline, click Optimise, see the LLM's proposal, see the sim re-run with it, and read clear before/after numbers.
- It works offline in demo mode.
- Same inputs always give identical results.
- Every number in the Assumptions panel has a source or is marked as an estimate.
- It looks like a polished product.
- All three of us can explain the sim logic in plain words. `docs/TEAM-GUIDE.md` does this, with viva questions and answers.

---

## 11. Open questions, and what was decided

1. **Stack:** vanilla JS (ES modules) + Vite, no framework.
2. **Backend:** Node, built-in modules only.
3. **LLM:** Claude Sonnet 5.5, through the Claude Code subscription (`claude -p`) by default, with the Anthropic API as a switch in `config/llm.json`.
4. **Map:** first a placeholder; now the real Thapar satellite capture (2960 × 1840 px, 0.5153 m/px, about 1.5 km wide).
5. **Scope changes:** the LLM no longer proposes a route order (the sim computes routes); a cost metric and budget were added so the AI can't win by collecting everywhere daily; the node limit went from 10 to 40 for the real campus; the budget is on net cost (spend minus bale revenue).
