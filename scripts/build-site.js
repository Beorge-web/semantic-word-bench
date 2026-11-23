import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = resolve(root, 'site');
const siteDataPath = resolve(siteDir, 'data/results.json');
const distDir = resolve(root, 'dist');
const comparisonPath = resolve(root, 'results/2026-11-23-neon-en/comparison.json');
const neonAuditPath = resolve(root, 'results/2026-11-23-neon-en/audit.json');
const solAuditPath = resolve(root, 'results/2026-11-23-sol-high-en/audit.json');

const MODEL_META = {
  'gpt-6.1-sol:high': {
    id: 'gpt-6.1-sol-high',
    key: 'gpt-6.1-sol',
    label: 'GPT-6.1 Sol high',
    shortLabel: 'Sol 6.1 high',
    family: 'Sol',
    providerDisplay: 'Codex',
    color: '#6b9eff',
    executedModelVerified: true,
    executedModelNote: 'Verified via Codex transcript audit (executedModel: gpt-6.1-sol).',
  },
  'gpt-6.2-sol:high': {
    id: 'gpt-6.2-sol-high',
    key: 'gpt-6.2-sol',
    label: 'GPT-6.2 Sol high',
    shortLabel: 'Sol 6.2 high',
    family: 'Sol',
    providerDisplay: 'Codex',
    color: '#3fd1a5',
    executedModelVerified: true,
    executedModelNote: 'Verified via Codex transcript audit (executedModel: gpt-6.2-sol).',
  },
  'gemini-4-neon:low': {
    id: 'gemini-4-neon-low',
    key: 'neon-low',
    label: 'Gemini 4 Neon low',
    shortLabel: 'Neon low',
    family: 'Neon',
    providerDisplay: 'Antigravity',
    color: '#e6a955',
    executedModelVerified: false,
    executedModelNote: 'Antigravity did not report executedModel; audit verifies configured gemini-4-neon and thought_level low.',
  },
  'gemini-4-neon:medium': {
    id: 'gemini-4-neon-medium',
    key: 'neon-medium',
    label: 'Gemini 4 Neon medium',
    shortLabel: 'Neon medium',
    family: 'Neon',
    providerDisplay: 'Antigravity',
    color: '#b78bfa',
    executedModelVerified: false,
    executedModelNote: 'Antigravity did not report executedModel; audit verifies configured gemini-4-neon and thought_level medium.',
  },
};

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
    const metaKey = `${run.metadata.model}:${run.metadata.effort}`;
    const info = MODEL_META[metaKey];
    if (!info) throw new Error(`Unknown model/effort entry in comparison.json: ${metaKey}`);

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

    const canonical = run.summary?.by_language?.en;
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

    const cumulativeSolves = [];
    for (let attempt = 0; attempt <= maxGuesses; attempt++) {
      cumulativeSolves.push(solvedRounds.filter(r => r.attempts <= attempt).length);
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
      effort: run.metadata.effort,
      track: run.metadata.track,
      prompt_mode: run.metadata.prompt_mode,
      repetition: run.metadata.repetition,
      created_at: run.created_at,
      interventions: run.interventions.length,
      executed_model_verified: info.executedModelVerified,
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
      },
      cumulative_solves: cumulativeSolves,
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
    generated_from: 'results/2026-11-23-neon-en/comparison.json',
    suite_id: comparison.runs[0].suite_id,
    suite_fingerprint: suiteFingerprint,
    protocol_fingerprint: protocolFingerprint,
    scope: comparison.scope,
    repeats: comparison.repeats,
    max_guesses: maxGuesses,
    par2_penalty: par2Penalty,
    vocabulary_size: 50000,
    started_at: comparison.started_at,
    completed_at: comparison.completed_at,
    timing_note: comparison.timing_note,
    audit: {
      total_commands: solAudit.commands + neonAudit.commands,
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
  };
}

function readDataset() {
  if (!existsSync(comparisonPath)) {
    throw new Error(`Canonical results not found at ${comparisonPath}`);
  }
  const comparison = JSON.parse(readFileSync(comparisonPath, 'utf8'));
  const neonAudit = JSON.parse(readFileSync(neonAuditPath, 'utf8'));
  const solAudit = JSON.parse(readFileSync(solAuditPath, 'utf8'));

  return buildDataset(comparison, neonAudit, solAudit);
}

export function checkSiteData() {
  if (!existsSync(siteDataPath) || readFileSync(siteDataPath, 'utf8') !== JSON.stringify(readDataset())) {
    throw new Error('Published dashboard data is missing or stale. Run node scripts/build-site.js and commit site/data/results.json.');
  }
  console.log('Published dashboard data matches canonical benchmark records.');
}

export function build() {
  const dataset = readDataset();
  mkdirSync(dirname(siteDataPath), { recursive: true });
  writeFileSync(siteDataPath, JSON.stringify(dataset), 'utf8');

  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  cpSync(siteDir, distDir, { recursive: true });

  const summaryLine = dataset.runs
    .map(r => `${r.short_label}: ${r.metrics.solved}/10, PAR2 ${r.metrics.par2.toFixed(1)}, mean ${(r.metrics.cycle_mean_ms / 1000).toFixed(2)}s`)
    .join(' | ');
  console.log(`Built static dashboard in ${distDir}`);
  console.log(summaryLine);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) checkSiteData();
  else build();
}
