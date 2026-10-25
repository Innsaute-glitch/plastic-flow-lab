// Cached soft-glow sprites (one offscreen canvas per colour) so drawing a glowing dot is one drawImage.
const cache = new Map();

export function glowSprite(rgb, size = 64) {
  const key = rgb.map(Math.round).join(',') + ':' + size;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  const [r, gg, b] = rgb.map(Math.round);
  grad.addColorStop(0, `rgba(255,255,255,0.95)`);
  grad.addColorStop(0.14, `rgba(${r},${gg},${b},0.95)`);
  grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.32)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}
