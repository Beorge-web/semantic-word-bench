import { escapeHtml, formatNumber, formatRank, isRunActive } from './model.js';

export function overallRanking(data) {
  const groups = new Map();
  for (const run of data.runs) {
    const key = JSON.stringify([run.model, run.provider, run.effort, run.service_tier ?? null, run.track, run.prompt_mode]);
    if (!groups.has(key)) groups.set(key, { label: run.short_label, color: run.color, members: [], rounds: 0, solved: 0, solvedCost: 0, failureCost: 0 });
    const group = groups.get(key);
    group.members.push(run.id);
    for (const round of Object.values(run.rounds)) {
      group.rounds++;
      if (round.status === 'solved') { group.solved++; group.solvedCost += round.attempts; }
      else group.failureCost += data.par2_penalty;
    }
  }
  const rows = [...groups.values()].map(group => ({ ...group, totalCost: group.solvedCost + group.failureCost, par2: (group.solvedCost + group.failureCost) / group.rounds }));
  rows.sort((a, b) => a.totalCost * b.rounds - b.totalCost * a.rounds || a.label.localeCompare(b.label));
  let rank = 1;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (previous && row.totalCost * previous.rounds !== previous.totalCost * row.rounds) rank = index + 1;
    return { ...row, rank };
  });
}

export function renderOverall(data, focused) {
  return `<div class="overall-ranking">${overallRanking(data).map(row => `<div class="overall-row ${row.members.some(id => isRunActive(id, focused)) ? '' : 'is-dimmed'} ${row.rank === 1 ? 'is-leading' : ''}">
    <span class="overall-place">${row.rank}</span><div class="overall-participant"><span>${escapeHtml(row.label)}</span><span class="table-sub">${row.solved}/${row.rounds} solved${row.members.length > 1 ? ` across ${row.members.length} trials` : ''}</span></div>
    <div class="overall-track" role="img" aria-label="${escapeHtml(row.label)}: PAR2 ${formatNumber(row.par2, 2)}, solved-attempt contribution ${formatNumber(row.solvedCost / row.rounds, 2)}, failure-penalty contribution ${formatNumber(row.failureCost / row.rounds, 2)}. Lower is better.">
      <span class="overall-attempts" style="width:${row.solvedCost / row.rounds / data.par2_penalty * 100}%;background:${row.color}"></span><span class="overall-failures" style="width:${row.failureCost / row.rounds / data.par2_penalty * 100}%"></span>
    </div><span class="overall-score">${formatNumber(row.par2, 2)}<span class="table-sub">PAR2</span></span>
  </div>`).join('')}<div class="overall-axis" aria-hidden="true"><span>0</span><span>${data.par2_penalty / 2}</span><span>${data.par2_penalty}</span></div></div>`;
}

export function proximityAt(run, threshold, budget) {
  let exact = 0, reached = 0;
  for (const round of Object.values(run.rounds)) {
    const ranks = round.events.filter(event => event.attempt <= budget && typeof event.rank === 'number').map(event => event.rank);
    if (ranks.includes(1)) exact++;
    if (ranks.some(rank => rank <= threshold)) reached++;
  }
  return { exact, near: reached - exact, missed: run.metrics.rounds - reached, total: run.metrics.rounds };
}

export function renderProximity(runs, focused, threshold, budget) {
  return `<div class="diagnostic-rows">${runs.map(run => {
    const value = proximityAt(run, threshold, budget);
    return `<div class="diagnostic-row ${isRunActive(run.id, focused) ? '' : 'is-dimmed'}">
      <span class="diagnostic-label">${escapeHtml(run.short_label)}</span>
      <div class="proximity-track" role="img" aria-label="${escapeHtml(run.short_label)}: ${value.exact} exact, ${value.near} additional top-${threshold}, ${value.missed} outside top-${threshold}, out of ${value.total}">
        <span class="proximity-exact" style="width:${value.exact / value.total * 100}%"></span><span class="proximity-near" style="width:${value.near / value.total * 100}%"></span>
      </div><span class="diagnostic-value">${value.exact} exact + ${value.near} near<span class="table-sub">${value.exact + value.near}/${value.total} reached</span></span>
    </div>`;
  }).join('')}</div>`;
}

export function renderSolveUnits(runs, words, focused) {
  return `<div class="solve-unit-rows">${runs.map(run => `<div class="solve-unit-row ${isRunActive(run.id, focused) ? '' : 'is-dimmed'}"><span class="diagnostic-label">${escapeHtml(run.short_label)}</span><div class="solve-units" style="--unit-columns:${Math.min(10, words.length)}">${words.map(word => {
    const round = run.rounds[word.id];
    return `<button type="button" class="solve-unit" style="--unit-color:${round.status === 'solved' ? run.color : 'var(--bg-subtle)'}" data-select-word="${word.id}" data-select-run="${escapeHtml(run.id)}" data-inspect-round aria-label="${escapeHtml(`${run.short_label}, ${word.id}, ${word.answer}: ${round.status === 'solved' ? `solved in ${round.attempts}` : 'not solved'}`)}" title="${escapeHtml(word.id + ': ' + word.answer)}"></button>`;
  }).join('')}</div><span class="diagnostic-value">${run.metrics.solved}/${run.metrics.rounds}</span></div>`).join('')}</div><p class="panel-footnote">One square per task in task order. Filled means solved. Select a square to inspect the round.</p>`;
}

