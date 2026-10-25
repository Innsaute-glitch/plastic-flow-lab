// Compare mode: the before/after climax. Hero delta, metric table, budget, seed sweep, Sankey toggle, setup changes.
import { h, svgIcon, ICONS, deltaChip } from './dom.js';
import { METRICS, deltaFor, formatMetric, budgetStatus, sweepRange, sweepWins, setupChanges } from './format.js';
import { tick } from './counter.js';
import { createSankeyCard } from './metrics-view.js';
import { sourceBadgeEl } from './ai-activity.js';

const M = Object.fromEntries(METRICS.map((m) => [m.key, m]));

function rangeText(r, m) {
  if (!r) return '';
  const a = formatMetric(m, r.min), b = formatMetric(m, r.max);
  return a === b ? a : `${a}–${b}`;
}

function rangeStrip(sweep, m, axisMax) {
  const wrap = h('div', 'results-strip');
  const rows = [
    ['Before', sweepRange(sweep.baseline, m), 'before'],
    ['After', sweepRange(sweep.optimised, m), 'after'],
  ];
  for (const [label, r, cls] of rows) {
    const row = h('div', 'results-strip-row');
    row.appendChild(h('span', 'results-strip-label', label));
    const track = h('span', 'results-strip-track');
    const bar = h('i', `results-strip-bar results-strip-bar--${cls}`);
    bar.style.left = (r.min / axisMax) * 100 + '%';
    bar.style.width = Math.max(((r.max - r.min) / axisMax) * 100, 0.6) + '%';
    track.appendChild(bar);
    for (const v of r.vals) {
      const d = h('b', `results-strip-dot results-strip-dot--${cls}`);
      d.style.left = (v / axisMax) * 100 + '%';
      track.appendChild(d);
    }
    row.appendChild(track);
    row.appendChild(h('span', 'results-strip-val', rangeText(r, m)));
    wrap.appendChild(row);
  }
  return wrap;
}

