import { test, expect } from 'bun:test';
import { prepareVectors, rankWords, sampleTargets } from '../tools/suite-generation.js';
import { root, Suite } from '../src/dataset.js';
import { resolve } from 'node:path';

test('cosine ranks are norm invariant, force the exact answer first and break rounded ties alphabetically', () => {
  const bank = prepareVectors(['target', 'zebra', 'alpha', 'opposite'], [2,0, 4,0, 1,0, -2,0], 2);
  expect(rankWords(bank, 'target')).toEqual([1,3,2,4]);
  expect(() => prepareVectors(['zero'], [0,0], 2)).toThrow('Zero vector');
});

test('seeded target selection is reproducible and without replacement', () => {
  const words = ['apple','beacon','cedar','desert','elm','forest','garden','harbor'];
  const first = sampleTargets(words, 5, 'version-one');
  expect(sampleTargets([...words].reverse(), 5, 'version-one')).toEqual(first);
  expect(new Set(first).size).toBe(5);
  expect(first.includes('elm')).toBe(false);
});

test('bundled extra datasets verify their checksums and cannot share the original oracle identity', () => {
  const original = new Suite();
  const fresh = new Suite(resolve(root, 'datasets/numberbatch-20261124'));
  const modern = new Suite(resolve(root, 'datasets/bge-small-en-v1'));
  expect(fresh.public().rounds.length).toBe(20);
  expect(modern.public().rounds.length).toBe(10);
  expect(new Set([original.fingerprint, fresh.fingerprint, modern.fingerprint]).size).toBe(3);
  expect(fresh.manifest.track).toBe('numberbatch-19.08');
  expect(modern.manifest.embedding_parameters.pooling).toBe('cls');
  expect(modern.manifest.embedding_parameters.model_revision).toHaveLength(40);
  expect(modern.public().rounds.every(round => round.language === 'en' && round.vocabulary_size === 50000)).toBe(true);
});
