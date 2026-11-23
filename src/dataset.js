import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const normalize = word => word.normalize('NFC').toLowerCase().replaceAll('ё', 'е').trim();

export class Suite {
  constructor(directory = resolve(root, 'data')) {
    const manifest = readFileSync(resolve(directory, 'manifest.json'));
    this.manifest = JSON.parse(manifest);
    this.limit = this.manifest.max_guesses;
    this.words = new Map();
    this.tables = new Map();
    const fingerprint = createHash('sha256').update(manifest);
    for (const [language, info] of Object.entries(this.manifest.languages)) {
      const compressed = readFileSync(resolve(directory, info.file));
      if (createHash('sha256').update(compressed).digest('hex') !== info.sha256) throw new Error(`Dataset checksum mismatch: ${language}`);
      fingerprint.update(compressed);
      const payload = JSON.parse(gunzipSync(compressed).toString('utf8'));
      const words = new Map(payload.words.map((word, index) => [word, index]));
      if (words.size !== info.vocabulary_size || words.size !== payload.words.length) throw new Error('Invalid vocabulary');
      this.words.set(language, words);
      if (JSON.stringify(Object.keys(payload.ranks)) !== JSON.stringify(info.rounds)) throw new Error('Invalid round IDs');
      for (const [id, ranks] of Object.entries(payload.ranks)) {
        const seen = new Uint8Array(words.size + 1);
        if (ranks.length !== words.size || ranks.some(rank => !Number.isInteger(rank) || rank < 1 || rank > words.size || seen[rank]++)) throw new Error(`Invalid ranks: ${id}`);
        this.tables.set(id, { language, ranks });
      }
    }
    this.fingerprint = fingerprint.digest('hex');
  }

  public() {
    return {
      id: this.manifest.id, fingerprint: this.fingerprint, max_guesses: this.limit, embedding: this.manifest.embedding,
      rounds: [...this.tables].map(([id, table]) => ({ id, language: table.language, vocabulary_size: table.ranks.length })),
    };
  }

  lookup(id, word) {
    const table = this.tables.get(id);
    if (!table) throw new Error('Unknown round');
    if (!(table.language === 'ru' ? /^[а-я]{2,30}$/u : /^[a-z]{2,30}$/).test(word)) return { rank: null, error: 'invalid_format' };
    const index = this.words.get(table.language).get(word);
    return index === undefined ? { rank: null, error: 'unknown_word' } : { rank: table.ranks[index], error: null };
  }
}
