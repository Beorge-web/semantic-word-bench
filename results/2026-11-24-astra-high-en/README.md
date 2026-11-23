# Astra English baseline

Each completed participant attempted the same 10 English tasks in fresh Codex agent contexts, with high reasoning effort, default service tier and 50 submissions per task. The Numberbatch v1 oracle and baseline prompt match the earlier Sol and Neon trials.

| Participant | Solved | PAR2 | Mean cycle | Median cycle |
| --- | ---: | ---: | ---: | ---: |
| gpt-6-astra high | 5/10 | 62.3 | 6.84 s | 5.44 s |
| gpt-6.2-astra high | 5/10 | 64.8 | 3.29 s | 2.78 s |

Quality and time are separate measurements. Cycles include model, agent and CLI work and exclude each round's first result. These are single trials on 10 selected words, not a general intelligence ranking. Russian rounds are excluded.

Machine workload was not controlled. Dataset preparation and site validation also ran on the oracle machine during the experiment. Astra 6 has a 326.7-second interaction cycle. This observation remains in the mean; the median is reported separately. These measurements do not isolate provider inference latency.

All completed transcripts were audited for the configured and executed model, high effort, default tier and assigned CLI commands. Recorded ranks match the frozen tables. These runs have fresh contexts and shared-filesystem command audits, not physical filesystem isolation. Provider token usage and task cost were unavailable and remain null.

- [Raw comparison](comparison.json)
- [Round metrics and trajectories](rounds.csv)
- [Audit evidence](audit.json)
- [Metric definitions](../../docs/search-metrics.md)
