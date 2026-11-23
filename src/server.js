import { resolve } from 'node:path';
import { root } from './dataset.js';
import { RuleError } from './engine.js';
import { protocolFingerprint, templates } from './protocol.js';

export function serve(app, { hostname = '127.0.0.1', port = 8765 } = {}) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return Bun.serve({
    hostname, port,
    async fetch(request) {
      const url = new URL(request.url), path = url.pathname;
      try {
        if (request.method === 'GET') {
          const staticFiles = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
          if (Object.hasOwn(staticFiles, path)) return new Response(Bun.file(resolve(root, 'web', staticFiles[path])), { headers: { 'Cache-Control': 'no-store' } });
          if (path === '/api/suite') return json({ ...app.suite.public(), protocol_fingerprint: protocolFingerprint() });
          if (path === '/api/prompts') return json(templates());
          const match = path.match(/^\/api\/runs\/([a-f0-9]{32})(?:\/prompt\/((?:ru|en)-\d{2}))?$/);
          if (match) return json(match[2] ? { prompt: app.prompt(match[1], match[2], { origin: url.origin }) } : app.present(app.get(match[1])));
        }
        if (request.method === 'POST') {
          const text = await request.text();
          if (text.length > 16384) throw new Error('Request body too large');
          const body = JSON.parse(text);
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a JSON object');
          if (path === '/api/runs') return json(app.present(app.create(body)), 201);
          const match = path.match(/^\/api\/runs\/([a-f0-9]{32})\/(guess|abandon|finish|intervention)$/);
          if (match) return json(app.present(app.change(match[1], match[2], body).run));
        }
        return json({ error: 'Not found' }, 404);
      } catch (error) {
        return json({ error: error.message }, error instanceof RuleError ? 409 : error.message === 'Unknown run' ? 404 : 400);
      }
    },
  });
}
