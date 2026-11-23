import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build-site.js';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const distDir = resolve(root, 'dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

if (!existsSync(resolve(distDir, 'index.html')) || process.argv.includes('--build')) {
  build();
}

const server = createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const relPath = normalize(urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  const filePath = resolve(distDir, relPath);

  if (!filePath.startsWith(distDir + sep) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Static results dashboard available at http://${host}:${port}`);
});
