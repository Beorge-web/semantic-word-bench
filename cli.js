import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { App } from './src/app.js';
import { Suite } from './src/dataset.js';
import { finished, summarize } from './src/engine.js';
import { serve } from './src/server.js';

const help = `Semantic Word Bench. JavaScript / Bun. No install or server required.

bun cli.js create --model NAME --provider NAME --effort MODE [--repetition 1]
bun cli.js prompt RUN ROUND
bun cli.js guess RUN ROUND WORD [--request-id ID]
bun cli.js play RUN ROUND
bun cli.js history RUN ROUND
bun cli.js abandon RUN ROUND
bun cli.js summary RUN
bun cli.js export RUN --out result.json
bun cli.js finish RUN
bun cli.js intervention RUN --note TEXT
bun cli.js check-data
bun cli.js serve [--host 127.0.0.1 --port 8765]

All local commands accept --database PATH. play reads one word per line;
:quit pauses, :giveup abandons. Every guess prints one compact JSON result.
`;

export async function main(args = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: {
    model: { type: 'string' }, provider: { type: 'string' }, effort: { type: 'string' }, repetition: { type: 'string' },
    database: { type: 'string' }, out: { type: 'string' }, note: { type: 'string' }, 'request-id': { type: 'string' },
    host: { type: 'string' }, port: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  const [command, id, roundId, word] = positionals;
  const print = value => console.log(JSON.stringify(value));
  if (!command || values.help) { console.log(help); return; }
  const arity = { create: 0, prompt: 2, guess: 3, play: 2, history: 2, abandon: 2, summary: 1, export: 1, finish: 1, intervention: 1, 'check-data': 0, serve: 0 };
  if (!Object.hasOwn(arity, command) || positionals.length - 1 !== arity[command]) throw new Error('Invalid command or arguments. Use --help');
  if (command === 'check-data') { const suite = new Suite(); print(suite.public()); return; }
  const app = new App({ database: values.database ? resolve(values.database) : undefined });
  try {
    if (command === 'create') {
      const run = app.create({ model: values.model, provider: values.provider, effort: values.effort, repetition: Number(values.repetition ?? 1), track: 'cli' });
      print({ run_id: run.id, track: 'cli', rounds: Object.keys(run.rounds) });
    } else if (command === 'prompt') console.log(app.prompt(id, roundId));
    else if (command === 'guess') print(app.change(id, 'guess', { round_id: roundId, word, request_id: values['request-id'] }).feedback);
    else if (command === 'history') {
      const round = app.get(id).rounds[roundId];
      if (!round) throw new Error('Unknown round');
      print({ round: round.id, status: round.status, guesses: round.events.map(({ attempt, word, rank, error, duplicate }) => ({ attempt, word, rank, ...(error ? { error } : {}), ...(duplicate ? { duplicate: true } : {}) })) });
    } else if (command === 'summary') {
      const run = app.get(id);
      print({ run_id: run.id, metadata: run.metadata, ...summarize(run, app.suite.limit) });
    } else if (command === 'export') {
      if (!values.out) throw new Error('export requires --out PATH');
      writeFileSync(resolve(values.out), JSON.stringify(app.present(app.get(id)), null, 2) + '\n', 'utf8');
      print({ saved: resolve(values.out) });
    } else if (command === 'play') {
      const round = app.get(id).rounds[roundId];
      if (!round) throw new Error('Unknown round');
      print({ round: roundId, status: round.status, attempts: round.events.length, remaining: app.suite.limit - round.events.length });
      if (finished(round)) return;
      const input = createInterface({ input: process.stdin, terminal: false });
      for await (const line of input) {
        if (line === ':quit') { input.close(); break; }
        if (line === ':giveup') { app.change(id, 'abandon', { round_id: roundId }); print({ round: roundId, status: 'abandoned' }); input.close(); break; }
        const result = app.change(id, 'guess', { round_id: roundId, word: line }).feedback;
        print(result);
        if (finished(app.get(id).rounds[roundId])) { input.close(); break; }
      }
    } else if (command === 'serve') {
      const port = Number(values.port ?? 8765);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
      const server = serve(app, { hostname: values.host ?? '127.0.0.1', port });
      console.log(`Semantic Word Bench: ${server.url}`);
      await new Promise(resolve => {
        const stop = () => { server.stop(true); resolve(); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
      });
    } else {
      const action = command === 'intervention' ? { note: values.note } : { round_id: roundId };
      const { run } = app.change(id, command, action);
      print(command === 'abandon' ? { round: roundId, status: run.rounds[roundId].status } : { run_id: id, ...summarize(run, app.suite.limit) });
    }
  } finally { app.close(); }
}

if (import.meta.main) main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
