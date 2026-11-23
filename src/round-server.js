import { timingSafeEqual } from 'node:crypto';

export function serveRound(app, { runId, roundId, token, hostname = '127.0.0.1', port = 8766 }) {
  if (typeof token !== 'string' || token.length < 32) throw Error('Oracle token must contain at least 32 characters');
  const run = app.get(runId);
  if (run.metadata.track !== 'http') throw Error('Scoped oracle requires a run created with interface http');
  if (!run.rounds[roundId]) throw Error('Unknown round');
  const secret = Buffer.from(`Bearer ${token}`);
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return Bun.serve({ hostname, port, async fetch(request) {
    const provided = Buffer.from(request.headers.get('authorization') ?? '');
    if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) return json({ error: 'Unauthorized' }, 401);
    const path = new URL(request.url).pathname;
    try {
      if (request.method === 'GET' && path === '/round') {
        const round = app.get(runId).rounds[roundId];
        return json({ round: roundId, language: round.language, vocabulary_size: round.vocabulary_size, max_guesses: app.suite.limit, status: round.status, guesses: round.events.map(({ attempt, word, rank, error, duplicate }) => ({ attempt, word, rank, error, duplicate })) });
      }
      if (request.method === 'POST' && ['/guess', '/abandon', `/api/runs/${runId}/guess`].includes(path)) {
        const text = await request.text();
        if (text.length > 2048) throw Error('Request body too large');
        const body = JSON.parse(text);
        if (body.round_id && body.round_id !== roundId) throw Error('This oracle accepts only its assigned round');
        if (path !== '/abandon') return json(app.change(runId, 'guess', { round_id: roundId, word: body.word, request_id: body.request_id }).feedback);
        app.change(runId, 'abandon', { round_id: roundId });
        return json({ round: roundId, status: app.get(runId).rounds[roundId].status });
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error.message }, 400); }
  } });
}
