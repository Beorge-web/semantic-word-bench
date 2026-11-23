import { escapeHtml, formatNumber, formatRank, formatSeconds, isRunActive, resolveLabelPositions } from './model.js';

const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function renderPar2Chart(runs, focusedIds, maxGuesses, par2Penalty) {
  const width = 540;
  const rowStep = 40;
  const top = 34;
  const left = 132;
  const right = 68;
  const plotW = width - left - right;
  const height = top + runs.length * rowStep + 34;
  const xOf = value => left + (Math.min(par2Penalty, Math.max(0, value)) / par2Penalty) * plotW;
  const budgetX = xOf(maxGuesses);

  const ticks = Array.from({ length: 5 }, (_, i) => par2Penalty * i / 4);
  const axisY = top + runs.length * rowStep + 6;
  const grid = ticks
    .map(tick => {
      const x = xOf(tick);
      const isBudget = tick === maxGuesses;
      return `
        <line x1="${x.toFixed(1)}" y1="${top - 6}" x2="${x.toFixed(1)}" y2="${axisY - 4}" stroke="${isBudget ? '#465768' : '#1f2832'}" stroke-width="1"${isBudget ? ' stroke-dasharray="3 3"' : ''}/>
        <text x="${x.toFixed(1)}" y="${axisY + 14}" text-anchor="middle" fill="#708090" font-family="${FONT_MONO}" font-size="11">${tick}</text>
      `;
    })
    .join('');

  const rows = runs
    .map((run, idx) => {
      const y = top + idx * rowStep + 8;
      const active = isRunActive(run.id, focusedIds);
      const opacity = active ? '1' : '0.28';
      const barW = Math.max(2, xOf(run.metrics.par2) - left);
      return `
        <g opacity="${opacity}">
          <text x="0" y="${y + 13}" fill="#d8e1eb" font-size="12.5" font-weight="500">${escapeHtml(run.short_label)}</text>
          <rect x="${left}" y="${y}" width="${plotW}" height="18" rx="4" fill="#171f28"/>
          <rect x="${left}" y="${y}" width="${barW.toFixed(1)}" height="18" rx="4" fill="${run.color}">
            <title>${escapeHtml(run.label)}: PAR2 ${formatNumber(run.metrics.par2, 1)} attempts (${run.metrics.solved}/${run.metrics.rounds} solved)</title>
          </rect>
          <text x="${(width - 4).toFixed(1)}" y="${y + 13}" text-anchor="end" fill="#edf2f7" font-family="${FONT_MONO}" font-size="12.5" font-weight="600">${formatNumber(run.metrics.par2, 1)}</text>
        </g>
      `;
    })
    .join('');

  const aria = `PAR2 attempts, lower is better. ${runs.map(r => `${r.label}: ${formatNumber(r.metrics.par2, 1)}`).join('. ')}.`;

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(aria)}">
      <rect x="${budgetX.toFixed(1)}" y="${top - 6}" width="${(plotW - (budgetX - left)).toFixed(1)}" height="${(axisY - top + 2).toFixed(1)}" fill="#e27878" opacity="0.045"/>
      <text x="${budgetX.toFixed(1)}" y="18" text-anchor="middle" fill="#8998a8" font-family="${FONT_MONO}" font-size="10.5">${maxGuesses} budget</text>
      <text x="${(left + plotW).toFixed(1)}" y="18" text-anchor="end" fill="#708090" font-family="${FONT_MONO}" font-size="10">penalty zone</text>
      ${grid}
      ${rows}
    </svg>
  `;
}

export function renderSolvedUnitChart(runs, words, focusedIds) {
  const width = 540;
  const rowStep = 40;
  const top = 34;
  const left = 132;
  const right = 68;
  const plotW = width - left - right;
  const height = top + runs.length * rowStep + 34;
  const count = words.length;
  const gap = 4;
  const cellW = (plotW - gap * (count - 1)) / count;
  const axisY = top + runs.length * rowStep + 6;

  const colHeaders = words
    .map((word, idx) => {
      const cx = left + idx * (cellW + gap) + cellW / 2;
      const num = word.id.replace(/^(en|ru)-/, '');
      return `<text x="${cx.toFixed(1)}" y="18" text-anchor="middle" fill="#708090" font-family="${FONT_MONO}" font-size="10.5"><title>${escapeHtml(word.id)}: ${escapeHtml(word.answer)}</title>${escapeHtml(num)}</text>`;
    })
    .join('');

  const rows = runs
    .map((run, rIdx) => {
      const y = top + rIdx * rowStep + 8;
      const active = isRunActive(run.id, focusedIds);
      const opacity = active ? '1' : '0.28';
      const cells = words
        .map((word, wIdx) => {
          const x = left + wIdx * (cellW + gap);
          const round = run.rounds[word.id];
          const solved = round && round.status === 'solved';
          const fill = solved ? run.color : '#171f28';
          const stroke = solved ? run.color : '#283340';
          const detail = solved
            ? `${run.label} solved ${word.id} (${word.answer}) in ${round.attempts} guesses`
            : `${run.label} failed ${word.id} (${word.answer}), best rank ${formatRank(round?.best_rank)}`;
          return `<rect x="${x.toFixed(1)}" y="${y}" width="${cellW.toFixed(1)}" height="18" rx="3.5" fill="${fill}" stroke="${stroke}" stroke-width="1"><title>${escapeHtml(detail)}</title></rect>`;
        })
        .join('');

      return `
        <g opacity="${opacity}">
          <text x="0" y="${y + 13}" fill="#d8e1eb" font-size="12.5" font-weight="500">${escapeHtml(run.short_label)}</text>
          ${cells}
          <text x="${(width - 4).toFixed(1)}" y="${y + 13}" text-anchor="end" fill="#edf2f7" font-family="${FONT_MONO}" font-size="12.5" font-weight="600">${run.metrics.solved}/${count}</text>
        </g>
      `;
    })
    .join('');

  const aria = `Words solved out of ${count}. ${runs.map(r => `${r.label}: ${r.metrics.solved} of ${count}`).join('. ')}.`;

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(aria)}">
      ${colHeaders}
      ${rows}
      <text x="${left}" y="${axisY + 14}" fill="#708090" font-size="11">Columns follow the selected task order. Filled = solved.</text>
    </svg>
  `;
}

