import {
  renderAttemptsChart,
  renderPar2Chart,
  renderRoundTrajectoryChart,
  renderSolvedUnitChart,
  renderSpeedDistributionChart,
} from './charts.js';
import {
  escapeHtml,
  formatDateUtc,
  formatEventNote,
  formatInt,
  formatNumber,
  formatRank,
  formatSeconds,
  isRunActive,
  validateDataset,
} from './model.js';

const el = id => document.getElementById(id);

const state = {
  data: null,
  focusedIds: new Set(),
  selectedWordId: null,
  selectedRunId: null,
};

function keepFocus(update) {
  const active = document.activeElement;
  const container = active?.parentElement?.closest('[id]');
  const selectors = ['focusRun', 'selectWord', 'selectRun']
    .filter(key => active?.dataset?.[key])
    .map(key => `[data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${CSS.escape(active.dataset[key])}"]`);
  update();
  if (container && selectors.length) {
    el(container.id)?.querySelector(selectors.join(''))?.focus({ preventScroll: true });
  }
}

function showStatus(message, isError = false) {
  const card = el('status-region');
  const text = el('status-message');
  card.hidden = false;
  card.classList.toggle('is-error', isError);
  text.textContent = message;
  el('dashboard').hidden = true;
}

function toggleFocus(runId) {
  if (state.focusedIds.has(runId)) {
    state.focusedIds.delete(runId);
  } else {
    state.focusedIds.add(runId);
  }
  if (state.focusedIds.size === state.data.runs.length) {
    state.focusedIds.clear();
  }
  renderAll();
}

function renderMetadata(data) {
  el('meta-scope').textContent = `${data.words.length} English words (Russian not run)`;
  el('meta-budget').textContent = `${data.max_guesses} guesses / round`;
  el('meta-vocab').textContent = `${formatInt(data.vocabulary_size)} words`;
  el('meta-repeats').textContent = `${data.repeats} trial / model`;
  el('meta-date').textContent = formatDateUtc(data.completed_at);

  el('fp-suite-id').textContent = data.suite_id;
  el('fp-dataset').textContent = data.suite_fingerprint;
  el('fp-protocol').textContent = data.protocol_fingerprint;

  if (data.audit) {
    el('audit-summary-text').textContent =
      `All ${formatInt(data.audit.total_commands)} CLI submissions (${formatInt(data.audit.sol_commands)} Sol and ${formatInt(data.audit.neon_commands)} Neon) were audited with ${data.audit.unexpected_commands} unexpected commands and ${data.audit.interventions} human interventions. Every recorded rank matches the frozen tables.`;
  }
}

function renderFilters(data) {
  const container = el('model-filters');
  const resetBtn = el('reset-filters');
  const hint = el('filter-hint');
  const count = state.focusedIds.size;

  resetBtn.hidden = count === 0;
  hint.textContent = count === 0
    ? `Showing all ${data.runs.length} participants`
    : `Highlighting ${count} of ${data.runs.length} participants`;

  container.innerHTML = data.runs
    .map(run => {
      const focused = state.focusedIds.has(run.id);
      const dimmed = count > 0 && !focused;
      return `
        <button
          type="button"
          class="model-pill${dimmed ? ' is-dimmed' : ''}"
          style="--model-color:${run.color}"
          data-focus-run="${escapeHtml(run.id)}"
          aria-pressed="${focused ? 'true' : 'false'}"
        >
          <span class="model-dot" aria-hidden="true"></span>
          <span>${escapeHtml(run.label)}</span>
        </button>
      `;
    })
    .join('');
}

