# English baseline, November 23, 2026

One trial on the same 10 English tasks for GPT-6.1 Sol high and GPT-6.2 Sol high. Both used Codex-beorge, the default service tier, protocol version 3, and a separate CLI process for each submission. Every round ran in a fresh agent context. There were no human interventions.

| Model | Solved | PAR2, attempts | Mean interaction cycle | Median interaction cycle |
| --- | ---: | ---: | ---: | ---: |
| GPT-6.1 Sol high | 3/10 | 78.1 | 4.57 s | 4.38 s |
| GPT-6.2 Sol high | 7/10 | 50.9 | 2.81 s | 2.57 s |

PAR2 assigns 100 attempts to an unsolved round, then averages across all tasks. Lower is better. Timing is separate. Interaction cycles are measured between consecutive results within a round, excluding the first result. They are not provider TTFT.

## Files

- [report.html](report.html): standalone report with charts and expandable results for each word.
- [comparison.json](comparison.json): English records for both models, aggregate metrics, and paired task results.
- [rounds.csv](rounds.csv): results by word.
- [gpt-6.1-sol.json](gpt-6.1-sol.json) and [gpt-6.2-sol.json](gpt-6.2-sol.json): submissions and timestamps.
- [audit.json](audit.json): verified models and settings, transcript links, command counts, and agent run times.

Exports contain only English rounds. Russian tasks were not run and are excluded from the metrics. All 20 agent transcripts were reviewed. They contain 790 individual CLI submissions. No source, dictionary, or external-source access was found in those transcripts.

This is one observation on 10 selected words without independent repeats. It is not a general ranking of model intelligence.
