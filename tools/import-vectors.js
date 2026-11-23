import { createReadStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { canonicalWord, validWord, writeVectorBank } from './vector-bank.js';

export async function importVectors(options) {
  const { source, format, language, limit = 50000, vocabulary } = options;
  if (!['text', 'word2vec-binary', 'json'].includes(format) || !['en', 'ru'].includes(language) || !Number.isInteger(limit) || limit < 1) throw Error('Invalid format, language or limit');
  const wanted = vocabulary ? new Set(vocabulary.map(canonicalWord)) : null;
  const words = [], rows = [], seen = new Set();
  let dimensions;
  function accept(raw, values) {
    const word = canonicalWord(raw);
    if (!validWord(word, language) || seen.has(word) || (wanted && !wanted.has(word)) || words.length >= limit) return;
    values = typeof values === 'function' ? values() : values;
    dimensions ??= values.length;
    if (!dimensions || values.length !== dimensions || values.some(value => !Number.isFinite(value)) || values.every(value => value === 0)) throw Error(`Invalid vector for ${word}`);
    seen.add(word); words.push(word); rows.push(values);
  }
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(source)) hash.update(bytes);
  const sourceHash = hash.digest('hex');
  if (options.sha256 && options.sha256 !== sourceHash) throw Error('Source checksum mismatch');
  const stream = createReadStream(source);
  const input = source.endsWith('.gz') ? stream.pipe(createGunzip()) : stream;
  if (format === 'text') {
    let first = true;
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      const fields = line.trim().split(/\s+/);
      if (first && fields.length === 2 && fields.every(value => /^\d+$/.test(value))) { dimensions = Number(fields[1]); first = false; continue; }
      first = false;
      if (fields.length < 2) continue;
      accept(fields[0], () => fields.slice(1).map(Number));
    }
  } else if (format === 'json') {
    const chunks = [];
    for await (const chunk of input) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(data.words) || !Array.isArray(data.vectors) || data.words.length !== data.vectors.length) throw Error('Expected {words: [...], vectors: [[...], ...]}');
    data.words.forEach((word, index) => accept(word, data.vectors[index]));
  } else {
    let pending = Buffer.alloc(0), header = false, count = 0, total;
    for await (const chunk of input) {
      pending = Buffer.concat([pending, chunk]);
      if (!header) {
        const end = pending.indexOf(10);
        if (end === -1) continue;
        [total, dimensions] = pending.subarray(0, end).toString('ascii').trim().split(/\s+/).map(Number);
        if (!Number.isInteger(total) || total < 1 || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 65536) throw Error('Invalid word2vec header');
        pending = pending.subarray(end + 1); header = true;
      }
      let offset = 0;
      while (count < total) {
        while ([10, 13].includes(pending[offset])) offset++;
        const end = pending.indexOf(32, offset);
        if (end === -1 || pending.length < end + 1 + dimensions * 4) break;
        const word = pending.subarray(offset, end).toString('utf8');
        accept(word, () => Array.from({ length: dimensions }, (_, i) => pending.readFloatLE(end + 1 + i * 4)));
        count++; offset = end + 1 + dimensions * 4;
      }
      pending = pending.subarray(offset);
    }
    if (!header || count !== total || pending.some(byte => ![10, 13, 32].includes(byte))) throw Error('Truncated or malformed word2vec binary');
  }
  if (wanted && [...wanted].some(word => !seen.has(word))) throw Error('Source is missing requested vocabulary; choose its explicit intersection before importing');
  const manifest = writeVectorBank(options.out, {
    track: options.track, embedding: options.embedding, source_url: options.sourceUrl,
    source_sha256: sourceHash, license: options.license, import_format: format,
    vocabulary_selection: wanted ? 'explicit' : `first-${limit}-valid-source-entries`,
  }, { [language]: { words, vectors: rows.flat(), dimensions } });
  return { output: options.out, track: manifest.track, dimensions, words: words.length, source_sha256: sourceHash };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: Object.fromEntries(['source', 'format', 'language', 'limit', 'vocabulary', 'out', 'track', 'embedding', 'source-url', 'license', 'sha256'].map(key => [key, { type: 'string' }])) });
  const result = await importVectors({ ...values, sourceUrl: values['source-url'], limit: Number(values.limit ?? 50000), vocabulary: values.vocabulary ? JSON.parse(readFileSync(values.vocabulary, 'utf8')) : undefined });
  console.log(JSON.stringify(result));
}
