import { parseArgs } from 'node:util';
import { Suite } from '../src/dataset.js';
import { loadVectorBank, rankWords } from './suite-generation.js';

const { values } = parseArgs({ options: { bank: { type: 'string' }, suite: { type: 'string' } } });
const suite = new Suite(values.suite);
const bank = loadVectorBank(values.bank);
let checked = 0;
for (const [id, table] of suite.tables) {
  const vectors = bank.languages[table.language];
  const words = [...suite.words.get(table.language).keys()];
  if (!vectors || JSON.stringify(vectors.words) !== JSON.stringify(words)) throw Error(`Vocabulary mismatch: ${id}`);
  const target = words[table.ranks.indexOf(1)];
  const recomputed = rankWords(vectors, target);
  for (let i = 0; i < table.ranks.length; i++) {
    if (table.ranks[i] !== recomputed[i]) throw Error(`Rank mismatch in ${id} for ${words[i]}`);
    checked++;
  }
}
console.log(JSON.stringify({ suite: suite.manifest.id, fingerprint: suite.fingerprint, checked_ranks: checked, mismatches: 0 }));
