import { test, expect } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { root, Suite } from '../src/dataset.js';
import { App } from '../src/app.js';
import { expandMatrix, exportComparison } from '../tools/experiment.js';
import { importVectors } from '../tools/import-vectors.js';
import { generateSuite, loadVectorBank } from '../tools/suite-generation.js';
import { serveRound } from '../src/round-server.js';

const parent = resolve(root, '.checks');
mkdirSync(parent, { recursive: true });
const temporary = () => mkdtempSync(resolve(parent, 'experiment-test-'));
const cleanup = directory => {
  if (!directory.startsWith(parent + sep)) throw Error('Test cleanup escaped workspace');
  rmSync(directory, { recursive: true, force: true });
};

test('effort matrix keeps every model/provider/effort/trial separate and rejects unsupported None', () => {
  const config = { scope: 'en', repetitions: 2, participants: [{ model: 'model', provider: 'provider', efforts: ['low', 'high'], supported_efforts: ['low', 'high'] }] };
  expect(expandMatrix(config).map(p => [p.effort, p.repetition])).toEqual([['low',1],['low',2],['high',1],['high',2]]);
  expect(() => expandMatrix({ ...config, participants: [{ ...config.participants[0], efforts: ['none'] }] })).toThrow('Unsupported effort');
  expect(() => expandMatrix({ ...config, participants: [...config.participants, ...config.participants] })).toThrow('Duplicate');
});

test('text, gzipped binary and precomputed JSON import produce playable frozen ranks with source hashes', async () => {
  const directory = temporary();
  try {
    const words = ['alpha', 'beta', 'gamma'];
    const rows = [[1,0], [0,1], [-1,0]];
    const binary = [Buffer.from('3 2\n')];
    words.forEach((word, i) => {
      const floats = Buffer.alloc(8); rows[i].forEach((value, j) => floats.writeFloatLE(value, j * 4));
      binary.push(Buffer.from(word + ' '), floats, Buffer.from('\n'));
    });
    const sources = [
      ['text', 'vectors.txt', Buffer.from('3 2\nAlpha 1 0\nbeta 0 1\ngamma -1 0\n')],
      ['word2vec-binary', 'vectors.bin.gz', gzipSync(Buffer.concat(binary))],
      ['json', 'vectors.json', Buffer.from(JSON.stringify({ words, vectors: rows }))],
    ];
    for (const [format, file, bytes] of sources) {
      const source = resolve(directory, file), out = resolve(directory, format);
      writeFileSync(source, bytes);
      const imported = await importVectors({ source, out, format, language: 'en', track: 'fixture', embedding: 'fixture', license: 'MIT', sourceUrl: 'https://example.org/fixture' });
      expect(imported.words).toBe(3);
      expect(imported.source_sha256).toHaveLength(64);
      const suiteDirectory = resolve(directory, `${format}-suite`);
      generateSuite({ bank: loadVectorBank(out), directory: suiteDirectory, id: `fixture-${format}`, targets: { en: ['beta'] } });
      const suite = new Suite(suiteDirectory);
      expect(suite.lookup('en-01', 'beta').rank).toBe(1);
      expect(suite.lookup('en-01', 'alpha').rank).toBe(2);
      expect(() => generateSuite({ bank: loadVectorBank(out), directory: suiteDirectory, id: 'replacement', seed: 'no' })).toThrow('cannot be overwritten');
    }
    const source = resolve(directory, 'vectors.bin.gz');
    writeFileSync(source, gzipSync(Buffer.concat(binary).subarray(0, -6)));
    await expect(importVectors({ source, out: resolve(directory, 'bad'), format: 'word2vec-binary', language: 'en' })).rejects.toThrow('Truncated');
  } finally { cleanup(directory); }
});

test('scoped oracle rejects other routes and round injection while preserving retry semantics', async () => {
  const directory = temporary();
  const app = new App({ database: resolve(directory, 'oracle.sqlite3') });
  const run = app.create({ model: 'human-anonymous', provider: 'human', effort: 'none', participant_type: 'human', track: 'http' });
  const token = '0123456789abcdef0123456789abcdef';
  const server = serveRound(app, { runId: run.id, roundId: 'en-01', token, port: 0 });
  const call = (path, body, authorized = true) => fetch(new URL(path, server.url), { headers: { ...(authorized ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  try {
    expect((await call('/round', null, false)).status).toBe(401);
    expect((await call('/api/runs/' + run.id)).status).toBe(404);
    const round = await (await call('/round')).json();
    expect(Object.keys(round)).toEqual(['round','language','vocabulary_size','max_guesses','status','guesses']);
    const body = { round_id: 'en-02', word: 'river', request_id: 'retry' };
    expect((await call('/guess', body)).status).toBe(400);
    body.round_id = 'en-01';
    const first = await (await call('/guess', body)).json();
    const second = await (await call('/guess', body)).json();
    expect(first).toEqual(second);
    expect(app.get(run.id).rounds['en-01'].events.length).toBe(1);
    expect(app.get(run.id).rounds['en-02'].events.length).toBe(0);
    expect(() => exportComparison(app, [run.id], 'en')).toThrow('incomplete');
    for (const roundId of Object.keys(run.rounds).filter(id => id.startsWith('en-'))) app.change(run.id, 'abandon', { round_id: roundId });
    const report = exportComparison(app, [run.id], 'en');
    expect(report.paired.length).toBe(10);
    expect(report.runs[0].metadata.participant_type).toBe('human');
    expect(report.runs[0].summary.by_language.en.rounds).toBe(10);
    expect(Object.keys(report.runs[0].rounds).some(id => id.startsWith('ru-'))).toBe(false);
  } finally { server.stop(true); app.close(); cleanup(directory); }
});
