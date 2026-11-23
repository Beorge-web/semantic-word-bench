import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareVectors } from './suite-generation.js';

export const canonicalWord = word => word.normalize('NFC').toLowerCase().replaceAll('\u0451', '\u0435');
export const validWord = (word, language) => (language === 'en' ? /^[a-z]{2,30}$/ : /^[\u0430-\u044f]{2,30}$/).test(word);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function writeVectorBank(directory, metadata, languages) {
  if (existsSync(directory)) throw Error('Vector bank destination already exists');
  if (!metadata.track || !metadata.embedding || !metadata.source_url || !metadata.license) throw Error('Track, embedding, source URL and license are required');
  const entries = Object.entries(languages);
  if (!entries.length) throw Error('No vector languages');
  const dimensions = entries[0][1].dimensions;
  const manifest = { ...metadata, format: 'semantic-vector-bank-v1', dimensions, dtype: 'float32le', languages: {} };
  const files = [];
  for (const [language, bank] of entries) {
    if (!['en', 'ru'].includes(language) || bank.dimensions !== dimensions || !bank.words.length || bank.words.some(word => !validWord(word, language) || canonicalWord(word) !== word)) throw Error('Invalid vector vocabulary');
    prepareVectors(bank.words, bank.vectors, dimensions);
    const words = Buffer.from(JSON.stringify(bank.words));
    const vectors = Buffer.alloc(bank.vectors.length * 4);
    bank.vectors.forEach((value, index) => vectors.writeFloatLE(value, index * 4));
    if (bank.vectors.some(value => !Number.isFinite(Math.fround(value)))) throw Error('Vector exceeds float32 range');
    manifest.languages[language] = { words: `${language}.words.json`, vectors: `${language}.vectors.bin`, vocabulary_size: bank.words.length, words_sha256: sha256(words), vectors_sha256: sha256(vectors) };
    files.push([`${language}.words.json`, words], [`${language}.vectors.bin`, vectors]);
  }
  mkdirSync(directory, { recursive: true });
  for (const [file, bytes] of files) writeFileSync(resolve(directory, file), bytes);
  writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