export function createCompareView(ctx) {
  const { store } = ctx;
  const el = h('div', 'results-view results-compare');
  let sk = null;
  let sankeyWhich = 'optimised';
  let lastKey = null;
  let skCard = null;

  function build(state) {
    el.textContent = '';
    sk?.destroy();
    const { baseline, optimised, sweep, scenario, ui, assumptions } = state;
    const bs = baseline.results.summary, os = optimised.results.summary;
    const proposal = optimised.proposal;

    // header
    const head = h('header', 'results-head');
    head.append(h('h2', 'results-title', 'Before → after'), sourceBadgeEl(proposal.source));
    const chip = h('span', 'results-chip', `Model results · seed ${optimised.results.meta.seed}`);
    head.appendChild(chip);
    el.appendChild(head);

    // hero
    const hd = deltaFor(M.overflow, bs.overflowBinDays, os.overflowBinDays);
    const hero = h('section', `results-hero results-hero--${hd.tone}`);
    hero.appendChild(h('div', 'results-hero-label', 'Overflow bin-days'));
    const nums = h('div', 'results-hero-nums');
    const before = h('span', 'results-hero-before', String(bs.overflowBinDays));
    const arrow = h('span', 'results-hero-arrow');
    arrow.innerHTML = '<svg viewBox="0 0 40 24" width="40" height="24"><path d="M2 12h32M24 3l11 9-11 9" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const after = h('span', 'results-hero-after', String(bs.overflowBinDays));
    nums.append(before, arrow, after);
    hero.appendChild(nums);
    const foot = h('div', 'results-hero-foot');
    foot.appendChild(deltaChip(hd, { big: true, text: hd.pct === null ? '' : `${Math.round(hd.pct * 100)}%` }));
    foot.appendChild(h('span', 'results-hero-cap', hd.dir === 'down' ? 'fewer overflow days' : hd.dir === 'up' ? 'more overflow days' : 'no change'));
    hero.appendChild(foot);
    el.appendChild(hero);
    tick(after, os.overflowBinDays, { from: bs.overflowBinDays, decimals: 0, duration: 1600 });

    // metrics table
    const tbl = h('section', 'results-card results-cmp');
    for (const k of ['recovery', 'purity', 'contamination', 'km', 'cost']) {
      const m = M[k];
      const b = m.get(bs), a = m.get(os);
      const d = deltaFor(m, b, a);
      const budget = m.isCost ? budgetStatus(bs.cost.total, os.cost.total, assumptions.llmLimits.budgetTolerance.value) : null;
      // cost increase inside the budget is an accepted trade-off: amber, not red
      const shown = budget && d.tone === 'bad' && budget.within ? { ...d, tone: 'warn' } : d;
      const row = h('div', 'results-cmp-row');
      row.appendChild(h('span', 'results-cmp-label', m.label));
      const vals = h('span', 'results-cmp-vals');
      vals.append(h('span', 'results-cmp-b', formatMetric(m, b)), h('span', 'results-cmp-arrow', '→'));
      const av = h('span', 'results-cmp-a', '');
      vals.appendChild(av);
      row.appendChild(vals);
      // rates are already percentages: show the absolute change in percentage points, not a relative %
      const pctText = m.unit === '%'
        ? `${d.abs >= 0 ? '+' : '−'}${Math.abs(d.abs).toFixed(1)} pp`
        : d.dir === 'flat' ? '0%' : d.pct === null ? '' : `${Math.round(d.pct * 100)}%`;
      // the cost change is shown by the budget line below; a chip here would not fit beside the ₹ values
      if (!budget) row.appendChild(deltaChip(shown, { text: pctText }));
      tbl.appendChild(row);
      tick(av, a, { from: b, decimals: m.decimals, prefix: m.prefix || '', duration: 1300 });
      if (m.unit && m.unit !== 'INR') vals.appendChild(h('span', 'results-cmp-unit', m.unit));
      if (budget) {
        const pill = h('div', `results-budget results-budget--${budget.within ? 'ok' : 'over'}`);
        pill.appendChild(svgIcon(budget.within ? ICONS.check : ICONS.close, 13));
        pill.appendChild(h('b', '', budget.text));
        pill.appendChild(h('span', '', budget.limitText));
        tbl.appendChild(pill);
      }
    }
    el.appendChild(tbl);

    // sweep
    if (sweep && sweep.baseline?.length) {
      const sec = h('section', 'results-card results-sweep');
      const n = sweep.seeds.length;
      sec.appendChild(h('h3', 'results-h3', `Holds across ${n} seeds`));
      for (const key of ['overflow', 'recovery']) {
        const m = M[key];
        const all = [...sweep.baseline, ...sweep.optimised].map((s) => m.get(s));
        const axisMax = Math.max(...all) * 1.05 || 1;
        const w = sweepWins(sweep, m);
        const blk = h('div', 'results-sweep-blk');
        const cap = h('div', 'results-sweep-cap');
        cap.append(h('b', '', m.label), h('span', w.wins === w.total ? 'is-good' : 'is-bad', `better in ${w.wins}/${w.total} seeds`));
        blk.append(cap, rangeStrip(sweep, m, axisMax));
        sec.appendChild(blk);
      }
      el.appendChild(sec);
    }

    // sankey with toggle
    skCard = createSankeyCard(ui, { title: 'Plastic flows', onExpand: () => ctx.openSheet() });
    const seg = h('div', 'results-seg');
    const btns = {};
    for (const [id, label] of [['baseline', 'Before'], ['optimised', 'After']]) {
      const b = h('button', 'results-seg-btn', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        sankeyWhich = id;
        paintSeg();
        skCard.update(state[id].results.flows, { animate: true });
      });
      btns[id] = b;
      seg.appendChild(b);
    }
    const paintSeg = () => Object.entries(btns).forEach(([id, b]) => b.classList.toggle('is-on', id === sankeyWhich));
    skCard.headActions.prepend(seg);
    paintSeg();
    el.appendChild(skCard.el);
    skCard.update(state[sankeyWhich].results.flows, { animate: false });
    sk = skCard;

    // setup changes
    const chg = h('section', 'results-card results-changes');
    const chgHead = h('div', 'results-card-head');
    chgHead.append(h('h3', 'results-h3', 'Changes made'));
    const drawerBtn = h('button', 'results-linkbtn');
    drawerBtn.type = 'button';
    drawerBtn.append(svgIcon(ICONS.eye, 14), document.createTextNode(' What the AI saw / said'));
    drawerBtn.addEventListener('click', () => store.set({ panel: 'ai-drawer' }));
    chgHead.appendChild(drawerBtn);
    chg.appendChild(chgHead);
    if (proposal.summary) chg.appendChild(h('p', 'results-summary', proposal.summary));

    const sortRow = h('div', 'results-chg results-chg--sort');
    const from = ui.sortingMethodLabels[baseline.setup.sortingMethod];
    const to = ui.sortingMethodLabels[proposal.setup.sortingMethod];
    const sh = h('div', 'results-chg-head');
    sh.append(h('b', '', 'Sorting method'));
    const sp = h('span', 'results-chip-set');
    sp.textContent = from === to ? `${to} (unchanged)` : `${from} → ${to}`;
    sh.appendChild(sp);
    sortRow.appendChild(sh);
    if (proposal.sortingRationale) sortRow.appendChild(h('p', 'results-chg-why', proposal.sortingRationale));
    chg.appendChild(sortRow);

    // per-node changes scroll inside the card so 30 nodes do not turn the panel into a wall of text
    const changes = setupChanges(scenario, baseline.setup, proposal.setup);
    const nChanged = changes.filter((c) => c.changed).length;
    const listHead = h('div', 'results-chg-listhead');
    listHead.append(h('b', '', 'Per-node changes'), h('span', '', `${nChanged} of ${changes.length} nodes changed`));
    chg.appendChild(listHead);
    const list = h('div', 'results-chg-list');
    chg.appendChild(list);
    for (const c of changes) {
      const row = h('div', `results-chg${c.changed ? '' : ' is-same'}`);
      const hh = h('div', 'results-chg-head');
      const nameEl = h('b', '', c.name);
      nameEl.title = c.name;
      hh.appendChild(nameEl);
      const ps = h('span', 'results-chg-parts');
      if (c.changed) c.parts.forEach((p) => ps.appendChild(h('span', 'results-chip-set', p)));
      else ps.appendChild(h('span', 'results-same', 'no change'));
      hh.appendChild(ps);
      row.appendChild(hh);
      const why = proposal.rationales?.[c.id];
      if (why) row.appendChild(h('p', 'results-chg-why', why));
      list.appendChild(row);
    }
    if (proposal.clampNotes?.length) {
      const cl = h('div', 'results-clamps');
      cl.appendChild(h('b', '', 'Adjusted to allowed limits'));
      proposal.clampNotes.forEach((n) => cl.appendChild(h('code', '', n)));
      chg.appendChild(cl);
    }
    el.appendChild(chg);
  }

  return {
    el,
    update(state) {
      const key = [state.baseline.results, state.optimised.results, state.sweep, state.scenario];
      if (lastKey && key.every((k, i) => k === lastKey[i])) return;
      lastKey = key;
      build(state);
    },
    destroy() {
      sk?.destroy();
      el.remove();
    },
  };
}
