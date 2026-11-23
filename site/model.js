export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatSeconds(ms, digits = 2) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 'n/a';
  return `${(ms / 1000).toFixed(digits)} s`;
}

export function formatNumber(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

export function formatInt(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return Math.round(value).toLocaleString('en-US');
}

export function formatRank(rank) {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return 'n/a';
  return rank.toLocaleString('en-US');
}

export function formatDateUtc(isoString) {
  if (!isoString) return 'n/a';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatEventNote(event) {
  if (event.rank === 1) return { text: 'Solved', kind: 'win' };
  if (event.error === 'unknown_word') return { text: 'Unknown word', kind: 'err' };
  if (event.error === 'invalid_format') return { text: 'Invalid format', kind: 'err' };
  if (event.error) return { text: event.error, kind: 'err' };
  if (event.duplicate) return { text: 'Duplicate', kind: 'err' };
  return { text: '', kind: '' };
}

export function isRunActive(runId, focusedIds) {
  return focusedIds.size === 0 || focusedIds.has(runId);
}

export function validateDataset(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'Benchmark data payload is empty or invalid JSON.' };
  }
  if (!Array.isArray(data.runs) || data.runs.length === 0) {
    return { ok: false, reason: 'No completed benchmark runs were found in the canonical dataset.' };
  }
  if (!Array.isArray(data.words) || data.words.length === 0) {
    return { ok: false, reason: 'No benchmark tasks were found in the canonical dataset.' };
  }
  return { ok: true };
}

export function resolveLabelPositions(items, minGap, minY, maxY) {
  const sorted = items.map(item => ({ ...item, resolvedY: item.y })).sort((a, b) => a.resolvedY - b.resolvedY);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].resolvedY - sorted[i - 1].resolvedY < minGap) {
      sorted[i].resolvedY = sorted[i - 1].resolvedY + minGap;
    }
  }
  if (sorted.length && sorted[sorted.length - 1].resolvedY > maxY) {
    sorted[sorted.length - 1].resolvedY = maxY;
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i + 1].resolvedY - sorted[i].resolvedY < minGap) {
        sorted[i].resolvedY = sorted[i + 1].resolvedY - minGap;
      }
    }
  }
  for (const item of sorted) {
    if (item.resolvedY < minY) item.resolvedY = minY;
  }
  return sorted;
}
