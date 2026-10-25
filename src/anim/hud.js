// Glassy HUD: real DOM buttons over the canvas. Pure view; calls handlers, never touches the store.
const ICON = {
  play: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 4v5.5h5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  skip: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 5.5v13l9-6.5z" fill="currentColor"/><rect x="16" y="5.5" width="3" height="13" rx="1.2" fill="currentColor"/></svg>',
};

export function createHud(el, h) {
  const root = document.createElement('div');
  root.className = 'anim-hud';
  root.hidden = true;
  root.innerHTML = `
    <div class="anim-hud__run" data-k="which"></div>
    <div class="anim-hud__panel">
      <div class="anim-hud__top">
        <span class="anim-hud__day"><span class="anim-hud__daynum">Day 1</span><span class="anim-hud__daytot"> / 30</span></span>
        <span class="anim-hud__clock">00:00</span>
        <span class="anim-chip anim-chip--over" data-k="over"><i></i><b>0</b> bins full</span>
      </div>
      <div class="anim-hud__chips">
        <span class="anim-chip" data-k="litter"><b>0</b> kg litter</span>
        <span class="anim-chip" data-k="sorted"><b>0</b> kg sorted</span>
      </div>
      <div class="anim-hud__bar">
        <button type="button" class="anim-btn anim-btn--main" data-k="play" aria-label="Play or pause"></button>
        <input class="anim-scrub" type="range" min="0" max="1000" value="0" aria-label="Playback position" />
        <div class="anim-speed" role="group" aria-label="Speed">
          <button type="button" data-speed="1">1×</button><button type="button" data-speed="2">2×</button><button type="button" data-speed="4">4×</button>
        </div>
        <button type="button" class="anim-btn" data-k="skip" aria-label="Skip to end" title="Skip to end">${ICON.skip}</button>
      </div>
    </div>`;
  el.appendChild(root);
  const q = (s) => root.querySelector(s);
  const playBtn = q('[data-k=play]'), scrub = q('.anim-scrub');
  let dragging = false, last = {};
  playBtn.addEventListener('click', () => h.onPlay());
  q('[data-k=skip]').addEventListener('click', () => h.onSkip());
  root.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => h.onSpeed(+b.dataset.speed)));
  scrub.addEventListener('pointerdown', () => (dragging = true));
  scrub.addEventListener('pointerup', () => (dragging = false));
  scrub.addEventListener('input', () => h.onSeek(scrub.value / 1000));
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('click', (e) => e.stopPropagation());

  const set = (sel, v) => { const n = q(sel); if (n.textContent !== v) n.textContent = v; };
  return {
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    destroy() { root.remove(); },
    update(st) {
      set('.anim-hud__daynum', `Day ${st.day}`);
      set('.anim-hud__daytot', ` / ${st.days}`);
      set('.anim-hud__clock', `${String(st.hour).padStart(2, '0')}:00`);
      set('[data-k=over] b', String(st.overflowing));
      root.classList.toggle('is-overflowing', st.overflowing > 0);
      set('[data-k=litter] b', st.litterKg.toFixed(st.litterKg < 100 ? 1 : 0));
      set('[data-k=sorted] b', Math.round(st.sortedKg).toLocaleString('en-IN'));
      set('[data-k=which]', st.which === 'optimised' ? 'Optimised plan' : 'Baseline');
      root.dataset.which = st.which;
      const icon = st.done ? 'replay' : st.playing ? 'pause' : 'play';
      if (last.icon !== icon) { playBtn.innerHTML = ICON[icon]; last.icon = icon; }
      if (!dragging) scrub.value = Math.round(st.progress * 1000);
      scrub.style.setProperty('--p', `${st.progress * 100}%`);
      root.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('is-on', +b.dataset.speed === st.speed));
    },
  };
}
