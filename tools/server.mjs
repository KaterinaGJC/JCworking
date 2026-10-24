import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export function startServer(rootDir, port = 0, host = '127.0.0.1') {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, rel);
      if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
        return;
      }
      const body = fs.readFileSync(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'service-worker-allowed': '/',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(err));
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolve({
        url: `http://${host}:${actual}`,
        port: actual,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// CLI: node tools/server.mjs [root] [port]
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const root = process.argv[2] ?? 'app';
  const port = Number(process.argv[3] ?? 8123);
  const s = await startServer(root, port);
  console.log(`serving ${root} at ${s.url}`);
}
