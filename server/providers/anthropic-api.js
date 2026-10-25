// Fallback provider: Anthropic Messages API over fetch (SSE), no SDK. Key from env only.
export async function callAnthropicApi({ system, user, onDelta, cfg }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.anthropicApiUrl, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': cfg.anthropicVersion },
      body: JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens, stream: true, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const dec = new TextDecoder();
    let buf = '';
    let text = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5));
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') { text += evt.delta.text; onDelta?.(evt.delta.text); }
          else if (evt.type === 'error') throw new Error(`Anthropic API stream error: ${evt.error?.message}`);
        } catch (e) { if (e.message.startsWith('Anthropic')) throw e; }
      }
    }
    if (!text) throw new Error('Anthropic API returned no text');
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Anthropic API timed out after ${cfg.timeoutMs} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
