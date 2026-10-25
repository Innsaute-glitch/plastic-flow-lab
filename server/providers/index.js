// callModel({ system, user, onDelta, signal }) -> Promise<string>. `signal` (AbortSignal) cancels the call. Provider chosen by config/llm.json.
import { readFile } from 'node:fs/promises';
import { callClaudeCli } from './claude-cli.js';
import { callAnthropicApi } from './anthropic-api.js';
import { loadJson } from '../user-message.js';
import { loadEnv } from '../env.js';

const SYSTEM_FILE = new URL('../prompts/optimise.system.md', import.meta.url);

export const getLlmConfig = () => loadJson('config/llm.json');

export async function callModel({ system, user, onDelta, signal }) {
  loadEnv();
  const cfg = getLlmConfig();
  const sys = system ?? (await readFile(SYSTEM_FILE, 'utf8'));
  if (cfg.provider === 'claude-cli') return callClaudeCli({ system: sys, user, onDelta, cfg, signal });
  if (cfg.provider === 'anthropic-api') return callAnthropicApi({ system: sys, user, onDelta, cfg, signal });
  throw new Error(`Unknown LLM provider "${cfg.provider}" in config/llm.json`);
}
