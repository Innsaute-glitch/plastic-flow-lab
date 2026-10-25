// The "i" gains popover: a small info button that opens a compact, non-modal list of gains
// (money, recycling, CO2e, landfill, litter). One popover open at a time. The popover is attached to
// <body> with position:fixed so the scrolling results panel cannot clip it.
import { h, svgIcon, ICONS } from './dom.js';
import { GAINS_FOOTNOTE } from './format.js';

let open = null; // { pop, btn, off }

export function closeGains({ restoreFocus = false } = {}) {
  if (!open) return;
  const { pop, btn, off } = open;
  open = null;
  off();
  pop.remove();
  btn.setAttribute('aria-expanded', 'false');
  if (restoreFocus) btn.focus();
}

function place(pop, btn) {
  const r = btn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const m = 8;
  pop.style.maxHeight = vh - 2 * m + 'px';
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  // right-align under the button, clamp inside the viewport
  let left = Math.min(Math.max(m, r.right - pw), vw - pw - m);
  let top = r.bottom + 6;
  if (top + ph > vh - m) top = r.top - ph - 6 >= m ? r.top - ph - 6 : Math.max(m, vh - ph - m);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

/**
 * Info button. `getRows()` returns the rows to show when opened: [{label, value, tone, icon}] (see format.js).
 * `title` is the popover heading and part of the button's aria-label.
 */
export function createGainsButton({ getRows, title = 'Gains', ariaLabel = 'Show gains' }) {
  const btn = h('button', 'results-infobtn');
  btn.type = 'button';
  btn.setAttribute('aria-label', ariaLabel);
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.title = ariaLabel;
  btn.appendChild(svgIcon(ICONS.info, 16));

  function show() {
    closeGains();
    const pop = h('div', 'results-gains');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);
    pop.tabIndex = -1;
    pop.appendChild(h('div', 'results-gains-title', title));
    const list = h('ul', 'results-gains-list');
    for (const r of getRows()) {
      const li = h('li', 'results-gains-row');
      const ic = h('span', 'results-gains-ic');
      ic.appendChild(svgIcon(ICONS[r.icon] || ICONS.info, 15));
      li.append(ic, h('span', 'results-gains-lab', r.label), h('b', `results-gains-val results-gains-val--${r.tone}`, r.value));
      list.appendChild(li);
    }
    pop.appendChild(list);
    pop.appendChild(h('p', 'results-gains-foot', GAINS_FOOTNOTE));
    document.body.appendChild(pop);
    place(pop, btn);
    btn.setAttribute('aria-expanded', 'true');
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeGains({ restoreFocus: true });
      }
    };
    const onDown = (e) => {
      if (!pop.contains(e.target) && !btn.contains(e.target)) closeGains();
    };
    const onFocusOut = (e) => {
      // keyboard: tabbing out of the popover (and off the button) closes it
      if (e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== btn) closeGains();
    };
    const onMove = (e) => { if (!e || !e.target || !pop.contains(e.target)) closeGains(); }; // scroll/resize would detach it from its button
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    pop.addEventListener('focusout', onFocusOut);
    open = {
      pop,
      btn,
      off() {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('pointerdown', onDown, true);
        document.removeEventListener('scroll', onMove, true);
        window.removeEventListener('resize', onMove);
      },
    };
    pop.focus({ preventScroll: true });
  }

  btn.addEventListener('click', () => (open && open.btn === btn ? closeGains() : show()));
  return btn;
}
