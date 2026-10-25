// The only way any module shows a toast.
import { icon } from './icons.js';

const ICONS = { info: 'info', warn: 'alert', error: 'alert' };
const TTL = { info: 3500, warn: 5500, error: 8000 };

export function notify(level, message, opts = {}) {
  const lvl = ['info', 'warn', 'error'].includes(level) ? level : 'info';
  const log = lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.info;
  log('[app] toast:', message);
  const root = typeof document !== 'undefined' && document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `app-toast app-toast--${lvl}`;
  el.setAttribute('role', lvl === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="app-toast__icon">${icon(ICONS[lvl], 18)}</span><span class="app-toast__msg"></span><button class="app-toast__x" aria-label="Dismiss">${icon('x', 14)}</button>`;
  el.querySelector('.app-toast__msg').textContent = String(message);
  const action = opts && opts.action;
  if (action && typeof action.onClick === 'function') {
    const b = document.createElement('button');
    b.className = 'app-toast__action';
    b.textContent = String(action.label);
    b.addEventListener('click', () => { action.onClick(); close(); });
    el.insertBefore(b, el.querySelector('.app-toast__x'));
  }
  const close = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.app-toast__x').addEventListener('click', close);
  root.appendChild(el);
  while (root.children.length > 4) root.firstChild.remove();
  setTimeout(close, action ? 8000 : TTL[lvl]);
}
