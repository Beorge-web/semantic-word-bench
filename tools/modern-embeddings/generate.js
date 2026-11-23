import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pipeline, env } from '@huggingface/transformers';
import { canonicalWord, validWord, writeVectorBank, sha256 } from '../vector-bank.js';

const { values } = parseArgs({ options: Object.fromEntries(['model', 'revision', 'pooling', 'prefix', 'dtype', 'vocabulary', 'vocabulary-source', 'vocabulary-license', 'language', 'out', 'track', 'license', 'batch-size', 'cache'].map(key => [key, { type: 'string' }])) });
const { model, revision, pooling, language } = values;
if (!model || !/^[a-f0-9]{40}$/.test(revision ?? '') || !['cls', 'mean'].includes(pooling) || !['en', 'ru'].includes(language)) throw Error('Specify a model, full commit revision, cls/mean pooling and en/ru language');
const vocabularyBytes = readFileSync(values.vocabulary);
const words = JSON.parse(vocabularyBytes).map(canonicalWord);
const batch = Number(values['batch-size'] ?? 32);
if (!Number.isInteger(batch) || batch < 1 || batch > 256 || !words.length || new Set(words).size !== words.length || words.some(word => !validWord(word, language))) throw Error('Invalid batch size or vocabulary');
if (values.cache) env.cacheDir = values.cache;
const dtype = values.dtype ?? 'q8';
const prefix = values.prefix ?? '';
const extractor = await pipeline('feature-extraction', model, { revision, dtype, device: 'cpu' });
const vectors = [];
let dimensions;
try {
  for (let start = 0; start < words.length; start += batch) {
    const result = await extractor(words.slice(start, start + batch).map(word => prefix + word), { pooling, normalize: true });
    dimensions ??= result.dims[1];
    if (result.dims.length !== 2 || result.dims[1] !== dimensions) throw Error('Unexpected embedding output dimensions');
    for (const value of result.data) vectors.push(value);
    console.error(`Embedded ${Math.min(start + batch, words.length)}/${words.length}`);
  }
} finally { await extractor.dispose(); }
const manifest = writeVectorBank(values.out, {
  track: values.track, embedding: `${model}@${revision}`, source_url: `https://huggingface.co/${model}/tree/${revision}`,
  source_sha256: null, license: values.license, model_revision: revision, pooling, prefix, dtype,
  runtime: '@huggingface/transformers@3.8.1', vocabulary_sha256: sha256(vocabularyBytes),
  vocabulary_source: values['vocabulary-source'] ?? null, vocabulary_license: values['vocabulary-license'] ?? null,
}, { [language]: { words, vectors, dimensions } });
console.log(JSON.stringify({ output: values.out, track: manifest.track, dimensions, words: words.length }));
