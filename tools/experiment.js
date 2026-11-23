import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { App } from '../src/app.js';
import { root, Suite } from '../src/dataset.js';
import { summarize, finished } from '../src/engine.js';

export function expandMatrix(config) {
  if (!['en', 'ru', 'all'].includes(config.scope) || !Number.isInteger(config.repetitions) || config.repetitions < 1 || config.repetitions > 100 || !config.participants?.length) throw Error('Invalid experiment scope, repetitions or participants');
  const profiles = [];
  for (const entry of config.participants) {
    if (!entry.model || !entry.provider || !entry.efforts?.length || !entry.supported_efforts?.length) throw Error('Each participant requires model, provider and explicit supported efforts');
    for (const effort of entry.efforts) {
      if (!entry.supported_efforts.includes(effort)) throw Error(`Unsupported effort ${effort} for ${entry.model}`);
      if (entry.participant_type === 'human' && effort !== 'none') throw Error('Human participants use effort none');
      for (let repetition = 1; repetition <= config.repetitions; repetition++) {
        profiles.push({ model: entry.model, provider: entry.provider, effort, repetition, service_tier: entry.service_tier ?? null, participant_type: entry.participant_type ?? 'model', track: 'cli', scope: config.scope });
      }
    }
  }
  const keys = profiles.map(profile => JSON.stringify([profile.model, profile.provider, profile.effort, profile.service_tier, profile.repetition]));
  if (new Set(keys).size !== keys.length) throw Error('Duplicate participant profile');
  return profiles;
}

export function exportComparison(app, ids, scope, audits = []) {
  const runs = ids.map(id => {
    const full = app.get(id);
    if (full.suite_fingerprint !== app.suite.fingerprint) throw Error('Export suite does not match run');
    const rounds = Object.fromEntries(Object.entries(full.rounds).filter(([, round]) => scope === 'all' || round.language === scope));
    if (!Object.keys(rounds).length || !Object.values(rounds).every(finished)) throw Error(`Run ${id} has incomplete scoped rounds`);
    const run = { ...full, scope, rounds };
    return { ...run, summary: summarize(run, app.suite.limit) };
  });
  if (!runs.length) throw Error('No runs selected');
  const paired = Object.keys(runs[0].rounds).map(id => {
    const table = app.suite.tables.get(id);
    const answerIndex = table.ranks.indexOf(1);
    const answer = [...app.suite.words.get(table.language).keys()][answerIndex];
    return { id, answer };
  });
  const timestamps = [
    ...runs.flatMap(run => Object.values(run.rounds).flatMap(round => round.events.map(event => event.result_ms))),
    ...audits.map(audit => Date.parse(audit.completed_at)),
  ].filter(Number.isFinite);
  return { schema_version: 1, scope, repeats: Math.max(...runs.map(run => run.metadata.repetition)), max_guesses: app.suite.limit,
    vocabulary_size: Object.fromEntries(app.suite.public().rounds.map(round => [round.language, round.vocabulary_size])),
    started_at: runs.map(run => run.created_at).sort()[0],
    completed_at: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    runs, paired };
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: Object.fromEntries(['config', 'out', 'plan', 'audits'].map(key => [key, { type: 'string' }])) });
  const [command] = positionals;
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  if (command === 'plan') {
    const config = read(values.config);
    const profiles = expandMatrix(config);
    if (!values.out) { console.log(JSON.stringify({ id: config.id, profiles }, null, 2)); process.exit(0); }
    const directory = resolve(values.out);
    if (existsSync(directory)) throw Error('Experiment directory already exists');
    const suite = new Suite(resolve(root, config.suite));
    mkdirSync(directory, { recursive: true });
    const app = new App({ database: resolve(directory, 'runs.sqlite3'), suite });
    try {
      const jobs = profiles.map(profile => {
        const run = app.create(profile);
        const rounds = Object.values(run.rounds).filter(round => config.scope === 'all' || round.language === config.scope).map(round => {
          const file = `prompts/${run.id}/${round.id}.txt`;
          mkdirSync(dirname(resolve(directory, file)), { recursive: true });
          writeFileSync(resolve(directory, file), app.prompt(run.id, round.id), 'utf8');
          return { id: round.id, prompt: file };
        });
        return { run_id: run.id, profile, rounds };
      });
      writeFileSync(resolve(directory, 'plan.json'), JSON.stringify({ id: config.id, suite: suite.directory, database: app.database, scope: config.scope, suite_fingerprint: suite.fingerprint, jobs }, null, 2) + '\n');
      console.log(JSON.stringify({ directory, participant_runs: jobs.length, round_jobs: jobs.reduce((sum, job) => sum + job.rounds.length, 0) }));
    } finally { app.close(); }
  } else if (command === 'export') {
    const plan = read(values.plan), audits = values.audits ? read(values.audits).rounds : [];
    const app = new App({ database: plan.database, suite: new Suite(plan.suite) });
    try {
      const report = exportComparison(app, plan.jobs.map(job => job.run_id), plan.scope, audits);
      writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify({ output: resolve(values.out), runs: report.runs.length }));
    } finally { app.close(); }
  } else throw Error('Use plan --config FILE [--out NEW_DIRECTORY] or export --plan FILE --out FILE [--audits FILE]');
}