export function renderAttemptsChart(runs, words, focusedIds, maxGuesses) {
  const headers = runs.map(run => `<th scope="col" style="--model-color:${run.color}">
    <span class="attempt-model-name">${escapeHtml(run.short_label.replace(/\s(high|low|medium)$/, ''))}</span>
    <span class="attempt-effort">${escapeHtml(run.effort)}</span>
  </th>`).join('');
  const rows = words.map(word => `<tr>
    <th scope="row">${escapeHtml(word.answer)}</th>
    ${runs.map(run => {
      const round = run.rounds[word.id];
      const solved = round.status === 'solved';
      const label = `${run.label}, ${word.answer}: ${solved ? `solved in ${round.attempts} attempts` : `not solved in ${maxGuesses} attempts, best rank ${round.best_rank}`}`;
      return `<td style="--model-color:${run.color}" class="${isRunActive(run.id, focusedIds) ? '' : 'is-dimmed'}">
        <span class="attempt-result ${solved ? 'is-solved' : 'is-failed'}" aria-label="${escapeHtml(label)}">
          ${solved
            ? `<span class="attempt-track" aria-hidden="true"><span class="attempt-fill" style="width:${round.attempts / maxGuesses * 100}%"></span></span><span class="attempt-count">${round.attempts}</span>`
            : '<span class="attempt-fail">Fail</span>'}
        </span>
      </td>`;
    }).join('')}
  </tr>`).join('');
  return `<table class="attempts-table" aria-label="Attempts used to solve each word. Lower is better. Fail means not solved within ${maxGuesses} attempts.">
    <thead><tr><th scope="col">Word</th>${headers}</tr></thead><tbody>${rows}</tbody>
  </table>`;
}

