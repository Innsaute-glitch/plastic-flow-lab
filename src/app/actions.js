// The action pipeline. Never computes outcomes itself: calls simulate() / optimise().
import { simulate, SimInputError } from '../sim/index.js';
import { optimise } from '../llm/client.js';
import { applyOverrides } from '../shared/assumptions.js';
import { notify } from './notify.js';
import { normaliseScenario, emptyScenario, defaultNodeSetup, nextNodeId, MAX_NODES, mapScaleProblem } from './scenario-utils.js';

const RESET = { baseline: null, optimised: null, sweep: null, mode: 'edit' };
const FRESH_PLAYBACK = (which = 'baseline', playing = false) => ({ t: 0, playing, speed: 1, done: false, which });
const FRESH_LLM = { stage: null, text: '', error: null };

/** Apply a mutation to a clone of the scenario. Invalidates every derived result and returns to edit mode. */
export function editScenario(store, mutate, extra = {}) {
  const scenario = structuredClone(store.get().scenario);
  mutate(scenario);
  store.set({ scenario, ...RESET, playback: FRESH_PLAYBACK(), llm: FRESH_LLM, ...extra });
}

/** Rename without invalidating results, playback or the AI answer. */
export function renameScenario(store, name) {
  store.set({ scenario: { ...store.get().scenario, name } });
}

export function addNode(store, x, y) {
  const { scenario, assumptions } = store.get();
  const unplaced = scenario.nodes.find((n) => n.x == null);
  if (unplaced) {
    editScenario(store, (s) => {
      const n = s.nodes.find((m) => m.id === unplaced.id);
      n.x = x;
      n.y = y;
    }, { selectedNodeId: unplaced.id });
    return unplaced.id;
  }
  const id = nextNodeId(scenario.nodes);
  if (!id) {
    notify('warn', `Maximum of ${MAX_NODES} nodes reached.`);
    return null;
  }
  editScenario(store, (s) => {
    s.nodes.push({ id, name: `Node ${id.slice(1)}`, x, y, wasteType: 'mixed', rateKgPerDay: 5, peak: null, observed: null });
    s.baselineSetup.nodes[id] = defaultNodeSetup(assumptions);
    s.lastProposal = null;
  }, { selectedNodeId: id });
  return id;
}

export function deleteNode(store, id) {
  editScenario(store, (s) => {
    s.nodes = s.nodes.filter((n) => n.id !== id);
    delete s.baselineSetup.nodes[id];
    s.lastProposal = null;
  }, { selectedNodeId: null });
}

export function moveNode(store, id, x, y) {
  editScenario(store, (s) => {
    const n = id === 'facility' ? s.facility : s.nodes.find((m) => m.id === id);
    if (n) { n.x = x; n.y = y; }
  });
}

export function placeFacility(store, x, y) {
  editScenario(store, (s) => {
    s.facility = { id: 'facility', name: s.facility?.name ?? 'Sorting facility', x, y };
  }, { tool: 'select' });
}

export function loadScenario(store, scenarioObj) {
  try {
    const { assumptionsBase, ui } = store.get();
    const scenario = normaliseScenario(scenarioObj, assumptionsBase);
    // an implausible scale would make every distance, cost and AI input meaningless, so refuse the file
    const bad = mapScaleProblem(scenario.map, ui?.calibration);
    if (bad) throw new Error(`its map scale is ${scenario.map.metresPerPixel} m per pixel, so ${bad.text}. Fix "metresPerPixel" in the file's "map" section.`);
    store.set({
      scenario,
      assumptions: applyOverrides(assumptionsBase, scenario.assumptionOverrides), ...RESET, playback: FRESH_PLAYBACK(), llm: FRESH_LLM,
      selectedNodeId: null, tool: scenario.nodes.some((n) => n.x == null) ? 'add-node' : 'select', panel: null,
    });
    return true;
  } catch (err) {
    console.error('[app] loadScenario failed:', err.message);
    notify('error', `Could not load scenario: ${err.message}`);
    return false;
  }
}

