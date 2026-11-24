// Serves the temple at http://localhost:8317 and opens it in the default browser. YouTube refuses to play its
// player inside a page opened from disk (it needs a web address), so the phone's videos play only when served.
// node serve.mjs [--no-open]
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8317);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webm': 'audio/webm', '.opus': 'audio/ogg', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.flac': 'audio/flac' };

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  let st;
  if (!file.startsWith(root + path.sep) || !(st = (() => { try { return statSync(file); } catch { return null; } })()) || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const a = range[1] ? +range[1] : st.size - +range[2], b = range[1] && range[2] ? +range[2] : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
    createReadStream(file, { start: a, end: b }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
    createReadStream(file).pipe(res);
  }
}).listen(PORT, '127.0.0.1', () => {
  const at = `http://localhost:${PORT}/`;
  console.log(`The temple is at ${at} (close this window to stop it)`);
  if (!process.argv.includes('--no-open')) exec(process.platform === 'win32' ? `start "" "${at}"` : process.platform === 'darwin' ? `open "${at}"` : `xdg-open "${at}"`);
});
