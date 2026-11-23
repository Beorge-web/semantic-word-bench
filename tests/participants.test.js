import { test, expect } from 'bun:test';
import { auditMatchesRun, participantInfo, summarizeEfforts } from '../analysis/participants.js';
import { mergeComparisons } from '../scripts/build-site.js';

test('missing audit keys do not match another model or effort', () => {
  const run = { id: 'a', metadata: { model: 'gpt-6-astra', effort: 'high', provider: 'Codex', track: 'cli' }, rounds: { 'en-01': {} } };
  expect(auditMatchesRun({ model: 'gpt-6.2-astra', effort: 'high' }, run)).toBe(false);
  expect(auditMatchesRun({ model: 'gpt-6-astra', effort: 'low' }, run)).toBe(false);
  expect(participantInfo(run).executedModelVerified).toBe(false);
});

test('within-model effort statistics weight rounds and cycles independently', () => {
  const base = { comparison_group: 'same-conditions', model: 'example', provider_display: 'provider', service_tier: 'default', effort: 'low' };
  const stats = (rounds, solved, par2, cycle_mean_ms, cycle_count) => ({ rounds, solved, par2, cycle_mean_ms, cycle_count });
  const groups = summarizeEfforts([
    { ...base, metrics: stats(10, 4, 70, 1000, 400) },
    { ...base, metrics: stats(30, 12, 90, 5000, 100) },
    { ...base, effort: 'high', metrics: stats(10, 8, 30, 2000, 200) },
    { ...base, comparison_group: 'different-tier', service_tier: 'priority', metrics: stats(10, 9, 20, 1000, 300) },
  ]);
  expect(groups.length).toBe(2);
  const low = groups[0].efforts.find(entry => entry.effort === 'low');
  expect(low.par2).toBe(85);
  expect(low.cycle_mean_ms).toBe(1800);
  expect(low.solve_rate).toBe(0.4);
  expect(low.runs).toBe(2);
});

test('collections reject incomplete or conflicting run snapshots and different task sets', () => {
  const report = { scope: 'en', max_guesses: 50, completed_at: '2026-11-24', paired: [{ id: 'en-01', answer: 'fixture' }], runs: [{ id: 'a', metadata: { track: 'cli', prompt_mode: 'baseline' }, rounds: { 'en-01': { status: 'solved' } } }] };
  expect(mergeComparisons([report, structuredClone(report)]).runs.length).toBe(1);
  const unfinished = structuredClone(report);
  unfinished.runs[0].rounds['en-01'].status = 'active';
  expect(() => mergeComparisons([unfinished])).toThrow('Incomplete');
  const other = structuredClone(report);
  other.paired[0].answer = 'different';
  expect(() => mergeComparisons([report, other])).toThrow('task sets');
  const http = structuredClone(report);
  http.runs[0].metadata.track = 'http';
  expect(() => mergeComparisons([report, http])).toThrow('interfaces');
});
