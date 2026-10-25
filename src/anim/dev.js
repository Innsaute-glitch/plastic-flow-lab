// Standalone harness: a minimal store, fixtures, and fake edit-layer markers. Not imported by the app.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/600.css';
import { mount, debugPlayer } from './player.js';
window.__player = debugPlayer;

function createStore(init) {
  let st = init; const subs = new Set();
  return {
    get: () => st,
    set(patch) { const prev = st; st = { ...st, ...patch }; subs.forEach((f) => f(st, prev)); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}
const j = (p) => fetch(p).then((r) => r.json());
const [scenario, ui, base, opt] = await Promise.all([
  j('/fixtures/scenario.demo.json'), j('/config/ui.json'), j('/fixtures/results.baseline.json'), j('/fixtures/results.optimised.json'),
]);
const qs = new URLSearchParams(location.search);
if (qs.get('full')) document.body.classList.add('full');

const store = createStore({
  scenario, ui, mode: 'edit', baseline: null, optimised: null,
  playback: { t: 0, playing: false, speed: 1, done: false, which: 'baseline' },
});
window.__store = store;

// stand-in for Task 3's edit markers (so overlap with the canvas is visible)
const svg = document.getElementById('map-edit-layer');
const NS = 'http://www.w3.org/2000/svg';
for (const n of scenario.nodes) {
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', n.x); c.setAttribute('cy', n.y); c.setAttribute('r', 11);
  c.setAttribute('fill', ui.resinColors[ui.wasteTypeColorKey[n.wasteType]]); c.setAttribute('stroke', '#EFEAE0'); c.setAttribute('stroke-width', 2);
  svg.appendChild(c);
}
const f = document.createElementNS(NS, 'rect');
f.setAttribute('x', scenario.facility.x - 14); f.setAttribute('y', scenario.facility.y - 14); f.setAttribute('width', 28); f.setAttribute('height', 28);
f.setAttribute('rx', 6); f.setAttribute('fill', '#C6F36B'); svg.appendChild(f);

mount(document.getElementById('map-stage'), store);

const status = document.getElementById('status');
store.subscribe((s) => { status.textContent = `mode=${s.mode} which=${s.playback.which} t=${s.playback.t} playing=${s.playback.playing} done=${s.playback.done}`; });
document.getElementById('b-base').onclick = () => store.set({ baseline: { setup: scenario.baselineSetup, results: base }, optimised: null, playback: { t: 0, playing: false, speed: 1, done: false, which: 'baseline' }, mode: 'running' });
document.getElementById('b-opt').onclick = () => store.set({ baseline: { setup: scenario.baselineSetup, results: base }, optimised: { proposal: null, results: opt }, playback: { t: 0, playing: false, speed: 1, done: false, which: 'optimised' }, mode: 'compare' });
document.getElementById('b-edit').onclick = () => store.set({ baseline: null, optimised: null, mode: 'edit' });
if (qs.get('run') === 'baseline') document.getElementById('b-base').click();
if (qs.get('run') === 'optimised') document.getElementById('b-opt').click();
