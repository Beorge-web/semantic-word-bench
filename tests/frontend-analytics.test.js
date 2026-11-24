import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { proximityAt, renderMetricBars, renderCheckpoints, comparisonCsv } from '../site/analytics.js';

test('near hits are exclusive of exact wins and checkpoints exclude later guesses', () => {
  const run = { metrics: { rounds: 3 }, rounds: {
    a: { events: [{ attempt: 1, rank: 2 }, { attempt: 2, rank: 1 }] },
    b: { events: [{ attempt: 1, rank: null }, { attempt: 2, rank: 2 }] },
    c: { events: [{ attempt: 1, rank: 3 }] },
  } };
  expect(proximityAt(run, 2, 1)).toEqual({ exact: 0, near: 1, missed: 2, total: 3 });
  expect(proximityAt(run, 2, 2)).toEqual({ exact: 1, near: 1, missed: 1, total: 3 });
  expect(proximityAt(run, 1, 2)).toEqual({ exact: 1, near: 0, missed: 2, total: 3 });
});

test('missing timing remains unavailable while a measured zero retains its value', () => {
  const runs = [{ id: 'a', short_label: 'Missing', color: '#fff', value: null }, { id: 'b', short_label: 'Zero', color: '#fff', value: 0 }];
  const html = renderMetricBars(runs, new Set(), run => ({ value: run.value, detail: 'fixture' }), 10, String);
  expect(html).toContain('Not available');
  expect(html).toContain('>0<span');
  expect(html).not.toMatch(/NaN|undefined/);
});

test('published catalog distinguishes frozen packs from measured collections without exposing targets', () => {
  const catalog = JSON.parse(readFileSync(new URL('../site/data/catalog.json', import.meta.url), 'utf8'));
  expect(catalog.datasets.length).toBe(3);
  expect(catalog.datasets.filter(dataset => dataset.completed_runs > 0).length).toBe(1);
  expect(catalog.datasets.filter(dataset => dataset.completed_runs === 0).length).toBe(2);
  expect(catalog.datasets.every(dataset => dataset.fingerprint.length === 64 && !('answers' in dataset) && !('ranks' in dataset))).toBe(true);
  const data = JSON.parse(readFileSync(new URL('../site/data/results.json', import.meta.url), 'utf8'));
  expect(renderCheckpoints(data.runs, new Set(), data.vocabulary_size)).not.toMatch(/NaN|undefined/);
  const csv = comparisonCsv(data);
  expect(csv.trim().split('\r\n').length).toBe(61);
  expect(csv).toContain('"gpt-6-astra"');
  expect(csv).toContain('"gpt-6.2-astra"');
  expect(csv).not.toMatch(/null|undefined/);
});
