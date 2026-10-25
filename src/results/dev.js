// Dev harness for the results column. Own minimal store; does not import Task 3 files.
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { mount } from './index.js';

function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      subs.forEach((f) => f(state, prev));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

const j = (p) => fetch(p).then((r) => r.json());
const [ui, assumptions, scenario, rb, ro, proposal, sweep, events] = await Promise.all([
  j('/config/ui.json'), j('/config/assumptions.json'), j('/fixtures/scenario.demo.json'),
  j('/fixtures/results.baseline.json'), j('/fixtures/results.optimised.json'), j('/fixtures/proposal.json'),
  j('/fixtures/sweep.json'), j('/fixtures/llm-stream-events.json'),
]);

const store = createStore({
  scenario, assumptions, ui, mode: 'edit', tool: 'select', selectedNodeId: null,
  baseline: null, optimised: null, sweep: null,
  llm: { stage: null, text: '', error: null },
  playback: { t: 0, playing: false, speed: 1, done: false, which: 'baseline' },
  demoMode: false, panel: null,
});
window.__store = store;
mount(document.getElementById('results'), store);

const baseline = { setup: scenario.baselineSetup, results: rb };
const optimised = { proposal, results: ro };
let timers = [];
const clear = () => (timers.forEach(clearTimeout), (timers = []));

const states = {
  empty: () => store.set({ mode: 'edit', baseline: null, optimised: null, sweep: null, llm: { stage: null, text: '', error: null }, panel: null }),
  running: () => store.set({ mode: 'running', baseline: null, optimised: null, sweep: null }),
  results: () => store.set({ mode: 'results', baseline, optimised: null, sweep: null, panel: null }),
  compare: () => store.set({ mode: 'compare', baseline, optimised, sweep, llm: { stage: 'done', text: proposal.raw, error: null } }),
  overbudget: () => {
    const o = structuredClone(optimised);
    o.results.summary.cost.total = Math.round(rb.summary.cost.total * 1.4);
    o.proposal.source = 'heuristic';
    o.proposal.clampNotes = ['n4.pickupIntervalDays 0 -> 1', 'n2.binCount 9 -> 6'];
    store.set({ mode: 'compare', baseline, optimised: o, sweep });
  },
  drawer: () => store.set({ panel: 'ai-drawer' }),
  sheet: () => document.querySelector('.results-sankey-card .results-iconbtn')?.click(),
};

function replay({ holdAt = null, fail = false } = {}) {
  clear();
  store.set({ mode: 'optimising', baseline, optimised: null, sweep: null, llm: { stage: null, text: '', error: null }, panel: null });
  let t = 300, text = '';
  const deltas = events.filter((e) => e.type === 'delta').length;
  let seen = 0;
  for (const e of events) {
    if (e.type === 'delta') {
      seen++;
      if (holdAt !== null && seen > holdAt * deltas) continue;
    }
    if (holdAt !== null && (e.type === 'result' || (e.type === 'status' && ['validating', 'done'].includes(e.stage)))) continue;
    t += e.type === 'delta' ? 90 : 700;
    timers.push(setTimeout(() => {
      if (e.type === 'status') store.set({ llm: { ...store.get().llm, stage: e.stage } });
      else if (e.type === 'delta') { text += e.text; store.set({ llm: { ...store.get().llm, text } }); }
      else if (e.type === 'result') store.set({ optimised });
    }, t));
  }
  if (holdAt === null) {
    timers.push(setTimeout(() => store.set({ mode: 'compare', sweep }), t + 1400));
  }
  if (fail) timers.push(setTimeout(() => store.set({ llm: { ...store.get().llm, error: { message: 'Claude CLI timed out', fallback: 'heuristic' } } }), 1500));
}

const bar = document.getElementById('bar');
const add = (label, fn) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => { clear(); fn(); };
  bar.appendChild(b);
};
add('Empty', states.empty);
add('Running', states.running);
add('Results', states.results);
add('Optimising (full replay)', () => replay());
add('Optimising (hold 60%)', () => replay({ holdAt: 0.6 }));
add('Optimising (fallback)', () => replay({ holdAt: 0.5, fail: true }));
add('Compare', states.compare);
add('Compare (over budget)', states.overbudget);
add('AI drawer', states.drawer);
add('Wide sheet', states.sheet);
const lab = document.createElement('label');
lab.innerHTML = '<input type="checkbox" id="demo"> demo mode';
lab.querySelector('input').onchange = (e) => store.set({ demoMode: e.target.checked });
bar.appendChild(lab);

const q = new URLSearchParams(location.search).get('state');
if (q === 'optimising') replay({ holdAt: 0.6 });
else if (q === 'fallback') replay({ holdAt: 0.5, fail: true });
else if (q === 'full') replay();
else if (q && states[q] && q !== 'drawer' && q !== 'sheet') states[q]();
if (q === 'sheet') { states.compare(); setTimeout(states.sheet, 1800); }
if (q === 'drawer') states.compare();
if (q === 'drawer') setTimeout(states.drawer, 100);
