// Browser-side optimise(). Contract: plan.md §3.1. Never throws; falls back to the heuristic.
import { heuristicProposal } from './heuristic.js';
import { scenarioFingerprint } from './fingerprint.js';

// Demo replay pacing (mutable so tests can run fast).
export const timing = { totalMs: 4000, statusMs: [250, 350], tailMs: 150, chunks: 60 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = () => (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

function heuristicFallback({ scenario, baseline, assumptions, history }, onEvent, message) {
  console.warn('[llm] falling back to heuristic:', message);
  onEvent({ type: 'error', message, fallback: 'heuristic' });
  const p = { ...heuristicProposal(scenario, baseline.setup, baseline.results, assumptions), round: history.length + 1 };
  onEvent({ type: 'result', proposal: p });
  onEvent({ type: 'status', stage: 'done' });
  return p;
}

async function demoReplay(args, onEvent) {
  const { scenario } = args;
  let cached;
  try {
    const res = await fetch(`${base()}demo/cached-proposal.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cached = await res.json();
  } catch (e) {
    return heuristicFallback(args, onEvent, `Demo mode: could not load the cached proposal (${e.message}). Showing the rule-based plan instead.`);
  }
  const ids = scenario.nodes.map((n) => n.id).sort().join(',');
  const cachedIds = Object.keys(cached?.setup?.nodes ?? {}).sort().join(',');
  if (cached?.scenarioId !== scenario.id || ids !== cachedIds || typeof cached.raw !== 'string' || !cached.raw) {
    return heuristicFallback(args, onEvent, 'Demo mode: the cached AI proposal belongs to a different scenario. Showing the rule-based plan instead.');
  }
  if (cached.fingerprint && cached.fingerprint !== scenarioFingerprint(scenario)) {
    return heuristicFallback(args, onEvent, 'Demo mode: the scenario was edited since the AI proposal was cached. Turn Demo off for a live AI answer; showing the rule-based plan instead.');
  }
  onEvent({ type: 'status', stage: 'sending' });
  await sleep(timing.statusMs[0]);
  onEvent({ type: 'status', stage: 'thinking' });
  await sleep(timing.statusMs[1]);
  const streamMs = Math.max(0, timing.totalMs - timing.statusMs[0] - timing.statusMs[1] - timing.tailMs);
  const size = Math.ceil(cached.raw.length / timing.chunks);
  const n = Math.ceil(cached.raw.length / size);
  for (let i = 0; i < n; i++) {
    onEvent({ type: 'delta', text: cached.raw.slice(i * size, (i + 1) * size) });
    await sleep(streamMs / n);
  }
  onEvent({ type: 'status', stage: 'validating' });
  await sleep(timing.tailMs);
  const proposal = { ...cached, source: 'cached', round: args.history.length + 1, createdAt: new Date().toISOString() };
  onEvent({ type: 'result', proposal });
  onEvent({ type: 'status', stage: 'done' });
  return proposal;
}

async function liveCall(args, onEvent) {
  const { scenario, baseline, history } = args;
  const res = await fetch(`${base()}api/optimise`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenario,
      baselineSetup: baseline.setup,
      baselineSummary: baseline.results.summary,
      perNode: baseline.results.perNode,
      history,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Server responded ${res.status}`);
  const dec = new TextDecoder();
  let buf = '';
  let proposal = null;
  let failure = null;
  const dispatch = (block) => {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    const payload = JSON.parse(data);
    if (event === 'error') { failure = payload.message || 'Server error'; return; }
    if (event === 'result') proposal = payload.proposal;
    onEvent({ type: event, ...payload });
  };
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { dispatch(buf.slice(0, i)); buf = buf.slice(i + 2); }
  }
  if (buf.trim()) dispatch(buf);
  if (failure) throw new Error(failure);
  if (!proposal) throw new Error('Server stream ended without a result');
  return proposal;
}

export async function optimise({ scenario, baseline, assumptions, demoMode, history = [] }, onEvent = () => {}) {
  const args = { scenario, baseline, assumptions, history };
  const emit = (evt) => { try { onEvent(evt); } catch (e) { console.error('[llm] onEvent handler threw:', e.message); } };
  try {
    if (demoMode) return await demoReplay(args, emit);
    return await liveCall(args, emit);
  } catch (e) {
    try {
      return heuristicFallback(args, emit, `AI request failed (${e.message}). Showing the rule-based plan instead.`);
    } catch (e2) {
      console.error('[llm] heuristic failed:', e2.message);
      return { source: 'heuristic', model: 'rule-based', createdAt: new Date().toISOString(), round: history.length + 1, scenarioId: scenario?.id, setup: baseline?.setup, rationales: {}, sortingRationale: '', summary: 'No change (fallback failed).', clampNotes: [], raw: '' };
    }
  }
}
