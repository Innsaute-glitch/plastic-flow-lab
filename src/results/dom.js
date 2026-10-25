// Tiny DOM helpers shared by the results views.
export function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
export function svgIcon(path, size = 14, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = path;
  return s;
}
export const ICONS = {
  up: '<path d="M8 3 L14 12 H2 Z" fill="currentColor"/>',
  down: '<path d="M8 13 L2 4 H14 Z" fill="currentColor"/>',
  flat: '<rect x="2" y="7" width="12" height="2.4" rx="1.2" fill="currentColor"/>',
  check: '<path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  expand: '<path d="M9 2h5v5M7 14H2V9M14 2 9 7M2 14l5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  close: '<path d="M3 3l10 10M13 3 3 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  info: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v4M8 4.6v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  spark: '<path d="M8 1.5l1.7 4.8 4.8 1.7-4.8 1.7L8 14.5l-1.7-4.8L1.5 8l4.8-1.7z" fill="currentColor"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/>',
};
export function deltaChip(d, { big = false, text } = {}) {
  const chip = h('span', `results-delta results-delta--${d.tone}${big ? ' results-delta--big' : ''}`);
  chip.appendChild(svgIcon(ICONS[d.dir], big ? 22 : 12));
  chip.appendChild(h('span', 'results-delta-txt', text ?? (d.pct === null ? '' : `${Math.round(d.pct * 100)}%`)));
  chip.setAttribute('aria-label', `${d.dir === 'flat' ? 'no change' : d.dir === 'up' ? 'increase' : 'decrease'}, ${d.tone === 'good' ? 'improvement' : d.tone === 'bad' ? 'regression' : 'neutral'}`);
  return chip;
}
