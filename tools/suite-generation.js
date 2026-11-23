import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function prepareVectors(words, vectors, dimensions) {
  if (!Number.isInteger(dimensions) || dimensions < 1 || vectors.length !== words.length * dimensions || new Set(words).size !== words.length) throw Error('Invalid vector dimensions or vocabulary');
  const normalized = new Float64Array(vectors.length);
  for (let row = 0; row < words.length; row++) {
    const start = row * dimensions;
    let norm = 0;
    for (let j = 0; j < dimensions; j++) {
      const value = vectors[start + j];
      if (!Number.isFinite(value)) throw Error(`Non-finite vector for ${words[row]}`);
      norm += value * value;
    }
    if (!norm) throw Error(`Zero vector for ${words[row]}`);
    norm = Math.sqrt(norm);
    for (let j = 0; j < dimensions; j++) normalized[start + j] = vectors[start + j] / norm;
  }
  return { words, vectors: normalized, dimensions };
}

export function rankWords(bank, target) {
  const targetIndex = bank.words.indexOf(target);
  if (targetIndex === -1) throw Error(`Target is absent from vocabulary: ${target}`);
  const scores = new Float64Array(bank.words.length);
  const offset = targetIndex * bank.dimensions;
  for (let row = 0; row < bank.words.length; row++) {
    let dot = 0;
    for (let j = 0; j < bank.dimensions; j++) dot += bank.vectors[row * bank.dimensions + j] * bank.vectors[offset + j];
    scores[row] = Number(dot.toFixed(6));
  }
  scores[targetIndex] = 2;
  const order = Array.from({ length: bank.words.length }, (_, i) => i).sort((a, b) => scores[b] - scores[a] || (bank.words[a] < bank.words[b] ? -1 : bank.words[a] > bank.words[b] ? 1 : 0));
  const ranks = new Array(order.length);
  order.forEach((index, rank) => { ranks[index] = rank + 1; });
  return ranks;
}

export function sampleTargets(words, count, seed) {
  const pool = words.filter(word => word.length >= 4 && word.length <= 20).sort();
  if (!Number.isInteger(count) || count < 1 || count > pool.length) throw Error('Invalid target count');
  let state = createHash('sha256').update(String(seed)).digest().readUInt32LE(0) || 1;
  for (let i = pool.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function loadVectorBank(directory) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'semantic-vector-bank-v1' || !['int8', 'float32le'].includes(manifest.dtype)) throw Error('Unsupported vector bank format');
  const languages = {};
  for (const [language, info] of Object.entries(manifest.languages)) {
    const wordBytes = readFileSync(resolve(directory, info.words));
    const vectorBytes = readFileSync(resolve(directory, info.vectors));
    if (digest(wordBytes) !== info.words_sha256 || digest(vectorBytes) !== info.vectors_sha256) throw Error(`Vector bank checksum mismatch: ${language}`);
    const words = JSON.parse(wordBytes);
    const width = manifest.dtype === 'int8' ? 1 : 4;
    if (words.length !== info.vocabulary_size || vectorBytes.length !== words.length * manifest.dimensions * width) throw Error('Vector bank size mismatch');
    const vectors = manifest.dtype === 'int8' ? new Int8Array(vectorBytes.buffer, vectorBytes.byteOffset, vectorBytes.length) : Float32Array.from({ length: vectorBytes.length / 4 }, (_, i) => vectorBytes.readFloatLE(i * 4));
    languages[language] = prepareVectors(words, vectors, manifest.dimensions);
  }
  return { manifest, languages };
}

export function generateSuite({ bank, directory, id, seed, count = 10, targets, maxGuesses = 50 }) {
  if (!/^[a-z0-9][a-z0-9.-]{2,80}$/.test(id) || !Number.isInteger(maxGuesses) || maxGuesses < 1) throw Error('Invalid suite ID or attempt budget');
  if (existsSync(directory)) throw Error('Suite destination already exists; frozen sets cannot be overwritten');
  if (!targets && seed === undefined) throw Error('A reproducible seed or explicit targets are required');
  const manifest = {
    id, version: 1, track: bank.manifest.track, max_guesses: maxGuesses,
    embedding: bank.manifest.embedding, source_url: bank.manifest.source_url,
    source_sha256: bank.manifest.source_sha256, license: bank.manifest.vocabulary_license ?? bank.manifest.license,
    embedding_license: bank.manifest.license,
    vocabulary_source: bank.manifest.vocabulary_source ?? null, vocabulary_license: bank.manifest.vocabulary_license ?? null,
    embedding_parameters: Object.fromEntries(['model_revision', 'pooling', 'prefix', 'dtype', 'runtime', 'vocabulary_sha256'].filter(key => bank.manifest[key] !== undefined).map(key => [key, bank.manifest[key]])),
    vector_bank_sha256: digest(Buffer.from(JSON.stringify(bank.manifest))),
    generator: 'semantic-suite-js-v1', target_selection: targets ? 'explicit' : 'seeded-uniform-4-to-20-letters',
    seed: seed === undefined ? null : String(seed), languages: {},
  };
  const payloads = [];
  const languages = targets ? Object.keys(targets) : Object.keys(bank.languages);
  if (!languages.length) throw Error('No target languages selected');
  for (const language of languages) {
    const vectors = bank.languages[language];
    if (!vectors) throw Error(`No vector bank for ${language}`);
    const supplied = targets?.[language] ?? sampleTargets(vectors.words, count, `${seed}:${language}`);
    if (!Array.isArray(supplied) || supplied.some(word => typeof word !== 'string')) throw Error('Targets must be an array of words');
    const answers = supplied.map(word => word.normalize('NFC').toLowerCase().replaceAll('\u0451', '\u0435').trim());
    if (!answers.length || answers.length > 99 || new Set(answers).size !== answers.length) throw Error('Targets must be unique, with 1 to 99 rounds per language');
    const ranks = Object.fromEntries(answers.map((answer, index) => [`${language}-${String(index + 1).padStart(2, '0')}`, rankWords(vectors, answer)]));
    const file = `${language}.json.gz`;
    const bytes = gzipSync(Buffer.from(JSON.stringify({ words: vectors.words, ranks })), { level: 9 });
    manifest.languages[language] = { file, sha256: digest(bytes), vocabulary_size: vectors.words.length, rounds: Object.keys(ranks) };
    payloads.push({ file, bytes });
  }
  mkdirSync(directory, { recursive: true });
  for (const { file, bytes } of payloads) writeFileSync(resolve(directory, file), bytes);
  writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
