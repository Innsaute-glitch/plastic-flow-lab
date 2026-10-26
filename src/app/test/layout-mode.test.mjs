import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutFor, orientFor, isShort, hudReserveFor, tabsFor, normalisePane, paneOnModeChange, paneOnToolChange } from '../layout-mode.js';

const cfg = JSON.parse(readFileSync(new URL('../../../config/ui.json', import.meta.url), 'utf8')).layout;

test('layoutFor: wide from 1240 px, medium 820-1239 and tall enough, narrow otherwise', () => {
  assert.equal(layoutFor(1920, 1080, cfg), 'wide');
  assert.equal(layoutFor(1366, 768, cfg), 'wide');
  assert.equal(layoutFor(1240, 600, cfg), 'wide');
  assert.equal(layoutFor(1239, 768, cfg), 'medium');
  assert.equal(layoutFor(1024, 768, cfg), 'medium');
  assert.equal(layoutFor(820, 560, cfg), 'medium');
  assert.equal(layoutFor(819, 900, cfg), 'narrow');
  assert.equal(layoutFor(768, 1024, cfg), 'narrow');
  assert.equal(layoutFor(844, 390, cfg), 'narrow', 'phone in landscape: short, so narrow');
  assert.equal(layoutFor(1024, 559, cfg), 'narrow', 'short screens are narrow even when wide enough for medium');
  assert.equal(layoutFor(390, 844, cfg), 'narrow');
});

test('HUD reserve comes from config: 116 on wide and medium, 64 on narrow (the seam with the HUD)', () => {
  assert.deepEqual(['wide', 'medium', 'narrow'].map((l) => hudReserveFor(l, cfg)), [116, 116, 64]);
});

test('layoutFor follows whatever thresholds it is given (no numbers baked in)', () => {
  const c = { wideMinWidthPx: 1000, mediumMinWidthPx: 500, mediumMinHeightPx: 300, hudReservePx: { wide: 1, medium: 2, narrow: 3 } };
  assert.equal(layoutFor(1000, 100, c), 'wide');
  assert.equal(layoutFor(600, 300, c), 'medium');
  assert.equal(layoutFor(600, 299, c), 'narrow');
  assert.equal(hudReserveFor('narrow', c), 3);
});

test('orientFor and isShort: portrait when height >= width; short below the medium height', () => {
  assert.equal(orientFor(390, 844), 'portrait');
  assert.equal(orientFor(844, 390), 'landscape');
  assert.equal(orientFor(800, 800), 'portrait');
  assert.equal(isShort(390, cfg), true);
  assert.equal(isShort(559, cfg), true);
  assert.equal(isShort(560, cfg), false);
});

test('tabsFor: three tabs on narrow, Setup and Results on medium, none on wide', () => {
  assert.deepEqual(tabsFor('narrow'), ['setup', 'map', 'results']);
  assert.deepEqual(tabsFor('medium'), ['setup', 'results']);
  assert.deepEqual(tabsFor('wide'), []);
});

test('normalisePane: medium has no Map tab; unknown panes fall back to setup', () => {
  assert.equal(normalisePane('medium', 'map', 'edit'), 'setup');
  assert.equal(normalisePane('medium', 'map', 'running'), 'results');
  assert.equal(normalisePane('narrow', 'map', 'edit'), 'map');
  assert.equal(normalisePane('narrow', 'bogus', 'edit'), 'setup');
});

test('paneOnModeChange: running -> Map on narrow, Results on medium; wide never switches', () => {
  assert.deepEqual(paneOnModeChange('narrow', 'setup', 'edit', 'running'), { pane: 'map', dots: ['results'] });
  assert.deepEqual(paneOnModeChange('medium', 'setup', 'edit', 'running'), { pane: 'results', dots: [] });
  assert.deepEqual(paneOnModeChange('wide', 'setup', 'edit', 'running'), { pane: 'setup', dots: [] });
});

test('paneOnModeChange: optimising and compare -> Results; compare leaves a dot on the Map (narrow only)', () => {
  assert.deepEqual(paneOnModeChange('narrow', 'setup', 'results', 'optimising'), { pane: 'results', dots: [] });
  assert.deepEqual(paneOnModeChange('narrow', 'results', 'optimising', 'compare'), { pane: 'results', dots: ['map'] });
  assert.deepEqual(paneOnModeChange('medium', 'results', 'optimising', 'compare'), { pane: 'results', dots: [] });
});

test('paneOnModeChange: back to edit -> Setup; replay finishing keeps the pane and flags Results if you are elsewhere', () => {
  assert.equal(paneOnModeChange('narrow', 'results', 'compare', 'edit').pane, 'setup');
  assert.deepEqual(paneOnModeChange('narrow', 'map', 'running', 'results'), { pane: 'map', dots: ['results'] });
  assert.deepEqual(paneOnModeChange('narrow', 'results', 'running', 'results'), { pane: 'results', dots: [] });
});

test('paneOnModeChange: the same mode again changes nothing (the user tap wins)', () => {
  assert.deepEqual(paneOnModeChange('narrow', 'setup', 'running', 'running'), { pane: 'setup', dots: [] });
});

test('paneOnToolChange: Add, Place and Calibrate jump to Map on narrow only', () => {
  for (const tool of ['add-node', 'place-facility', 'calibrate']) {
    assert.equal(paneOnToolChange('narrow', 'setup', 'select', tool), 'map');
    assert.equal(paneOnToolChange('medium', 'setup', 'select', tool), 'setup');
    assert.equal(paneOnToolChange('wide', 'setup', 'select', tool), 'setup');
  }
  assert.equal(paneOnToolChange('narrow', 'setup', 'add-node', 'select'), 'setup', 'going back to select stays put');
  assert.equal(paneOnToolChange('narrow', 'results', 'add-node', 'add-node'), 'results', 'no change, no jump');
});
