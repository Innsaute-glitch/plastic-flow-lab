// Centre column: map image, SVG edit layer (markers, drag, tools), strip, scale bar, attribution, calibrate popover.
import { icon } from '../icons.js';
import { addNode, moveNode, placeFacility, deleteNode, editScenario } from '../actions.js';
import { assetUrl } from '../io.js';
import { notify } from '../notify.js';
import { MAX_NODES } from '../scenario-utils.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SCALE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function mount(el, store) {
  const $ = (id) => el.querySelector('#' + id);
  const strip = $('map-strip'), foot = $('map-foot'), wrap = $('map-wrap'), frame = $('map-frame');
  const img = $('map-image'), svg = $('map-edit-layer'), scaleEl = $('map-scale'), attrEl = $('map-attribution'), pop = $('map-popover');
  let calib = []; // calibration points in image px
  let drag = null;
  let k = 1; // screen px per image px
  let loadedSrc = null;
  let warnedSrc = null;

  /* ---------- sizing ---------- */
  function fit() {
    const { map } = store.get().scenario;
    const ar = map.widthPx / map.heightPx;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (!cw || !ch) return;
    const w = Math.floor(Math.min(cw, ch * ar));
    frame.style.width = `${w}px`;
    frame.style.height = `${Math.floor(w / ar)}px`;
    k = w / map.widthPx;
    frame.style.setProperty('--inv', String(1 / k));
    updateScale(map);
  }
  function updateScale(map) {
    const target = 110 / k * map.metresPerPixel; // metres spanned by ~110 screen px
    const m = SCALE_STEPS.find((v) => v >= target) ?? SCALE_STEPS.at(-1);
    const px = (m / map.metresPerPixel) * k;
    scaleEl.innerHTML = `<span class="ms-bar" style="width:${px.toFixed(0)}px"></span><span class="ms-lbl">${m >= 1000 ? m / 1000 + ' km' : m + ' m'}</span>`;
  }
  const ro = new ResizeObserver(fit);
  ro.observe(wrap);

  /* ---------- helpers ---------- */
  const toImage = (e) => {
    const r = svg.getBoundingClientRect();
    const { map } = store.get().scenario;
    return [((e.clientX - r.left) / r.width) * map.widthPx, ((e.clientY - r.top) / r.height) * map.heightPx];
  };
  const round = (v) => Math.round(v * 10) / 10;
  const markerStyle = (x, y) => `transform: translate(${x}px, ${y}px) scale(var(--inv))`;
  const labelW = (t) => Math.round(t.length * 6.8 + 18);

  /* ---------- svg render ---------- */
  function drawSvg(s) {
    const { scenario: sc, ui } = s;
    const live = s.mode !== 'edit';
    const parts = [];
    for (const n of sc.nodes) {
      if (n.x == null) continue;
      const key = ui.wasteTypeColorKey[n.wasteType];
      const sel = n.id === s.selectedNodeId;
      const w = labelW(n.name);
      parts.push(`<g class="mk mk-node ${sel ? 'is-selected' : ''}" data-id="${n.id}" style="--c:var(--resin-${key}); ${markerStyle(n.x, n.y)}">
        ${sel ? '<circle class="mk-pulse" r="24"/><circle class="mk-pulse mk-pulse--2" r="24"/>' : ''}
        <circle class="mk-halo" r="20"/><circle class="mk-ring" r="12"/><circle class="mk-core" r="7"/>
        ${sel ? '<circle class="mk-sel" r="19"/>' : ''}
        <g class="mk-label" transform="translate(0 27)"><rect x="${-w / 2}" y="-10" width="${w}" height="21" rx="10.500"/><text y="4.500" text-anchor="middle">${esc(n.name)}</text></g>
      </g>`);
    }
    if (sc.facility) {
      const f = sc.facility;
      const sel = s.selectedNodeId === 'facility';
      parts.push(`<g class="mk mk-facility ${sel ? 'is-selected' : ''}" data-id="facility" style="${markerStyle(f.x, f.y)}">
        <circle class="mk-pulse mk-pulse--fac" r="30"/>
        <rect class="mk-fac-halo" x="-27" y="-27" width="54" height="54" rx="18"/>
        <rect class="mk-fac" x="-19" y="-19" width="38" height="38" rx="12"/>
        <g class="mk-fac-ico" transform="translate(-11 -11) scale(0.9167)" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V10l6 3V9l6 3V5h3a1 1 0 0 1 1 1v15z"/><path d="M8 17h2M13 17h2"/></g>
        <g class="mk-label mk-label--fac" transform="translate(0 -40)"><rect x="-52" y="-10" width="104" height="21" rx="10.500"/><text y="4.500" text-anchor="middle">${esc(f.name || 'Sorting facility')}</text></g>
      </g>`);
    }
    if (s.tool === 'calibrate' && calib.length) {
      const [a, b] = calib;
      if (b) parts.push(`<line class="cal-line" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="stroke-width: calc(2px * var(--inv))"/>`);
      for (const p of calib) parts.push(`<g class="cal-pt" style="${markerStyle(p[0], p[1])}"><circle r="9"/><circle r="3"/></g>`);
    }
    svg.innerHTML = parts.join('');
    svg.classList.toggle('is-live', live);
  }

  /* ---------- strip + hint ---------- */
  function drawStrip(s) {
    const { scenario: sc, ui } = s;
    const unplaced = sc.nodes.find((n) => n.x == null);
    let hint = '';
    if (s.mode !== 'edit') hint = `<span class="ms-hint">${icon('info', 15)}<span>Replaying the model run. Press Edit to change the map.</span></span>`;
    else if (unplaced && s.tool === 'add-node') hint = `<span class="ms-hint ms-hint--accent">${icon('pin-plus', 15)}<span>Place: <b>${esc(unplaced.name)}</b></span></span>`;
    else if (s.tool === 'add-node') hint = `<span class="ms-hint ms-hint--accent">${icon('pin-plus', 15)}<span>Click the map to add a node (${sc.nodes.length}/${MAX_NODES})</span></span>`;
    else if (s.tool === 'place-facility') hint = `<span class="ms-hint ms-hint--accent">${icon('factory', 15)}<span>Click the map to place the facility</span></span>`;
    else if (s.tool === 'calibrate') hint = `<span class="ms-hint ms-hint--accent">${icon('ruler', 15)}<span>${calib.length === 0 ? 'Click the first point' : 'Click the second point'}</span></span>`;
    else if (unplaced) hint = `<span class="ms-hint ms-hint--accent">${icon('pin-plus', 15)}<span>${sc.nodes.filter((n) => n.x == null).length} node(s) need a place. Use the pin tool.</span></span>`;
    else if (!sc.nodes.length && !sc.facility) hint = `<span class="ms-hint">${icon('info', 15)}<span>Pick a tool on the left, or load the demo.</span></span>`;
    else hint = `<span class="ms-hint">${icon('cursor', 15)}<span>Drag markers to move them</span></span>`;
    strip.innerHTML = `<div class="ms-left">${hint}</div>`;
    const legend = Object.entries(ui.wasteTypeColorKey).map(([w, key]) =>
      `<span class="ms-leg"><i style="--c:var(--resin-${key})"></i>${esc(ui.wasteTypeLabels[w])}</span>`).join('');
    const placed = sc.nodes.filter((n) => n.x != null).length;
    const total = sc.nodes.reduce((a, n) => a + (Number(n.rateKgPerDay) || 0), 0);
    foot.innerHTML = `<div class="mf-legend">${legend}</div><div class="mf-facts">
      <span class="mf-fact">${icon('pin-plus', 14)}<b>${placed}</b> of ${MAX_NODES} nodes</span>
      <span class="mf-fact">${icon('weight', 14)}<b>${Math.round(total * 10) / 10}</b> kg/day plastic</span>
      <span class="mf-fact">${icon('ruler', 14)}<b>${Number(sc.map.metresPerPixel).toFixed(2)}</b> m/px</span></div>`;
  }

  /* ---------- image, attribution ---------- */
  function drawMap(s) {
    const { map } = s.scenario;
    attrEl.textContent = map.attribution || '';
    attrEl.hidden = !map.attribution;
    svg.setAttribute('viewBox', `0 0 ${map.widthPx} ${map.heightPx}`);
    if (loadedSrc !== map.src) {
      loadedSrc = map.src;
      frame.classList.remove('is-missing');
      img.src = assetUrl(map.src);
    }
    fit();
  }
  img.addEventListener('error', () => {
    frame.classList.add('is-missing');
    if (warnedSrc !== loadedSrc) {
      warnedSrc = loadedSrc;
      notify('warn', 'The map image could not be loaded. Showing a grid instead.');
    }
  });

  /* ---------- calibrate popover ---------- */
  function drawPopover(s) {
    if (s.tool !== 'calibrate' || calib.length < 2) { pop.hidden = true; return; }
    const { map } = s.scenario;
    const mx = (calib[0][0] + calib[1][0]) / 2 / map.widthPx * 100;
    const my = (calib[0][1] + calib[1][1]) / 2 / map.heightPx * 100;
    const px = Math.hypot(calib[0][0] - calib[1][0], calib[0][1] - calib[1][1]);
    pop.hidden = false;
    pop.style.left = `${Math.min(80, Math.max(20, mx))}%`;
    pop.style.top = `${Math.min(85, my + 4)}%`;
    pop.innerHTML = `<span class="pp-ico">${icon('ruler', 16)}</span>
      <input class="app-input app-input--num" id="pp-m" type="number" min="0.1" step="any" placeholder="metres" aria-label="Distance in metres" /><span class="pp-u">m</span>
      <button class="app-btn app-btn--primary app-btn--sm" id="pp-ok" aria-label="Apply">${icon('check', 16)}</button>
      <button class="app-btn app-btn--icon app-btn--sm" id="pp-x" aria-label="Cancel">${icon('x', 14)}</button>`;
    const input = pop.querySelector('#pp-m');
    const apply = () => {
      const m = Number(input.value);
      if (!(m > 0) || !(px > 0)) return notify('warn', 'Enter a distance in metres greater than zero.');
      const mpp = m / px;
      editScenario(store, (sc) => { sc.map.metresPerPixel = Math.round(mpp * 10000) / 10000; }, { tool: 'select' });
      notify('info', `Scale set to ${mpp.toFixed(3)} m per pixel.`);
    };
    pop.querySelector('#pp-ok').onclick = apply;
    pop.querySelector('#pp-x').onclick = () => store.set({ tool: 'select' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); e.stopPropagation(); });
    setTimeout(() => input.focus(), 0);
  }

  /* ---------- pointer interaction ---------- */
  svg.addEventListener('pointerdown', (e) => {
    const s = store.get();
    if (s.mode !== 'edit' || e.button !== 0) return;
    const g = e.target.closest('.mk');
    drag = { id: g?.dataset.id ?? null, sx: e.clientX, sy: e.clientY, moved: false, pos: null };
    svg.setPointerCapture(e.pointerId);
    if (g && s.tool !== 'calibrate') {
      drag.origin = g.dataset.id === 'facility' ? s.scenario.facility : s.scenario.nodes.find((n) => n.id === g.dataset.id);
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag?.origin) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true;
    const { map } = store.get().scenario;
    const [x, y] = toImage(e);
    drag.pos = [round(Math.min(map.widthPx, Math.max(0, x))), round(Math.min(map.heightPx, Math.max(0, y)))];
    const g = svg.querySelector(`.mk[data-id="${drag.id}"]`);
    if (g) g.setAttribute('style', g.getAttribute('style').replace(/transform:[^;]*/, markerStyle(drag.pos[0], drag.pos[1])));
    svg.classList.add('is-dragging');
  });
  svg.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    svg.classList.remove('is-dragging');
    const s = store.get();
    if (d.id && d.origin) {
      if (d.moved && d.pos) moveNode(store, d.id, d.pos[0], d.pos[1]);
      if (store.get().selectedNodeId !== d.id) store.set({ selectedNodeId: d.id });
      return;
    }
    if (d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) return;
    const [x0, y0] = toImage(e);
    const x = round(x0), y = round(y0);
    if (s.tool === 'add-node') {
      if (s.scenario.nodes.length >= MAX_NODES && !s.scenario.nodes.some((n) => n.x == null)) {
        notify('warn', `Maximum of ${MAX_NODES} nodes reached.`);
        store.set({ tool: 'select' });
        return;
      }
      addNode(store, x, y);
      const after = store.get();
      if (!after.scenario.nodes.some((n) => n.x == null) && after.scenario.nodes.length >= MAX_NODES) store.set({ tool: 'select' });
    } else if (s.tool === 'place-facility') placeFacility(store, x, y);
    else if (s.tool === 'calibrate') {
      calib = calib.length >= 2 ? [[x, y]] : [...calib, [x, y]];
      render(store.get());
    } else if (s.selectedNodeId) store.set({ selectedNodeId: null });
  });
  svg.addEventListener('pointercancel', () => { drag = null; svg.classList.remove('is-dragging'); });

  const onKey = (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const s = store.get();
    if ((e.key === 'Delete' || e.key === 'Backspace') && s.mode === 'edit' && s.selectedNodeId && s.selectedNodeId !== 'facility') {
      e.preventDefault();
      deleteNode(store, s.selectedNodeId);
    } else if (e.key === 'Escape') {
      calib = [];
      store.set({ tool: 'select', selectedNodeId: null });
    }
  };
  document.addEventListener('keydown', onKey);

  /* ---------- render loop ---------- */
  let lastTool = null;
  function render(s) {
    if (s.tool !== lastTool) {
      if (s.tool !== 'calibrate') calib = [];
      lastTool = s.tool;
    }
    svg.dataset.tool = s.tool;
    frame.dataset.mode = s.mode;
    el.dataset.mode = s.mode;
    drawMap(s);
    drawSvg(s);
    drawStrip(s);
    drawPopover(s);
  }
  render(store.get());
  const off = store.subscribe(render);
  return () => { off(); ro.disconnect(); document.removeEventListener('keydown', onKey); };
}
