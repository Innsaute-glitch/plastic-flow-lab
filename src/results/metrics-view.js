// Results mode: metric cards with ticking counters, Sankey, per-node table.
import { h, svgIcon, ICONS } from './dom.js';
import { METRICS, fmtInt, fmtDec1, fmtKg } from './format.js';
import { tick } from './counter.js';
import { createSankey } from './sankey.js';

const CARD_ORDER = ['recovery', 'purity', 'contamination', 'km', 'cost'];

function subFor(key, s, days = 30) {
  switch (key) {
    case 'overflow': return `bin-days \u00B7 ${s.overflowCalendarDays} of ${days} days had overflow`;
    case 'recovery': return `${fmtInt(s.generatedKg * s.recoveryRate)} of ${fmtInt(s.generatedKg)} kg generated`;
    case 'purity': return 'resin share of baled mass';
    case 'contamination': return 'of sorted mass';
    case 'km': return `${s.truckTrips} truck trips · ${s.pickups} bin pickups`;
    case 'cost': return `transport ₹${fmtInt(s.cost.transport)} · bins ₹${fmtInt(s.cost.bins)} · sorting ₹${fmtInt(s.cost.sorting)}`;
    default: return '';
  }
}

export function createMetricCards() {
  const root = h('div', 'results-cards');
  const refs = {};
  const make = (m, cls) => {
    const card = h('div', `results-card results-metric ${cls || ''}`);
    card.appendChild(h('div', 'results-card-label', m.label));
    const num = h('div', 'results-numeral');
    if (m.prefix) num.appendChild(h('span', 'results-numeral-pre', m.prefix));
    const val = h('span', 'results-numeral-val', '0');
    num.appendChild(val);
    if (m.unit && m.unit !== 'INR') num.appendChild(h('span', 'results-numeral-unit', m.unit));
    card.appendChild(num);
    const sub = h('div', 'results-card-sub');
    card.appendChild(sub);
    refs[m.key] = { val, sub, m };
    return card;
  };
  const M = Object.fromEntries(METRICS.map((m) => [m.key, m]));
  root.appendChild(make(M.overflow, 'results-metric--hero'));
  for (const k of CARD_ORDER) root.appendChild(make(M[k], k === 'cost' ? 'results-metric--wide' : ''));
  return {
    el: root,
    update(summary, { animate = true, days = 30 } = {}) {
      for (const k in refs) {
        const { val, sub, m } = refs[k];
        tick(val, m.get(summary), { decimals: m.decimals, duration: animate ? 1000 : 0 });
        sub.textContent = subFor(k, summary, days);
      }
    },
  };
}

