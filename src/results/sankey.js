// Sankey of results.flows. Layout via d3-sankey, paths via d3-shape, plain SVG DOM.
// Geometry is tweened per node/link id so a re-run morphs instead of flashing.
import { sankey as d3Sankey, sankeyLeft } from 'd3-sankey';
import { linkHorizontal } from 'd3-shape';
import { fmtKg } from './format.js';

const SVGNS = 'http://www.w3.org/2000/svg';
// Fixed top-to-bottom order inside each column, so layouts stay stable between runs.
const ORDER = [
  'generated', 'collected', 'litter', 'in_bins_end', 'sorted', 'backlog_end',
  'bale_pet', 'bale_hdpe', 'bale_pp', 'residue_mixed', 'contaminated', 'rejected',
  'route_mechanical', 'route_chemical', 'route_landfill',
];
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVGNS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

function wrap(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

function mix(a, b, t) {
  const o = {};
  for (const k in b) o[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : b[k];
  return o;
}

/**
 * createSankey(container, { ui, height, compact })
 * -> { update(flows, { animate }), destroy(), svg }
 */
export function createSankey(container, { ui, height = 400, compact = true, tooltip = true } = {}) {
  const font = compact ? 11 : 14;
  const lineH = font + 3;
  const charW = font * 0.55;
  const nodeW = compact ? 10 : 14;

  const wrapEl = document.createElement('div');
  wrapEl.className = 'results-sankey';
  const svg = el('svg', { class: 'results-sankey-svg', role: 'img', 'aria-label': 'Sankey diagram of plastic flows in kg' });
  const gLinks = el('g');
  const gNodes = el('g');
  const gLabels = el('g');
  svg.append(gLinks, gNodes, gLabels);
  const tip = document.createElement('div');
  tip.className = 'results-sankey-tip';
  wrapEl.append(svg, tip);
  container.appendChild(wrapEl);

  const nodeItems = new Map();
  const linkItems = new Map();
  let lastFlows = null;
  let raf = 0;
  let width = 0;

  const linkPath = linkHorizontal().source((d) => [d.sx, d.y0]).target((d) => [d.tx, d.y1]);

  function colorFor(id) {
    return ui.flowColors[id] || '#888';
  }
  function linkColor(s, t) {
    return t.startsWith('route_') ? colorFor(s) : colorFor(t);
  }

  function showTip(evt, html) {
    if (!tooltip) return;
    tip.innerHTML = html;
    tip.style.opacity = '1';
    const r = wrapEl.getBoundingClientRect();
    const x = Math.min(Math.max(evt.clientX - r.left + 12, 0), r.width - 190);
    tip.style.transform = `translate(${x}px, ${evt.clientY - r.top + 14}px)`;
  }
  const hideTip = () => (tip.style.opacity = '0');

  function layout(flows) {
    width = Math.max(260, container.clientWidth || 360);
    const rightGutter = compact ? Math.min(96, width * 0.27) : 190;
    const leftPad = 4;
    const top = compact ? 4 * lineH + 6 : 4; // compact: two staggered rows of column-header labels live above the chart
    const chartW = width - leftPad - rightGutter;
    const links = flows.filter((f) => f.kg > 0).map((f) => ({ source: f.source, target: f.target, value: f.kg }));
    const ids = new Set();
    links.forEach((l) => (ids.add(l.source), ids.add(l.target)));
    const nodes = ORDER.filter((id) => ids.has(id)).map((id) => ({ id }));
    const gen = d3Sankey()
      .nodeId((d) => d.id)
      .nodeAlign(sankeyLeft)
      .nodeSort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
      .nodeWidth(nodeW)
      .nodePadding(compact ? 20 : 24)
      .extent([[0, top], [chartW, height - 4]]);
    const g = gen({ nodes, links });
    // Non-uniform column positions: more room where labels are long.
    const fr = compact ? [0, 0.27, 0.53, 0.72, 1] : [0, 0.22, 0.45, 0.7, 1];
    const maxDepth = Math.max(...g.nodes.map((n) => n.depth));
    for (const n of g.nodes) {
      const f = fr[Math.min(n.depth, fr.length - 1)] ?? n.depth / maxDepth;
      n.x0 = leftPad + f * (chartW - nodeW);
      n.x1 = n.x0 + nodeW;
    }
    // Labels: name wrapped to the room available, plus a kg line.
    const byCol = new Map();
    for (const n of g.nodes) {
      const next = fr[Math.min(n.depth + 1, fr.length - 1)] * (chartW - nodeW) + leftPad;
      const hasOut = n.sourceLinks.length > 0;
      n.header = compact && n.depth <= 2 && hasOut;
      const room = n.depth >= maxDepth ? rightGutter - 10 : hasOut ? Math.max(next - n.x1 - 8, 54) : n.depth + 1 <= maxDepth ? Math.max(next - n.x1 - 8, 40) : 100;
      const label = ui.flowLabels[n.id] || n.id;
      n.labelLines = wrap(label, Math.max(6, Math.floor(room / charW)));
      n.labelH = (n.labelLines.length + 1) * lineH;
      n.lx = n.header ? n.x0 : n.x1 + 6;
      if (n.header) n.labelLines = [ui.flowLabels[n.id] || n.id];
      if (n.header) n.labelH = 2 * lineH;
      const col = byCol.get(n.depth) || [];
      col.push(n);
      byCol.set(n.depth, col);
    }
    for (const col0 of byCol.values()) {
      // headers sit ~54px apart in the narrow column: odd depths drop to a second row so they never collide
      for (const n of col0) if (n.header) n.ly = n.depth % 2 ? 2 * lineH + 2 : 0;
      const col = col0.filter((n) => !n.header);
      if (!col.length) continue;
      col.sort((a, b) => a.y0 - b.y0);
      for (const n of col) n.ly = (n.y0 + n.y1) / 2 - n.labelH / 2;
      for (let i = 1; i < col.length; i++) {
        const minY = col[i - 1].ly + col[i - 1].labelH + 2;
        if (col[i].ly < minY) col[i].ly = minY;
      }
      const last = col[col.length - 1];
      if (last.ly + last.labelH > height) {
        last.ly = height - last.labelH;
        for (let i = col.length - 2; i >= 0; i--) {
          const maxY = col[i + 1].ly - col[i].labelH - 2;
          if (col[i].ly > maxY) col[i].ly = maxY;
        }
      }
      if (col[0].ly < 0) col[0].ly = 0;
    }
    return g;
  }

  function build(g) {
    const total = g.nodes.find((n) => n.id === 'generated')?.value || 1;
    const seenN = new Set();
    const seenL = new Set();
    for (const n of g.nodes) {
      seenN.add(n.id);
      const to = { x0: n.x0, x1: n.x1, y0: n.y0, y1: Math.max(n.y1, n.y0 + 1.5), lx: n.lx, ly: n.ly, o: 1 };
      let it = nodeItems.get(n.id);
      if (!it) {
        const rect = el('rect', { class: 'results-sankey-node', fill: colorFor(n.id), rx: 2 });
        const label = el('g', { class: 'results-sankey-label' });
        const texts = [];
        for (let i = 0; i < n.labelLines.length + 1; i++) {
          const t = el('text', { y: font + i * lineH, class: i === n.labelLines.length ? 'results-sankey-kg' : '' });
          t.setAttribute('font-size', i === n.labelLines.length ? font - 1 : font);
          label.appendChild(t);
          texts.push(t);
        }
        gNodes.appendChild(rect);
        gLabels.appendChild(label);
        it = { rect, label, texts, cur: { ...to, o: 0 } };
        nodeItems.set(n.id, it);
        rect.addEventListener('mousemove', (e) => showTip(e, `<b>${ui.flowLabels[n.id]}</b><br>${fmtKg(it.kg)} <span>${Math.round((it.kg / it.total) * 100)}% of generated</span>`));
        rect.addEventListener('mouseleave', () => (hideTip(), highlight(null)));
        rect.addEventListener('mouseenter', () => highlight(n.id));
      }
      it.to = to;
      it.from = { ...it.cur };
      it.kg = n.value;
      it.total = total;
      n.labelLines.forEach((line, i) => (it.texts[i].textContent = line));
      it.texts[n.labelLines.length].textContent = fmtKg(n.value);
      it.rect.dataset.id = n.id;
      it.rect.dataset.kg = n.value.toFixed(3);
      it.exiting = false;
    }
    for (const l of g.links) {
      const key = `${l.source.id}>${l.target.id}`;
      seenL.add(key);
      const to = { sx: l.source.x1, tx: l.target.x0, y0: l.y0, y1: l.y1, w: Math.max(l.width, 0.5), o: 1 };
      let it = linkItems.get(key);
      if (!it) {
        const path = el('path', { class: 'results-sankey-link', fill: 'none', stroke: linkColor(l.source.id, l.target.id) });
        gLinks.appendChild(path);
        it = { path, cur: { ...to, o: 0 } };
        linkItems.set(key, it);
        path.addEventListener('mousemove', (e) => {
          const p = it.kg / it.srcTotal;
          showTip(e, `<b>${ui.flowLabels[l.source.id]} → ${ui.flowLabels[l.target.id]}</b><br>${fmtKg(it.kg)} <span>${Math.round(p * 100)}% of ${ui.flowLabels[l.source.id].toLowerCase()}</span>`);
          path.classList.add('is-hot');
        });
        path.addEventListener('mouseleave', () => (hideTip(), path.classList.remove('is-hot')));
      }
      it.to = to;
      it.from = { ...it.cur };
      it.kg = l.value;
      it.srcTotal = l.source.value;
      it.exiting = false;
      it.path.setAttribute('stroke', linkColor(l.source.id, l.target.id));
      it.path.dataset.kg = l.value.toFixed(3);
      it.path.dataset.link = key;
    }
    for (const [k, it] of nodeItems) if (!seenN.has(k)) ((it.from = { ...it.cur }), (it.to = { ...it.cur, o: 0 }), (it.exiting = true));
    for (const [k, it] of linkItems) if (!seenL.has(k)) ((it.from = { ...it.cur }), (it.to = { ...it.cur, o: 0 }), (it.exiting = true));
  }

  function highlight(id) {
    for (const [key, it] of linkItems) {
      const [s, t] = key.split('>');
      it.path.classList.toggle('is-dim', !!id && s !== id && t !== id);
    }
  }

  function paint() {
    for (const it of nodeItems.values()) {
      const c = it.cur;
      it.rect.setAttribute('x', c.x0);
      it.rect.setAttribute('y', c.y0);
      it.rect.setAttribute('width', c.x1 - c.x0);
      it.rect.setAttribute('height', c.y1 - c.y0);
      it.rect.style.opacity = c.o;
      it.label.setAttribute('transform', `translate(${c.lx},${c.ly})`);
      it.label.style.opacity = Math.max(0, c.o * 2 - 1);
    }
    for (const it of linkItems.values()) {
      const c = it.cur;
      it.path.setAttribute('d', linkPath(c));
      it.path.setAttribute('stroke-width', c.w);
      it.path.style.opacity = c.o;
    }
  }

  function run(animate) {
    cancelAnimationFrame(raf);
    const items = [...nodeItems.values(), ...linkItems.values()];
    const finish = () => {
      for (const it of items) it.cur = { ...it.to };
      paint();
      for (const [k, it] of nodeItems) if (it.exiting) (it.rect.remove(), it.label.remove(), nodeItems.delete(k));
      for (const [k, it] of linkItems) if (it.exiting) (it.path.remove(), linkItems.delete(k));
    };
    if (!animate || reduced()) return finish();
    const t0 = performance.now();
    const dur = 650;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = easeInOut(p);
      for (const it of items) it.cur = mix(it.from, it.to, e);
      paint();
      if (p < 1) raf = requestAnimationFrame(step);
      else finish();
    };
    raf = requestAnimationFrame(step);
  }

  function update(flows, { animate = true } = {}) {
    lastFlows = flows;
    svg.setAttribute('viewBox', `0 0 ${(width = Math.max(260, container.clientWidth || 360))} ${height}`);
    svg.setAttribute('height', height);
    const g = layout(flows);
    build(g);
    run(animate && nodeItems.size > 0);
  }

  let rz;
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        if (!lastFlows || Math.abs((container.clientWidth || 0) - width) < 2) return;
        clearTimeout(rz);
        rz = setTimeout(() => update(lastFlows, { animate: false }), 80);
      })
    : null;
  ro?.observe(container);

  return {
    svg,
    update,
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(rz);
      ro?.disconnect();
      wrapEl.remove();
    },
  };
}