export function newScenario(store) {
  const st = store.get();
  // already blank: nothing to undo, and a new Undo would replace the one that restores real work
  if (!st.scenario.nodes.length && !st.scenario.facility) {
    notify('info', 'Already a blank campus.');
    return;
  }
  const snapshot = structuredClone({
    scenario: st.scenario, assumptions: st.assumptions, baseline: st.baseline, optimised: st.optimised,
    sweep: st.sweep, mode: st.mode, playback: { ...st.playback, playing: false }, llm: st.llm, selectedNodeId: st.selectedNodeId,
  });
  const fresh = emptyScenario(st.assumptionsBase, structuredClone(st.scenario.map));
  fresh.assumptionOverrides = structuredClone(st.scenario.assumptionOverrides ?? {});
  if (!loadScenario(store, fresh)) return;
  notify('info', 'Cleared. Start placing nodes on the map.', {
    key: 'blank-undo',
    action: { label: 'Undo', onClick: () => { store.set(snapshot); notify('info', 'Restored.'); } },
  });
}

export function exportScenario(store) {
  return structuredClone(store.get().scenario);
}

function simErrorMessage(err) {
  return err instanceof SimInputError ? err.errors.join(' ') : `Simulation failed: ${err.message}`;
}

function preflight(scenario) {
  const unplaced = scenario.nodes.filter((n) => n.x == null);
  if (unplaced.length) return `Place ${unplaced.map((n) => n.name).join(', ')} on the map first.`;
  return null;
}

export function runBaseline(store) {
  const { scenario, assumptions, mode } = store.get();
  if (mode === 'optimising') return;
  const pre = preflight(scenario);
  if (pre) return notify('warn', pre);
  try {
    const setup = structuredClone(scenario.baselineSetup);
    const results = simulate(scenario, setup, assumptions, scenario.settings.seed);
    store.set({
      baseline: { setup, results }, optimised: null, sweep: null,
      llm: FRESH_LLM, mode: 'running', playback: FRESH_PLAYBACK('baseline', true), panel: null,
    });
  } catch (err) {
    console.error('[app] runBaseline failed:', err.message);
    notify('error', simErrorMessage(err));
  }
}

// The in-flight AI request, so the Cancel button can abort it.
let optimiseCtl = null;

export function cancelOptimise() {
  optimiseCtl?.abort();
}

export async function runOptimise(store) {
  const start = store.get();
  const { scenario, assumptions, baseline, demoMode, ui } = start;
  if (!baseline) return notify('warn', 'Run the baseline first.');
  if (start.mode === 'optimising') return;
  const prev = { mode: start.mode, optimised: start.optimised, sweep: start.sweep, playback: start.playback };
  store.set({ mode: 'optimising', optimised: null, sweep: null, llm: { stage: 'sending', text: '', error: null }, panel: null });
  const stale = () => store.get().scenario !== scenario;
  const ctl = (optimiseCtl = new AbortController());
  try {
    const onEvent = (evt) => {
      if (stale()) return;
      const llm = store.get().llm;
      if (evt.type === 'status') store.set({ llm: { ...llm, stage: evt.stage } });
      else if (evt.type === 'delta') store.set({ llm: { ...llm, text: llm.text + (evt.text ?? '') } });
      else if (evt.type === 'error') {
        store.set({ llm: { ...llm, error: { message: evt.message ?? 'AI request failed', fallback: evt.fallback ?? null } } });
        notify('warn', evt.fallback === 'heuristic' ? `${evt.message} Using the rule-based fallback.` : evt.message);
      }
    };
    const proposal = await optimise(
      { scenario, baseline: { setup: baseline.setup, results: baseline.results }, assumptions, demoMode, history: [], signal: ctl.signal },
      onEvent
    );
    if (stale()) return;
    if (!proposal) {
      // cancelled: back to the baseline results, nothing else changes
      store.set({ ...prev, playback: { ...prev.playback, playing: false }, llm: FRESH_LLM });
      notify('info', 'AI request cancelled.');
      return;
    }
    const seed = scenario.settings.seed;
    const optimisedResults = simulate(scenario, proposal.setup, assumptions, seed);
    const seeds = Array.from({ length: ui.sweepSeeds }, (_, i) => seed + i);
    const sweep = {
      seeds,
      baseline: seeds.map((s) => simulate(scenario, baseline.setup, assumptions, s).summary),
      optimised: seeds.map((s) => simulate(scenario, proposal.setup, assumptions, s).summary),
    };
    if (stale()) return;
    store.set({
      scenario: { ...scenario, lastProposal: proposal },
      optimised: { proposal, results: optimisedResults },
      sweep, mode: 'compare', playback: FRESH_PLAYBACK('optimised', true),
    });
  } catch (err) {
    console.error('[app] runOptimise failed:', err.message);
    notify('error', simErrorMessage(err));
    if (!stale()) store.set({ mode: 'edit', llm: { ...store.get().llm, stage: null } });
  } finally {
    if (optimiseCtl === ctl) optimiseCtl = null;
  }
}
