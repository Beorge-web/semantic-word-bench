import { test, expect } from 'bun:test';
import { analyzeRound, analyzeRun } from '../analysis/search.js';

const round = (ranks, status = 'exhausted') => ({ status, events: ranks.map((rank, index) => ({
  attempt: index + 1, word: `guess${index}`, rank, error: rank === null ? 'unknown_word' : null,
  received_ms: 1000 + index * 1000, result_ms: 1100 + index * 1000,
})) });

test('trajectory counts strict improvements, ties, invalid guesses and repeated words', () => {
  const fixture = round([500, 500, null, 100, 200, 100, 10, 2, 1], 'solved');
  fixture.events[4].word = fixture.events[0].word;
  const result = analyzeRound(fixture);
  expect(result.best_rank_at).toEqual({ 10: 1, 25: 1, 50: 1 });
  expect(result.steps_to_top[100]).toBe(4);
  expect(result.steps_to_top[10]).toBe(7);
  expect(result.longest_stagnation).toBe(2);
  expect(result.duplicates).toBe(1);
  expect(result.repeat_rate).toBe(1 / 9);
  expect(result.improvements).toBe(5);
});

test('an unfinished short round has censored checkpoints and missing ranks stay missing', () => {
  const result = analyzeRound(round([null, 200], 'abandoned'));
  expect(result.best_rank_at[10]).toBeNull();
  expect(result.checkpoint_observed[10]).toBe(false);
  expect(result.steps_to_top[100]).toBeNull();
  expect(result.time_to_solve_ms).toBeNull();
  expect(result.token_usage).toBeNull();
  expect(result.cost).toBeNull();
});

test('time-to-solve distinguishes agent timing from observed play and rejects incomplete audit coverage', () => {
  const fixture = round([100, 1], 'solved');
  const covered = analyzeRound(fixture, { started_at: new Date(500).toISOString(), completed_at: new Date(2500).toISOString() });
  expect(covered.time_to_solve_ms).toBe(1600);
  expect(covered.solve_time_basis).toBe('agent_start_to_winning_result');
  const incomplete = analyzeRound(fixture, { started_at: new Date(1500).toISOString(), completed_at: new Date(2500).toISOString() });
  expect(incomplete.agent_duration_ms).toBeNull();
  expect(incomplete.time_to_solve_ms).toBe(1100);
  expect(incomplete.solve_time_basis).toBe('first_submission_to_winning_result');
});

test('aggregate threshold steps retain reach counts and resource totals retain coverage and currencies', () => {
  const run = { rounds: { a: round([100, 1], 'solved'), b: round([900, 800]) } };
  const result = analyzeRun(run, [{ round: 'a', token_usage: { input_tokens: 0, output_tokens: 20, source: 'provider receipt' }, cost: { amount: 0.1, currency: 'USD', source: 'provider receipt' } }]).summary;
  expect(result.steps_to_top[100]).toEqual({ reached: 1, total: 2, mean: 1, median: 1 });
  expect(result.resources.token_rounds).toBe(1);
  expect(result.resources.token_totals).toEqual({ input_tokens: 0, output_tokens: 20 });
  expect(result.resources.token_sources).toEqual(['provider receipt']);
  expect(() => analyzeRun(run, [{ round: 'a', token_usage: { total_tokens: 100 } }])).toThrow('evidence source');
  expect(result.resources.cost_by_currency).toEqual({ USD: 0.1 });
  const unavailable = analyzeRun(run).summary.resources;
  expect(unavailable.token_totals).toBeNull();
  expect(unavailable.cost_by_currency).toBeNull();
});