export function renderSpeedDistributionChart(runs, focusedIds) {
  const width = 920;
  const rowStep = 50;
  const top = 26;
  const bottom = 40;
  const left = 176;
  const right = 186;
  const plotW = width - left - right;
  const height = top + runs.length * rowStep + bottom;

  const maxP90Sec = Math.max(...runs.map(r => (r.metrics.cycle_p90_ms || 0) / 1000), 15);
  const axisMaxSec = Math.max(25, Math.ceil(maxP90Sec / 5) * 5);
  const xOfSec = sec => left + (Math.min(axisMaxSec, Math.max(0, sec)) / axisMaxSec) * plotW;

  const tickStep = axisMaxSec <= 25 ? 5 : 10;
  const ticks = [];
  for (let s = 0; s <= axisMaxSec; s += tickStep) ticks.push(s);

  const axisY = top + runs.length * rowStep + 4;
  const grid = ticks
    .map(sec => {
      const x = xOfSec(sec);
      return `
        <line x1="${x.toFixed(1)}" y1="${top - 4}" x2="${x.toFixed(1)}" y2="${axisY - 4}" stroke="${sec === 0 ? '#313f4d' : '#1d2630'}" stroke-width="1"/>
        <text x="${x.toFixed(1)}" y="${axisY + 14}" text-anchor="middle" fill="#708090" font-family="${FONT_MONO}" font-size="11">${sec} s</text>
      `;
    })
    .join('');

  const rows = runs
    .map((run, idx) => {
      const cy = top + idx * rowStep + 22;
      const m = run.metrics;
      const active = isRunActive(run.id, focusedIds);
      const opacity = active ? '1' : '0.26';

      const xP10 = xOfSec((m.cycle_p10_ms || 0) / 1000);
      const xP25 = xOfSec((m.cycle_p25_ms || 0) / 1000);
      const xMed = xOfSec((m.cycle_median_ms || 0) / 1000);
      const xMean = xOfSec((m.cycle_mean_ms || 0) / 1000);
      const xP75 = xOfSec((m.cycle_p75_ms || 0) / 1000);
      const xP90 = xOfSec((m.cycle_p90_ms || 0) / 1000);

      const d = 5.5;
      const diamond = `${xMean.toFixed(1)},${(cy - d).toFixed(1)} ${(xMean + d).toFixed(1)},${cy.toFixed(1)} ${xMean.toFixed(1)},${(cy + d).toFixed(1)} ${(xMean - d).toFixed(1)},${cy.toFixed(1)}`;
      const maxNote = (m.cycle_max_ms || 0) / 1000 > axisMaxSec
        ? `max ${formatSeconds(m.cycle_max_ms, 1)}`
        : `max ${formatSeconds(m.cycle_max_ms, 2)}`;

      const tooltip = `${run.label}: mean ${formatSeconds(m.cycle_mean_ms)}, median ${formatSeconds(m.cycle_median_ms)}, IQR ${formatSeconds(m.cycle_p25_ms)} to ${formatSeconds(m.cycle_p75_ms)}, P90 ${formatSeconds(m.cycle_p90_ms)}, max ${formatSeconds(m.cycle_max_ms)} (${m.cycle_count} cycles)`;

      return `
        <g opacity="${opacity}">
          <text x="0" y="${cy - 2}" fill="#edf2f7" font-size="13" font-weight="500">${escapeHtml(run.label)}</text>
          <text x="0" y="${cy + 14}" fill="#708090" font-family="${FONT_MONO}" font-size="10.5">${escapeHtml(run.provider_display)} / ${m.cycle_count} cycles</text>

          <line x1="${left}" y1="${cy}" x2="${(left + plotW).toFixed(1)}" y2="${cy}" stroke="#171e26" stroke-width="1"/>
          <line x1="${xP10.toFixed(1)}" y1="${cy}" x2="${xP90.toFixed(1)}" y2="${cy}" stroke="${run.color}" stroke-width="2" opacity="0.65"/>
          <line x1="${xP10.toFixed(1)}" y1="${cy - 5}" x2="${xP10.toFixed(1)}" y2="${cy + 5}" stroke="${run.color}" stroke-width="1.5" opacity="0.65"/>
          <line x1="${xP90.toFixed(1)}" y1="${cy - 5}" x2="${xP90.toFixed(1)}" y2="${cy + 5}" stroke="${run.color}" stroke-width="1.5" opacity="0.65"/>

          <rect x="${xP25.toFixed(1)}" y="${cy - 8}" width="${Math.max(2, xP75 - xP25).toFixed(1)}" height="16" rx="3" fill="${run.color}" fill-opacity="0.24" stroke="${run.color}" stroke-width="1.5">
            <title>${escapeHtml(tooltip)}</title>
          </rect>

          <line x1="${xMed.toFixed(1)}" y1="${cy - 10}" x2="${xMed.toFixed(1)}" y2="${cy + 10}" stroke="#edf2f7" stroke-width="2.5" stroke-linecap="round">
            <title>Median: ${formatSeconds(m.cycle_median_ms)}</title>
          </line>

          <polygon points="${diamond}" fill="${run.color}" stroke="#0b0e11" stroke-width="1.5">
            <title>Mean: ${formatSeconds(m.cycle_mean_ms)}</title>
          </polygon>

          <text x="${(left + plotW + 16).toFixed(1)}" y="${cy - 2}" fill="#edf2f7" font-family="${FONT_MONO}" font-size="12" font-weight="600">${formatSeconds(m.cycle_mean_ms)} mean</text>
          <text x="${(left + plotW + 16).toFixed(1)}" y="${cy + 14}" fill="#8f9eae" font-family="${FONT_MONO}" font-size="10.5">${formatSeconds(m.cycle_median_ms)} med | ${maxNote}</text>
        </g>
      `;
    })
    .join('');

  const aria = `Interaction cycle duration in seconds. ${runs.map(r => `${r.label}: mean ${formatSeconds(r.metrics.cycle_mean_ms)}, median ${formatSeconds(r.metrics.cycle_median_ms)}`).join('. ')}.`;

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(aria)}">
      ${grid}
      ${rows}
      <text x="${(left + plotW / 2).toFixed(1)}" y="${height - 4}" text-anchor="middle" fill="#708090" font-size="11.5">Interaction cycle duration (axis capped at ${axisMaxSec} s for P10-P90 readability)</text>
    </svg>
  `;
}

export function renderRoundTrajectoryChart(runs, wordId, focusedIds, maxGuesses, vocabularySize, mode = 'best') {
  const width = 920;
  const height = 264;
  const left = 64;
  const right = 148;
  const top = 22;
  const bottom = 42;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const maxLog = Math.max(1, Math.log10(vocabularySize));

  const xOf = attempt => left + ((attempt - 1) / Math.max(1, maxGuesses - 1)) * plotW;
  const yOfRank = rank => {
    const clamped = Math.min(vocabularySize, Math.max(1, rank));
    return top + (Math.log10(clamped) / maxLog) * plotH;
  };

  const yTicks = [...new Set([1, 10, 100, 1000, 10000, vocabularySize].filter(rank => rank <= vocabularySize))].sort((a, b) => a - b);
  const xTicks = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => Math.round(maxGuesses * (i + 1) / 5))].filter(attempt => attempt >= 1 && attempt <= maxGuesses))];

  const yGrid = yTicks
    .map(rank => {
      const y = yOfRank(rank);
      const isSolvedLine = rank === 1;
      const label = rank === 1 ? '1 (win)' : rank >= 1000 ? `${rank / 1000}k` : String(rank);
      return `
        <line x1="${left}" y1="${y.toFixed(1)}" x2="${(left + plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${isSolvedLine ? '#3fd1a5' : '#1d2630'}" stroke-width="1"${isSolvedLine ? ' stroke-dasharray="4 4" opacity="0.55"' : ''}/>
        <text x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${isSolvedLine ? '#3fd1a5' : '#708090'}" font-family="${FONT_MONO}" font-size="10.5">${label}</text>
      `;
    })
    .join('');

  const xGrid = xTicks
    .map(a => {
      const x = xOf(a);
      return `
        <line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${(top + plotH).toFixed(1)}" stroke="#19212a" stroke-width="1"/>
        <text x="${x.toFixed(1)}" y="${(top + plotH + 18).toFixed(1)}" text-anchor="middle" fill="#708090" font-family="${FONT_MONO}" font-size="11">${a}</text>
      `;
    })
    .join('');

  const endPoints = [];
  const series = runs
    .map(run => {
      const round = run.rounds[wordId];
      if (!round || !round.events.length) return '';
      const active = isRunActive(run.id, focusedIds);
      const opacity = active ? '1' : '0.2';
      const strokeW = active ? '2.3' : '1.4';

      const pts = [];
      for (const ev of round.events) {
        const rank = mode === 'raw' ? ev.rank : ev.best_rank_so_far;
        pts.push({ attempt: ev.attempt, rank, word: ev.word, rawRank: ev.rank });
      }

      let connected = false;
      const pathD = pts.map(pt => {
        if (pt.rank === null || pt.rank === undefined) { connected = false; return ''; }
        const command = `${connected ? 'L' : 'M'} ${xOf(pt.attempt).toFixed(1)} ${yOfRank(pt.rank).toFixed(1)}`;
        connected = true;
        return command;
      }).join(' ');

      const last = pts.findLast(pt => pt.rank !== null && pt.rank !== undefined);
      if (!last) return '';
      const lx = xOf(last.attempt);
      const ly = yOfRank(last.rank);
      const solved = round.status === 'solved';

      endPoints.push({
        run,
        round,
        x: lx,
        y: ly,
        active,
        solved,
        displayRank: last.rank,
      });

      const marker = solved
        ? `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.5" fill="${run.color}" stroke="#0b0e11" stroke-width="1.5"><title>${escapeHtml(run.label)}: solved on attempt ${round.attempts}</title></circle>`
        : `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="#11161c" stroke="${run.color}" stroke-width="2"><title>${escapeHtml(run.label)}: exhausted (best rank ${formatRank(round.best_rank)})</title></circle>`;

      return `
        <g opacity="${opacity}">
          <path d="${pathD}" fill="none" stroke="${run.color}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"/>
          ${marker}
        </g>
      `;
    })
    .join('');

  const labels = resolveLabelPositions(endPoints, 18, top + 6, top + plotH - 4)
    .map(item => {
      const opacity = item.active ? '1' : '0.3';
      const statusText = item.solved ? `#${item.round.attempts}` : `r${formatRank(item.displayRank)}`;
      return `
        <g opacity="${opacity}">
          <text x="${(left + plotW + 14).toFixed(1)}" y="${(item.resolvedY + 4).toFixed(1)}" fill="${item.run.color}" font-size="11.5" font-weight="500">${escapeHtml(item.run.short_label)}</text>
          <text x="${(width - 4).toFixed(1)}" y="${(item.resolvedY + 4).toFixed(1)}" text-anchor="end" fill="${item.solved ? '#edf2f7' : '#8f9eae'}" font-family="${FONT_MONO}" font-size="11">${escapeHtml(statusText)}</text>
        </g>
      `;
    })
    .join('');

  const answer = runs[0]?.rounds[wordId]?.answer || '';
  const aria = `${mode === 'raw' ? 'Every guess rank' : 'Best rank so far'} for ${wordId} (${answer}) across attempts 1 to ${maxGuesses}. ${endPoints.map(p => `${p.run.label}: ${p.solved ? `solved on attempt ${p.round.attempts}` : `failed with best rank ${p.round.best_rank}`}`).join('. ')}.`;

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(aria)}">
      ${xGrid}
      ${yGrid}
      ${series}
      ${labels}
      <text x="${(left + plotW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" fill="#708090" font-size="11.5">Attempt number</text>
      <text x="14" y="${(top + plotH / 2).toFixed(1)}" text-anchor="middle" fill="#708090" font-size="11.5" transform="rotate(-90 14 ${(top + plotH / 2).toFixed(1)})">${mode === 'raw' ? 'Guess rank' : 'Best rank'} (log scale)</text>
    </svg>
  `;
}
