import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalLabels } from '../source-labels.js';

for (const src of ['llm', 'cached']) {
  test(`proposalLabels(${src}) keeps the AI wording`, () => {
    assert.deepEqual(proposalLabels(src), {
      link: ' What the AI saw / said',
      title: 'What the AI saw / said',
      aria: 'What the AI saw and said',
      saw: 'What it saw',
      said: 'What it said',
    });
  });
}
test('proposalLabels(heuristic) never mentions the AI', () => {
  const l = proposalLabels('heuristic');
  assert.equal(l.link, ' What the rules used / produced');
  assert.equal(l.title, 'What the rules used / produced');
  assert.equal(l.aria, 'What the rule-based plan used and produced');
  assert.equal(l.saw, 'What it used');
  assert.equal(l.said, 'What it produced');
  assert.ok(!Object.values(l).some((v) => /AI/.test(v)));
});
