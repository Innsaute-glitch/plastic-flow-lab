// Scenario JSON + CSV import/export, demo loading.
import { loadScenario, exportScenario, editScenario } from './actions.js';
import { csvToNodes, MAX_NODES, slugify, rescaleToImage } from './scenario-utils.js';
import { notify } from './notify.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
export const assetUrl = (src) => (/^(data:|blob:|https?:|\/)/.test(src) ? src : `${BASE}${src}`);

const DEMO_FILES = { before: 'demo/demo-scenario.json', after: 'demo/demo-scenario-after.json' };

export async function loadDemo(store, which = 'before') {
  try {
    const res = await fetch(`${BASE}${DEMO_FILES[which] ?? DEMO_FILES.before}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const scenario = await res.json();
    if (loadScenario(store, scenario)) notify('info', `Loaded ${scenario.name ?? 'demo scenario'}.`);
  } catch (err) {
    console.error('[app] loadDemo failed:', err.message);
    notify('error', `Could not load the demo scenario: ${err.message}`);
  }
}

export function downloadScenario(store) {
  const scenario = exportScenario(store);
  const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(scenario.name) || slugify(scenario.id) || 'scenario'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importCsvText(store, text) {
  const { assumptions, ui } = store.get();
  try {
    const { nodes, nodeSetups, warnings } = csvToNodes(text, assumptions, Object.keys(ui.wasteTypeLabels));
    editScenario(store, (s) => {
      s.nodes = nodes;
      s.baselineSetup.nodes = nodeSetups;
      s.lastProposal = null;
    }, { selectedNodeId: null, tool: nodes.some((n) => n.x == null) ? 'add-node' : 'select' });
    warnings.forEach((w) => notify('warn', w));
    const unplaced = nodes.filter((n) => n.x == null).length;
    notify('info', `Imported ${nodes.length} nodes${unplaced ? `. Click the map to place ${unplaced}.` : '.'}`);
  } catch (err) {
    console.error('[app] CSV import failed:', err.message);
    notify('error', `CSV import failed: ${err.message}`);
  }
}

export async function importFile(store, file) {
  if (!file) return;
  try {
    const text = await file.text();
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') importCsvText(store, text);
    else if (loadScenario(store, JSON.parse(text))) notify('info', `Imported ${file.name}.`);
  } catch (err) {
    console.error('[app] import failed:', err.message);
    notify('error', `Could not import ${file.name}: ${err.message}`);
  }
}

export function changeMapImage(store, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => notify('error', 'Could not read the image file.');
  reader.onload = () => {
    const src = String(reader.result);
    const img = new Image();
    img.onerror = () => notify('error', 'That file is not a usable image.');
    img.onload = () => {
      const w = img.naturalWidth || 1600, h = img.naturalHeight || 1000;
      editScenario(store, (s) => {
        const next = rescaleToImage(s, w, h);
        s.map = next.map;
        s.nodes = next.nodes;
        s.facility = next.facility;
        s.map.src = src;
      }, { tool: 'calibrate' });
      notify('info', 'Map changed. Node positions were scaled to the new image: drag them onto the right spots, then calibrate the scale. Keep the image\'s attribution.');
    };
    img.src = src;
  };
  reader.readAsDataURL(file);
}

export { MAX_NODES };
