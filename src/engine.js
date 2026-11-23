import { normalize } from './dataset.js';

export class RuleError extends Error {}
export const finished = round => ['solved', 'exhausted', 'abandoned'].includes(round.status);

export function applyGuess(suite, current, input, requestId, timing) {
  const word = normalize(input);
  const cached = current.events.find(event => event.request_id === requestId);
  if (cached) {
    if (cached.word !== word) throw new RuleError('request_id already used with another word');
    return { round: current, event: cached };
  }
  if (finished(current)) throw new RuleError('Round is already finished');
  const round = structuredClone(current);
  const previous = round.events.at(-1);
  const event = {
    attempt: round.events.length + 1, word, ...suite.lookup(round.id, word),
    duplicate: round.events.some(event => event.word === word), request_id: requestId, ...timing,
    cycle_ms: previous ? Math.max(0, timing.result_ms - previous.result_ms) : null,
  };
  round.events.push(event);
  round.status = event.rank === 1 ? 'solved' : round.events.length >= suite.limit ? 'exhausted' : 'active';
  round.best_rank = Math.min(...round.events.filter(event => event.rank !== null).map(event => event.rank));
  if (!Number.isFinite(round.best_rank)) round.best_rank = null;
  return { round, event };
}

const mean = values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function metrics(rounds, limit) {
  const solved = rounds.filter(round => round.status === 'solved');
  const attempts = solved.map(round => round.events.length);
  const events = rounds.flatMap(round => round.events);
  const cycles = events.filter(event => event.cycle_ms !== null).map(event => event.cycle_ms);
  return {
    rounds: rounds.length, solved: solved.length, success_rate: rounds.length ? solved.length / rounds.length : null,
    par2: mean(rounds.map(round => round.status === 'solved' ? round.events.length : 2 * limit)),
    solved_guesses_mean: mean(attempts), solved_guesses_median: median(attempts), submissions: events.length,
    invalid: events.filter(event => event.error !== null).length, duplicates: events.filter(event => event.duplicate).length,
    cycle_mean_ms: mean(cycles), cycle_median_ms: median(cycles), cycle_count: cycles.length,
    service_mean_ms: mean(events.map(event => event.service_ms)),
  };
}

export function summarize(run, limit) {
  const rounds = Object.values(run.rounds);
  return {
    complete: rounds.every(finished), finished_rounds: rounds.filter(finished).length, interventions: run.interventions.length,
    all: metrics(rounds, limit),
    by_language: Object.fromEntries(['ru', 'en'].map(language => [language, metrics(rounds.filter(round => round.language === language), limit)])),
  };
}

export function feedback(round, event, limit) {
  return {
    round: round.id, attempt: event.attempt, word: event.word, rank: event.rank, status: round.status,
    remaining: limit - round.events.length,
    ...(event.error ? { error: event.error } : {}), ...(event.duplicate ? { duplicate: true } : {}),
  };
}
