// Ticking number counter. tick(el, to, { from, decimals, duration, prefix }) animates el.textContent.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function formatNumber(v, decimals) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

export function tick(el, to, opts = {}) {
  const { decimals = 0, duration = 900, prefix = '' } = opts;
  if (el._raf) cancelAnimationFrame(el._raf);
  const from = opts.from ?? (typeof el._value === 'number' ? el._value : 0);
  const write = (v) => {
    el._value = v;
    el.textContent = prefix + formatNumber(v, decimals);
  };
  if (reduced() || duration <= 0 || from === to) {
    write(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    write(from + (to - from) * easeOut(p));
    if (p < 1) el._raf = requestAnimationFrame(step);
    else write(to);
  };
  write(from);
  el._raf = requestAnimationFrame(step);
}
