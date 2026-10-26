// Wide comparison sheet in #overlay-root: Sankeys side by side at full legibility (projector view).
import { h, svgIcon, ICONS } from './dom.js';
import { createSankey } from './sankey.js';

export function createSheet(root, getState, onClose) {
  const back = h('div', 'results-sheet-back');
  const sheet = h('section', 'results-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Wide Sankey comparison');
  back.appendChild(sheet);
  back.addEventListener('mousedown', (e) => e.target === back && onClose());
  const onKey = (e) => e.key === 'Escape' && onClose();
  document.addEventListener('keydown', onKey);

  const state = getState();
  const { baseline, optimised, ui } = state;
  const head = h('div', 'results-sheet-head');
  head.appendChild(h('h2', 'results-title', optimised ? 'Where the plastic went: before vs after' : 'Where the plastic went'));
  head.appendChild(h('span', 'results-chip', 'Model results'));
  const x = h('button', 'results-iconbtn');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.appendChild(svgIcon(ICONS.close, 18));
  x.addEventListener('click', onClose);
  head.appendChild(x);
  sheet.appendChild(head);
  // shown by CSS only when the sheet is too narrow for the chart (phones): the sheet then scrolls sideways
  const hint = h('p', 'results-sheet-hint');
  hint.append('Swipe sideways to see the whole chart.', h('span', 'results-sheet-turn', ' Turn your phone sideways for a wider view.'));
  sheet.appendChild(hint);

  const grid = h('div', 'results-sheet-grid' + (optimised ? ' is-two' : ''));
  sheet.appendChild(grid);
  const pending = [];
  const sankeys = [];
  const cols = [['Before (baseline)', baseline]];
  if (optimised) cols.push(['After (AI proposal)', optimised]);
  for (const [label, run] of cols) {
    const col = h('div', 'results-sheet-col');
    const t = h('div', 'results-sheet-coltitle');
    t.appendChild(h('b', '', label));
    const s = run.results.summary;
    t.appendChild(h('span', '', `${s.overflowBinDays} overflow bin-days · recovery ${(s.recoveryRate * 100).toFixed(1)}%`));
    col.appendChild(t);
    const holder = h('div', 'results-sheet-sk');
    col.appendChild(holder);
    grid.appendChild(col);
    pending.push([holder, run.results.flows]);
  }
  root.appendChild(back);
  requestAnimationFrame(() => {
    back.classList.add('is-open');
    for (const [holder, flows] of pending) {
      const sk = createSankey(holder, { ui, height: Math.max(380, Math.min(560, window.innerHeight - 260)), compact: false });
      sk.update(flows, { animate: true });
      sankeys.push(sk);
    }
  });
  x.focus();
  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      sankeys.forEach((s) => s.destroy?.());
      back.remove();
    },
  };
}