function renderSummaryCards(data) {
  const container = el('summary-cards');
  const hasFocus = state.focusedIds.size > 0;

  container.innerHTML = data.runs
    .map(run => {
      const m = run.metrics;
      const focused = state.focusedIds.has(run.id);
      const dimmed = hasFocus && !focused;
      const cls = ['summary-card'];
      if (focused) cls.push('is-focused');
      if (dimmed) cls.push('is-dimmed');

      return `
        <button
          type="button"
          class="${cls.join(' ')}"
          style="--model-color:${run.color}"
          data-focus-run="${escapeHtml(run.id)}"
          aria-pressed="${focused ? 'true' : 'false'}"
        >
          <span class="card-head">
            <span class="card-title">${escapeHtml(run.label)}</span>
            <span class="card-sub">${escapeHtml(run.provider_display)} / ${escapeHtml(run.effort)}</span>
          </span>
          <span class="card-group">
            <span class="card-group-label">Quality</span>
            <span class="card-metrics">
              <span class="metric-pair">
                <span class="metric-value">${m.solved}/${m.rounds}</span>
                <span class="metric-label">Solved</span>
              </span>
              <span class="metric-pair">
                <span class="metric-value">${formatNumber(m.par2, 1)}</span>
                <span class="metric-label">PAR2</span>
              </span>
            </span>
          </span>
          <span class="card-group">
            <span class="card-group-label">Interaction speed</span>
            <span class="card-metrics">
              <span class="metric-pair">
                <span class="metric-value small-num">${formatSeconds(m.cycle_mean_ms)}</span>
                <span class="metric-label">Mean cycle</span>
              </span>
              <span class="metric-pair">
                <span class="metric-value small-num">${formatSeconds(m.cycle_median_ms)}</span>
                <span class="metric-label">Median cycle</span>
              </span>
            </span>
          </span>
        </button>
      `;
    })
    .join('');
}

