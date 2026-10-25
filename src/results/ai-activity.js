// Live AI activity card: stage stepper, monospace stream with cursor, rationales popping in.
import { h, svgIcon, ICONS } from './dom.js';
import { parseRationales, sourceBadge } from './format.js';

const STEPS = [
  { id: 'sending', label: 'Sending' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'validating', label: 'Validating' },
];
const TAIL_CHARS = 900;

export function sourceBadgeEl(source) {
  const b = sourceBadge(source);
  return h('span', `results-badge results-badge--${b.tone}`, b.label);
}

export function createAiActivity() {
  const card = h('section', 'results-card results-ai');
  const head = h('div', 'results-card-head');
  const t = h('h3', 'results-h3 results-ai-title');
  t.append(svgIcon(ICONS.spark, 16, 'results-ai-spark'), document.createTextNode(' AI optimiser'));
  const badgeSlot = h('span', 'results-badge-slot');
  head.append(t, badgeSlot);

  const stepper = h('ol', 'results-steps');
  const stepEls = STEPS.map((s, i) => {
    const li = h('li', 'results-step');
    const dot = h('span', 'results-step-dot', String(i + 1));
    li.append(dot, h('span', 'results-step-label', s.label));
    stepper.appendChild(li);
    return { li, dot };
  });
  const note = h('div', 'results-ai-note');

  const streamWrap = h('div', 'results-stream');
  const streamHead = h('div', 'results-stream-head');
  streamHead.append(h('span', '', 'model output'), h('span', 'results-stream-count', ''));
  const pre = h('pre', 'results-stream-pre');
  const body = document.createTextNode('');
  const cursor = h('span', 'results-cursor');
  pre.append(body, cursor);
  streamWrap.append(streamHead, pre);

  const ratHead = h('div', 'results-rat-head', 'Rationales');
  const ratList = h('ul', 'results-rats');
  card.append(head, stepper, note, streamWrap, ratHead, ratList);

  const shown = new Set();
  let lastKey = '';

  return {
    el: card,
    update(state) {
      const { llm, scenario, ui } = state;
      const stage = llm.stage;
      const idx = stage === 'done' ? 3 : stage === 'retrying' ? 1 : Math.max(0, STEPS.findIndex((s) => s.id === stage));
      stepEls.forEach((s, i) => {
        s.li.className = 'results-step ' + (i < idx ? 'is-done' : i === idx ? 'is-active' : '');
        s.dot.textContent = '';
        if (i < idx) s.dot.appendChild(svgIcon(ICONS.check, 12));
        else s.dot.textContent = String(i + 1);
      });
      card.classList.toggle('is-done', stage === 'done');
      note.textContent = llm.error
        ? llm.error.fallback ? `${llm.error.message || 'LLM call failed'} — using the rule-based heuristic.` : llm.error.message || 'LLM call failed'
        : stage === 'retrying' ? 'Response failed validation, asking once more…' : '';
      note.className = 'results-ai-note' + (llm.error ? ' is-error' : stage === 'retrying' ? ' is-warn' : '');

      const src = state.optimised?.proposal?.source || (llm.error?.fallback ? 'heuristic' : state.demoMode ? 'cached' : 'llm');
      const key = src;
      if (key !== lastKey) {
        badgeSlot.textContent = '';
        badgeSlot.appendChild(sourceBadgeEl(src));
        lastKey = key;
      }

      const text = llm.text || '';
      const tail = text.length > TAIL_CHARS ? '…' + text.slice(-TAIL_CHARS) : text;
      body.nodeValue = tail || (stage ? 'Waiting for the model…' : '');
      cursor.style.display = stage === 'done' ? 'none' : '';
      streamHead.lastChild.textContent = text ? `${text.length.toLocaleString()} chars` : '';
      pre.scrollTop = pre.scrollHeight;

      if (!text) {
        shown.clear();
        ratList.textContent = '';
      }
      const rats = parseRationales(text);
      const byId = new Map(scenario.nodes.map((n) => [n.id, n]));
      for (const r of rats) {
        const id = r.key ?? '?';
        if (shown.has(id)) continue;
        shown.add(id);
        const node = byId.get(id);
        const li = h('li', 'results-rat');
        const dot = h('span', 'results-rat-dot');
        const color = node ? ui.resinColors[ui.wasteTypeColorKey[node.wasteType]] : ui.flowColors.collected;
        dot.style.background = color;
        const wrap = h('div', 'results-rat-body');
        wrap.append(h('b', '', id === 'sorting' ? 'Sorting method' : node ? node.name : id), h('span', '', r.text));
        li.append(dot, wrap);
        ratList.appendChild(li);
        ratList.scrollTop = ratList.scrollHeight;
      }
      ratHead.textContent = `Rationales${shown.size ? ` (${shown.size})` : ''}`;
      ratHead.style.display = shown.size ? '' : 'none';
    },
  };
}
