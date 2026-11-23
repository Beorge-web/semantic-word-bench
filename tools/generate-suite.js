import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateSuite, loadVectorBank } from './suite-generation.js';

const { values } = parseArgs({ options: {
  bank: { type: 'string' }, out: { type: 'string' }, id: { type: 'string' }, seed: { type: 'string' },
  rounds: { type: 'string', default: '10' }, targets: { type: 'string' },
} });
if (!values.bank || !values.out || !values.id) throw Error('Usage: node tools/generate-suite.js --bank DIRECTORY --out NEW_DIRECTORY --id VERSION_ID --seed SEED [--rounds 10] [--targets JSON_FILE]');
const bank = loadVectorBank(resolve(values.bank));
const manifest = generateSuite({ bank, directory: resolve(values.out), id: values.id, seed: values.seed, count: Number(values.rounds), targets: values.targets ? JSON.parse(readFileSync(values.targets, 'utf8')) : undefined });
console.log(JSON.stringify({ id: manifest.id, track: manifest.track, languages: manifest.languages }));
