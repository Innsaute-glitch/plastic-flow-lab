// Entry: load config, create the store, mount own modules, then mount other tasks' modules defensively.
// Global styles (tokens/base/fonts are owned by Task 6; any that are missing are simply skipped).
import.meta.glob('./styles/*.css', { eager: true });
import './app/layout.css';
import assumptions from '../config/assumptions.json';
import ui from '../config/ui.json';
import { applyOverrides } from './shared/assumptions.js';
import { createStore } from './app/store.js';
import { emptyScenario } from './app/scenario-utils.js';
import { mount as mountShell } from './app/shell.js';
import { mount as mountTopbar } from './app/topbar.js';
import { mount as mountControls } from './app/controls/index.js';
import { mount as mountMapEditor } from './app/map-editor/index.js';

const store = createStore({
  scenario: emptyScenario(assumptions),
  assumptionsBase: assumptions,
  assumptions: applyOverrides(assumptions, {}),
  ui,
  mode: 'edit',
  tool: 'select',
  selectedNodeId: null,
  baseline: null,
  optimised: null,
  sweep: null,
  llm: { stage: null, text: '', error: null },
  playback: { t: 0, playing: false, speed: 1, done: false, which: 'baseline' },
  demoMode: false,
  panel: null,
});

// Keep effective assumptions in sync whenever the scenario's overrides change (any module may set them).
store.subscribe((s, prev) => {
  if (JSON.stringify(s.scenario.assumptionOverrides ?? {}) !== JSON.stringify(prev.scenario.assumptionOverrides ?? {})) {
    store.set({ assumptions: applyOverrides(s.assumptionsBase, s.scenario.assumptionOverrides ?? {}) });
  }
});

const $ = (id) => document.getElementById(id);
const unmounts = [
  mountShell($('app'), store),
  mountTopbar($('topbar'), store),
  mountControls($('controls'), store),
  mountMapEditor($('map-stage'), store),
];

// Modules owned by other tasks. import.meta.glob only lists files that exist, so a missing one never breaks the build.
const optional = import.meta.glob('./{anim/player,results/index,assumptions/index}.js');
const targets = {
  './anim/player.js': 'map-stage',
  './results/index.js': 'results',
  './assumptions/index.js': 'overlay-root',
};
for (const [path, id] of Object.entries(targets)) {
  const loader = optional[path];
  if (!loader) {
    console.warn(`[app] ${path} not found yet; skipping`);
    continue;
  }
  loader()
    .then((m) => unmounts.push(m.mount($(id), store)))
    .catch((err) => {
      console.warn(`[app] could not mount ${path}:`, err?.message ?? err);
    });
}

window.addEventListener('error', (e) => console.error('[app] uncaught:', e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[app] unhandled rejection:', e.reason?.message ?? e.reason));
window.__store = store; // debugging aid for the dev console