export function createNodeTable() {
  const card = h('section', 'results-card results-table-card');
  const th = h('div', 'results-card-head');
  const cnt = h('span', 'results-count');
  th.append(h('h3', 'results-h3', 'Per-node results'), cnt);
  card.appendChild(th);
  const body = h('div', 'results-table'); // scrolls inside the card (30 nodes); header row is sticky
  const caption = h('p', 'results-tcaption');
  card.append(body, caption);
  return {
    el: card,
    update(scenario, results, ui) {
      body.textContent = '';
      cnt.textContent = `${scenario.nodes.filter((n) => results.perNode[n.id]).length} nodes`;
      const head = h('div', 'results-trow results-thead');
      for (const [t, tip] of [['Node', ''], ['kg', 'Plastic generated over the run'], ['Overflow', 'Days with overflow, out of ' + results.meta.days], ['Load', 'Load at pickup: plastic arrived since the last pickup as % of bin capacity']]) {
        const c = h('span', '', t);
        if (tip) c.title = tip;
        head.appendChild(c);
      }
      body.appendChild(head);
      const days = results.meta.days;
      // load = plastic that arrived since the last pickup as % of bin capacity (uncapped); >100% means it overflowed
      const loadColor = (v) => (v > 100 ? ui.fillColors.red : v >= ui.fillThresholds.redPct ? ui.fillColors.amber : ui.fillColors.green);
      for (const n of scenario.nodes) {
        const p = results.perNode[n.id];
        if (!p) continue;
        const row = h('div', 'results-trow');
        const nm = h('span', 'results-tname', n.name);
        nm.title = n.name;
        row.appendChild(nm);
        row.appendChild(h('span', 'results-tnum', fmtKg(p.generatedKg).replace(/\s*kg$/, '')));
        const ov = h('span', 'results-tov');
        const bar = h('span', 'results-tbar');
        const fill = h('i');
        fill.style.width = Math.min(100, (p.overflowDays / days) * 100) + '%';
        bar.appendChild(fill);
        bar.title = `${p.overflowDays} of ${days} days overflowed`;
        ov.append(h('b', '', String(p.overflowDays)), bar);
        row.appendChild(ov);
        const lp = p.avgLoadPctAtPickup ?? p.avgFillPctAtPickup;
        const f = h('span', 'results-tnum', `${Math.round(lp)}%`);
        f.style.color = loadColor(lp);
        f.title = `Bin ${Math.round(p.avgFillPctAtPickup)}% full at pickup on average; ${Math.round(lp)}% of its capacity arrived per cycle`;
        row.appendChild(f);
        body.appendChild(row);
        if (n.observed) {
          const note = h('div', 'results-obs');
          note.appendChild(svgIcon(ICONS.info, 13));
          note.appendChild(
            h('span', '', `Observed ${n.observed.overflowDays} overflow days, ${n.observed.fillPctAtPickup}% full at pickup. Model: ${p.overflowDays} days, bin ${Math.round(p.avgFillPctAtPickup)}% full (${Math.round(lp)}% of capacity arrived).`)
          );
          body.appendChild(note);
        }
      }
      body.scrollTop = 0;
      caption.textContent = (`kg = plastic generated over ${days} days. Load at pickup = plastic that arrived since the last pickup, as % of the bin's capacity; over 100% means the bin overflowed. Bar = days with overflow, out of ${days}.`);
    },
  };
}

/** Sankey card with optional expand button. */
export function createSankeyCard(ui, { title = 'Where the plastic went', onExpand, height = 420 } = {}) {
  const card = h('section', 'results-card results-sankey-card');
  const head = h('div', 'results-card-head');
  head.appendChild(h('h3', 'results-h3', title));
  const slot = h('div', 'results-head-actions');
  head.appendChild(slot);
  if (onExpand) {
    const b = h('button', 'results-iconbtn');
    b.type = 'button';
    b.title = 'Open wide view';
    b.setAttribute('aria-label', 'Open wide Sankey view');
    b.appendChild(svgIcon(ICONS.expand, 16));
    b.addEventListener('click', onExpand);
    slot.appendChild(b);
  }
  const holder = h('div', 'results-sankey-holder');
  card.append(head, holder);
  let sk = null;
  return {
    el: card,
    headActions: slot,
    update(flows, opts) {
      if (!sk) sk = createSankey(holder, { ui, height, compact: true });
      sk.update(flows, opts);
    },
    destroy: () => sk?.destroy(),
  };
}

export function createResultsView(ctx) {
  const { ui } = ctx;
  const el = h('div', 'results-view');
  const head = h('header', 'results-head');
  const title = h('h2', 'results-title', 'Baseline results');
  const chip = h('span', 'results-chip', 'Model results');
  head.append(title, chip);
  const cards = createMetricCards();
  const sk = createSankeyCard(ui, { onExpand: () => ctx.openSheet() });
  const table = createNodeTable();
  el.append(head, cards.el, sk.el, table.el);
  let lastResults = null;
  return {
    el,
    update(state, { results, label }) {
      title.textContent = label;
      chip.textContent = `Model results · seed ${results.meta.seed}`;
      const first = lastResults === null;
      if (results !== lastResults) {
        cards.update(results.summary, { animate: true, days: results.meta.days });
        sk.update(results.flows, { animate: !first });
        table.update(state.scenario, results, ui);
        lastResults = results;
      }
    },
    destroy() {
      sk.destroy();
      el.remove();
    },
  };
}
