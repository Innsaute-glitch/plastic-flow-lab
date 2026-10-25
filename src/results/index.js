// Results column: mount(el, store) -> unmount. Talks only through the store.
import './results.css';
import { h } from './dom.js';
import { createResultsView } from './metrics-view.js';
import { createCompareView } from './compare-view.js';
import { createAiActivity } from './ai-activity.js';
import { createAiDrawer } from './ai-drawer.js';
import { createSheet } from './sheet.js';

const WATCH = ['scenario', 'baseline', 'optimised', 'sweep', 'llm', 'mode', 'panel', 'demoMode', 'ui', 'assumptions'];

export function mount(el, store) {
  const root = h('div', 'results-root');
  el.appendChild(root);
  const overlayRoot = document.getElementById('overlay-root') || document.body;
  let kind = null;
  let view = null;
  let ai = null;
  let drawer = null;
  let drawerFor = null;
  let sheet = null;
  let sheetOpen = false;
  let lastWhich = null;

  const ctx = {
    store,
    get ui() { return store.get().ui; },
    openSheet() { sheetOpen = true; syncOverlays(store.get()); },
  };
  const closeSheet = () => { sheetOpen = false; syncOverlays(store.get()); };

  function empty(state) {
    const running = state.mode === 'running';
    const box = h('div', 'results-empty');
    box.appendChild(h('div', running ? 'results-spinner' : 'results-empty-art'));
    box.appendChild(h('h2', 'results-title', running ? `Simulating ${state.assumptions?.simulation?.days?.value ?? 30} days…` : 'No results yet'));
    box.appendChild(h('p', 'results-muted', running ? 'Hourly steps, pickups and routes are being computed.' : 'Place your bins on the map, then press Run to see recovery, purity, overflow and cost.'));
    return { el: box, update() {}, destroy: () => box.remove() };
  }

  function pickKind(s) {
    if (s.mode === 'compare' && s.baseline && s.optimised) return 'compare';
    if (!s.baseline) return s.mode === 'running' ? 'running' : 'empty';
    if (s.mode === 'optimising') return 'optimising';
    return 'results';
  }

  function setKind(k, state) {
    if (k === kind) return;
    view?.destroy();
    ai?.el.remove();
    ai = null;
    root.textContent = '';
    kind = k;
    if (k === 'empty' || k === 'running') view = empty({ ...state, mode: k });
    else if (k === 'compare') view = createCompareView(ctx);
    else view = createResultsView({ ...ctx, ui: state.ui });
    if (k === 'optimising') {
      ai = createAiActivity();
      root.appendChild(ai.el);
    }
    root.appendChild(view.el);
  }

  function syncOverlays(s) {
    if (drawer && (s.panel !== 'ai-drawer' || drawerFor !== s.optimised)) (drawer.destroy(), (drawer = null));
    if (s.panel === 'ai-drawer' && !drawer) ((drawer = createAiDrawer(overlayRoot, store)), (drawerFor = s.optimised));
    if (sheetOpen && !sheet) sheet = createSheet(overlayRoot, () => store.get(), closeSheet);
    else if (!sheetOpen && sheet) (sheet.destroy(), (sheet = null));
  }

  let snap = {};
  function render(s) {
    try {
      const k = pickKind(s);
      setKind(k, s);
      if (k === 'compare') view.update(s);
      else if (k === 'optimising' || k === 'results') {
        const useOpt = k === 'results' && s.optimised && s.playback?.which === 'optimised';
        const run = useOpt ? s.optimised : s.baseline;
        view.update(s, { results: run.results, label: k === 'optimising' ? 'Baseline (before)' : useOpt ? 'Optimised results' : 'Baseline results' });
        if (ai) ai.update(s);
      }
      if (sheetOpen && !s.baseline) (sheetOpen = false);
      syncOverlays(s);
    } catch (err) {
      console.error('[results] render failed:', err);
    }
  }

  const unsub = store.subscribe((s) => {
    const changed = WATCH.some((k) => s[k] !== snap[k]) || (s.playback?.which !== lastWhich);
    if (!changed) return;
    snap = s;
    lastWhich = s.playback?.which;
    render(s);
  });
  snap = store.get();
  lastWhich = snap.playback?.which;
  render(snap);

  return function unmount() {
    unsub();
    view?.destroy();
    drawer?.destroy();
    sheet?.destroy();
    root.remove();
  };
}
