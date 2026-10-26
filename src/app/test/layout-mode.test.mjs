import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFor, tabsFor, normalisePane, paneOnModeChange, paneOnToolChange, HUD_RESERVE_PX } from '../layout-mode.js';

test('layoutFor: wide from 1240 px, medium 820-1239 and tall enough, narrow otherwise', () => {
  assert.equal(layoutFor(1920, 1080), 'wide');
  assert.equal(layoutFor(1366, 768), 'wide');
  assert.equal(layoutFor(1240, 600), 'wide');
  assert.equal(layoutFor(1239, 768), 'medium');
  assert.equal(layoutFor(1024, 768), 'medium');
  assert.equal(layoutFor(820, 560), 'medium');
  assert.equal(layoutFor(819, 900), 'narrow');
  assert.equal(layoutFor(768, 1024), 'narrow');
  assert.equal(layoutFor(844, 390), 'narrow', 'phone in landscape: short, so narrow');
  assert.equal(layoutFor(1024, 559), 'narrow', 'short screens are narrow even when wide enough for medium');
  assert.equal(layoutFor(390, 844), 'narrow');
});

test('HUD reserve: 116 on wide and medium, 64 on narrow (the seam with the HUD)', () => {
  assert.deepEqual(HUD_RESERVE_PX, { wide: 116, medium: 116, narrow: 64 });
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
