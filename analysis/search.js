export const checkpoints = [10, 25, 50];
export const proximityThresholds = [1, 2, 10, 100, 1000];

const numeric = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const duration = (start, end) => numeric(start) && numeric(end) && end >= start ? end - start : null;

export function analyzeRound(round, audit = {}) {
  const events = round.events;
  let best = null;
  let stagnation = 0;
  let longest = 0;
  let improvements = 0;
  let duplicates = 0;
  const seen = new Set();
  const bestRanks = events.map(event => {
    const improved = numeric(event.rank) && (best === null || event.rank < best);
    if (improved) {
      best = event.rank;
      improvements++;
      stagnation = 0;
    } else {
      stagnation++;
      longest = Math.max(longest, stagnation);
    }
    if (seen.has(event.word)) duplicates++;
    seen.add(event.word);
    return best;
  });
  const checkpointObserved = n => events.length >= n || round.status === 'solved';
  const first = events[0];
  const last = events.at(-1);
  const auditStart = Date.parse(audit.started_at ?? '');
  const auditEnd = Date.parse(audit.completed_at ?? '');
  const auditCoversRound = first && numeric(auditStart) && numeric(auditEnd) && auditStart <= first.received_ms && auditEnd >= last.result_ms;
  const observedDuration = duration(first?.received_ms, last?.result_ms);
  const resource = audit.token_usage ?? null;
  const tokenFields = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens', 'total_tokens'];
  if (resource && (!resource.source || Object.entries(resource).some(([key, value]) => key === 'source' ? typeof value !== 'string' : !tokenFields.includes(key) || (value !== null && (!Number.isSafeInteger(value) || value < 0))))) throw Error('Token usage requires measured nonnegative integer counts and an evidence source');
  const usage = resource ? Object.fromEntries(Object.entries(resource).filter(([key]) => key !== 'source')) : null;
  if (usage && !Object.values(usage).some(numeric)) throw Error('Token usage has no measured counts');
  const cost = audit.cost ?? null;
  if (cost && (!numeric(cost.amount) || cost.amount < 0 || !/^[A-Z]{3}$/.test(cost.currency) || !cost.source)) throw Error('Cost requires an amount, ISO currency and evidence source');
  return {
    submissions: events.length,
    best_rank: best,
    best_rank_at: Object.fromEntries(checkpoints.map(n => [n, checkpointObserved(n) ? bestRanks[Math.min(n, events.length) - 1] ?? null : null])),
    checkpoint_observed: Object.fromEntries(checkpoints.map(n => [n, checkpointObserved(n)])),
    steps_to_top: Object.fromEntries(proximityThresholds.map(k => [k, events.find(event => numeric(event.rank) && event.rank <= k)?.attempt ?? null])),
    longest_stagnation: longest,
    improvements,
    duplicates,
    repeat_rate: events.length ? duplicates / events.length : null,
    invalid_rate: events.length ? events.filter(event => event.error).length / events.length : null,
    observed_duration_ms: observedDuration,
    agent_duration_ms: auditCoversRound ? duration(auditStart, auditEnd) : null,
    time_to_solve_ms: round.status === 'solved' ? duration(auditCoversRound ? auditStart : first?.received_ms, last?.result_ms) : null,
    solve_time_basis: round.status === 'solved' ? auditCoversRound ? 'agent_start_to_winning_result' : observedDuration === null ? null : 'first_submission_to_winning_result' : null,
    audit_timing_covers_round: Boolean(auditCoversRound),
    token_usage: usage,
    token_source: resource?.source ?? null,
    cost,
  };
}

export function analyzeRun(run, audits = []) {
  const rounds = Object.fromEntries(Object.entries(run.rounds).map(([id, round]) => [id, analyzeRound(round, audits.find(audit => audit.round === id))]));
  const values = Object.values(rounds);
  const costs = values.filter(round => round.cost);
  const usages = values.filter(round => round.token_usage);
  const observed = values.map(round => round.observed_duration_ms).filter(numeric);
  const agentDurations = values.map(round => round.agent_duration_ms).filter(numeric);
  const solved = values.filter(round => round.time_to_solve_ms !== null);
  const submitted = values.reduce((sum, round) => sum + round.submissions, 0);
  const costByCurrency = {};
  for (const { cost } of costs) costByCurrency[cost.currency] = (costByCurrency[cost.currency] ?? 0) + cost.amount;
  const tokenKeys = [...new Set(usages.flatMap(round => Object.keys(round.token_usage)))];
  const tokenTotals = Object.fromEntries(tokenKeys.map(key => {
    const counts = usages.map(round => round.token_usage[key]).filter(numeric);
    return [key, counts.length ? counts.reduce((sum, count) => sum + count, 0) : null];
  }));
  return {
    rounds,
    summary: {
      rounds: values.length,
      best_rank_median_at: Object.fromEntries(checkpoints.map(n => [n, median(values.filter(round => round.checkpoint_observed[n]).map(round => round.best_rank_at[n]).filter(numeric))])),
      checkpoint_scored_rounds: Object.fromEntries(checkpoints.map(n => [n, values.filter(round => round.checkpoint_observed[n] && numeric(round.best_rank_at[n])).length])),
      steps_to_top: Object.fromEntries(proximityThresholds.map(k => {
        const steps = values.map(round => round.steps_to_top[k]).filter(numeric);
        return [k, { reached: steps.length, total: values.length, mean: mean(steps), median: median(steps) }];
      })),
      longest_stagnation_mean: mean(values.map(round => round.longest_stagnation)),
      longest_stagnation_median: median(values.map(round => round.longest_stagnation)),
      longest_stagnation_max: values.length ? Math.max(...values.map(round => round.longest_stagnation)) : null,
      repeat_rate: submitted ? values.reduce((sum, round) => sum + round.duplicates, 0) / submitted : null,
      observed_duration_mean_ms: mean(observed),
      observed_duration_median_ms: median(observed),
      agent_duration_mean_ms: mean(agentDurations),
      agent_duration_median_ms: median(agentDurations),
      agent_timing_rounds: agentDurations.length,
      solve_time_by_basis: Object.fromEntries(['agent_start_to_winning_result', 'first_submission_to_winning_result'].map(basis => {
        const times = solved.filter(round => round.solve_time_basis === basis).map(round => round.time_to_solve_ms);
        return [basis, { rounds: times.length, mean_ms: mean(times), median_ms: median(times) }];
      })),
      resources: {
        token_rounds: usages.length,
        token_sources: [...new Set(usages.map(round => round.token_source))],
        total_rounds: values.length,
        token_totals: usages.length ? tokenTotals : null,
        token_field_coverage: Object.fromEntries(tokenKeys.map(key => [key, usages.filter(round => numeric(round.token_usage[key])).length])),
        cost_rounds: costs.length,
        cost_by_currency: costs.length ? costByCurrency : null,
      },
    },
  };
}
