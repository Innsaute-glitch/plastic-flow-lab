// Centre column: map image, SVG edit layer (markers, drag, tools), strip, scale bar, attribution, calibrate popover.
import { icon } from '../icons.js';
import { addNode, moveNode, placeFacility, deleteNode, editScenario } from '../actions.js';
import { assetUrl } from '../io.js';
import { notify } from '../notify.js';
import { MAX_NODES, CALIBRATION_DEFAULTS, fmtLength as fmtLen, mapScaleProblem } from '../scenario-utils.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Smallest round 1-2-5 distance (m) at or above `target`, for any map scale.
const niceStep = (target) => {
  const p = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((f) => f * p).find((v) => v >= target);
};

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
    if (!(map.metresPerPixel > 0) || !(k > 0)) { scaleEl.innerHTML = ''; return; }
    const target = 110 / k * map.metresPerPixel; // metres spanned by ~110 screen px
    const m = niceStep(target);
    // a 1-2-5 step is at most 2.5x the target, so the bar stays under ~275 px; clamp anyway to the frame
    const px = Math.min((m / map.metresPerPixel) * k, frame.clientWidth * 0.45);
    scaleEl.innerHTML = `<span class="ms-bar" style="width:${px.toFixed(0)}px"></span><span class="ms-lbl">${fmtLen(m)}</span>`;
  }
  const ro = new ResizeObserver(() => { fit(); redrawLabels(); });
  ro.observe(wrap);

  /* ---------- helpers ---------- */
  const toImage = (e) => {
    const r = svg.getBoundingClientRect();
    const { map } = store.get().scenario;
    return [((e.clientX - r.left) / r.width) * map.widthPx, ((e.clientY - r.top) / r.height) * map.heightPx];
  };
  const round = (v) => Math.round(v * 10) / 10;
  // Marker size shrinks smoothly as the node count grows (0.85 at 10 nodes, 0.60 at 40). Keep in sync with src/anim/player.js.
  // On a small map frame (laptop) dense scenarios shrink a little more (up to x0.8).
  const markerScale = (n, frameW) => {
    const base = Math.min(0.85, Math.max(0.6, 0.85 - (n - 10) * 0.25 / 30));
    const f = Math.min(1, Math.max(0, (n - 15) / 10));
    return base * (1 - f * (1 - Math.min(1, Math.max(0.8, frameW / 1100))));
  };
  let ms = 0.85;
  const facScale = () => Math.max(ms, 0.72); // the facility marker never shrinks as far as the nodes
  const markerStyle = (x, y, sc = ms) => `transform: translate(${x}px, ${y}px) scale(calc(var(--inv) * ${sc}))`;
  const labelStyle = (x, y) => `transform: translate(${x}px, ${y}px) scale(var(--inv))`;
  const mctx = document.createElement('canvas').getContext('2d');
  const labelW = (t) => {
    let w = t.length * 6.3;
    try { mctx.font = '500 11.5px Inter, system-ui, sans-serif'; w = mctx.measureText(t).width; } catch { /* estimate */ }
    return Math.ceil(w + 16);
  };
  const clip = (t, max) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
  const LABEL_CHARS = 17; // auto labels are shortened; hover / selection shows the full name
  const LABEL_H = 20;
  let hoverId = null;

  // Greedy label placement in screen px: facility first, then the selected node, then by waste rate.
  // A label is kept only if its pill clears every marker and every label already placed.
  function placeLabels(sc, s, live) {
    const placed = sc.nodes.filter((n) => n.x != null);
    const R = 20 * ms + 3; // marker clearance radius (screen px)
    const W = sc.map.widthPx * k, H = sc.map.heightPx * k;
    const boxes = [];
    const hitsBox = (b) => boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const circ = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
    const obstacles = placed.map((n) => circ(n.x * k, n.y * k, R));
    if (live) for (const n of placed) obstacles.push({ x: n.x * k + 13 * ms + 2, y: n.y * k - 15, w: 14, h: 30 }); // replay fill meter
    if (sc.facility) obstacles.push(circ(sc.facility.x * k, sc.facility.y * k, 30 * facScale() + 4));
    const out = new Map();
    const tryPlace = (id, x, y, text, cands, force) => {
      const w = labelW(text);
      let best = null;
      for (const [cx, cy] of cands) {
        let px = x * k + cx - w / 2;
        px = Math.max(4, Math.min(W - w - 4, px));
        const py = Math.max(4, Math.min(H - LABEL_H - 4, y * k + cy - LABEL_H / 2));
        const b = { x: px, y: py, w, h: LABEL_H };
        const clash = hitsBox(b) || obstacles.some((o) => o.x < b.x + b.w && o.x + o.w > b.x && o.y < b.y + b.h && o.y + o.h > b.y);
        if (!clash) { best = b; break; }
        if (force && !best) best = b;
      }
      if (!best) return;
      boxes.push(best);
      out.set(id, { dx: best.x + best.w / 2 - x * k, dy: best.y + best.h / 2 - y * k, w, text });
    };
    const d = 22 * ms + 10;
    if (sc.facility) {
      const f = 30 * facScale() + 14;
      tryPlace('facility', sc.facility.x, sc.facility.y, sc.facility.name || 'Sorting facility', [[0, -f], [0, f], [f + 30, 0]], true);
    }
    const order = placed.slice().sort((a, b) => (b.id === s.selectedNodeId) - (a.id === s.selectedNodeId) || (Number(b.rateKgPerDay) || 0) - (Number(a.rateKgPerDay) || 0));
    for (const n of order) {
      const full = n.id === s.selectedNodeId;
      const text = full ? clip(n.name, 34) : clip(n.name, LABEL_CHARS);
      const w = labelW(text) / 2;
      const cands = [[0, d], [0, -d], ...(live ? [] : [[w + d - 4, 0]]), [-(w + d - 4), 0]];
      tryPlace(n.id, n.x, n.y, text, cands, full);
    }
    return out;
  }

  /* ---------- svg render ---------- */
  function drawSvg(s) {
    const { scenario: sc, ui } = s;
    const live = s.mode !== 'edit';
    ms = markerScale(sc.nodes.length, sc.map.widthPx * k);
    hoverId = null;
    const labels = placeLabels(sc, s, live);
    const parts = [];
    const nodes = sc.nodes.filter((n) => n.x != null).sort((a, b) => (a.id === s.selectedNodeId) - (b.id === s.selectedNodeId));
    for (const n of nodes) {
      const key = ui.wasteTypeColorKey[n.wasteType];
      const sel = n.id === s.selectedNodeId;
      parts.push(`<g class="mk mk-node ${sel ? 'is-selected' : ''}" data-id="${n.id}" style="--c:var(--resin-${key}); ${markerStyle(n.x, n.y)}">
        <title>${esc(n.name)}</title>
        ${sel ? '<circle class="mk-pulse" r="24"/><circle class="mk-pulse mk-pulse--2" r="24"/>' : ''}
        <circle class="mk-halo" r="20"/><circle class="mk-ring" r="12"/><circle class="mk-core" r="6.5"/>
        ${sel ? '<circle class="mk-sel" r="19"/>' : ''}
        <circle class="mk-hit" r="${(Math.max(19, 14 / ms)).toFixed(1)}"/>
      </g>`);
    }
    if (sc.facility) {
      const f = sc.facility;
      const sel = s.selectedNodeId === 'facility';
      parts.push(`<g class="mk mk-facility ${sel ? 'is-selected' : ''}" data-id="facility" style="${markerStyle(f.x, f.y, facScale())}">
        <title>${esc(f.name || 'Sorting facility')}</title>
        <circle class="mk-pulse mk-pulse--fac" r="30"/>
        <rect class="mk-fac-halo" x="-27" y="-27" width="54" height="54" rx="18"/>
        <rect class="mk-fac" x="-19" y="-19" width="38" height="38" rx="12"/>
        <g class="mk-fac-ico" transform="translate(-11 -11) scale(0.9167)" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V10l6 3V9l6 3V5h3a1 1 0 0 1 1 1v15z"/><path d="M8 17h2M13 17h2"/></g>
        <rect class="mk-hit" x="-24" y="-24" width="48" height="48"/>
      </g>`);
    }
    // labels live in their own top layer so a pill never hides behind a neighbouring marker
    const lab = [];
    const pill = (id, x, y, l, cls) => `<g class="mk-label ${cls} ${l ? '' : 'is-off'}" data-for="${id}" ${l ? `data-dx="${l.dx.toFixed(1)}" data-dy="${l.dy.toFixed(1)}"` : ''} style="${labelStyle(x, y)}"><g transform="translate(${l ? l.dx.toFixed(1) : 0} ${l ? l.dy.toFixed(1) : 22})"><rect x="${l ? -l.w / 2 : 0}" y="-10" width="${l ? l.w : 0}" height="${LABEL_H}" rx="10"/><text y="4" text-anchor="middle">${l ? esc(l.text) : ''}</text></g></g>`;
    for (const n of nodes) lab.push(pill(n.id, n.x, n.y, labels.get(n.id), 'mk-label--node'));
    if (sc.facility) lab.push(pill('facility', sc.facility.x, sc.facility.y, labels.get('facility'), 'mk-label--fac'));
    parts.push(`<g class="mk-labels">${lab.join('')}</g>`);
    if (s.tool === 'calibrate' && calib.length) {
      const [a, b] = calib;
      if (b) parts.push(`<line class="cal-line" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="stroke-width: calc(2px * var(--inv))"/>`);
      for (const p of calib) parts.push(`<g class="cal-pt" style="${markerStyle(p[0], p[1])}"><circle r="9"/><circle r="3"/></g>`);
    }
    svg.innerHTML = parts.join('');
    svg.classList.toggle('is-live', live);
  }

  // hover reveals the full name: one tiny label pill is built on demand (labels hidden by collision have no text)
  function showHover(id) {
    hoverId = id;
    svg.querySelectorAll('.mk-label.is-hover').forEach((g) => { g.classList.remove('is-hover'); g.querySelector('.mk-hover')?.remove(); });
    if (!id) return;
    const g = svg.querySelector(`.mk-label[data-for="${id}"]`);
    if (!g) return;
    const sc = store.get().scenario;
    const it = id === 'facility' ? { name: sc.facility?.name || 'Sorting facility' } : sc.nodes.find((n) => n.id === id);
    if (!it) return;
    const text = clip(it.name, 34), w = labelW(text);
    const above = id !== 'facility' ? -(22 * ms + 10) : -(30 * facScale() + 14);
    const dx = g.dataset.dx ?? 0, dy = g.dataset.dy ?? above;
    g.classList.add('is-hover');
    g.insertAdjacentHTML('beforeend', `<g class="mk-hover" transform="translate(${dx} ${dy})"><rect x="${-w / 2}" y="-10" width="${w}" height="${LABEL_H}" rx="10"/><text y="4" text-anchor="middle">${esc(text)}</text></g>`);
    // keep the pill inside the map: shift it sideways off the edges, flip it below the marker near the top.
    // Label units are screen px (labelStyle scales by --inv), so client-rect overshoot maps 1:1.
    const pill = g.lastElementChild, r = pill.getBoundingClientRect(), b = svg.getBoundingClientRect(), pad = 4;
    let sx = 0, fy = Number(dy);
    if (r.left < b.left + pad) sx = b.left + pad - r.left;
    else if (r.right > b.right - pad) sx = b.right - pad - r.right;
    if (r.top < b.top + pad) fy = -fy;
    if (sx || fy !== Number(dy)) pill.setAttribute('transform', `translate(${Number(dx) + sx} ${fy})`);
  }

  function redrawLabels() { if (!drag) drawSvg(store.get()); }

  /* ---------- strip + hint ---------- */
  function drawStrip(s) {
    const { scenario: sc, ui } = s;
    const unplaced = sc.nodes.find((n) => n.x == null);
    let hint = '';
    if (s.mode !== 'edit') hint = `<span class="ms-hint">${icon('info', 15)}<span>Replaying the model run. Press Edit to change the map.</span></span>`;
    else if (unplaced && s.tool === 'add-node') hint = `<span class="ms-hint ms-hint--accent">${icon('pin-plus', 15)}<span>Place: <b>${esc(unplaced.name)}</b></span></span>`;
    else if (s.tool === 'add-node') hint = `<span class="ms-hint ms-hint--accent">${icon('pin-plus', 15)}<span>Click the map to add a node (${sc.nodes.length}/${MAX_NODES})</span></span>`;
    else if (s.tool === 'place-facility') hint = `<span class="ms-hint ms-hint--accent">${icon('factory', 15)}<span>Click the map to place the facility</span></span>`;
    else if (s.tool === 'calibrate') hint = `<span class="ms-hint ms-hint--accent">${icon('ruler', 15)}<span>${calib.length === 0 ? 'Click the first point · this rescales all distances and costs' : 'Click the second point'}</span></span>`;
    else if (unplaced) hint = `<span class="ms-hint ms-hint--accent">${icon('pin-plus', 15)}<span>${sc.nodes.filter((n) => n.x == null).length} node(s) need a place. Use the pin tool.</span></span>`;
    else if (!sc.nodes.length && !sc.facility) hint = `<span class="ms-hint">${icon('info', 15)}<span>Pick a tool on the left, or load the demo.</span></span>`;
    else hint = `<span class="ms-hint">${icon('cursor', 15)}<span>Drag markers to move them. Hover a marker for its name.</span></span>`;
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
      const lim = { ...CALIBRATION_DEFAULTS, ...store.get().ui?.calibration };
      if (px * k < lim.minPointGapScreenPx) return notify('warn', 'The two points are too close together. Pick two landmarks further apart.');
      const mpp = Number((m / px).toPrecision(4));
      const widthM = map.widthPx * mpp;
      if (mapScaleProblem({ ...map, metresPerPixel: mpp }, lim)) {
        return notify('warn', `That would make the whole map ${fmtLen(widthM)} wide. Check the distance: it is the real metres between your two points.`);
      }
      const before = map.metresPerPixel;
      editScenario(store, (sc) => { sc.map.metresPerPixel = mpp; }, { tool: 'select' });
      notify('info', `Scale set to ${mpp} m per pixel (map ≈ ${fmtLen(widthM)} wide).`, {
        key: 'calib-undo',
        action: { label: 'Undo', onClick: () => editScenario(store, (sc) => { sc.map.metresPerPixel = before; }) },
      });
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
    if (g) g.setAttribute('style', g.getAttribute('style').replace(/transform:[^;]*/, markerStyle(drag.pos[0], drag.pos[1], drag.id === 'facility' ? facScale() : ms)));
    const lg = svg.querySelector(`.mk-label[data-for="${drag.id}"]`);
    if (lg) lg.setAttribute('style', labelStyle(drag.pos[0], drag.pos[1]));
    if (hoverId !== drag.id) showHover(drag.id);
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
  svg.addEventListener('pointerover', (e) => { const id = e.target.closest?.('.mk')?.dataset.id ?? null; if (id !== hoverId && !drag) showHover(id); });
  svg.addEventListener('pointerleave', () => { if (!drag) showHover(null); });
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
