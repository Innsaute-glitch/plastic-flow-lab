// Top bar: title, mode chip, Demo toggle, Load demo, Import/Export, Assumptions.
import { icon } from './icons.js';
import { newScenario, renameScenario } from './actions.js';
import { loadDemo, importFile, downloadScenario } from './io.js';

const MODE_LABEL = { edit: 'Editing', running: 'Running', results: 'Results', optimising: 'Optimising', compare: 'Compare' };

export function mount(el, store) {
  el.innerHTML = `
    <div class="tb-brand">
      <span class="tb-logo">${icon('logo', 22)}</span>
      <span class="tb-title">Plastic Flow Lab</span>
      <button type="button" class="tb-name" id="tb-name" title="Rename scenario" aria-label="Scenario name, click to rename"><span class="tb-name__text"></span>${icon('pencil', 13)}</button>
    </div>
    <div class="tb-right">
      <span class="tb-mode" id="tb-mode"><i></i><span></span></span>
      <button class="app-btn app-btn--ghost" id="tb-edit" hidden title="Back to editing the map">${icon('cursor', 16)}<span>Edit</span></button>
      <label class="app-switch-row" title="Demo mode: replay a cached AI proposal, no network needed">
        ${icon('flask', 16)}<span>Demo</span>
        <span class="app-switch"><input type="checkbox" id="tb-demo" aria-label="Demo mode" /><i></i></span>
      </label>
      <span class="tb-sep"></span>
      <div class="tb-menu-wrap">
        <button class="app-btn" id="tb-load" title="Load a demo or start blank" aria-haspopup="menu" aria-expanded="false" aria-controls="tb-demo-menu">${icon('map', 16)}<span>Load demo</span><span class="tb-chev">${icon('chevron', 14)}</span></button>
        <div class="tb-menu" id="tb-demo-menu" role="menu" hidden>
          <button class="tb-menu__item" role="menuitem" data-demo="before"><b>Thapar 2023 · before Saahas</b><span>Mixed bins, the starting point</span></button>
          <button class="tb-menu__item" role="menuitem" data-demo="after"><b>Thapar 2024 · after Saahas</b><span>Segregated bins, what Thapar did</span></button>
          <div class="tb-menu__div" role="separator"></div>
          <button class="tb-menu__item" role="menuitem" data-action="blank"><b>Blank campus</b><span>Start from scratch on this map</span></button>
        </div>
      </div>
      <button class="app-btn app-btn--icon" id="tb-import" title="Import scenario (.json) or nodes (.csv)" aria-label="Import">${icon('upload', 17)}</button>
      <button class="app-btn app-btn--icon" id="tb-export" title="Export scenario as JSON" aria-label="Export">${icon('download', 17)}</button>
      <button class="app-btn" id="tb-assume" title="Show model assumptions">${icon('sliders', 16)}<span>Assumptions</span></button>
      <input type="file" id="tb-file" accept=".json,.csv,application/json,text/csv" hidden />
    </div>`;
  const $ = (id) => el.querySelector('#' + id);
  const file = $('tb-file');

  const loadBtn = $('tb-load');
  const menu = $('tb-demo-menu');
  const setMenu = (open, focusBtn = false) => {
    menu.hidden = !open;
    loadBtn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('[role="menuitem"]').focus();
    else if (focusBtn) loadBtn.focus();
  };
  loadBtn.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-demo], [data-action]');
    if (!item) return;
    setMenu(false, true);
    if (item.dataset.action === 'blank') newScenario(store);
    else loadDemo(store, item.dataset.demo);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });
  const onDocClick = (e) => { if (!menu.hidden && !e.target.closest('.tb-menu-wrap')) setMenu(false); };
  const onKey = (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); setMenu(false, true); } };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
  $('tb-import').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    importFile(store, file.files[0]);
    file.value = '';
  });
  $('tb-export').addEventListener('click', () => downloadScenario(store));
  $('tb-assume').addEventListener('click', () => store.set({ panel: store.get().panel === 'assumptions' ? null : 'assumptions' }));
  $('tb-demo').addEventListener('change', (e) => store.set({ demoMode: e.target.checked }));
  $('tb-edit').addEventListener('click', () => store.set({ mode: 'edit', playback: { ...store.get().playback, playing: false } }));

  const nameBtn = $('tb-name');
  let editing = null;
  const startRename = () => {
    const s = store.get();
    if (editing || s.mode === 'optimising') return;
    const btn = nameBtn;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tb-name-input';
    input.maxLength = 60;
    input.value = s.scenario.name;
    input.setAttribute('aria-label', 'Scenario name');
    editing = input;
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      editing = null;
      const name = input.value.trim();
      input.replaceWith(btn);
      if (save && name && name !== store.get().scenario.name) renameScenario(store, name);
      if (save === 'focus' || save === false) btn.focus();
      render(store.get());
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish('focus'); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('blur', () => finish(true));
    btn.replaceWith(input);
    input.focus();
    input.select();
  };
  nameBtn.addEventListener('click', startRename);

  function render(s) {
    nameBtn.querySelector('.tb-name__text').textContent = s.scenario.name;
    nameBtn.setAttribute('aria-disabled', String(s.mode === 'optimising'));
    nameBtn.title = s.mode === 'optimising' ? 'Cannot rename while optimising' : 'Rename scenario';
    $('tb-demo').checked = s.demoMode;
    const mode = $('tb-mode');
    mode.dataset.mode = s.mode;
    mode.querySelector('span').textContent = MODE_LABEL[s.mode] ?? s.mode;
    $('tb-edit').hidden = !(s.mode === 'results' || s.mode === 'compare');
    $('tb-assume').classList.toggle('is-active', s.panel === 'assumptions');
  }
  render(store.get());
  const unsub = store.subscribe(render);
  return () => {
    unsub();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
  };
}
