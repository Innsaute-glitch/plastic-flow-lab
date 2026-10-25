// Assumptions drawer. Reads store.assumptions (effective set) and store.assumptionsBase (unmodified config).
// Open when store.get().panel === "assumptions". Close via ×, Esc or backdrop click.
// Editable rows (config/ui.json editableAssumptions) write scenario.assumptionOverrides.
// Contract: plan.md §3.1 "Assumption overrides"; pure helpers in src/shared/assumptions.js.

import { applyOverrides, validateOverrides } from '../shared/assumptions.js';
import './assumptions.css';

const ARROW = ' – ';
const FOOTER_TEXT = 'All outputs are model results computed from these assumptions.';
const NOTE_TEXT = 'Edit costs to test other prices. Saved with the scenario; re-run to see the effect.';
const METHOD_COLUMNS = [
  { header: 'Accuracy', key: 'accuracy', kind: 'fraction' },
  { header: 'Contaminant detection', key: 'contaminantDetection', kind: 'fraction' },
  { header: 'Throughput', key: 'throughputKgPerDay', kind: 'kg' },
  { header: 'Process loss', key: 'processLossFraction', kind: 'fraction' },
];
const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// "resinMix" -> "Resin mix", "pet_bottles" -> "Pet bottles", "allowedCapacitiesL" -> "Allowed capacities L"
function humanise(key) {
  const words = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length === 1 && /[A-Z]/.test(w) ? w : w.toLowerCase()));
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Display label: config/ui.json assumptionLabels first, humanised key as fallback.
function labelFor(key, labels) {
  return labels?.[key] ?? humanise(key);
}

// Fractions 0-1 with a "fraction" unit show as %, at most 1 decimal, no trailing ".0".
function fmtPct(n) {
  return `${Math.round(n * 1000) / 10}%`;
}

function fmtNum(n, unit = '') {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  const u = String(unit);
  let s = u.includes('fraction') && n >= 0 && n <= 1 ? fmtPct(n) : String(n);
  if (u.startsWith('±')) s = `±${s}`;
  return s;
}

function fmtValue(v, unit) {
  if (Array.isArray(v)) {
    const parts = v.map((x) => fmtNum(x, unit));
    return parts.length === 2 ? `${parts[0]}${ARROW}${parts[1]}` : parts.join(', ');
  }
  return fmtNum(v, unit);
}

// Text shown in an editable input. Fraction units are edited as percentages (0.25 shows as 25).
function fieldText(value, percent) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const x = percent ? value * 100 : value;
  return String(Math.round(x * 1e9) / 1e9);
}

// Value at a dotted override path (leaf path, or leaf path + "." + key inside an object value).
function leafAt(root, path) {
  const parts = path.split('.');
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    node = node?.[parts[i]];
    if (isObj(node) && 'value' in node) {
      const rest = parts.slice(i + 1);
      return { leaf: node, key: rest.length ? rest[0] : null };
    }
  }
  return null;
}

function valueAt(root, path) {
  const ref = leafAt(root, path);
  if (!ref) return undefined;
  return ref.key === null ? ref.leaf.value : ref.leaf.value?.[ref.key];
}