export function renderCheckpoints(runs, focused, vocabulary, width = 920) {
  const height = 280, left = 58, right = 18, top = 20, bottom = 54;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = index => left + index / 2 * plotWidth;
  const y = rank => top + Math.log10(Math.max(1, rank)) / Math.max(1, Math.log10(vocabulary)) * plotHeight;
  const ticks = [...new Set([1, 10, 100, 1000, 10000, vocabulary].filter(rank => rank <= vocabulary))];
  const grid = ticks.map(rank => `<line x1="${left}" x2="${width - right}" y1="${y(rank)}" y2="${y(rank)}" stroke="var(--border)"/><text x="${left - 12}" y="${y(rank) + 4}" text-anchor="end">${formatRank(rank)}</text>`).join('');
  const lines = runs.map(run => {
    let connected = false;
    const points = [10, 25, 50].map((checkpoint, index) => ({ rank: run.search.best_rank_median_at[checkpoint], coverage: run.search.checkpoint_scored_rounds[checkpoint], checkpoint, index }));
    const path = points.map(point => {
      if (point.rank === null) { connected = false; return ''; }
      const command = `${connected ? 'L' : 'M'} ${x(point.index)} ${y(point.rank)}`;
      connected = true; return command;
    }).join(' ');
    return `<g opacity="${isRunActive(run.id, focused) ? 1 : 0.18}"><path d="${path}" fill="none" stroke="${run.color}" stroke-width="2"/>${points.filter(point => point.rank !== null).map(point => `<circle cx="${x(point.index)}" cy="${y(point.rank)}" r="4" fill="${run.color}"><title>${escapeHtml(run.short_label)} at ${point.checkpoint}: median rank ${point.rank}, ${point.coverage}/${run.metrics.rounds} scored rounds</title></circle>`).join('')}</g>`;
  }).join('');
  const legend = runs.map(run => `<span class="${isRunActive(run.id, focused) ? '' : 'is-dimmed'}"><i class="model-dot" style="--model-color:${run.color}" aria-hidden="true"></i>${escapeHtml(run.short_label)}</span>`).join('');
  return `<svg class="checkpoint-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Median best rank at attempts 10, 25 and 50. Logarithmic rank axis; rank 1 is best.">${grid}${lines}${[10,25,50].map((checkpoint, index) => `<text x="${x(index)}" y="${height - bottom + 22}" text-anchor="middle">${checkpoint}</text>`).join('')}<text x="${left + plotWidth / 2}" y="${height - 5}" text-anchor="middle">Attempts</text></svg><div class="inline-legend checkpoint-legend">${legend}</div>`;
}

export function renderMetricBars(runs, focused, metric, maximum, format) {
  return `<div class="diagnostic-rows">${runs.map(run => {
    const { value, detail } = metric(run);
    return `<div class="diagnostic-row ${isRunActive(run.id, focused) ? '' : 'is-dimmed'}">
      <span class="diagnostic-label">${escapeHtml(run.short_label)}</span>
      <div class="metric-track" aria-hidden="true">${value === null ? '' : `<span style="width:${Math.min(100, Math.max(0, value / Math.max(1, maximum) * 100))}%;background:${run.color}"></span>`}</div>
      <span class="diagnostic-value">${value === null ? 'Not available' : escapeHtml(format(value))}<span class="table-sub">${escapeHtml(detail)}</span></span>
    </div>`;
  }).join('')}</div>`;
}

export function thresholdMetric(run, threshold) {
  const value = run.search.steps_to_top[threshold];
  return { value: value.reached / value.total, detail: `${value.reached}/${value.total} reached; ${value.median === null ? 'no steps observed' : `median ${formatNumber(value.median, 1)} attempts among reached`}` };
}

export function comparisonCsv(data) {
  const header = ['dataset', 'embedding_track', 'model', 'provider', 'effort', 'service_tier', 'round', 'answer', 'status', 'attempts', 'best_rank', 'best_rank_at_10', 'best_rank_at_25', 'best_rank_at_50', 'steps_to_top_100', 'steps_to_top_10', 'longest_stagnation', 'repeat_rate', 'observed_duration_ms', 'agent_duration_ms', 'time_to_solve_ms', 'solve_time_basis', 'cycle_mean_ms', 'cycle_median_ms'];
  const rows = data.runs.flatMap(run => Object.values(run.rounds).map(round => {
    const search = round.search;
    return [data.suite_id, data.embedding_track, run.model, run.provider, run.effort, run.service_tier, round.id, round.answer, round.status, round.attempts, round.best_rank, search.best_rank_at[10], search.best_rank_at[25], search.best_rank_at[50], search.steps_to_top[100], search.steps_to_top[10], search.longest_stagnation, search.repeat_rate, search.observed_duration_ms, search.agent_duration_ms, search.time_to_solve_ms, search.solve_time_basis, round.cycle_mean_ms, round.cycle_median_ms];
  }));
  return [header, ...rows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
}
