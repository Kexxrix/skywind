import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.mp4':'video/mp4', '.wav':'audio/wav', '.ogg':'audio/ogg', '.ico':'image/x-icon' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
    const info = await stat(path);
    if (!info.isFile()) { res.writeHead(404); return res.end(); }
    const buffer = await readFile(path);
    res.writeHead(200, { 'Content-Type':types[extname(path)] || 'application/octet-stream', 'Content-Length':buffer.length, 'Cache-Control':'no-cache' });
    res.end(buffer);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`SkyWind ready at http://127.0.0.1:${port}`));
