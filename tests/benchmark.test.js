import { afterAll, beforeAll, expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { App } from '../src/app.js';
import { root, Suite, normalize } from '../src/dataset.js';
import { applyGuess, RuleError, summarize } from '../src/engine.js';
import { serve } from '../src/server.js';

const suite = new Suite();
const targets = JSON.parse(readFileSync(resolve(root, 'tools/suite_targets.json'), 'utf8'));
const metadata = { model: 'test-model', provider: 'test-agent', effort: 'high', track: 'cli' };
let directory;
beforeAll(() => { directory = mkdtempSync(resolve(tmpdir(), 'wordbench-js-')); });
afterAll(() => { rmSync(directory, { recursive: true, force: true }); });
const freshRound = (id = 'en-01') => ({ id, language: id.slice(0, 2), status: 'pending', best_rank: null, events: [] });
const guess = (round, word, id = 'first', result = 1002) => applyGuess(suite, round, word, id, { received_ms: result - 2, result_ms: result, service_ms: 2 });

test('JavaScript preserves the exact frozen Python-era dataset fingerprint', () => {
  expect(suite.fingerprint).toBe('c497f4347aa6cb3515e939da2d6b0b89dbd863a05508db4e63f5b061a125de51');
  expect(suite.tables.size).toBe(20);
  for (const language of ['ru', 'en']) {
    expect(suite.words.get(language).size).toBe(50000);
    for (const [index, word] of targets[language].entries()) expect(suite.lookup(`${language}-${String(index + 1).padStart(2, '0')}`, word).rank).toBe(1);
  }
});

test('semantic orientation and normalization are preserved', () => {
  expect(suite.lookup('en-05', 'book').rank).toBeLessThan(suite.lookup('en-05', 'volcano').rank);
  expect(suite.lookup('ru-01', 'море').rank).toBeLessThan(suite.lookup('ru-01', 'договор').rank);
  expect(normalize('  ЁЖ ')).toBe('еж');
  expect(normalize('LIBRARY')).toBe('library');
});

test('manifest line endings do not change the dataset identity', () => {
  const path = mkdtempSync(resolve(directory, 'line-endings-'));
  for (const language of ['ru', 'en']) copyFileSync(resolve(root, `data/${language}.json.gz`), resolve(path, `${language}.json.gz`));
  const text = readFileSync(resolve(root, 'data/manifest.json'), 'utf8').replaceAll('\r\n', '\n');
  for (const manifest of [text, text.replaceAll('\n', '\r\n')]) {
    writeFileSync(resolve(path, 'manifest.json'), manifest);
    expect(new Suite(path).fingerprint).toBe('c497f4347aa6cb3515e939da2d6b0b89dbd863a05508db4e63f5b061a125de51');
  }
});

test('public metadata contains no target words or rank tables', () => {
  const text = JSON.stringify(suite.public());
  expect(text).not.toContain('ranks');
  for (const word of [...targets.ru, ...targets.en]) expect(text).not.toContain(word);
});

test('corrupt data fails verification', () => {
  const path = mkdtempSync(resolve(directory, 'corrupt-'));
  writeFileSync(resolve(path, 'manifest.json'), readFileSync(resolve(root, 'data/manifest.json')));
  writeFileSync(resolve(path, 'ru.json.gz'), 'corrupt');
  expect(() => new Suite(path)).toThrow('checksum');
});

test('a win is terminal and replays do not consume attempts', () => {
  const original = freshRound();
  const { round, event } = guess(original, ' LANTERN ');
  expect(original.events).toHaveLength(0);
  expect(round.status).toBe('solved');
  expect(event.rank).toBe(1);
  expect(guess(round, 'lantern').event).toEqual(event);
  expect(() => guess(round, 'needle', 'second')).toThrow(RuleError);
  expect(() => guess(round, 'needle')).toThrow('request_id');
});

test('unknown words, duplicates and bad formats all consume the budget', () => {
  let { round } = guess(freshRound(), 'zzzzzzzzzzzzzzz');
  expect(round.events[0].error).toBe('unknown_word');
  round = guess(round, 'zzzzzzzzzzzzzzz', 'second').round;
  expect(round.events[1].duplicate).toBe(true);
  round = guess(round, 'two words', 'third').round;
  expect(round.events[2].error).toBe('invalid_format');
  for (let i = 3; i < 50; i++) round = guess(round, 'invalid!', String(i)).round;
  expect(round.status).toBe('exhausted');
  expect(round.events).toHaveLength(50);
  expect(() => guess(round, 'lantern', 'last')).toThrow();
});

test('cycle timing excludes the first result and other rounds', () => {
  const first = guess(freshRound(), 'book');
  expect(first.event.cycle_ms).toBeNull();
  expect(guess(first.round, 'lantern', 'second', 6502).event.cycle_ms).toBe(5500);
  expect(guess(freshRound('en-02'), 'volcano', 'new', 12000).event.cycle_ms).toBeNull();
});

test('unfinished rounds receive a penalty and a solved-only average cannot hide failures', () => {
  const rounds = Object.fromEntries([...suite.tables.keys()].map(id => [id, freshRound(id)]));
  rounds['en-01'] = guess(rounds['en-01'], 'lantern').round;
  const summary = summarize({ rounds, interventions: [] }, 50);
  expect(summary.complete).toBe(false);
  expect(summary.all.solved).toBe(1);
  expect(summary.all.par2).toBe(95.05);
  expect(summary.all.solved_guesses_mean).toBe(1);
  expect(summary.all.cycle_mean_ms).toBeNull();
});

test('SQLite persists state, rejects cross-round IDs and rolls back failed updates', () => {
  const database = resolve(directory, 'persistence.sqlite3');
  let app = new App({ database, suite });
  const run = app.create(metadata);
  const body = { round_id: 'en-01', word: 'book', request_id: 'replay' };
  const first = app.change(run.id, 'guess', body);
  expect(app.change(run.id, 'guess', body).feedback).toEqual(first.feedback);
  expect(() => app.change(run.id, 'guess', { ...body, round_id: 'en-02' })).toThrow('another round');
  expect(() => app.change(run.id, 'guess', { ...body, word: 'needle' })).toThrow('another word');
  app.close();
  app = new App({ database, suite });
  try {
    expect(app.get(run.id).rounds['en-01'].events).toHaveLength(1);
    expect(() => app.change(run.id, 'guess', { round_id: 'en-01', word: ['book'] })).toThrow();
    const ended = app.change(run.id, 'finish').run;
    expect(summarize(ended, 50).complete).toBe(true);
  } finally { app.close(); }
});

test('all 20 rounds solve and language summaries are complete', () => {
  const app = new App({ database: resolve(directory, 'all.sqlite3'), suite });
  try {
    let run = app.create(metadata);
    for (const [language, words] of Object.entries(targets)) for (const [i, word] of words.entries()) run = app.change(run.id, 'guess', { round_id: `${language}-${String(i + 1).padStart(2, '0')}`, word }).run;
    const summary = summarize(run, 50);
    expect(summary.complete).toBe(true);
    expect(summary.all.solved).toBe(20);
    expect(summary.all.par2).toBe(1);
    expect(summary.all.cycle_count).toBe(0);
    expect(summary.by_language.ru.solved).toBe(10);
    expect(summary.by_language.en.solved).toBe(10);
  } finally { app.close(); }
});

test('CLI prompts include the actual database and no browser requirement', () => {
  const database = resolve(directory, 'space and проба.sqlite3');
  const app = new App({ database, suite });
  try {
    const run = app.create(metadata);
    expect(run.metadata.prompt_mode).toBe('baseline');
    for (const id of ['ru-01', 'en-01']) {
      const prompt = app.prompt(run.id, id);
      expect(prompt).toContain(database);
      expect(prompt).toContain(`guess ${run.id} ${id}`);
      expect(prompt).not.toMatch(/\{[A-Z_]+\}/);
      expect(prompt).not.toMatch(/HTTP|browser|браузер|кнопк/);
      expect(prompt).toContain('50000');
      expect(prompt).toContain('50');
      expect(prompt).toContain('null');
    }
  } finally { app.close(); }
});

test('real CLI creates, guesses, resumes in another working directory, and exports', () => {
  const database = resolve(directory, 'cli проба.sqlite3');
  const call = (args, stdin) => {
    const result = Bun.spawnSync([process.execPath, resolve(root, 'cli.js'), '--database', database, ...args], { cwd: directory, stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin), stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe('');
    return result.stdout.toString().trim();
  };
  const created = JSON.parse(call(['create', '--model', 'Neon', '--provider', 'Antigravity', '--effort', 'high']));
  expect(created.track).toBe('cli');
  expect(created.rounds).toHaveLength(20);
  const first = JSON.parse(call(['guess', created.run_id, 'ru-01', 'море', '--request-id', 'once']));
  expect(first.attempt).toBe(1);
  expect(first.rank).toBeGreaterThan(1);
  expect(Object.keys(first)).toEqual(['round', 'attempt', 'word', 'rank', 'status', 'remaining']);
  expect(JSON.stringify(first).length).toBeLessThan(180);
  expect(JSON.parse(call(['guess', created.run_id, 'ru-01', 'море', '--request-id', 'once']))).toEqual(first);
  expect(call(['prompt', created.run_id, 'ru-01'])).toContain(database);
  const lines = call(['play', created.run_id, 'en-01'], 'book\nlantern\nignored\n').split(/\r?\n/).map(JSON.parse);
  expect(lines).toHaveLength(3);
  expect(lines.at(-1).status).toBe('solved');
  expect(JSON.parse(call(['history', created.run_id, 'en-01'])).guesses).toHaveLength(2);
  const summary = JSON.parse(call(['summary', created.run_id]));
  expect(summary.all.solved).toBe(1);
  const file = resolve(directory, 'export.json');
  call(['export', created.run_id, '--out', file]);
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  expect(exported.metadata.track).toBe('cli');
  expect(exported.rounds['ru-01'].events[0].word).toBe('море');
  expect(JSON.parse(call(['finish', created.run_id])).complete).toBe(true);
});

test('simultaneous CLI retries with one request ID consume one attempt', async () => {
  const database = resolve(directory, 'parallel.sqlite3');
  const app = new App({ database, suite });
  const run = app.create(metadata);
  app.close();
  const calls = Array.from({ length: 3 }, () => Bun.spawn([process.execPath, resolve(root, 'cli.js'), '--database', database, 'guess', run.id, 'en-01', 'book', '--request-id', 'same'], { stdout: 'pipe', stderr: 'pipe' }));
  for (const child of calls) {
    expect(await child.exited).toBe(0);
    expect(JSON.parse(await new Response(child.stdout).text()).attempt).toBe(1);
  }
  const reopened = new App({ database, suite });
  try { expect(reopened.get(run.id).rounds['en-01'].events).toHaveLength(1); } finally { reopened.close(); }
});

test('optional web adapter uses the same engine and exposes no private files', async () => {
  const app = new App({ database: resolve(directory, 'http.sqlite3'), suite });
  const server = serve(app, { port: 0 });
  const request = async (path, body) => fetch(new URL(path, server.url), body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const response = await request('/api/runs', { ...metadata, track: 'browser' });
    expect(response.status).toBe(201);
    const run = await response.json();
    const result = await (await request(`/api/runs/${run.id}/guess`, { round_id: 'en-01', word: 'lantern' })).json();
    expect(result.rounds['en-01'].status).toBe('solved');
    expect(result.summary.all.solved).toBe(1);
    expect((await request('/tools/suite_targets.json')).status).toBe(404);
    expect((await request('/data/ru.json.gz')).status).toBe(404);
    expect((await request('/api/runs', {})).status).toBe(400);
  } finally { server.stop(true); app.close(); }
});
