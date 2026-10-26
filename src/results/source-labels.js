// Wording that depends on where a proposal came from. The rule-based fallback must not claim an AI was involved.
export function proposalLabels(source) {
  if (source === 'heuristic') {
    return {
      link: ' What the rules used / produced',
      title: 'What the rules used / produced',
      aria: 'What the rule-based plan used and produced',
      saw: 'What it used',
      said: 'What it produced',
    };
  }
  return {
    link: ' What the AI saw / said',
    title: 'What the AI saw / said',
    aria: 'What the AI saw and said',
    saw: 'What it saw',
    said: 'What it said',
  };
}
