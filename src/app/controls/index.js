// Left column: tools, run/optimise, facility sorting method, node list / node editor, map card.
import { icon, WASTE_ICON } from '../icons.js';
import { editScenario, deleteNode, runBaseline, runOptimise, cancelOptimise } from '../actions.js';
import { changeMapImage } from '../io.js';
import { MAX_NODES } from '../scenario-utils.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TOOLS = [
  ['select', 'cursor', 'Select / move'],
  ['add-node', 'pin-plus', 'Add node'],
  ['place-facility', 'factory', 'Place facility'],
];
// Calibrate is not a toolbar tool: it is rare and rescales every distance, so it lives in the Map card only.

export function mount(el, store) {
  el.innerHTML = `
    <section id="c-tools" class="c-sec"></section>
    <section id="c-run" class="c-sec"></section>
    <section id="c-facility" class="c-sec"></section>
    <section id="c-nodes" class="c-sec"></section>
    <section id="c-map" class="c-sec"></section>
    <input type="file" id="c-file" accept="image/*" hidden />`;
  const $ = (id) => el.querySelector('#' + id);
  const secs = {
    tools: { el: $('c-tools'), sig: null, render: renderTools },
    run: { el: $('c-run'), sig: null, render: renderRun },
    facility: { el: $('c-facility'), sig: null, render: renderFacility },
    nodes: { el: $('c-nodes'), sig: null, render: renderNodes },
    map: { el: $('c-map'), sig: null, render: renderMap },
  };

  const node = (s) => s.scenario.nodes.find((n) => n.id === s.selectedNodeId);
  const sigs = {
    tools: (s) => s.tool,
    run: (s) => [s.mode, !!s.baseline, s.scenario.nodes.length, !!s.scenario.facility].join('|'),
    facility: (s) => [!!s.scenario.facility, s.scenario.baselineSetup.sortingMethod, s.mode === 'optimising', s.mode === 'compare' ? s.optimised?.proposal?.setup?.sortingMethod : ''].join('|'),
    nodes: (s) => (node(s)
      ? ['edit', s.selectedNodeId, s.scenario.nodes.length].join('|')
      : ['list', s.scenario.id, JSON.stringify(s.scenario.nodes.map((n) => [n.id, n.name, n.wasteType, n.rateKgPerDay, n.x == null]))].join('|')),
    map: (s) => [s.scenario.map.metresPerPixel, s.scenario.map.src.slice(0, 40), s.tool].join('|'),
  };

  function render(s) {
    for (const [k, sec] of Object.entries(secs)) {
      const sig = sigs[k](s);
      if (sig !== sec.sig) {
        sec.sig = sig;
        sec.render(sec.el, s);
      }
    }
  }
  const rerender = (k) => { secs[k].sig = null; render(store.get()); };

  /* ---------- tools ---------- */
  function renderTools(host, s) {
    host.innerHTML = `<div class="c-tools" role="toolbar" aria-label="Map tools">${TOOLS.map(
      ([id, ic, label]) => `<button class="c-tool ${s.tool === id ? 'is-active' : ''}" data-tool="${id}" title="${label}" aria-pressed="${s.tool === id}">${icon(ic, 20)}<span>${label.split(' ')[0]}</span></button>`
    ).join('')}</div>`;
  }

  /* ---------- run ---------- */
  let wasBusy = false;
  function renderRun(host, s) {
    const busy = s.mode === 'optimising';
    const ae = document.activeElement;
    const refocus = wasBusy && !busy && (ae === document.body || host.contains(ae));
    wasBusy = busy;
    const canRun = !busy && s.scenario.nodes.length > 0 && !!s.scenario.facility;
    host.innerHTML = `<div class="c-run">
      <button class="app-btn app-btn--primary app-btn--lg" data-act="run" ${canRun ? '' : 'disabled'} title="${canRun ? 'Simulate 30 days with the current setup' : 'Add a node and place the facility first'}">${icon('play', 18)}<span>Run</span></button>
      ${busy
    ? `<button class="app-btn app-btn--lg app-btn--cancel" data-act="cancel" aria-label="Cancel AI request" title="Cancel the AI request (Esc)">${icon('x', 18)}<span>Cancel</span></button>`
    : `<button class="app-btn app-btn--lg" data-act="optimise" ${s.baseline ? '' : 'disabled'} title="${s.baseline ? 'Ask the AI for a better setup, then verify it by simulation' : 'Run the baseline first'}">${icon('sparkles', 18)}<span>Optimise</span></button>`}
    </div>`;
    if (refocus) host.querySelector('[data-act="optimise"]')?.focus();
  }

  /* ---------- facility ---------- */
  function renderFacility(host, s) {
    const methods = s.assumptions.sorting.methods.value;
    const cur = s.scenario.baselineSetup.sortingMethod;
    // in compare mode the map replays the AI plan: tag its method so the baseline highlight isn't mistaken for it
    const aiM = s.mode === 'compare' ? s.optimised?.proposal?.setup?.sortingMethod : null;
    host.innerHTML = `<div class="app-card">
      <div class="app-card__head"><span class="app-card__icon app-card__icon--accent">${icon('factory', 18)}</span><h3>Sorting facility</h3>
        ${s.scenario.facility ? '' : `<button class="app-btn app-btn--sm" data-tool="place-facility">${icon('pin-plus', 14)}<span>Place</span></button>`}</div>
      <div class="c-methods" role="radiogroup" aria-label="Sorting method">${Object.keys(s.ui.sortingMethodLabels).map((m) => `
        <button class="c-method ${cur === m ? 'is-active' : ''}" role="radio" aria-checked="${cur === m}" data-method="${m}">
          <span class="c-method__dot"></span><span class="c-method__label">${esc(s.ui.sortingMethodLabels[m])}${m === aiM ? ' <span class="pill pill-good">AI plan</span>' : ''}${aiM && m === cur && m !== aiM ? ' <span class="pill">baseline</span>' : ''}</span>
          <span class="c-method__meta">${methods[m] ? `${methods[m].throughputKgPerDay} kg/d` : ''}</span></button>`).join('')}
      </div></div>`;
  }

  /* ---------- nodes: list or editor ---------- */
  function renderNodes(host, s) {
    const n = node(s);
    host.classList.toggle('c-sec--fill', !n);
    if (n) return renderEditor(host, s, n);
    const items = s.scenario.nodes;
    host.innerHTML = `<div class="app-card">
      <div class="app-card__head"><span class="app-card__icon">${icon('pin-plus', 18)}</span><h3>Nodes</h3><span class="app-count">${items.length}/${MAX_NODES}</span>
        <button class="app-btn app-btn--icon app-btn--sm" data-tool="add-node" title="Add node (click the map)" aria-label="Add node">${icon('plus', 16)}</button></div>
      ${items.length ? `<ul class="c-list">${items.map((it) => {
        const key = s.ui.wasteTypeColorKey[it.wasteType];
        return `<li><button class="c-row" data-select="${it.id}"><span class="c-dot" style="--c:var(--resin-${key})"></span>
          <span class="c-row__name" title="${esc(it.name)}">${esc(it.name)}</span>
          ${it.x == null ? `<span class="app-pill app-pill--warn">place</span>` : `<span class="c-row__meta">${it.rateKgPerDay} kg/d</span>`}</button></li>`;
      }).join('')}</ul>` : `<p class="c-empty">${icon('map', 28)}<span>Click the map to add nodes, or load the demo.</span></p>`}
    </div>`;
  }

  function renderEditor(host, s, n) {
    const su = s.scenario.baselineSetup.nodes[n.id];
    const key = s.ui.wasteTypeColorKey[n.wasteType];
    const caps = s.assumptions.bins.allowedCapacitiesL.value;
    const [ivMin, ivMax] = s.assumptions.llmLimits.pickupIntervalDays.value;
    const [bcMin, bcMax] = s.assumptions.llmLimits.binCount.value;
    const stepper = (field, val, min, max) => `<div class="app-stepper" data-field="${field}" data-min="${min}" data-max="${max}">
      <button data-step="-1" aria-label="Decrease" ${val <= min ? 'disabled' : ''}>${icon('minus', 14)}</button><output>${val}</output>
      <button data-step="1" aria-label="Increase" ${val >= max ? 'disabled' : ''}>${icon('plus', 14)}</button></div>`;
    host.innerHTML = `<div class="app-card c-editor" data-node="${n.id}">
      <div class="app-card__head">
        <button class="app-btn app-btn--icon app-btn--sm" data-act="deselect" title="Back to node list" aria-label="Back">${icon('chevron', 16)}</button>
        <span class="c-dot c-dot--lg" style="--c:var(--resin-${key})"></span>
        <input class="app-input c-name" data-f="name" value="${esc(n.name)}" aria-label="Node name" maxlength="40" />
        <button class="app-btn app-btn--icon app-btn--sm app-btn--danger" data-act="delete" title="Delete node (Del)" aria-label="Delete node">${icon('trash', 16)}</button>
      </div>

      <div class="c-field"><div class="c-label">${icon('bottle', 15)}<span>Waste</span></div>
        <div class="c-chips">${Object.keys(s.ui.wasteTypeLabels).map((w) => `
          <button class="app-chip ${n.wasteType === w ? 'is-active' : ''}" style="--c:var(--resin-${s.ui.wasteTypeColorKey[w]})" data-waste="${w}" title="${esc(s.ui.wasteTypeLabels[w])}" aria-label="${esc(s.ui.wasteTypeLabels[w])}" aria-pressed="${n.wasteType === w}">${icon(WASTE_ICON[w], 20)}</button>`).join('')}
        </div><div class="c-hint">${esc(s.ui.wasteTypeLabels[n.wasteType])}</div></div>

      <div class="c-field c-field--row"><div class="c-label">${icon('weight', 15)}<span>Rate</span></div>
        <div class="c-unit"><input class="app-input app-input--num" type="number" min="0" step="0.5" data-f="rateKgPerDay" value="${n.rateKgPerDay}" aria-label="Rate in kg per day" /><span>kg/day</span></div></div>

      <div class="c-field c-field--row"><div class="c-label">${icon('clock', 15)}<span>Peak</span></div>
        <label class="app-switch"><input type="checkbox" data-f="peakOn" ${n.peak ? 'checked' : ''} aria-label="Peak window" /><i></i></label></div>
      ${n.peak ? `<div class="c-peak">
        <input class="app-input app-input--num" type="number" min="0" max="23" step="1" data-p="startHour" value="${n.peak.startHour}" aria-label="Peak start hour" /><b>to</b>
        <input class="app-input app-input--num" type="number" min="1" max="24" step="1" data-p="endHour" value="${n.peak.endHour}" aria-label="Peak end hour" /><b>h</b>
        <span class="c-times">&times;</span><input class="app-input app-input--num" type="number" min="1" max="10" step="0.5" data-p="multiplier" value="${n.peak.multiplier}" aria-label="Peak multiplier" /></div>` : ''}

      <div class="c-divider"></div>

      <div class="c-field c-field--row"><div class="c-label">${icon('bin', 15)}<span>Bin type</span></div>
        <div class="app-seg" role="radiogroup">
          <button class="${su.binType === 'single' ? 'is-active' : ''}" data-bintype="single" title="One mixed bin" aria-label="Single bin">${icon('bin', 17)}</button>
          <button class="${su.binType === 'segregated' ? 'is-active' : ''}" data-bintype="segregated" title="Segregated bins" aria-label="Segregated bins">${icon('split', 17)}</button></div></div>
      <div class="c-field c-field--row"><div class="c-label">${icon('layers', 15)}<span>Count</span></div>${stepper('binCount', su.binCount, bcMin, bcMax)}</div>
      <div class="c-field"><div class="c-label">${icon('weight', 15)}<span>Size (L)</span></div>
        <div class="app-seg app-seg--wide">${caps.map((c) => `<button class="${su.binCapacityL === c ? 'is-active' : ''}" data-cap="${c}">${c}</button>`).join('')}</div></div>
      <div class="c-field c-field--row"><div class="c-label">${icon('calendar', 15)}<span>Pickup every</span></div>
        <div class="c-unit">${stepper('pickupIntervalDays', su.pickupIntervalDays, ivMin, ivMax)}<span>days</span></div></div>
    </div>`;
  }

  function renderMap(host, s) {
    const m = s.scenario.map;
    host.innerHTML = `<div class="app-card">
      <div class="app-card__head"><span class="app-card__icon">${icon('map', 18)}</span><h3>Map</h3>
        <span class="app-pill">${Number(m.metresPerPixel).toFixed(2)} m/px</span></div>
      <div class="c-maprow">
        <button class="app-btn app-btn--sm ${s.tool === 'calibrate' ? 'is-active' : ''}" data-tool="calibrate" title="Click two points, then enter the distance">${icon('ruler', 15)}<span>Calibrate</span></button>
        <button class="app-btn app-btn--sm" data-act="image" title="Use your own map screenshot">${icon('image', 15)}<span>Change image</span></button>
      </div></div>`;
  }

  /* ---------- events ---------- */
  const setNode = (patch) => {
    const id = store.get().selectedNodeId;
    editScenario(store, (sc) => Object.assign(sc.nodes.find((n) => n.id === id), patch));
  };
  const setSetup = (patch) => {
    const id = store.get().selectedNodeId;
    editScenario(store, (sc) => Object.assign(sc.baselineSetup.nodes[id], patch));
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const s = store.get();
    if (t.dataset.tool) store.set({ tool: s.tool === t.dataset.tool && t.dataset.tool !== 'select' ? 'select' : t.dataset.tool });
    else if (t.dataset.select) store.set({ selectedNodeId: t.dataset.select });
    else if (t.dataset.method) editScenario(store, (sc) => { sc.baselineSetup.sortingMethod = t.dataset.method; });
    else if (t.dataset.waste) { setNode({ wasteType: t.dataset.waste }); rerender('nodes'); }
    else if (t.dataset.bintype) { setSetup({ binType: t.dataset.bintype }); rerender('nodes'); }
    else if (t.dataset.cap) { setSetup({ binCapacityL: Number(t.dataset.cap) }); rerender('nodes'); }
    else if (t.dataset.step) {
      const st = t.closest('.app-stepper');
      const v = clamp(Number(st.querySelector('output').textContent) + Number(t.dataset.step), Number(st.dataset.min), Number(st.dataset.max));
      setSetup({ [st.dataset.field]: v });
      rerender('nodes');
    } else if (t.dataset.act === 'run') runBaseline(store);
    else if (t.dataset.act === 'optimise') runOptimise(store);
    else if (t.dataset.act === 'cancel') cancelOptimise();
    else if (t.dataset.act === 'deselect') store.set({ selectedNodeId: null });
    else if (t.dataset.act === 'delete') deleteNode(store, s.selectedNodeId);
    else if (t.dataset.act === 'image') $('c-file').click();
  });

  el.addEventListener('change', (e) => {
    const i = e.target;
    if (i.id === 'c-file') { changeMapImage(store, i.files[0]); i.value = ''; return; }
    if (!i.closest('.c-editor')) return;
    const n = node(store.get());
    if (!n) return;
    if (i.dataset.f === 'name') setNode({ name: i.value.trim() || n.name });
    else if (i.dataset.f === 'rateKgPerDay') {
      const v = Math.max(0, Number(i.value) || 0);
      i.value = v;
      setNode({ rateKgPerDay: v });
    } else if (i.dataset.f === 'peakOn') {
      setNode({ peak: i.checked ? { startHour: 12, endHour: 14, multiplier: 3 } : null });
      rerender('nodes');
    } else if (i.dataset.p && n.peak) {
      const p = { ...n.peak };
      p[i.dataset.p] = Number(i.value) || 0;
      p.startHour = clamp(Math.round(p.startHour), 0, 23);
      p.endHour = clamp(Math.round(p.endHour), p.startHour + 1, 24);
      p.multiplier = clamp(p.multiplier, 1, 10);
      setNode({ peak: p });
      rerender('nodes');
    }
  });

  const onKey = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const s = store.get();
    if (s.mode !== 'optimising' || s.panel) return;
    e.preventDefault();
    cancelOptimise();
  };
  window.addEventListener('keydown', onKey);

  render(store.get());
  const unsub = store.subscribe(render);
  return () => { window.removeEventListener('keydown', onKey); unsub(); };
}
