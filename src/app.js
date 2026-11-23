import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { root, Suite } from './dataset.js';
import { applyGuess, feedback, finished, RuleError, summarize } from './engine.js';
import { protocolFingerprint, renderPrompt } from './protocol.js';
import { Store } from './storage.js';

export class App {
  constructor({ database = resolve(root, 'runs/benchmark.sqlite3'), suite = new Suite() } = {}) {
    this.suite = suite;
    this.database = database;
    this.store = new Store(database);
  }

  create(metadata) {
    for (const field of ['model', 'provider', 'effort', 'track']) {
      if (typeof metadata[field] !== 'string' || !metadata[field].trim() || metadata[field].length > 120) throw new Error(`Invalid ${field}`);
    }
    if (!['cli', 'http', 'browser'].includes(metadata.track)) throw new Error('Invalid track');
    if (metadata.participant_type !== undefined && !['model', 'human'].includes(metadata.participant_type)) throw new Error('Invalid participant type');
    if (metadata.participant_type === 'human' && metadata.effort !== 'none') throw new Error('Human participants use effort none');
    const repetition = metadata.repetition ?? 1;
    if (!Number.isInteger(repetition) || repetition < 1 || repetition > 100) throw new Error('Invalid repetition');
    return this.store.create({
      id: randomUUID().replaceAll('-', ''), created_at: new Date().toISOString(),
      metadata: { ...metadata, repetition, prompt_mode: 'baseline' }, suite_id: this.suite.manifest.id, suite_fingerprint: this.suite.fingerprint,
      protocol_fingerprint: protocolFingerprint(), interventions: [],
      rounds: Object.fromEntries(this.suite.public().rounds.map(round => [round.id, { ...round, status: 'pending', best_rank: null, events: [] }])),
    });
  }

  get(id) { return this.store.get(id); }
  present(run) { return { ...run, summary: summarize(run, this.suite.limit) }; }
  prompt(id, roundId, options) {
    const suiteArgument = this.suite.directory && this.suite.directory !== resolve(root, 'data') ? ` --suite "${this.suite.directory}"` : '';
    return renderPrompt(this.get(id), roundId, { cliCommand: `bun "${resolve(root, 'cli.js')}" --database "${this.database}"${suiteArgument}`, maxGuesses: this.suite.limit, ...options });
  }

  change(id, action, body = {}) {
    const started = performance.now(), receivedMs = Date.now();
    if (['guess', 'abandon'].includes(action) && !this.suite.tables.has(body.round_id)) throw new Error('Unknown round');
    if (action === 'guess' && (typeof body.word !== 'string' || body.word.length > 200)) throw new Error('Expected one word');
    const requestId = body.request_id ?? randomUUID();
    if (typeof requestId !== 'string' || !requestId.length || requestId.length > 100) throw new Error('Invalid request_id');
    if (action === 'intervention' && (typeof body.note !== 'string' || !body.note.length || body.note.length > 1000)) throw new Error('Expected an intervention note');
    let event;
    const run = this.store.update(id, current => {
      if (current.suite_fingerprint !== this.suite.fingerprint || current.protocol_fingerprint !== protocolFingerprint()) throw new RuleError('Dataset or protocol changed; create a new run');
      if (action === 'guess') {
        if (Object.values(current.rounds).some(round => round.id !== body.round_id && round.events.some(event => event.request_id === requestId))) throw new RuleError('request_id already used in another round');
        const result = applyGuess(this.suite, current.rounds[body.round_id], body.word, requestId, {
          received_ms: receivedMs, result_ms: Date.now(), service_ms: performance.now() - started,
        });
        current.rounds[body.round_id] = result.round;
        event = result.event;
      } else if (action === 'abandon' || action === 'finish') {
        for (const round of Object.values(current.rounds)) if (!finished(round) && (action === 'finish' || round.id === body.round_id)) round.status = 'abandoned';
      } else if (action === 'intervention') current.interventions.push({ at: new Date().toISOString(), note: body.note });
      else throw new Error('Unknown action');
      return current;
    });
    return { run, feedback: event ? feedback(run.rounds[body.round_id], event, this.suite.limit) : null };
  }

  close() { this.store.close(); }
}
