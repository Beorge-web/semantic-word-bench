import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import * as h5 from 'h5wasm/node';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values } = parseArgs({ options: { source: { type: 'string' }, out: { type: 'string' } } });
const source = resolve(values.source ?? resolve(root, '.cache/numberbatch-19.08-mini.h5'));
const output = resolve(values.out ?? resolve(root, '.cache/vectors/numberbatch-19.08'));
const original = JSON.parse(readFileSync(resolve(root, 'data/manifest.json'), 'utf8'));
const hash = createHash('sha256');
for await (const chunk of createReadStream(source)) hash.update(chunk);
if (hash.digest('hex') !== original.source_sha256) throw Error('Numberbatch source checksum differs from the pinned source');

const languages = Object.fromEntries(Object.entries(original.languages).map(([language, info]) => {
  const { words } = JSON.parse(gunzipSync(readFileSync(resolve(root, 'data', info.file))));
  return [language, { words, index: new Map(words.map((word, index) => [word, index])), rows: new Map(), vectors: new Int8Array(words.length * 300) }];
}));
await h5.ready;
const file = new h5.File(source, 'r');
try {
  const labels = file.get('mat/axis1');
  const matrix = file.get('mat/block0_values');
  if (matrix.shape[1] !== 300 || matrix.dtype !== '<b') throw Error('Unexpected Numberbatch matrix format');
  const selected = new Map();
  const blockSize = 8192;
  for (let start = 0; start < labels.shape[0]; start += blockSize) {
    const chunk = labels.slice([[start, Math.min(start + blockSize, labels.shape[0])]]);
    for (const [offset, label] of chunk.entries()) {
      const parts = Buffer.from(label, 'latin1').toString('utf8').split('/');
      const language = parts[2];
      const bank = languages[language];
      if (!bank) continue;
      const word = parts[3]?.normalize('NFC').toLowerCase().replaceAll('\u0451', '\u0435');
      const index = bank.index.get(word);
      if (index === undefined || bank.rows.has(word)) continue;
      const row = start + offset;
      bank.rows.set(word, row);
      selected.set(row, { bank, index });
    }
  }
  for (const [language, bank] of Object.entries(languages)) {
    if (bank.rows.size !== bank.words.length) throw Error(`Missing ${bank.words.length - bank.rows.size} ${language} vectors`);
  }
  const blocks = [...new Set([...selected.keys()].map(row => Math.floor(row / blockSize)))].sort((a, b) => a - b);
  for (const block of blocks) {
    const start = block * blockSize;
    const end = Math.min(start + blockSize, matrix.shape[0]);
    const vectors = matrix.slice([[start, end], []]);
    for (let row = start; row < end; row++) {
      const item = selected.get(row);
      if (item) item.bank.vectors.set(vectors.subarray((row - start) * 300, (row - start + 1) * 300), item.index * 300);
    }
  }
} finally { file.close(); }

mkdirSync(output, { recursive: true });
const manifest = {
  format: 'semantic-vector-bank-v1', track: 'numberbatch-19.08', embedding: original.embedding,
  dimensions: 300, dtype: 'int8', source_url: original.source_url, source_sha256: original.source_sha256,
  license: original.license, vocabulary_source: original.id, languages: {},
};
for (const [language, bank] of Object.entries(languages)) {
  const words = `${language}.words.json`;
  const vectors = `${language}.vectors.bin`;
  const bytes = Buffer.from(bank.vectors.buffer);
  writeFileSync(resolve(output, words), JSON.stringify(bank.words));
  writeFileSync(resolve(output, vectors), bytes);
  manifest.languages[language] = {
    words, vectors, vocabulary_size: bank.words.length,
    words_sha256: createHash('sha256').update(readFileSync(resolve(output, words))).digest('hex'),
    vectors_sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, track: manifest.track, languages: Object.fromEntries(Object.entries(languages).map(([language, bank]) => [language, bank.words.length])) }));
