import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSchedule } from '../schedule.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../../fixtures/${f}`, import.meta.url)));

for (const f of ['results.baseline.json', 'results.optimised.json']) {
  test(`schedule total is exactly 30 s and monotonic (${f})`, () => {
    const tl = load(f).timeline;
    const sc = buildSchedule(tl, 30);
    assert.ok(Math.abs(sc.total - 30) < 1e-9);
    let prev = -1;
    for (let s = 0; s <= 30; s += 0.01) {
      const p = sc.posAt(s);
      assert.ok(p.x >= prev - 1e-9 && p.x <= 719);
      prev = p.x;
    }
    assert.equal(sc.posAt(30).x, 719);
    assert.equal(sc.posAt(0).x, 0);
  });
  test(`trip pauses hold end-of-day frame (${f})`, () => {
    const tl = load(f).timeline;
    const sc = buildSchedule(tl, 30);
    for (const tr of tl.trips) {
      const s0 = sc.secondsOfFrame(tr.day * 24 + 23);
      const p = sc.posAt(s0 + sc.pause * 0.5);
      assert.equal(p.day, tr.day);
      assert.equal(p.x, tr.day * 24 + 23);
      assert.ok(p.tripIdx >= 0 && Math.abs(p.p - 0.5) < 1e-6);
    }
  });
}