function sameOverrides(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

// An object whose values are all objects (e.g. sorting.methods) renders as a table.
function isMethodTable(v) {
  const vals = Object.values(v);
  return vals.length > 0 && vals.every(isObj);
}

function renderMethodTable(methods, labels) {
  const head = ['Method', ...METHOD_COLUMNS.map((c) => c.header)]
    .map((h) => `<th scope="col">${esc(h)}</th>`)
    .join('');
  const rows = Object.entries(methods)
    .map(([id, m]) => {
      const cells = METHOD_COLUMNS.map((c) => {
        const x = m[c.key];
        if (typeof x !== 'number') return '<td>—</td>';
        const text = c.kind === 'kg' ? `${x} kg/day` : fmtNum(x, 'fraction');
        return `<td>${esc(text)}</td>`;
      }).join('');
      return `<tr><th scope="row">${esc(m.label ?? labelFor(id, labels))}</th>${cells}</tr>`;
    })
    .join('');
  return `<div class="assumption-table-wrap"><table class="assumption-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// One editable number field. `path` is the override key; `name` is the accessible name.
function renderField(path, name, shownLabel, value, percent, ctx) {
  const edited = Object.prototype.hasOwnProperty.call(ctx.overrides, path);
  const labelHtml = shownLabel ? `<span class="assumption-field-label">${esc(shownLabel)}</span>` : '';
  const editedHtml = edited ? '<span class="pill assumption-edited">edited</span>' : '';
  const resetHtml = edited
    ? `<button type="button" class="btn-ghost assumption-reset" data-reset-path="${esc(path)}" title="Reset to default" aria-label="Reset ${esc(name)} to default">↺</button>`
    : '';
  return `<div class="assumption-field">${labelHtml}<input class="input assumption-input" type="number" min="0" step="any" value="${esc(fieldText(value, percent))}" data-edit-path="${esc(path)}"${percent ? ' data-percent="1"' : ''} aria-label="${esc(name)}">${editedHtml}${resetHtml}</div>`;
}

function renderRow(row, ctx) {
  const { leaf, label, path } = row;
  const unit = leaf.unit ?? '';
  const v = leaf.value;
  const percent = unit.includes('fraction');
  const unitHtml = unit ? `<span class="assumption-unit muted">${esc(unit)}</span>` : '';
  const pillHtml = leaf.estimate === true ? '<span class="pill pill-warn">estimate</span>' : '';
  const sourceHtml = leaf.source ? `<div class="assumption-source muted">${esc(leaf.source)}</div>` : '';

  let valueHtml = '';
  let extraHtml = '';

  if (ctx.editable.has(path)) {
    if (isObj(v)) {
      const fields = Object.entries(v)
        .map(([k, x]) => renderField(`${path}.${k}`, `${label} ${labelFor(k, ctx.labels)}`, labelFor(k, ctx.labels), x, percent, ctx))
        .join('');
      extraHtml = `${unitHtml ? `<div>${unitHtml}</div>` : ''}<div class="assumption-fields">${fields}</div>`;
    } else {
      valueHtml = `<div class="assumption-value-line">${renderField(path, label, null, v, percent, ctx)}${unitHtml}</div>`;
    }
  } else if (isObj(v) && isMethodTable(v)) {
    extraHtml = renderMethodTable(v, ctx.labels);
    valueHtml = unitHtml ? `<div class="assumption-value-line">${unitHtml}</div>` : '';
  } else if (isObj(v)) {
    const chips = Object.entries(v)
      .map(([k, x]) => `<span class="chip">${esc(labelFor(k, ctx.labels))}: ${esc(fmtNum(x, unit))}</span>`)
      .join('');
    extraHtml = `<div class="assumption-chips">${chips}</div>`;
    valueHtml = unitHtml ? `<div class="assumption-value-line">${unitHtml}</div>` : '';
  } else {
    valueHtml = `<div class="assumption-value-line"><span class="assumption-value mono">${esc(fmtValue(v, unit))}</span>${unitHtml}</div>`;
  }

  return `<div class="assumption-row" data-assumption-row data-path="${esc(path)}">
  <div class="assumption-head">
    <span class="assumption-label">${esc(label)}</span>
    ${pillHtml}
  </div>
  ${valueHtml}
  ${extraHtml}
  ${sourceHtml}
</div>`;
}

// Walk the tree: any object with a `value` key is a leaf. `_meta` is skipped.
function collectRows(obj, rows, labels, prefix) {
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_meta') continue;
    const path = `${prefix}.${k}`;
    if (isObj(v) && 'value' in v) rows.push({ label: labelFor(k, labels), path, leaf: v });
    else if (isObj(v)) collectRows(v, rows, labels, path);
  }
  return rows;
}

function collectSections(assumptions, labels) {
  const sections = [];
  for (const [key, val] of Object.entries(assumptions)) {
    if (key === '_meta' || !isObj(val)) continue;
    const rows = collectRows(val, [], labels, key);
    if (rows.length) sections.push({ key, title: labelFor(key, labels), rows });
  }
  return sections;
}

function renderBody(assumptions, ctx) {
  if (!isObj(assumptions)) return { html: '', values: 0, estimates: 0 };
  const sections = collectSections(assumptions, ctx.labels);
  let values = 0;
  let estimates = 0;
  const html = sections
    .map((s) => {
      values += s.rows.length;
      estimates += s.rows.filter((r) => r.leaf.estimate === true).length;
      return `<section class="assumptions-section" data-section="${esc(s.key)}">
  <h3 class="assumptions-section-title">${esc(s.title)}</h3>
  <div class="assumptions-list">${s.rows.map((r) => renderRow(r, ctx)).join('')}</div>
</section>`;
    })
    .join('');
  return { html, values, estimates };
}

export function mount(el, store) {
  const root = document.createElement('div');
  root.className = 'assumptions-root';
  root.innerHTML = `
<div class="drawer-backdrop" data-role="backdrop"></div>
<aside class="drawer assumptions" role="dialog" aria-modal="true" aria-labelledby="assumptions-title" aria-hidden="true" data-role="drawer">
  <header class="assumptions-header">
    <div class="assumptions-heading">
      <h2 id="assumptions-title">Assumptions</h2>
      <p class="assumptions-note muted">${esc(NOTE_TEXT)}</p>
      <p class="assumptions-count muted" data-role="count"></p>
    </div>
    <div class="assumptions-header-actions">
      <button type="button" class="btn-ghost assumptions-reset-all" data-role="reset-all" hidden>Reset all edits</button>
      <button type="button" class="btn btn-icon" data-role="close" aria-label="Close assumptions">${CLOSE_SVG}</button>
    </div>
  </header>
  <div class="assumptions-body" data-role="body"></div>
  <footer class="assumptions-footer muted">${esc(FOOTER_TEXT)}</footer>
</aside>`;
  el.appendChild(root);

  const backdrop = root.querySelector('[data-role="backdrop"]');
  const drawer = root.querySelector('[data-role="drawer"]');
  const closeBtn = root.querySelector('[data-role="close"]');
  const resetAllBtn = root.querySelector('[data-role="reset-all"]');
  const countEl = root.querySelector('[data-role="count"]');
  const bodyEl = root.querySelector('[data-role="body"]');

  const close = () => store.set({ panel: null });
  const onKey = (e) => {
    if (e.key === 'Escape' && store.get().panel === 'assumptions') close();
  };

  // Writes the override map and the effective set, and clears results (plan.md §3.1 "App state").
  function writeOverrides(overrides) {
    const st = store.get();
    store.set({
      scenario: { ...st.scenario, assumptionOverrides: overrides },
      assumptions: applyOverrides(st.assumptionsBase, overrides),
      baseline: null,
      optimised: null,
      sweep: null,
      mode: 'edit',
    });
  }

  function commitInput(input) {
    const st = store.get();
    const path = input.dataset.editPath;
    const percent = input.dataset.percent === '1';
    const raw = input.value.trim();
    const shown = raw === '' ? NaN : Number(raw);
    const value = percent ? shown / 100 : shown;

    const current = st.scenario?.assumptionOverrides ?? {};
    const next = { ...current };
    if (value === valueAt(st.assumptionsBase, path)) delete next[path];
    else next[path] = value;

    if (validateOverrides(st.assumptionsBase, next).length > 0) {
      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      input.value = fieldText(valueAt(st.assumptions, path), percent);
      return;
    }
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    if (sameOverrides(next, current)) return;
    writeOverrides(next);
  }

  function onBodyChange(e) {
    if (e.target instanceof HTMLInputElement && e.target.dataset.editPath) commitInput(e.target);
  }

  function onBodyInput(e) {
    if (e.target instanceof HTMLInputElement && e.target.dataset.editPath) e.target.classList.remove('is-invalid');
  }

  function onBodyKeydown(e) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.dataset.editPath) {
      e.preventDefault();
      e.target.blur();
    }
  }

  function onBodyClick(e) {
    const btn = e.target.closest?.('[data-reset-path]');
    if (!btn) return;
    const path = btn.dataset.resetPath;
    const current = store.get().scenario?.assumptionOverrides ?? {};
    const next = { ...current };
    delete next[path];
    if (!sameOverrides(next, current)) writeOverrides(next);
  }

  function onResetAll() {
    writeOverrides({});
  }

  let lastAssumptions = undefined;
  let lastUi = undefined;
  let lastBase = undefined;
  let lastOverrides = undefined;
  let wasOpen = false;

  function sync(state) {
    const open = state.panel === 'assumptions';
    backdrop.classList.toggle('is-open', open);
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));

    const overrides = state.scenario?.assumptionOverrides ?? {};
    resetAllBtn.hidden = Object.keys(overrides).length === 0;

    if (
      state.assumptions !== lastAssumptions ||
      state.ui !== lastUi ||
      state.assumptionsBase !== lastBase ||
      overrides !== lastOverrides
    ) {
      lastAssumptions = state.assumptions;
      lastUi = state.ui;
      lastBase = state.assumptionsBase;
      lastOverrides = overrides;
      const ctx = {
        labels: state.ui?.assumptionLabels,
        editable: new Set(state.ui?.editableAssumptions ?? []),
        overrides,
      };
      const { html, values, estimates } = renderBody(state.assumptions, ctx);
      bodyEl.innerHTML = html;
      countEl.textContent = `${values} values · ${estimates} estimates`;
    }

    if (open && !wasOpen) closeBtn.focus();
    wasOpen = open;
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  resetAllBtn.addEventListener('click', onResetAll);
  bodyEl.addEventListener('change', onBodyChange);
  bodyEl.addEventListener('input', onBodyInput);
  bodyEl.addEventListener('keydown', onBodyKeydown);
  bodyEl.addEventListener('click', onBodyClick);
  document.addEventListener('keydown', onKey);
  const unsubscribe = store.subscribe((state) => sync(state));
  sync(store.get());

  return function unmount() {
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    closeBtn.removeEventListener('click', close);
    backdrop.removeEventListener('click', close);
    resetAllBtn.removeEventListener('click', onResetAll);
    bodyEl.removeEventListener('change', onBodyChange);
    bodyEl.removeEventListener('input', onBodyInput);
    bodyEl.removeEventListener('keydown', onBodyKeydown);
    bodyEl.removeEventListener('click', onBodyClick);
    root.remove();
  };
}
