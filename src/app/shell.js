// Responsive shell: sets data-layout / data-pane on #app and --hud-reserve on #map-stage, runs the tab bar and the pane rules.
// The seam with the panels (plan.md 3.4): layout and pane come from window size and user taps, never from the store.
// The store is only READ for the pane rules (a mode or tool change switches the pane once).
import { icon } from './icons.js';
import { layoutFor, orientFor, isShort, hudReserveFor, tabsFor, normalisePane, paneOnModeChange, paneOnToolChange } from './layout-mode.js';

const TAB = {
  setup: { label: 'Setup', icon: 'sliders', panel: 'controls' },
  map: { label: 'Map', icon: 'map', panel: 'map-stage' },
  results: { label: 'Results', icon: 'chart', panel: 'results' },
};
const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, select, [contenteditable=true]';

export function mount(app, store) {
  const tabsEl = document.getElementById('pane-tabs');
  const stage = document.getElementById('map-stage');
  const panels = { setup: document.getElementById('controls'), map: stage, results: document.getElementById('results') };

  const cfg = store.get().ui.layout; // breakpoints and HUD reserve: config/ui.json
  let layout = null;
  let orient = null;
  let short = null;
  let pane = 'setup';
  let stableH = window.innerHeight;
  const dots = new Set();
  let prev = store.get();

  const typing = () => !!document.activeElement?.matches?.(TEXT_FIELD);

  function applyTabs() {
    const list = tabsFor(layout);
    tabsEl.hidden = list.length === 0;
    const sig = list.join();
    if (tabsEl.dataset.sig !== sig) {
      tabsEl.dataset.sig = sig;
      tabsEl.innerHTML = list.map((id) => `<button type="button" role="tab" class="pt-tab" id="pt-${id}" data-pane="${id}" aria-controls="${TAB[id].panel}">
        <span class="pt-ico">${icon(TAB[id].icon, 20)}<i class="pt-dot" hidden></i></span><span class="pt-label">${TAB[id].label}</span></button>`).join('');
    }
    for (const b of tabsEl.querySelectorAll('.pt-tab')) {
      const id = b.dataset.pane;
      const on = id === pane;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      const dot = dots.has(id) && !on;
      b.querySelector('.pt-dot').hidden = !dot;
      b.setAttribute('aria-label', dot ? `${TAB[id].label} (new)` : TAB[id].label);
    }
  }

  function apply() {
    const mode = store.get().mode;
    pane = normalisePane(layout, pane, mode);
    dots.delete(pane);
    app.dataset.layout = layout;
    app.dataset.pane = pane;
    app.dataset.orient = orient;
    app.dataset.short = String(short);
    stage.style.setProperty('--hud-reserve', `${hudReserveFor(layout, cfg, { short, orient })}px`);
    // hidden panes must not take focus or taps (they stay laid out so scroll position and canvases survive)
    for (const [id, el] of Object.entries(panels)) el.inert = layout === 'wide' ? false : id === 'map' ? layout === 'narrow' && pane !== 'map' : id !== pane;
    applyTabs();
  }

  function setPane(next, { focus = false } = {}) {
    if (next === pane && app.dataset.pane === pane) return;
    pane = next;
    apply();
    if (focus) tabsEl.querySelector(`[data-pane="${pane}"]`)?.focus();
  }

  function measure() {
    const h = window.innerHeight, w = window.innerWidth;
    // an on-screen keyboard shrinks innerHeight: do not let that flip a tablet to the narrow layout
    if (!typing() || h > stableH) stableH = h;
    const useH = typing() ? Math.max(h, stableH) : h;
    const next = layoutFor(w, useH, cfg), nOrient = orientFor(w, h), nShort = isShort(useH, cfg);
    if (next === layout && nOrient === orient && nShort === short) return;
    layout = next; orient = nOrient; short = nShort;
    apply();
  }

  /* ---------- tabs ---------- */
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.pt-tab');
    if (b) setPane(b.dataset.pane);
  });
  tabsEl.addEventListener('keydown', (e) => {
    const list = tabsFor(layout);
    const i = list.indexOf(pane);
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + list.length - 1) % list.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j < 0) return;
    e.preventDefault();
    setPane(list[j], { focus: true });
  });
  // any element can ask for a pane with data-pane-goto (the map's "Edit <node>" chip)
  const onGoto = (e) => {
    const t = e.target.closest?.('[data-pane-goto]');
    if (!t) return;
    setPane(t.dataset.paneGoto);
    // Setup opens on the node editor, not on whatever the list was scrolled to
    const box = panels.setup, editor = box.querySelector('.c-editor');
    if (t.dataset.paneGoto === 'setup' && editor) box.scrollTop += editor.getBoundingClientRect().top - box.getBoundingClientRect().top - 4;
  };
  document.addEventListener('click', onGoto);

  /* ---------- pane rules ---------- */
  const unsub = store.subscribe((s) => {
    const p = prev;
    prev = s;
    if (s.mode === p.mode && s.tool === p.tool) return;
    let next = pane;
    if (s.mode !== p.mode) {
      const r = paneOnModeChange(layout, pane, p.mode, s.mode);
      next = r.pane;
      r.dots.forEach((d) => dots.add(d));
    }
    next = paneOnToolChange(layout, next, p.tool, s.tool);
    pane = next;
    apply();
  });

  window.addEventListener('resize', measure);
  const mqs = [`(min-width: ${cfg.mediumMinWidthPx}px)`, `(min-width: ${cfg.wideMinWidthPx}px)`, `(min-height: ${cfg.mediumMinHeightPx}px)`, '(orientation: portrait)'].map((q) => window.matchMedia(q));
  mqs.forEach((m) => m.addEventListener('change', measure));
  window.addEventListener('orientationchange', measure);
  document.addEventListener('focusout', () => setTimeout(measure, 150));
  measure();

  return () => {
    unsub();
    window.removeEventListener('resize', measure);
    window.removeEventListener('orientationchange', measure);
    mqs.forEach((m) => m.removeEventListener('change', measure));
    document.removeEventListener('click', onGoto);
  };
}
