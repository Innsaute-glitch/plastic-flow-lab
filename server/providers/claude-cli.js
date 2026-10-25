// Default provider: the user's logged-in Claude Code subscription via `claude -p`.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SYSTEM_FILE = new URL('../prompts/optimise.system.md', import.meta.url);

export async function callClaudeCli({ system, user, onDelta, cfg, signal }) {
  if (signal?.aborted) throw cancelledError();
  // Empty cwd so the project's CLAUDE.md is never loaded; system prompt is passed as text (absolute file read).
  const cwd = await mkdtemp(join(tmpdir(), 'resin-llm-'));
  const systemText = system ?? (await readFile(SYSTEM_FILE, 'utf8'));
  const args = [
    '-p', '--model', cfg.model,
    '--output-format', 'stream-json', '--include-partial-messages', '--verbose',
    '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands',
    '--no-session-persistence', '--system-prompt', systemText,
  ];
  // Drop API-key env so the CLI uses the subscription login, not a key.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let text = '';
      let finalText = null;
      let buf = '';
      let stderr = '';
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); fn(v); } };
      // cancelled by the user: stop the CLI so no further tokens are generated
      const onAbort = () => { child.kill('SIGTERM'); done(reject, cancelledError()); };
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => { child.kill('SIGKILL'); done(reject, new Error(`claude-cli timed out after ${cfg.timeoutMs} ms`)); }, cfg.timeoutMs);
      const handle = (line) => {
        if (!line.trim()) return;
        let evt;
        try { evt = JSON.parse(line); } catch { return; }
        if (evt.type === 'stream_event' && evt.event?.type === 'content_block_delta' && evt.event.delta?.type === 'text_delta') {
          text += evt.event.delta.text;
          onDelta?.(evt.event.delta.text);
        } else if (evt.type === 'result') {
          if (evt.is_error) done(reject, new Error(`claude-cli error: ${String(evt.result).slice(0, 300)}`));
          else finalText = evt.result;
        }
      };
      child.stdout.on('data', (d) => {
        buf += d.toString('utf8');
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
      });
      child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
      child.on('error', (e) => done(reject, new Error(e.code === 'ENOENT' ? 'claude CLI not found on PATH' : `claude-cli spawn failed: ${e.message}`)));
      child.on('close', (code) => {
        handle(buf);
        if (settled) return;
        const out = text || finalText || '';
        if (code !== 0 && !out) done(reject, new Error(`claude-cli exited ${code}: ${stderr.trim().slice(0, 300)}`));
        else if (!out) done(reject, new Error('claude-cli returned no text'));
        else done(resolve, out);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(user);
    });
  } finally {
    rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}

function cancelledError() {
  const e = new Error('Cancelled by the user');
  e.name = 'AbortError';
  return e;
}
