// Connect-style middleware for /api/*. Contract: plan.md §3.1 Server API.
import { callModel as defaultCallModel, getLlmConfig } from './providers/index.js';
import { buildUserMessage, buildRetryMessage, loadJson } from './user-message.js';
import { applyOverrides } from '../src/shared/assumptions.js';
import { validateAndClamp, parseModelJson } from '../src/llm/schema.js';

/** Runs prompt -> model -> validate (+1 retry). Calls emit(type, data). Returns the Proposal; throws on final failure. */
export async function runOptimisation(body, emit, callModel = defaultCallModel) {
  const cfg = getLlmConfig();
  const { scenario, baselineSetup, history = [] } = body;
  const assumptions = applyOverrides(loadJson('config/assumptions.json'), scenario?.assumptionOverrides ?? {});
  if (!scenario?.nodes?.length || !baselineSetup?.nodes || !body.baselineSummary) {
    throw new Error('Request body needs scenario, baselineSetup and baselineSummary.');
  }
  const user = buildUserMessage(body, assumptions);
  const onDelta = (text) => emit('delta', { text });
  emit('status', { stage: 'sending' });
  let raw = '';
  let v = null;
  let prompt = user;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) emit('status', { stage: 'retrying' });
    else emit('status', { stage: 'thinking' });
    raw = await callModel({ user: prompt, onDelta });
    emit('status', { stage: 'validating' });
    v = validateAndClamp(parseModelJson(raw), scenario, baselineSetup, assumptions);
    if (v.ok) break;
    console.warn('[server] model reply rejected:', v.errors.join('; '));
    prompt = buildRetryMessage(user, raw, v.errors);
  }
  if (!v.ok) throw new Error(`Model reply invalid after retry: ${v.errors.join('; ')}`);
  return {
    source: 'llm',
    model: cfg.model,
    createdAt: new Date().toISOString(),
    round: history.length + 1,
    scenarioId: scenario.id,
    setup: v.setup,
    rationales: v.rationales,
    sortingRationale: v.sortingRationale,
    summary: v.summary,
    clampNotes: v.clampNotes,
    raw,
  };
}

function readBody(req, limit = 4e6) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createHandler({ callModel = defaultCallModel } = {}) {
  return async function handleApi(req, res, next) {
    const path = (req.url || '').split('?')[0];
    if (!path.startsWith('/api/')) return next?.();
    if (path === '/api/health' && req.method === 'GET') {
      const cfg = getLlmConfig();
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, provider: cfg.provider, model: cfg.model }));
    }
    if (path === '/api/optimise' && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const emit = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      try {
        const proposal = await runOptimisation(body, emit, callModel);
        emit('result', { proposal });
        emit('status', { stage: 'done' });
      } catch (e) {
        console.error('[server] optimise failed:', e.message);
        emit('error', { message: e.message, fallback: 'heuristic' });
      }
      return res.end();
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  };
}

export const handleApi = createHandler();
