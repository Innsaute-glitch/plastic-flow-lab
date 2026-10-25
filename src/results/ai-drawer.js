// "What the AI saw / said" drawer. Lives in #overlay-root; open when store.panel === "ai-drawer".
import { h, svgIcon, ICONS } from './dom.js';
import { fmtInt, fmtKg } from './format.js';
import { sourceBadgeEl } from './ai-activity.js';

function prettyRaw(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function createAiDrawer(root, store) {
  const back = h('div', 'results-drawer-back');
  const panel = h('aside', 'results-drawer');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'What the AI saw and said');
  back.appendChild(panel);
  const close = () => store.set({ panel: null });
  back.addEventListener('mousedown', (e) => e.target === back && close());
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);

  const state = store.get();
  const { scenario, baseline, optimised, assumptions, ui } = state;
  const p = optimised?.proposal;

  const head = h('div', 'results-drawer-head');
  head.appendChild(h('h2', 'results-title', 'What the AI saw / said'));
  if (p) head.appendChild(sourceBadgeEl(p.source));
  const x = h('button', 'results-iconbtn');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.appendChild(svgIcon(ICONS.close, 16));
  x.addEventListener('click', close);
  head.appendChild(x);
  panel.appendChild(head);

  const body = h('div', 'results-drawer-body');
  panel.appendChild(body);

  // Request summary
  body.appendChild(h('h3', 'results-h3', 'What it saw'));
  const lim = assumptions?.llmLimits;
  const facts = [
    ['Scenario', `${scenario.name} · ${scenario.nodes.length} nodes + facility`],
    ['Allowed intervals', lim ? `${lim.pickupIntervalDays.value[0]}–${lim.pickupIntervalDays.value[1]} days` : '–'],
    ['Allowed bin counts', lim ? `${lim.binCount.value[0]}–${lim.binCount.value[1]}` : '–'],
    ['Allowed capacities', assumptions?.bins?.allowedCapacitiesL ? `${assumptions.bins.allowedCapacitiesL.value.join(', ')} L` : '–'],
    ['Budget rule', lim ? `cost ≤ baseline + ${Math.round(lim.budgetTolerance.value * 100)}%` : '–'],
  ];
  if (baseline) {
    const s = baseline.results.summary;
    facts.push(['Baseline', `${s.overflowBinDays} overflow bin-days · recovery ${(s.recoveryRate * 100).toFixed(1)}% · purity ${(s.purity * 100).toFixed(1)}% · ₹${fmtInt(s.cost.total)}`]);
  }
  const dl = h('dl', 'results-facts');
  facts.forEach(([k, v]) => dl.append(h('dt', '', k), h('dd', '', v)));
  body.appendChild(dl);

  const tbl = h('div', 'results-mini');
  scenario.nodes.forEach((n) => {
    const row = h('div', 'results-mini-row');
    const dot = h('i');
    dot.style.background = ui.resinColors[ui.wasteTypeColorKey[n.wasteType]];
    const cfg = baseline?.setup?.nodes?.[n.id] || scenario.baselineSetup?.nodes?.[n.id];
    row.append(dot, h('b', '', n.name), h('span', '', `${ui.wasteTypeLabels[n.wasteType]} · ${fmtKg(n.rateKgPerDay).replace(' kg', '')} kg/day`));
    if (cfg) row.appendChild(h('span', 'results-mini-cfg', `${cfg.binCount}×${cfg.binCapacityL} L ${cfg.binType}, every ${cfg.pickupIntervalDays} d`));
    tbl.appendChild(row);
  });
  body.appendChild(tbl);

  body.appendChild(h('h3', 'results-h3', 'What it said'));
  if (p) {
    const meta = h('div', 'results-drawer-meta', `${p.model || 'model'} · round ${p.round} · ${p.createdAt || ''}`);
    body.appendChild(meta);
    body.appendChild(h('pre', 'results-raw', prettyRaw(p.raw || '(no raw text)')));
  } else {
    body.appendChild(h('p', 'results-muted', 'Nothing yet. Run Optimise to see the model response.'));
  }

  root.appendChild(back);
  requestAnimationFrame(() => back.classList.add('is-open'));
  x.focus();
  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      back.remove();
    },
  };
}
