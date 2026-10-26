// Pure layout and pane rules (plan.md section 3.4). No DOM: the shell (shell.js) applies the results.
// The widths below are repeated in layout.css media queries (CSS cannot import JS); keep both in step.
export const BREAKPOINTS = { wideMinW: 1240, mediumMinW: 820, mediumMinH: 560 };
export const HUD_RESERVE_PX = { wide: 116, medium: 116, narrow: 64 };
export const PANES = ['setup', 'map', 'results'];
const MAP_TOOLS = ['add-node', 'place-facility', 'calibrate'];

export function layoutFor(width, height) {
  if (width >= BREAKPOINTS.wideMinW) return 'wide';
  if (width >= BREAKPOINTS.mediumMinW && height >= BREAKPOINTS.mediumMinH) return 'medium';
  return 'narrow';
}

/** The panes a layout lets the user pick between (wide shows all three at once and has no tabs). */
export function tabsFor(layout) {
  if (layout === 'narrow') return PANES;
  if (layout === 'medium') return ['setup', 'results'];
  return [];
}

/** Keep the pane valid for a layout: medium has no Map tab because the map is always on screen. */
export function normalisePane(layout, pane, mode) {
  if (!PANES.includes(pane)) return 'setup';
  if (layout === 'medium' && pane === 'map') return mode === 'edit' ? 'setup' : 'results';
  return pane;
}

/**
 * A mode change switches the pane once; afterwards the user's tap wins.
 * `dots` lists tabs that now hold something new (the shell ignores the tab being shown).
 */
export function paneOnModeChange(layout, pane, prevMode, mode) {
  const keep = { pane, dots: [] };
  if (layout === 'wide' || prevMode === mode) return keep;
  const narrow = layout === 'narrow';
  switch (mode) {
    case 'edit': return { pane: 'setup', dots: [] };
    case 'running': return narrow ? { pane: 'map', dots: ['results'] } : { pane: 'results', dots: [] };
    case 'optimising': return { pane: 'results', dots: [] };
    case 'compare': return { pane: 'results', dots: narrow ? ['map'] : [] };
    case 'results': return { pane, dots: pane === 'results' ? [] : ['results'] };
    default: return keep;
  }
}

/** On narrow, picking Add, Place or Calibrate jumps to the Map (the tool acts on the map). */
export function paneOnToolChange(layout, pane, prevTool, tool) {
  return layout === 'narrow' && tool !== prevTool && MAP_TOOLS.includes(tool) ? 'map' : pane;
}
