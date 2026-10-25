# Plastic waste collection simulator: rules for every agent

Full contracts live in `plan.md` §3.1. This is the short version.

- Read `plan.md` §3.1 before writing code. Match signatures and JSON shapes exactly.
- Stack: vanilla JS ES modules + Vite, Node backend, no framework. Deps: only `d3-sankey`, `d3-shape`, `@fontsource/*`. Tests: `node:test`.
- The sim is pure: `simulate(scenario, setup, assumptions, seed) -> Results`. No DOM, `Math.random`, `Date` or I/O inside `src/sim`. The animation **replays** `results.timeline` and never computes outcomes.
- Units: kg (plastic only), litres for bin capacity (kg via bulk density), 720 hourly steps (`t = day*24 + hour`, day 0–29). Fractions 0–1 in data, % only in the UI. Currency INR.
- Coordinates: original-image pixels, origin top-left, y down. Metres = px × `map.metresPerPixel` × `routing.detourFactor`.
- Pickup rule: interval k means collection at the END of day d when `(d+1) % k === 0`. Bins start empty.
- Naming: kebab-case files, camelCase JSON keys, snake_case enum values. Node ids `n1..n40`, facility id `"facility"`.
- UI modules export `mount(el, store) -> unmount` and talk only through the store (`src/app/store.js`).
- Constants: model numbers ONLY in `config/assumptions.json` (each leaf `{value, unit, source, estimate}`), colours/labels/thresholds ONLY in `config/ui.json` (mirrored as `--resin-*` in `src/styles/tokens.css`), LLM provider/model ONLY in `config/llm.json`. Never hard-code them elsewhere.
- Runtime assumption edits live in `scenario.assumptionOverrides` and are applied with `applyOverrides` from `src/shared/assumptions.js`. Always pass the EFFECTIVE assumptions (`state.assumptions`) to sim, heuristic and LLM.
- File ownership: edit only the folders your task Owns (table in `plan.md` §3.1). Never edit another task's files.
- Errors: the sim throws only `SimInputError`. UI errors go through `notify(level, msg)`. `optimise()` never throws and falls back to the heuristic.
- Logging: `console.*` with a `[module]` prefix. Never log API keys or full scenarios.
- Offline must work: no CDN fonts or scripts. Demo mode needs no network.
- Do not change `plan.md` §3.1. If a contract must change, stop and report it.
- If anything is ambiguous, write the question to `notes.md` and STOP. Do not guess.
- Every piece of work ends by running its done-check.
- Do exactly what you are asked; no extra features or refactors.
