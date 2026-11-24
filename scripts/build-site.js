import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRun } from '../analysis/search.js';
import { Suite } from '../src/dataset.js';
import { participantInfo, auditMatchesRun, summarizeEfforts } from '../analysis/participants.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = resolve(root, 'site');
const siteDataPath = resolve(siteDir, 'data/results.json');
const distDir = resolve(root, 'dist');
const catalogPath = resolve(root, 'results/catalog.json');

function mean(values) {
  if (!values.length) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function assertClose(actual, expected, label, tolerance = 1e-6) {
  if (actual === null && expected === null) return;
  if (typeof actual !== 'number' || typeof expected !== 'number' || Math.abs(actual - expected) > tolerance) {
    throw new Error(`Metric mismatch for ${label}: computed ${actual}, canonical ${expected}`);
  }
}

export function buildDataset(comparison, neonAudit, solAudit) {
  const maxGuesses = comparison.max_guesses;
  const par2Penalty = 2 * maxGuesses;
  const answerByRound = new Map(comparison.paired.map(item => [item.id, item.answer]));
  const roundOrder = comparison.paired.map(item => item.id);

  const runs = comparison.runs.map(run => {
    const runAudits = [...solAudit.rounds, ...neonAudit.rounds].filter(audit => auditMatchesRun(audit, run));
    const info = participantInfo(run, runAudits);
    const search = analyzeRun(run, runAudits);

    const roundEntries = roundOrder.map(roundId => {
      const round = run.rounds[roundId];
      if (!round) throw new Error(`Missing round ${roundId} for ${info.label}`);
      const events = round.events;
      const cycles = events.filter(e => e.cycle_ms !== null).map(e => e.cycle_ms).sort((a, b) => a - b);
      const validRanks = events.filter(e => e.rank !== null).map(e => e.rank);
      const computedBestRank = validRanks.length ? Math.min(...validRanks) : null;
      const invalidCount = events.filter(e => e.error !== null).length;
      const duplicateCount = events.filter(e => e.duplicate).length;

      let runningBest = null;
      const compactEvents = events.map(e => {
        if (e.rank !== null && (runningBest === null || e.rank < runningBest)) {
          runningBest = e.rank;
        }
        return {
          attempt: e.attempt,
          word: e.word,
          rank: e.rank,
          best_rank_so_far: runningBest,
          error: e.error,
          duplicate: e.duplicate,
          cycle_ms: e.cycle_ms,
        };
      });

      return {
        id: round.id,
        vocabulary_size: round.vocabulary_size,
        answer: answerByRound.get(round.id),
        status: round.status,
        attempts: events.length,
        best_rank: computedBestRank,
        invalid: invalidCount,
        duplicates: duplicateCount,
        cycle_count: cycles.length,
        cycle_mean_ms: mean(cycles),
        cycle_median_ms: median(cycles),
        cycle_max_ms: cycles.length ? cycles[cycles.length - 1] : null,
        events: compactEvents,
        search: search.rounds[round.id],
      };
    });

    const solvedRounds = roundEntries.filter(r => r.status === 'solved');
    const solvedAttempts = solvedRounds.map(r => r.attempts).sort((a, b) => a - b);
    const allCycles = roundEntries
      .flatMap(r => r.events.filter(e => e.cycle_ms !== null).map(e => e.cycle_ms))
      .sort((a, b) => a - b);
    const allServiceMs = Object.values(run.rounds)
      .flatMap(r => r.events.map(e => e.service_ms))
      .filter(v => typeof v === 'number');

    const par2 = mean(roundEntries.map(r => (r.status === 'solved' ? r.attempts : par2Penalty)));
    const submissions = roundEntries.reduce((sum, r) => sum + r.attempts, 0);
    const invalid = roundEntries.reduce((sum, r) => sum + r.invalid, 0);
    const duplicates = roundEntries.reduce((sum, r) => sum + r.duplicates, 0);
    const cycleMeanMs = mean(allCycles);
    const cycleMedianMs = median(allCycles);
    const solvedMean = mean(solvedAttempts);
    const solvedMedian = median(solvedAttempts);
    const serviceMeanMs = mean(allServiceMs);

    const canonical = comparison.scope === 'all' ? run.summary?.all : run.summary?.by_language?.[comparison.scope];
    if (canonical) {
      assertClose(solvedRounds.length, canonical.solved, `${info.id}.solved`, 0);
      assertClose(par2, canonical.par2, `${info.id}.par2`);
      assertClose(submissions, canonical.submissions, `${info.id}.submissions`, 0);
      assertClose(invalid, canonical.invalid, `${info.id}.invalid`, 0);
      assertClose(duplicates, canonical.duplicates, `${info.id}.duplicates`, 0);
      assertClose(allCycles.length, canonical.cycle_count, `${info.id}.cycle_count`, 0);
      assertClose(cycleMeanMs, canonical.cycle_mean_ms, `${info.id}.cycle_mean_ms`, 1e-4);
      assertClose(cycleMedianMs, canonical.cycle_median_ms, `${info.id}.cycle_median_ms`, 1e-4);
    }

    const outliers = [];
    for (const r of roundEntries) {
      for (const e of r.events) {
        if (e.cycle_ms !== null && e.cycle_ms > 25000) {
          outliers.push({
            round: r.id,
            answer: r.answer,
            attempt: e.attempt,
            word: e.word,
            cycle_ms: e.cycle_ms,
          });
        }
      }
    }
    outliers.sort((a, b) => b.cycle_ms - a.cycle_ms);

    return {
      id: info.id,
      key: info.key,
      run_id: run.id,
      label: info.label,
      short_label: info.shortLabel,
      family: info.family,
      color: info.color,
      model: run.metadata.model,
      provider: run.metadata.provider,
      provider_display: info.providerDisplay,
      service_tier: info.serviceTier,
      comparison_group: info.comparisonGroup,
      participant_type: run.metadata.participant_type ?? 'model',
      effort: run.metadata.effort,
      track: run.metadata.track,
      prompt_mode: run.metadata.prompt_mode,
      repetition: run.metadata.repetition,
      created_at: run.created_at,
      interventions: run.interventions.length,
      executed_model_verified: info.executedModelVerified,
      audited_rounds: Object.keys(run.rounds).filter(round => runAudits.some(audit => audit.round === round)).length,
      executed_model_note: info.executedModelNote,
      metrics: {
        rounds: roundEntries.length,
        solved: solvedRounds.length,
        success_rate: solvedRounds.length / roundEntries.length,
        par2,
        solved_guesses_mean: solvedMean,
        solved_guesses_median: solvedMedian,
        submissions,
        invalid,
        duplicates,
        cycle_count: allCycles.length,
        cycle_mean_ms: cycleMeanMs,
        cycle_median_ms: cycleMedianMs,
        cycle_min_ms: allCycles[0] ?? null,
        cycle_p10_ms: percentile(allCycles, 0.1),
        cycle_p25_ms: percentile(allCycles, 0.25),
        cycle_p75_ms: percentile(allCycles, 0.75),
        cycle_p90_ms: percentile(allCycles, 0.9),
        cycle_p95_ms: percentile(allCycles, 0.95),
        cycle_max_ms: allCycles.at(-1) ?? null,
        service_mean_ms: serviceMeanMs,
        hits_at_k: Object.fromEntries([1, 2, 10, 100, 1000].map(k => [k, roundEntries.filter(r => r.best_rank !== null && r.best_rank <= k).length])),
      },
      search: search.summary,
      outliers,
      rounds: Object.fromEntries(roundEntries.map(r => [r.id, r])),
    };
  });

  const suiteFingerprint = comparison.runs[0].suite_fingerprint;
  const protocolFingerprint = comparison.runs[0].protocol_fingerprint;
  for (const run of comparison.runs) {
    if (run.suite_fingerprint !== suiteFingerprint || run.protocol_fingerprint !== protocolFingerprint) {
      throw new Error('Runs do not share matching suite and protocol fingerprints');
    }
  }

  const words = roundOrder.map(roundId => {
    const answer = answerByRound.get(roundId);
    const solvedBy = runs.filter(r => r.rounds[roundId].status === 'solved').length;
    return {
      id: roundId,
      answer,
      solved_by: solvedBy,
    };
  });

  const solUnexpected = solAudit.rounds.reduce((sum, r) => sum + (r.unexpected_commands || 0), 0);
  const neonUnexpected = neonAudit.rounds.reduce((sum, r) => sum + (r.unexpected_commands || 0), 0);

  return {
    schema_version: 1,
    generated_from: comparison.sources ?? [],
    suite_id: comparison.runs[0].suite_id,
    suite_fingerprint: suiteFingerprint,
    protocol_fingerprint: protocolFingerprint,
    scope: comparison.scope,
    repeats: comparison.repeats,
    max_guesses: maxGuesses,
    par2_penalty: par2Penalty,
    vocabulary_size: Math.max(...comparison.runs.flatMap(run => Object.values(run.rounds).map(round => round.vocabulary_size))),
    vocabulary_sizes: Object.fromEntries(Object.values(comparison.runs[0].rounds).map(round => [round.language ?? round.id.slice(0, 2), round.vocabulary_size])),
    started_at: comparison.started_at,
    completed_at: comparison.completed_at,
    timing_note: comparison.timing_note,
    audit: {
      total_commands: solAudit.commands + neonAudit.commands,
      audited_rounds: comparison.runs.reduce((sum, run) => sum + Object.keys(run.rounds).filter(round => [...solAudit.rounds, ...neonAudit.rounds].some(audit => auditMatchesRun(audit, run) && audit.round === round)).length, 0),
      total_rounds: comparison.runs.reduce((sum, run) => sum + Object.keys(run.rounds).length, 0),
      sol_commands: solAudit.commands,
      neon_commands: neonAudit.commands,
      unexpected_commands: solUnexpected + neonUnexpected,
      interventions: runs.reduce((sum, r) => sum + r.interventions, 0),
      neon_configured_model: neonAudit.configured_model,
      neon_executed_model: neonAudit.executed_model,
      neon_executed_model_note: neonAudit.executed_model_note,
    },
    words,
    runs,
    effort_comparisons: summarizeEfforts(runs),
  };
}

export function mergeComparisons(comparisons) {
  if (!comparisons.length) throw Error('Collection has no comparisons');
  const first = comparisons[0];
  const tasks = JSON.stringify(first.paired.map(({ id, answer }) => ({ id, answer })));
  const interfaceTrack = first.runs[0]?.metadata.track;
  const promptMode = first.runs[0]?.metadata.prompt_mode;
  const byId = new Map();
  for (const report of comparisons) {
    if (report.scope !== first.scope || report.max_guesses !== first.max_guesses || JSON.stringify(report.paired.map(({ id, answer }) => ({ id, answer }))) !== tasks) throw Error('Collection mixes different scopes, budgets or task sets');
    for (const run of report.runs) {
      if (run.metadata.track !== interfaceTrack || run.metadata.prompt_mode !== promptMode) throw Error('Collection mixes different interfaces or prompt modes');
      if (!Object.values(run.rounds).every(round => ['solved', 'exhausted', 'abandoned'].includes(round.status))) throw Error('Incomplete runs cannot enter a completed collection');
      if (byId.has(run.id) && JSON.stringify(byId.get(run.id)) !== JSON.stringify(run)) throw Error(`Conflicting snapshots for run ${run.id}`);
      byId.set(run.id, run);
    }
  }
  return { ...first, completed_at: comparisons.map(report => report.completed_at).filter(Boolean).sort().at(-1), runs: [...byId.values()] };
}

function publishedFiles() {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const catalog = read(catalogPath);
  if (!catalog.collections.length || !catalog.collections.some(entry => entry.id === catalog.default)) throw Error('Invalid collection catalog');
  const files = new Map();
  const index = { default: catalog.default, collections: [], datasets: [], participant_profiles: catalog.participant_config ? read(catalog.participant_config).participants : [] };
  for (const entry of catalog.collections) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(entry.id)) throw Error('Invalid collection ID');
    const comparison = mergeComparisons(entry.comparisons.map(read));
    comparison.sources = entry.comparisons;
    const audits = entry.audits.map(read);
    const mergeAudits = records => ({
      commands: records.reduce((sum, record) => sum + record.commands, 0),
      rounds: records.flatMap(record => record.rounds),
    });
    const google = mergeAudits(audits.filter(record => record.configured_model?.startsWith('gemini-')));
    const others = mergeAudits(audits.filter(record => !record.configured_model?.startsWith('gemini-')));
    const dataset = { ...buildDataset(comparison, google, others), collection_id: entry.id, collection_title: entry.title, embedding_track: entry.track };
    const seenIds = new Set();
    for (const run of dataset.runs) {
      if (seenIds.has(run.id)) run.id = `${run.id}-${run.run_id}`;
      seenIds.add(run.id);
    }
    const file = entry.id === catalog.default ? 'results.json' : `${entry.id}.json`;
    files.set(file, dataset);
    index.collections.push({ id: entry.id, title: entry.title, track: entry.track, scope: dataset.scope, file, completed_runs: dataset.runs.length, suite_fingerprint: dataset.suite_fingerprint });
  }
  for (const entry of catalog.datasets ?? []) {
    const suite = new Suite(resolve(root, entry.directory));
    const collections = index.collections.filter(collection => collection.suite_fingerprint === suite.fingerprint);
    index.datasets.push({ ...entry, id: suite.manifest.id, fingerprint: suite.fingerprint, embedding: suite.manifest.embedding, license: suite.manifest.license,
      max_guesses: suite.limit, languages: Object.entries(suite.manifest.languages).map(([language, info]) => ({ language, rounds: info.rounds.length, vocabulary_size: info.vocabulary_size })),
      collections: collections.map(collection => collection.id), completed_runs: collections.reduce((sum, collection) => sum + collection.completed_runs, 0) });
  }
  files.set('catalog.json', index);
  return { files, index };
}

export function checkSiteData() {
  for (const [file, content] of publishedFiles().files) {
    const path = resolve(siteDir, 'data', file);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== JSON.stringify(content)) throw new Error('Published dashboard data is missing or stale. Run node scripts/build-site.js and commit site/data/.');
  }
  console.log('Published dashboard data matches canonical benchmark records.');
}

export function build() {
  const { files } = publishedFiles();
  mkdirSync(dirname(siteDataPath), { recursive: true });
  for (const [file, content] of files) writeFileSync(resolve(siteDir, 'data', file), JSON.stringify(content), 'utf8');

  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  cpSync(siteDir, distDir, { recursive: true });

  console.log(`Built static dashboard in ${distDir}`);
  for (const dataset of files.values()) if (dataset.runs) console.log(dataset.runs.map(r => `${r.short_label}: ${r.metrics.solved}/${r.metrics.rounds}, PAR2 ${r.metrics.par2.toFixed(1)}`).join(' | '));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) checkSiteData();
  else build();
}
