import test from 'node:test';
import assert from 'node:assert/strict';
import { rescaleToImage } from '../scenario-utils.js';

const mk = () => ({
  map: { src: 'a.jpg', widthPx: 2960, heightPx: 1840, metresPerPixel: 0.5153, attribution: 'x' },
  facility: { x: 510, y: 359 },
  nodes: [
    { id: 'n1', x: 1480, y: 920 },
    { id: 'n2', x: null, y: null },
    { id: 'n3', x: 2960, y: 1840 },
  ],
});

test('rescaleToImage scales nodes, facility and metresPerPixel without mutating input', () => {
  const sc = mk();
  const out = rescaleToImage(sc, 1000, 1000);
  assert.deepEqual(sc, mk());
  assert.equal(out.nodes[0].x, 500);
  assert.equal(out.nodes[0].y, 500);
  assert.equal(out.nodes[1].x, null);
  assert.equal(out.nodes[1].y, null);
  assert.equal(out.facility.x, 172.3);
  assert.equal(out.facility.y, 195.1);
  assert.equal(out.map.metresPerPixel, 1.5253);
  assert.equal(out.map.widthPx, 1000);
  assert.equal(out.map.heightPx, 1000);
});

test('rescaleToImage with same size is unchanged', () => {
  assert.deepEqual(rescaleToImage(mk(), 2960, 1840), mk());
});

test('rescaleToImage keeps placed nodes on the image', () => {
  const out = rescaleToImage(mk(), 800, 1200);
  for (const n of out.nodes.filter((n) => n.x != null)) {
    assert.ok(n.x >= 0 && n.x <= 800 && n.y >= 0 && n.y <= 1200);
  }
});
