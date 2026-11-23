import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildDataset } from '../scripts/build-site.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('top-k proximity includes the boundary and near misses remain unsolved', () => {
  const comparison = read('../results/2026-11-23-neon-en/comparison.json');
  const run = comparison.runs.find(run => run.metadata.effort === 'low');
  delete run.summary;
  comparison.runs = [run];
  const ranks = [null, 2, 3, 10, 11, 100, 101, 1000, 1001, 1];
  for (const [index, round] of Object.values(run.rounds).entries()) {
    const rank = ranks[index];
    round.status = rank === 1 ? 'solved' : 'exhausted';
    round.events = Array.from({ length: rank === 1 ? 1 : 50 }, (_, index) => ({
      attempt: index + 1,
      word: 'fixture',
      rank,
      error: rank === null ? 'unknown_word' : null,
      duplicate: index > 0,
      cycle_ms: index ? 1000 : null,
      service_ms: 1,
    }));
  }
  const dataset = buildDataset(
    comparison,
    read('../results/2026-11-23-neon-en/audit.json'),
    read('../results/2026-11-23-sol-high-en/audit.json'),
  );
  const metrics = dataset.runs[0].metrics;
  expect(metrics.hits_at_k).toEqual({ 1: 1, 2: 2, 10: 4, 100: 6, 1000: 8 });
  expect(metrics.solved).toBe(1);
  expect(metrics.par2).toBe(90.1);
});
