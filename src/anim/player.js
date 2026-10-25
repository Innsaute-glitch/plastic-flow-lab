// Animation player (Task 4). Replays results.timeline on one canvas. Never computes outcomes.
import { buildSchedule } from './schedule.js';
import { buildRoute, hexToRgb, rgba, lerp, clamp01, smoothstep, easeInOutSine, makeFillColor, mulberry } from './geometry.js';
import { glowSprite } from './sprites.js';
import { createHud } from './hud.js';
import './anim.css';

const MAX_DOTS = 420;
const MAX_LITTER = 360;
const DOTS_PER_KG = 5;      // visual density only
const MAX_DOT_RATE = 8;     // dots per second per node
const DOT_LIFE = 1.15;      // seconds
const SPILL_RATE = 2.4;     // spill dots per second per overflowing node
const TRAVEL_SHARE = 0.78;  // share of the trip pause spent travelling; rest is fade-out
const HUD_WRITE_MS = 140;

const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createPlayer(canvas, { scenario, results, ui, onUpdate, hud } = {}) {
  const ctx = canvas.getContext('2d');
  const tl = results.timeline;
  const frames = tl.frames;
  const order = tl.nodeOrder;
  const nodeById = new Map(scenario.nodes.map((n) => [n.id, n]));
  const nodes = order.map((id) => nodeById.get(id));
  const N = nodes.length;
  const sched = buildSchedule(tl, ui.playbackSeconds);
  const idxOf = new Map(order.map((id, i) => [id, i]));
  const routes = tl.trips.map((tr) => buildRoute(tr.path));
  const fillColor = makeFillColor(ui);
  const lime = hexToRgb(ui.flowColors.collected);
  const red = hexToRgb(ui.fillColors.red);
  const nodeRgb = nodes.map((n) => hexToRgb(ui.resinColors[ui.wasteTypeColorKey[n.wasteType]] || ui.resinColors.mixed));
  const maxQueue = Math.max(1, ...frames.map((f) => f.facility.queueKg));
  const maxLitter = Math.max(1e-9, frames[frames.length - 1].litterKgCum);
  const reduced = prefersReduced();

  let W = 0, H = 0, dpr = 1, scale = 1, u = 1;
  // node-attached effects shrink with the node count so up to 40 nodes stay readable. Same curve as the editor markers (src/app/map-editor).
  let ms = 0.85, nk = 1;
  let un = 1; // u * nk
  let s = 0, playing = false, speed = 1, done = false, raf = 0, lastTs = 0, clock = 0, lastWrite = -1e9;
  let which = 'baseline';

  // per-node smoothed display state
  const dispFill = new Float32Array(N), ovI = new Float32Array(N), flash = new Float32Array(N);
  const dotAcc = new Float32Array(N), spillAcc = new Float32Array(N);
  let facGlow = 0.25, facPulse = 0, sortAct = 0, queueDisp = 0;

  // pools
  const dots = Array.from({ length: MAX_DOTS }, () => ({ on: false }));
  let dotCursor = 0;
  const litter = []; let litterHead = 0;
  const rng = mulberry(1337);

  function allocDot() {
    for (let i = 0; i < MAX_DOTS; i++) {
      const d = dots[(dotCursor + i) % MAX_DOTS];
      if (!d.on) { dotCursor = (dotCursor + i + 1) % MAX_DOTS; return d; }
    }
    return null;
  }
  function addLitter(j, ox, oy, age) {
    const sp = { j, ox, oy, age, r: 0.9 + rng() * 1.3 };
    if (litter.length < MAX_LITTER) litter.push(sp); else { litter[litterHead] = sp; litterHead = (litterHead + 1) % MAX_LITTER; }
  }
  function spawnFlow(j) {
    const d = allocDot(); if (!d) return;
    const ang = rng() * Math.PI * 2, dist = 44 + rng() * 30;
    d.on = true; d.kind = 0; d.j = j; d.age = 0; d.life = DOT_LIFE * (0.85 + rng() * 0.3);
    d.sx = Math.cos(ang) * dist; d.sy = Math.sin(ang) * dist; d.ex = 0; d.ey = 0;
    const bend = (rng() < 0.5 ? -1 : 1) * (0.25 + rng() * 0.2);
    d.cx = d.sx * 0.5 - d.sy * bend; d.cy = d.sy * 0.5 + d.sx * bend;
    d.size = 1.5 + rng() * 1.1;
  }
  function spawnSpill(j) {
    const d = allocDot(); if (!d) return;
    const ang = rng() * Math.PI * 2, dist = 16 + rng() * 22;
    d.on = true; d.kind = 1; d.j = j; d.age = 0; d.life = 0.8 + rng() * 0.3;
    d.sx = Math.cos(ang) * 6; d.sy = Math.sin(ang) * 6 - 4;
    d.ex = Math.cos(ang) * dist; d.ey = Math.sin(ang) * dist * 0.8 + 6;
    d.cx = (d.sx + d.ex) / 2; d.cy = Math.min(d.sy, d.ey) - 14 - rng() * 8;
    d.size = 1.3 + rng() * 0.9;
  }

  function rebuildLitter(x) {
    litter.length = 0; litterHead = 0;
    const r = mulberry(99);
    const cnt = new Int32Array(N);
    const last = Math.floor(x);
    for (let f = 0; f <= last; f++) {
      const fn = frames[f].nodes;
      for (let j = 0; j < N; j++) {
        if (fn[j].overflowKg > 0 && ++cnt[j] % 8 === 0) {
          const a = r() * Math.PI * 2, dist = 16 + r() * 22;
          addLitter(j, Math.cos(a) * dist, Math.sin(a) * dist * 0.8 + 6, 99);
        }
      }
    }
  }

  // ---------- layout ----------
  function resize(cssW, cssH, ratio) {
    W = cssW; H = cssH; dpr = ratio || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    scale = W / scenario.map.widthPx;
    u = Math.max(0.7, Math.min(1.3, W / 1000));
    const base = Math.min(0.85, Math.max(0.6, 0.85 - (N - 10) * 0.25 / 30));
    const f = Math.min(1, Math.max(0, (N - 15) / 10));
    ms = base * (1 - f * (1 - Math.min(1, Math.max(0.8, W / 1100))));
    nk = ms / 0.85;
    un = u * nk;
    render();
  }

  // ---------- frame sampling ----------
  const cur = { x: 0, fa: 0, fb: 0, k: 0, day: 0, tripIdx: -1, p: 0 };
  function sample() {
    const pos = sched.posAt(s);
    cur.x = pos.x; cur.day = pos.day; cur.tripIdx = pos.tripIdx; cur.p = pos.p;
    cur.fa = Math.min(frames.length - 1, Math.floor(pos.x));
    cur.fb = Math.min(frames.length - 1, cur.fa + 1);
    cur.k = pos.x - cur.fa;
  }

  // ---------- update (dt seconds of wall time) ----------
  function update(dt, snap) {
    sample();
    const A = frames[cur.fa], B = frames[cur.fb], k = cur.k;
    clock += dt;
    const route = cur.tripIdx >= 0 ? routes[cur.tripIdx] : null;
    const trip = cur.tripIdx >= 0 ? tl.trips[cur.tripIdx] : null;
    const q = trip ? easeInOutSine(cur.p / TRAVEL_SHARE) : 0;
    const L = route ? q * route.total : 0;
    // arrival lengths by node
    let arrive = null;
    if (trip) {
      arrive = new Map();
      trip.route.forEach((id, i) => { if (id !== 'facility' && trip.collectedKg[id] != null && !arrive.has(id)) arrive.set(id, route.stops[i]); });
    }
    const a1 = snap ? 1 : 1 - Math.exp(-dt * 12);
    for (let j = 0; j < N; j++) {
      const na = A.nodes[j], nb = B.nodes[j];
      let target = lerp(na.fillPct, nb.fillPct, k);
      if (arrive && arrive.has(order[j]) && L >= arrive.get(order[j]) - 1) target = 0;
      else if (trip && cur.p >= 1 && trip.collectedKg[order[j]] != null) target = 0;
      dispFill[j] += (target - dispFill[j]) * (target === 0 && dispFill[j] > 5 ? 1 - Math.exp(-dt * 7) : a1);
      // a full bin stays alarmed until it is emptied (overflowKg is 0 at night when nothing is generated)
      const ovT = na.fillPct >= 99.95 || na.overflowKg > 0 ? 1 : 0;
      ovI[j] += (ovT - ovI[j]) * (snap ? 1 : 1 - Math.exp(-dt * (ovT > ovI[j] ? 9 : 2.2)));
      flash[j] = Math.max(0, flash[j] - dt * 3.5);
      if (snap || dt <= 0) continue;
      const gen = lerp(na.genKg, nb.genKg, k);
      dotAcc[j] += Math.min(MAX_DOT_RATE, gen * DOTS_PER_KG) * dt;
      while (dotAcc[j] >= 1) { dotAcc[j] -= 1; spawnFlow(j); }
      if (na.overflowKg > 0) {
        spillAcc[j] += SPILL_RATE * Math.min(1, 0.45 + na.overflowKg / 2) * dt;
        while (spillAcc[j] >= 1) { spillAcc[j] -= 1; spawnSpill(j); }
      }
    }
    // dots
    for (const d of dots) {
      if (!d.on) continue;
      d.age += dt;
      if (d.age >= d.life) {
        d.on = false;
        if (d.kind === 0) flash[d.j] = Math.min(1, flash[d.j] + 0.22);
        else addLitter(d.j, d.ex, d.ey, 0);
      }
    }
    for (const sp of litter) sp.age += dt;
    // facility
    const sortDelta = Math.max(0, B.facility.sortedKgCum - A.facility.sortedKgCum);
    sortAct += ((sortDelta > 0.01 ? 1 : 0) - sortAct) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    const qT = Math.min(1, lerp(A.facility.queueKg, B.facility.queueKg, k) / maxQueue);
    queueDisp += (qT - queueDisp) * (snap ? 1 : 1 - Math.exp(-dt * 6));
    facPulse = Math.max(0, facPulse - dt * 1.4);
    if (trip && q > 0.97 && !update.arrived) { facPulse = 1; update.arrived = true; }
    if (!trip) update.arrived = false;
    facGlow = 0.28 + 0.3 * sortAct + 0.1 * queueDisp;
  }

  // ---------- drawing ----------
  function drawGlow(rgb, x, y, r, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function render() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    sample();
    const trip = cur.tripIdx >= 0 ? tl.trips[cur.tripIdx] : null;
    const route = trip ? routes[cur.tripIdx] : null;
    const q = trip ? easeInOutSine(cur.p / TRAVEL_SHARE) : 0;
    const L = route ? q * route.total : 0;
    const fade = trip ? 1 - smoothstep((cur.p - TRAVEL_SHARE) / (1 - TRAVEL_SHARE)) : 0;
    const fac = scenario.facility;

    // litter specks (settled, faded)
    ctx.fillStyle = '#E9E4D8';
    for (const sp of litter) {
      const n = nodes[sp.j];
      const a = 0.95 - 0.5 * smoothstep(sp.age / 7);
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(nodeRgb[sp.j], 1);
      ctx.beginPath();
      ctx.arc(n.x * scale + sp.ox * un, n.y * scale + sp.oy * un, sp.r * 1.5 * un, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // facility glow + queue
    if (fac) {
      const fx = fac.x * scale, fy = fac.y * scale;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(lime, fx, fy, (34 + 18 * facPulse) * u, Math.min(1, facGlow + 0.5 * facPulse));
      ctx.globalCompositeOperation = 'source-over';
      const bw = 52 * u, bh = 5 * u, bx = fx - bw / 2, by = fy + 26 * u;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(8,20,16,0.55)'; rrect(bx, by, bw, bh, bh / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(239,234,224,0.22)'; ctx.lineWidth = 1; ctx.stroke();
      if (queueDisp > 0.01) {
        ctx.fillStyle = rgba(queueDisp > 0.7 ? hexToRgb(ui.fillColors.amber) : lime, 0.95);
        rrect(bx, by, Math.max(bh, bw * queueDisp), bh, bh / 2); ctx.fill();
      }
      ctx.font = `500 ${Math.round(10.5 * u + 1)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(239,234,224,0.7)';
      ctx.fillText('queue', fx, by + bh + 11 * u + 1);
    }

    // route line
    if (route && fade > 0.01) {
      const stride = 1;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(route.xs[0] * scale, route.ys[0] * scale);
        for (let i = stride; i < route.xs.length && route.cum[i] <= L; i += stride) ctx.lineTo(route.xs[i] * scale, route.ys[i] * scale);
        const e = route.at(L);
        ctx.lineTo(e[0] * scale, e[1] * scale);
      };
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, a, col] of [[11, 0.08, lime], [5, 0.2, lime], [1.8, 0.9, [235, 255, 200]]]) {
        trace(); ctx.lineWidth = w * u; ctx.strokeStyle = rgba(col, a * fade); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // flow + spill dots (additive)
    ctx.globalCompositeOperation = 'lighter';
    for (const d of dots) {
      if (!d.on) continue;
      const t = d.age / d.life, n = nodes[d.j];
      let e, alpha;
      if (d.kind === 0) {
        e = t * t * (3 - 2 * t);
        alpha = Math.min(1, t * 5) * (1 - smoothstep((t - 0.82) / 0.18) * 0.8);
      } else {
        e = 1 - (1 - t) * (1 - t);
        alpha = (1 - t * 0.5);
      }
      const m = 1 - e;
      const ox = m * m * d.sx + 2 * m * e * d.cx + e * e * d.ex;
      const oy = m * m * d.sy + 2 * m * e * d.cy + e * e * d.ey;
      const rgb = d.kind === 0 ? nodeRgb[d.j] : lerpRgb(nodeRgb[d.j], [233, 228, 216], 0.4);
      drawGlow(rgb, n.x * scale + ox * un, n.y * scale + oy * un, d.size * 5 * un, alpha);
    }
    ctx.globalAlpha = 1;

    // node halos, overflow rings, meters
    const pulseT = clock;
    for (let j = 0; j < N; j++) {
      const n = nodes[j], nx = n.x * scale, ny = n.y * scale;
      const pct = dispFill[j];
      const col = fillColor(pct);
      ctx.globalCompositeOperation = 'lighter';
      if (flash[j] > 0.01) drawGlow(nodeRgb[j], nx, ny, 22 * un, flash[j] * 0.55);
      if (ovI[j] > 0.03) {
        drawGlow(red, nx, ny, (26 + 3 * Math.sin(pulseT * 4.2)) * un, ovI[j] * 0.34);
        ctx.lineWidth = 1.6 * un;
        for (let r = 0; r < 2; r++) {
          const ph = (pulseT * 0.72 + r * 0.5 + j * 0.13) % 1;
          ctx.globalAlpha = (1 - ph) * (1 - ph) * 0.7 * ovI[j];
          ctx.strokeStyle = rgba(red, 1);
          ctx.beginPath(); ctx.arc(nx, ny, (10 + 26 * ph) * un, 0, 6.2832); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      // meter
      const mw = 6.5 * un + 1, mh = 34 * un, mx = nx + 13 * ms + 4, my = ny - mh / 2;
      ctx.fillStyle = 'rgba(8,20,16,0.62)'; rrect(mx - 1.5, my - 1.5, mw + 3, mh + 3, (mw + 3) / 2); ctx.fill();
      ctx.strokeStyle = ovI[j] > 0.3 ? rgba(red, 0.35 + 0.4 * ovI[j]) : 'rgba(239,234,224,0.22)';
      ctx.lineWidth = 1; ctx.stroke();
      const fh = Math.max(0, Math.min(1, pct / 100)) * mh;
      if (fh > 0.5) {
        ctx.save();
        rrect(mx, my, mw, mh, mw / 2); ctx.clip();
        const g = ctx.createLinearGradient(0, my + mh, 0, my + mh - fh);
        g.addColorStop(0, rgba(col, 0.78)); g.addColorStop(1, rgba(col, 1));
        ctx.fillStyle = g; ctx.fillRect(mx, my + mh - fh, mw, fh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(mx, my + mh - fh, mw, 1.2);
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(col, mx + mw / 2, my + mh - fh, 9 * un, 0.22);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // truck
    if (route && fade > 0.01) {
      const p = route.at(L), ang = route.angleAt(L);
      const x = p[0] * scale, y = p[1] * scale;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(lime, x, y, 26 * u, 0.55 * fade);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1.35, 1.35); ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; rrect(-10 * u + 1, -5 * u + 2, 21 * u, 10 * u, 3 * u); ctx.fill();
      ctx.fillStyle = '#E8F7C4'; rrect(-10 * u, -5 * u, 14 * u, 10 * u, 2.5 * u); ctx.fill();
      ctx.fillStyle = '#C6F36B'; rrect(4 * u, -4.4 * u, 7 * u, 8.8 * u, 2.5 * u); ctx.fill();
      ctx.fillStyle = '#10241D'; rrect(7.2 * u, -3.2 * u, 2.8 * u, 6.4 * u, 1 * u); ctx.fill();
      ctx.globalAlpha = 1; ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function lerpRgb(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }

  // ---------- HUD + store reporting ----------
  let hudKey = '';
  function hudState() {
    const A = frames[cur.fa];
    let over = 0;
    for (const nd of A.nodes) if (nd.fillPct >= 99.95 || nd.overflowKg > 0) over++; // full bins, not just this hour's spill
    return {
      day: cur.day + 1, days: sched.days, hour: cur.fa % 24, playing, speed, done,
      progress: s / sched.total, overflowing: over, litterKg: A.litterKgCum, sortedKg: A.facility.sortedKgCum,
      which, hasTrip: cur.tripIdx >= 0,
    };
  }
  function report(force) {
    const st = hudState();
    const key = [st.day, st.hour, st.playing, st.speed, st.done, st.overflowing, Math.round(st.litterKg), Math.round(st.sortedKg), Math.round(st.progress * 400)].join('|');
    if (hud && key !== hudKey) { hudKey = key; hud.update(st); }
    const now = clock * 1000;
    if (onUpdate && (force || now - lastWrite > HUD_WRITE_MS)) {
      lastWrite = now;
      onUpdate({ t: Math.floor(cur.x), playing, speed, done });
    }
  }

  // ---------- loop ----------
  function tick(ts) {
    if (!playing) return;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    s += dt * speed;
    if (s >= sched.total) { s = sched.total; update(dt, false); render(); finish(); return; }
    update(dt, false);
    render();
    report(false);
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    playing = false; done = true; cancelAnimationFrame(raf); raf = 0;
    report(true);
  }
  function refresh(snap) { update(0, true); render(); report(true); }

  function seekSeconds(sec) {
    s = Math.max(0, Math.min(sched.total, sec));
    done = s >= sched.total && !playing;
    dots.forEach((d) => (d.on = false));
    sample(); rebuildLitter(cur.x);
    update(0, true);
    render(); report(true);
  }

  const api = {
    play() {
      if (reduced) { api.skipToEnd(); return; }
      if (s >= sched.total) seekSeconds(0);
      done = false;
      if (playing) return;
      playing = true; lastTs = 0;
      raf = requestAnimationFrame(tick);
      report(true);
    },
    pause() { if (!playing) return; playing = false; cancelAnimationFrame(raf); raf = 0; report(true); },
    setSpeed(v) { speed = v === 2 || v === 4 ? v : 1; report(true); },
    seek(t) { seekSeconds(sched.secondsOfFrame(t)); },
    seekFraction(f) { seekSeconds(clamp01(f) * sched.total); },
    skipToEnd() {
      const was = playing; playing = false; cancelAnimationFrame(raf); raf = 0;
      seekSeconds(sched.total);
      done = true; report(true);
    },
    restart() { playing = false; cancelAnimationFrame(raf); seekSeconds(0); done = false; api.play(); },
    resize,
    setWhich(w) { which = w; },
    getState: () => ({ s, playing, speed, done, x: cur.x, day: cur.day, total: sched.total, tripIdx: cur.tripIdx, p: cur.p, schedule: { pause: sched.pause, trips: sched.nTrips } }),
    destroy() { playing = false; cancelAnimationFrame(raf); raf = 0; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); },
  };
  update.arrived = false;
  sample();
  return api;
}

// ---------------------------------------------------------------------------
let debugRef = null;
export const debugPlayer = () => debugRef;

export function mount(el, store) {
  let canvas = el.querySelector('#map-anim-layer') || el.querySelector('canvas');
  const ownCanvas = !canvas;
  if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'map-anim-layer'; el.appendChild(canvas); }
  const img = el.querySelector('#map-image');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  canvas.classList.add('anim-canvas');

  let player = null, curRes = null, curScenario = null, curWhich = null, lastWritten = null;

  const hud = createHud(el, {
    onPlay: () => (player && (player.getState().done ? player.restart() : player.getState().playing ? player.pause() : player.play())),
    onSpeed: (v) => player && player.setSpeed(v),
    onSkip: () => player && player.skipToEnd(),
    onSeek: (f) => player && player.seekFraction(f),
  });

  function layout() {
    const r = img ? img.getBoundingClientRect() : el.getBoundingClientRect();
    if (!r.width) return;
    canvas.style.position = 'absolute';
    // offsets are relative to the canvas's positioned ancestor (it may be a wrapper inside `el`)
    const host = canvas.offsetParent || el;
    const hr = host.getBoundingClientRect();
    canvas.style.left = `${r.left - hr.left - host.clientLeft + host.scrollLeft}px`;
    canvas.style.top = `${r.top - hr.top - host.clientTop + host.scrollTop}px`;
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    if (player) player.resize(r.width, r.height, window.devicePixelRatio || 1);
  }
  const ro = new ResizeObserver(layout);
  ro.observe(el); if (img) { ro.observe(img); img.addEventListener('load', layout); }

  function write(patch) {
    const pb = { ...store.get().playback, ...patch, which: curWhich };
    lastWritten = pb;
    store.set({ playback: pb });
  }

  function destroyPlayer() {
    if (player) player.destroy();
    player = null; curRes = null; debugRef = null;
    hud.hide();
  }

  function build(s) {
    const useOpt = s.playback.which === 'optimised' && s.optimised;
    const res = useOpt ? s.optimised.results : s.baseline && s.baseline.results;
    curWhich = useOpt ? 'optimised' : 'baseline';
    if (player) player.destroy();
    curRes = res; curScenario = s.scenario;
    player = createPlayer(canvas, {
      scenario: s.scenario, results: res, ui: s.ui, hud,
      onUpdate: (p) => {
        const wasDone = store.get().playback.done;
        write(p);
        if (p.done && !wasDone) {
          const mode = store.get().mode;
          lastWritten = null;
          if (mode === 'running') store.set({ mode: 'results' });
        }
      },
    });
    player.setWhich(curWhich);
    debugRef = player;
    hud.show();
    layout();
  }

  function onState(s, prev) {
    const useOpt = s.playback.which === 'optimised' && s.optimised;
    const res = useOpt ? s.optimised.results : s.baseline && s.baseline.results;
    if (!res || !s.scenario || s.mode === 'edit') { if (player) destroyPlayer(); return; }
    const which = useOpt ? 'optimised' : 'baseline';
    const entered = !prev || s.mode !== prev.mode || which !== curWhich;
    const auto = s.mode === 'running' || (s.mode === 'compare' && which === 'optimised' && !s.playback.done);
    const rebuilt = res !== curRes || s.scenario !== curScenario;
    if (rebuilt) {
      build(s);
      if (auto) player.restart(); else player.skipToEnd();
      return;
    }
    if (entered && auto) { curWhich = which; player.setWhich(which); player.restart(); return; }
    if (s.playback === lastWritten || !player) return;
    // external playback commands
    const pb = s.playback, st = player.getState();
    if (pb.speed !== st.speed) player.setSpeed(pb.speed);
    if (pb.playing && !st.playing) { st.done ? player.restart() : player.play(); }
    else if (!pb.playing && st.playing) player.pause();
  }

  const unsub = store.subscribe(onState);
  onState(store.get(), null);

  return function unmount() {
    unsub(); ro.disconnect();
    if (img) img.removeEventListener('load', layout);
    destroyPlayer(); hud.destroy();
    if (ownCanvas) canvas.remove();
  };
}
