# Neon English baseline, November 23, 2026

Neon low and Neon medium each attempted the same 10 English tasks once through Antigravity GoogleMain. Each round ran in a fresh agent context with a limit of 50 submissions. The baseline prompt explained the rules and ranks without suggesting a strategy. There were no human interventions.

The comparison includes the [earlier Sol trial](../2026-11-23-sol-high-en/README.md), which used the same dataset, protocol, tasks and CLI commands through Codex.

| Model | Solved | PAR2, attempts | Mean interaction cycle | Median interaction cycle | Cycles |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-6.1 Sol high | 3/10 | 78.1 | 4.57 s | 4.38 s | 421 |
| GPT-6.2 Sol high | 7/10 | 50.9 | 2.81 s | 2.57 s | 349 |
| Gemini 4 Neon low | 4/10 | 73.6 | 10.41 s | 7.43 s | 426 |
| Gemini 4 Neon medium | 5/10 | 64.4 | 12.27 s | 10.52 s | 384 |

PAR2 averages attempts across all 10 tasks, assigning 100 attempts to each unsolved task. Lower is better. Timing is separate and does not affect the quality score.

Neon medium solved one more task than Neon low. Its mean interaction cycle was 18% longer. GPT-6.2 Sol high solved the most words and had the shortest mean cycle in these trials. These are observations from one trial on 10 selected words, without independent repeats. They do not establish a general ranking of model intelligence.

## Timing

An interaction cycle is the interval between consecutive CLI results in the same round. The first result in each round is excluded. The reported mean pools all recorded cycles. Each submission started a separate Bun process.

Cycles include model reasoning and generation, agent work, process startup, data loading and application work. They are not provider TTFT or tokens per second. Sol used Codex; Neon used Antigravity. The trials ran at different times. The timings describe those complete systems under the observed conditions and do not isolate the model's inference latency.

## Results by word

| Round | Answer | Sol 6.1 high | Sol 6.2 high | Neon low | Neon medium |
| --- | --- | ---: | ---: | ---: | ---: |
| en-01 | lantern | 29 | 29 | 21 | 35 |
| en-02 | volcano | Failed | Failed | Failed | Failed |
| en-03 | needle | Failed | Failed | Failed | 38 |
| en-04 | harvest | Failed | 26 | Failed | 10 |
| en-05 | library | 22 | 22 | 27 | 15 |
| en-06 | justice | Failed | 42 | Failed | Failed |
| en-07 | curiosity | Failed | 28 | 38 | 46 |
| en-08 | permission | Failed | Failed | Failed | Failed |
| en-09 | loyalty | Failed | 36 | 50 | Failed |
| en-10 | pattern | 30 | 26 | Failed | Failed |

Numbers are submissions until the exact answer. Failed means the agent exhausted all 50 submissions without finding it. Neon low solved en-09 on submission 50.

Neon low submitted 436 guesses, including 5 invalid guesses. Neon medium submitted 394 guesses, including 9 invalid guesses. Neither repeated a guess. Unknown words and invalid formats consumed attempts. The reported metrics include only English rounds. Russian rounds were not run.

## Audit and reproducibility

All 20 Neon transcripts were reviewed. They contain 830 individual guess commands for the assigned rounds. No project, dictionary or external-source access was found in those transcripts. Every recorded Neon rank was checked against the frozen tables. The earlier Sol audit covers another 790 submissions.

The requested model was `gemini-4-neon`, with `thought_level` set to `low` or `medium`. Antigravity did not report `executedModel`, so that audit field remains `null`. The audit verifies the configured model, provider and effort. It does not independently identify the provider's backend model.

All four records have matching dataset and protocol fingerprints. Protocol version 3 gives rules without a strategy hint. The dataset contains 50,000 accepted English words and frozen semantic ranks. Each round used a new delegate with only its assigned prompt. The source, data and prompts were preserved throughout the experiment.

## Files

- [report.html](report.html) contains charts and expandable details.
- [comparison.json](comparison.json) contains all four English records and paired task results.
- [rounds.csv](rounds.csv) contains results for each word and model.
- [neon-low.json](neon-low.json) and [neon-medium.json](neon-medium.json) contain Neon submissions and timestamps.
- [audit.json](audit.json) contains Neon settings, transcript links, command counts and agent run times.
- [Earlier Sol audit](../2026-11-23-sol-high-en/audit.json) contains the corresponding Sol evidence.
