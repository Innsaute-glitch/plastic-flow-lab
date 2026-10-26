// Guards from the responsive phase: every stylesheet must be imported by the app itself (not only a dev page),
// and the drawer width must have one source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(src, p), 'utf8');

test('each module imports its own stylesheet', () => {
  assert.match(read('results/index.js'), /import '\.\/results\.css'/);
  assert.match(read('assumptions/index.js'), /import '\.\/assumptions\.css'/);
  assert.match(read('anim/player.js'), /import '\.\/anim\.css'/);
});

test('main.js loads every file in src/styles', () => {
  assert.match(read('main.js'), /import\.meta\.glob\('\.\/styles\/\*\.css'/);
});

test('drawer width is defined once, as a token', () => {
  assert.match(read('styles/tokens.css'), /--drawer-w:\s*440px/);
  assert.match(read('styles/base.css'), /width:\s*min\(var\(--drawer-w\), 100vw\)/);
  assert.doesNotMatch(read('assumptions/assumptions.css'), /440px/);
});