function renderQualitySection(data) {
  el('chart-par2').innerHTML = renderPar2Chart(data.runs, state.focusedIds, data.max_guesses, data.par2_penalty);
  el('chart-solved').innerHTML = renderSolvedUnitChart(data.runs, data.words, state.focusedIds);
  el('chart-attempts').innerHTML = renderAttemptsChart(data.runs, data.words, state.focusedIds, data.max_guesses);
  el('proximity-table-body').innerHTML = data.runs.map(run => `<tr class="${isRunActive(run.id, state.focusedIds) ? '' : 'is-dimmed'}">
    <th scope="row"><span class="model-cell"><span class="model-dot" style="--model-color:${run.color}" aria-hidden="true"></span>${escapeHtml(run.short_label)}</span></th>
    ${[1, 2, 10, 100, 1000].map(k => `<td class="num">${run.metrics.hits_at_k[k]}/${run.metrics.rounds}</td>`).join('')}
  </tr>`).join('');

  el('quality-table-body').innerHTML = data.runs
    .map(run => {
      const m = run.metrics;
      const dimmed = !isRunActive(run.id, state.focusedIds);
      return `
        <tr class="${dimmed ? 'is-dimmed' : ''}">
          <th scope="row">
            <span class="model-cell">
              <span class="model-dot" style="--model-color:${run.color}" aria-hidden="true"></span>
              <span>${escapeHtml(run.label)}</span>
            </span>
          </th>
          <td>${escapeHtml(run.provider_display)} <span class="table-sub">(${escapeHtml(run.effort)})</span></td>
          <td class="num">${m.solved}/${m.rounds}</td>
          <td class="num">${formatNumber(m.par2, 1)}</td>
          <td class="num">${formatNumber(m.solved_guesses_mean, 1)}</td>
          <td class="num">${formatNumber(m.solved_guesses_median, 1)}</td>
          <td class="num">${formatInt(m.submissions)}</td>
          <td class="num">${formatInt(m.invalid)}</td>
          <td class="num">${formatInt(m.duplicates)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderSpeedSection(data) {
  el('chart-speed').innerHTML = renderSpeedDistributionChart(data.runs, state.focusedIds);

  const extremeOutliers = data.runs
    .flatMap(run =>
      (run.outliers || [])
        .filter(o => o.cycle_ms >= 60000)
        .map(o => `${run.short_label} had a ${formatSeconds(o.cycle_ms, 1)} cycle on ${o.round} (${o.answer}, attempt ${o.attempt})`)
    );

  el('speed-footnote').textContent = extremeOutliers.length
    ? `Extreme cycles above 60 s are included in pooled means and omitted from the horizontal axis range so P10-P90 spreads remain legible: ${extremeOutliers.join('; ')}.`
    : 'All cycles are included in the pooled means, medians, and percentiles.';

  el('speed-table-body').innerHTML = data.runs
    .map(run => {
      const m = run.metrics;
      const dimmed = !isRunActive(run.id, state.focusedIds);
      return `
        <tr class="${dimmed ? 'is-dimmed' : ''}">
          <th scope="row">
            <span class="model-cell">
              <span class="model-dot" style="--model-color:${run.color}" aria-hidden="true"></span>
              <span>${escapeHtml(run.label)}</span>
            </span>
          </th>
          <td>${escapeHtml(run.provider_display)}</td>
          <td class="num">${formatSeconds(m.cycle_mean_ms)}</td>
          <td class="num">${formatSeconds(m.cycle_median_ms)}</td>
          <td class="num">${formatSeconds(m.cycle_p25_ms)} - ${formatSeconds(m.cycle_p75_ms)}</td>
          <td class="num">${formatSeconds(m.cycle_p90_ms)}</td>
          <td class="num">${formatSeconds(m.cycle_max_ms)}</td>
          <td class="num">${formatInt(m.cycle_count)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderMatrix(data) {
  el('matrix-head').innerHTML = `
    <tr>
      <th scope="col">Task</th>
      ${data.runs
        .map(
          run => `
          <th scope="col" class="model-col">
            <span class="model-cell">
              <span class="model-dot" style="--model-color:${run.color}" aria-hidden="true"></span>
              <span>${escapeHtml(run.short_label)}</span>
            </span>
          </th>
        `
        )
        .join('')}
    </tr>
  `;

  el('matrix-body').innerHTML = data.words
    .map(word => {
      const isSelectedWord = word.id === state.selectedWordId;
      const cells = data.runs
        .map(run => {
          const round = run.rounds[word.id];
          const solved = round.status === 'solved';
          const pct = Math.min(100, (round.attempts / data.max_guesses) * 100);
          const dimmed = !isRunActive(run.id, state.focusedIds);
          const isActiveCell = isSelectedWord && run.id === state.selectedRunId;
          const classes = ['matrix-cell-btn'];
          if (solved) classes.push('is-solved');
          if (isActiveCell) classes.push('is-active-cell');
          if (dimmed) classes.push('is-dimmed');

          return `
            <td>
              <button
                type="button"
                class="${classes.join(' ')}"
                style="--model-color:${run.color}"
                data-select-word="${escapeHtml(word.id)}"
                data-select-run="${escapeHtml(run.id)}"
                aria-label="${escapeHtml(`${word.id} ${word.answer}, ${run.label}: ${solved ? `solved in ${round.attempts} guesses` : `failed after ${round.attempts} guesses, best rank ${formatRank(round.best_rank)}`}`)}"
              >
                <span class="cell-top">
                  <span class="cell-attempts">${round.attempts} / ${data.max_guesses}</span>
                  <span class="cell-status">${solved ? 'solved' : 'failed'}</span>
                </span>
                <span class="cell-bar-track" aria-hidden="true">
                  <span class="cell-bar-fill" style="width:${pct.toFixed(1)}%"></span>
                </span>
                <span class="cell-rank">best rank ${formatRank(round.best_rank)}</span>
              </button>
            </td>
          `;
        })
        .join('');

      return `
        <tr class="${isSelectedWord ? 'is-selected-word' : ''}">
          <th scope="row">
            <button
              type="button"
              class="word-row-btn"
              data-select-word="${escapeHtml(word.id)}"
              aria-pressed="${isSelectedWord ? 'true' : 'false'}"
            >
              <span class="word-id">${escapeHtml(word.id)}</span>
              <span class="word-answer">${escapeHtml(word.answer)}</span>
              <span class="word-solved-count">${word.solved_by}/${data.runs.length} solved</span>
            </button>
          </th>
          ${cells}
        </tr>
      `;
    })
    .join('');
}

function renderInspector(data) {
  const word = data.words.find(w => w.id === state.selectedWordId) || data.words[0];
  const run = data.runs.find(r => r.id === state.selectedRunId) || data.runs[0];
  const round = run.rounds[word.id];

  el('inspector-heading').textContent = `${word.id}: ${word.answer}`;
  el('inspector-summary').textContent =
    word.solved_by === 0
      ? 'Not solved by any participant within 50 guesses.'
      : `Solved by ${word.solved_by} of ${data.runs.length} participants.`;

  el('word-switcher').innerHTML = data.words
    .map(
      w => `
      <button
        type="button"
        class="word-chip"
        data-select-word="${escapeHtml(w.id)}"
        aria-pressed="${w.id === word.id ? 'true' : 'false'}"
      >${escapeHtml(w.id)}</button>
    `
    )
    .join('');

  el('chart-trajectory').innerHTML = renderRoundTrajectoryChart(
    data.runs,
    word.id,
    state.focusedIds,
    data.max_guesses,
    data.vocabulary_size
  );

  el('log-model-tabs').innerHTML = data.runs
    .map(r => {
      const rRound = r.rounds[word.id];
      const tag = rRound.status === 'solved' ? `${rRound.attempts}` : 'fail';
      return `
        <button
          type="button"
          role="tab"
          id="log-tab-${escapeHtml(r.id)}"
          aria-controls="log-panel"
          tabindex="${r.id === run.id ? '0' : '-1'}"
          class="log-tab"
          style="--model-color:${r.color}"
          data-select-run="${escapeHtml(r.id)}"
          aria-selected="${r.id === run.id ? 'true' : 'false'}"
        >
          <span class="model-dot" aria-hidden="true"></span>
          <span>${escapeHtml(r.short_label)} (${tag})</span>
        </button>
      `;
    })
    .join('');

  el('log-panel').setAttribute('aria-labelledby', `log-tab-${run.id}`);

  el('log-round-meta').textContent =
    `${run.label} - ${round.status === 'solved' ? `Solved in ${round.attempts} guesses` : `Exhausted (${round.attempts} guesses, best rank ${formatRank(round.best_rank)})`} | Mean cycle ${formatSeconds(round.cycle_mean_ms)} | Median ${formatSeconds(round.cycle_median_ms)} | Invalid ${round.invalid}`;

  el('log-table-body').innerHTML = round.events
    .map(ev => {
      const note = formatEventNote(ev);
      const rowCls = ev.rank === 1 ? 'is-win' : ev.error ? 'is-invalid' : '';
      const badge = note.text
        ? `<span class="badge-inline${note.kind ? ` badge-${note.kind}` : ''}">${escapeHtml(note.text)}</span>`
        : '';
      return `
        <tr class="${rowCls}">
          <td class="num">${ev.attempt}</td>
          <td>${escapeHtml(ev.word)}</td>
          <td class="num">${ev.rank === null ? '-' : formatRank(ev.rank)}</td>
          <td class="num">${ev.best_rank_so_far === null ? '-' : formatRank(ev.best_rank_so_far)}</td>
          <td class="num">${ev.cycle_ms === null ? 'first' : formatSeconds(ev.cycle_ms)}</td>
          <td>${badge}</td>
        </tr>
      `;
    })
    .join('');
}

function renderAll() {
  const data = state.data;
  if (!data) return;
  renderFilters(data);
  renderSummaryCards(data);
  renderQualitySection(data);
  renderSpeedSection(data);
  renderMatrix(data);
  renderInspector(data);
}

function bindEvents() {
  document.addEventListener('click', event => {
    const focusBtn = event.target.closest('[data-focus-run]');
    if (focusBtn) {
      keepFocus(() => toggleFocus(focusBtn.dataset.focusRun));
      return;
    }

    const cellBtn = event.target.closest('[data-select-word], [data-select-run]');
    if (cellBtn) {
      let changed = false;
      if (cellBtn.dataset.selectWord && cellBtn.dataset.selectWord !== state.selectedWordId) {
        state.selectedWordId = cellBtn.dataset.selectWord;
        changed = true;
      }
      if (cellBtn.dataset.selectRun && cellBtn.dataset.selectRun !== state.selectedRunId) {
        state.selectedRunId = cellBtn.dataset.selectRun;
        changed = true;
      }
      if (changed) {
        keepFocus(() => {
          renderMatrix(state.data);
          renderInspector(state.data);
        });
      }
    }
  });

  el('reset-filters').addEventListener('click', () => {
    state.focusedIds.clear();
    renderAll();
  });

  el('log-model-tabs').addEventListener('keydown', event => {
    const tabs = [...el('log-model-tabs').querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const target = tabs[nextIndex];
    state.selectedRunId = target.dataset.selectRun;
    renderMatrix(state.data);
    renderInspector(state.data);
    const updatedTab = el('log-model-tabs').querySelector(`[data-select-run="${CSS.escape(state.selectedRunId)}"]`);
    if (updatedTab) updatedTab.focus();
  });
}

async function init() {
  bindEvents();
  try {
    const response = await fetch('./data/results.json', { cache: 'no-cache', headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading canonical results.`);
    }
    const payload = await response.json();
    const check = validateDataset(payload);
    if (!check.ok) {
      showStatus(check.reason, true);
      return;
    }

    state.data = payload;
    state.selectedWordId = payload.words[0].id;
    state.selectedRunId = payload.runs[1]?.id || payload.runs[0].id;

    renderMetadata(payload);
    renderAll();
    el('status-region').hidden = true;
    el('dashboard').hidden = false;
  } catch (error) {
    showStatus(`Unable to load benchmark results: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

init();
