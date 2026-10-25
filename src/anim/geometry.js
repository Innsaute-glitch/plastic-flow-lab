// Route smoothing and colour helpers. Coordinates in original-image pixels.

export function buildRoute(path, bow = 0.07, per = 14) {
  const pts = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    pts.push(a, [(a[0] + b[0]) / 2 - dy * bow, (a[1] + b[1]) / 2 + dx * bow]);
  }
  pts.push(path[path.length - 1]);
  const xs = [], ys = [], cum = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      xs.push(0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3));
      ys.push(0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3));
    }
  }
  xs.push(pts[n - 1][0]); ys.push(pts[n - 1][1]);
  let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    if (i) acc += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    cum.push(acc);
  }
  const total = acc || 1;
  // arrival length of original stop i (pts index 2*i, each pts segment has `per` samples)
  const stops = path.map((_, i) => cum[Math.min(2 * i * per, cum.length - 1)]);

  function at(L) {
    L = Math.max(0, Math.min(total, L));
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < L) lo = m + 1; else hi = m; }
    const i = Math.max(1, lo), span = cum[i] - cum[i - 1] || 1, f = (L - cum[i - 1]) / span;
    return [xs[i - 1] + (xs[i] - xs[i - 1]) * f, ys[i - 1] + (ys[i] - ys[i - 1]) * f];
  }
  function angleAt(L) {
    const a = at(L - 10), b = at(L + 10);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  return { xs, ys, cum, total, stops, at, angleAt };
}

export const hexToRgb = (h) => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
export const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
export const easeInOutSine = (v) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(v));

// Smooth green -> amber -> red from ui.fillThresholds / ui.fillColors.
export function makeFillColor(ui) {
  const g = hexToRgb(ui.fillColors.green), a = hexToRgb(ui.fillColors.amber), r = hexToRgb(ui.fillColors.red);
  const { amberPct, redPct } = ui.fillThresholds;
  const mix = (c1, c2, k) => [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
  return (pct) => {
    if (pct <= amberPct - 12) return g;
    if (pct <= amberPct + 4) return mix(g, a, smoothstep((pct - (amberPct - 12)) / 16));
    if (pct <= redPct - 6) return a;
    if (pct <= redPct + 4) return mix(a, r, smoothstep((pct - (redPct - 6)) / 10));
    return r;
  };
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
