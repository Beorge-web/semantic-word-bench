import { test, expect } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { root, Suite } from '../src/dataset.js';
import { generateSuite, prepareVectors } from '../tools/suite-generation.js';

test('a versioned suite is playable through CLI, remains bound in prompts and rejects the wrong oracle', () => {
  const parent = resolve(root, '.checks');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(resolve(parent, 'suite-cli-'));
  const suite = resolve(directory, 'version-two');
  const database = resolve(directory, 'game.sqlite3');
  const cli = (...args) => Bun.spawnSync({ cmd: [process.execPath, resolve(root, 'cli.js'), '--database', database, ...args], cwd: directory });
  try {
    generateSuite({ bank: { manifest: { track: 'fixture', embedding: 'fixture', dimensions: 2, source_sha256: 'fixture', license: 'fixture' }, languages: { en: prepareVectors(['alpha','beta','gamma'], [1,0, 0,1, -1,0], 2) } }, directory: suite, id: 'fixture-version-two', targets: { en: ['alpha'] } });
    const created = cli('--suite', suite, 'create', '--model', 'fixture', '--provider', 'test', '--effort', 'none');
    expect(created.exitCode).toBe(0);
    const id = JSON.parse(created.stdout.toString()).run_id;
    expect(cli('--suite', suite, 'prompt', id, 'en-01').stdout.toString()).toContain(`--suite "${suite}"`);
    const wrong = cli('guess', id, 'en-01', 'alpha');
    expect(wrong.exitCode).toBe(1);
    expect(wrong.stderr.toString()).toContain('Dataset or protocol changed');
    const correct = cli('--suite', suite, 'guess', id, 'en-01', 'alpha');
    expect(JSON.parse(correct.stdout.toString()).rank).toBe(1);
    expect(new Suite().fingerprint).toBe('c497f4347aa6cb3515e939da2d6b0b89dbd863a05508db4e63f5b061a125de51');
  } finally {
    if (!directory.startsWith(parent + sep)) throw Error('Test cleanup path escaped the workspace');
    rmSync(directory, { recursive: true, force: true });
  }
});
