// Prod server: static dist/ + /api. Port PORT || 8787.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff' };

async function serveStatic(req, res) {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(DIST, url === '/' ? 'index.html' : url));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    try { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile(join(DIST, 'index.html'))); }
    catch { res.writeHead(404); res.end('dist/ not built. Run npm run build.'); }
  }
}

const port = Number(process.env.PORT) || 8787;
http.createServer((req, res) => (req.url.startsWith('/api/') ? handleApi(req, res, () => serveStatic(req, res)) : serveStatic(req, res)))
  .listen(port, () => console.log(`[server] listening on http://localhost:${port}`));
