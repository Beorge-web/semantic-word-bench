export const effortOrder = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

const models = {
  'gpt-6.1-sol': { label: 'GPT-6.1 Sol', short: 'Sol 6.1', family: 'Sol', color: '#6b9eff' },
  'gpt-6.2-sol': { label: 'GPT-6.2 Sol', short: 'Sol 6.2', family: 'Sol', color: '#3fd1a5' },
  'gpt-6-astra': { label: 'GPT-6 Astra', short: 'Astra 6', family: 'Astra', color: '#ee8ba3' },
  'gpt-6.2-astra': { label: 'GPT-6.2 Astra', short: 'Astra 6.2', family: 'Astra', color: '#6dd4df' },
  'gemini-4-neon': { label: 'Gemini 4 Neon', short: 'Neon', family: 'Neon', color: '#e6a955' },
};

export function auditMatchesRun(audit, run) {
  if (audit.run_id) return audit.run_id === run.id;
  const model = audit.model ?? audit.requested_model;
  const effort = audit.effort ?? audit.thought_level;
  return (model === run.metadata.model || (audit.key !== undefined && run.key !== undefined && audit.key === run.key)) && effort === run.metadata.effort;
}

export function participantInfo(run, audits = []) {
  const meta = run.metadata;
  const known = models[meta.model] ?? { label: meta.model, short: meta.model, family: meta.participant_type === 'human' ? 'Human' : 'Other', color: '#bec9d8' };
  const checked = audits.filter(audit => auditMatchesRun(audit, run));
  const verified = Object.keys(run.rounds).length > 0 && Object.keys(run.rounds).every(id => checked.some(audit => audit.round === id && audit.executed_model === meta.model));
  const tier = meta.service_tier ?? checked.find(audit => audit.service_tier)?.service_tier ?? null;
  return {
    id: meta.participant_id ?? `${meta.model}-${meta.effort}`,
    key: run.key ?? `${meta.model}:${meta.effort}`,
    label: `${known.label} ${meta.effort}${meta.repetition > 1 ? ` trial ${meta.repetition}` : ''}`,
    shortLabel: `${known.short} ${meta.effort}`,
    family: known.family,
    providerDisplay: /codex/i.test(meta.provider) ? 'Codex' : /antigravity/i.test(meta.provider) ? 'Antigravity' : meta.provider,
    color: meta.model === 'gemini-4-neon' && meta.effort === 'medium' ? '#b78bfa' : known.color,
    executedModelVerified: verified,
    executedModelNote: meta.participant_type === 'human' ? 'Human participant; model identity does not apply.' : verified ? 'Executed model is recorded in every round audit.' : 'Executed model identity is not independently verified for every round. See the audit records.',
    serviceTier: tier,
    comparisonGroup: JSON.stringify([meta.model, meta.provider, meta.track, meta.prompt_mode, tier]),
  };
}

export function summarizeEfforts(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = run.comparison_group;
    if (!groups.has(key)) groups.set(key, { id: key, model: run.model, provider: run.provider_display, service_tier: run.service_tier, label: [run.model, run.provider_display, run.service_tier, run.track, run.prompt_mode].filter(Boolean).join(' / '), efforts: [] });
    const group = groups.get(key);
    let entry = group.efforts.find(entry => entry.effort === run.effort);
    if (!entry) { entry = { effort: run.effort, runs: 0, rounds: 0, solved: 0, par2_total: 0, cycle_total_ms: 0, cycle_count: 0 }; group.efforts.push(entry); }
    entry.runs++;
    entry.rounds += run.metrics.rounds;
    entry.solved += run.metrics.solved;
    entry.par2_total += run.metrics.par2 * run.metrics.rounds;
    entry.cycle_total_ms += (run.metrics.cycle_mean_ms ?? 0) * run.metrics.cycle_count;
    entry.cycle_count += run.metrics.cycle_count;
  }
  return [...groups.values()].map(group => ({ ...group, efforts: group.efforts
    .sort((a, b) => effortOrder.indexOf(a.effort) - effortOrder.indexOf(b.effort))
    .map(entry => ({ effort: entry.effort, runs: entry.runs, rounds: entry.rounds, solved: entry.solved, solve_rate: entry.rounds ? entry.solved / entry.rounds : null, par2: entry.rounds ? entry.par2_total / entry.rounds : null, cycle_mean_ms: entry.cycle_count ? entry.cycle_total_ms / entry.cycle_count : null })) }));
}
