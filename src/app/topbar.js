// Top bar: title, mode chip, Demo toggle, Load demo, Import/Export, Assumptions.
import { icon } from './icons.js';
import { loadDemo, importFile, downloadScenario } from './io.js';

const MODE_LABEL = { edit: 'Editing', running: 'Running', results: 'Results', optimising: 'Optimising', compare: 'Compare' };

export function mount(el, store) {
  el.innerHTML = `
    <div class="tb-brand">
      <span class="tb-logo">${icon('logo', 22)}</span>
      <span class="tb-title">Plastic Flow Lab</span>
      <span class="tb-name" id="tb-name"></span>
    </div>
    <div class="tb-right">
      <span class="tb-mode" id="tb-mode"><i></i><span></span></span>
      <button class="app-btn app-btn--ghost" id="tb-edit" hidden title="Back to editing the map">${icon('cursor', 16)}<span>Edit</span></button>
      <label class="app-switch-row" title="Demo mode: replay a cached AI proposal, no network needed">
        ${icon('flask', 16)}<span>Demo</span>
        <span class="app-switch"><input type="checkbox" id="tb-demo" aria-label="Demo mode" /><i></i></span>
      </label>
      <span class="tb-sep"></span>
      <button class="app-btn" id="tb-load" title="Load the demo scenario">${icon('map', 16)}<span>Load demo</span></button>
      <button class="app-btn app-btn--icon" id="tb-import" title="Import scenario (.json) or nodes (.csv)" aria-label="Import">${icon('upload', 17)}</button>
      <button class="app-btn app-btn--icon" id="tb-export" title="Export scenario as JSON" aria-label="Export">${icon('download', 17)}</button>
      <button class="app-btn" id="tb-assume" title="Show model assumptions">${icon('sliders', 16)}<span>Assumptions</span></button>
      <input type="file" id="tb-file" accept=".json,.csv,application/json,text/csv" hidden />
    </div>`;
  const $ = (id) => el.querySelector('#' + id);
  const file = $('tb-file');

  $('tb-load').addEventListener('click', () => loadDemo(store));
  $('tb-import').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    importFile(store, file.files[0]);
    file.value = '';
  });
  $('tb-export').addEventListener('click', () => downloadScenario(store));
  $('tb-assume').addEventListener('click', () => store.set({ panel: store.get().panel === 'assumptions' ? null : 'assumptions' }));
  $('tb-demo').addEventListener('change', (e) => store.set({ demoMode: e.target.checked }));
  $('tb-edit').addEventListener('click', () => store.set({ mode: 'edit', playback: { ...store.get().playback, playing: false } }));

  function render(s) {
    $('tb-name').textContent = s.scenario.name;
    $('tb-demo').checked = s.demoMode;
    const mode = $('tb-mode');
    mode.dataset.mode = s.mode;
    mode.querySelector('span').textContent = MODE_LABEL[s.mode] ?? s.mode;
    $('tb-edit').hidden = !(s.mode === 'results' || s.mode === 'compare');
    $('tb-assume').classList.toggle('is-active', s.panel === 'assumptions');
  }
  render(store.get());
  return store.subscribe(render);
}
