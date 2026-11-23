# Running experiments

Each participant is a model, provider, reasoning setting and service tier. Each repetition creates a new run. Keep the dataset fingerprint, prompt mode, language scope, attempt budget and interface fixed within a collection.

## Plan an effort matrix

```sh
bun tools/experiment.js plan --config experiments/effort-matrix.json
bun tools/experiment.js plan --config experiments/effort-matrix.json --out runs/effort-study
```

The first command prints the profiles without creating runs. The second creates a SQLite database, `plan.json` and one prompt file per round. It does not send model requests or incur provider charges. The example requests 24 participant runs and 240 English round jobs. Change `repetitions` and each participant's `efforts` before creating the plan.

Use a fresh agent context for every round job. Supply its prompt alone. Configure the requested provider, exact model, reasoning effort and service tier in the agent launcher. Execute one guess, read its feedback, and then choose the next guess. Finish the round before advancing that participant. Randomize participant order across repetitions when measuring time. Record the launcher settings and actual executed model in the audit.

`supported_efforts` is an explicit operator declaration, not automatic capability detection. Refresh it against the provider's current capabilities before a new experiment. The tool rejects an effort outside that declaration. None is permitted only when the provider actually supports disabling extended thinking. Low is a distinct setting. The current Astra models advertise low, medium, high, xhigh, max and ultra; they do not advertise None. The checked-in configs contain no invented None run.

Provider effort labels are retained verbatim. High on one provider does not establish the same compute budget as High on another. The dashboard compares effort settings within the same model, provider, service tier, interface and prompt mode. It reports solve rate, PAR2 and interaction cycles separately. Repeated trials are weighted by task count for quality and cycle count for time. Missing settings have no score.

## Human baseline

```sh
bun tools/experiment.js plan --config experiments/human-english.json --out runs/human-01
```

Use an anonymous participant ID in the config. Give the person each round's rules and use its CLI command or the `play` command. A person has `participant_type: human`, `provider: human` and `effort: none`. None describes the human record, not a model setting. Choose new hidden targets for a person who has seen the public answers. Human trials use the same ranks and attempt budget. No human results are included until a person completes a trial.

## Export and publish

```sh
bun tools/experiment.js export --plan runs/effort-study/plan.json --out results/my-study/comparison.json --audits results/my-study/audit.json
```

Create the output directory first. Export refuses incomplete rounds in the declared language scope. Pending Russian rounds do not become failures in an English experiment. Every run must match the selected frozen suite. Answers are read by the operator's exporter from rank 1, never supplied to a participant.

An audit file has `commands` and `rounds`. Each round record should identify `run_id`, `round`, `requested_model`, `executed_model` when exposed, `provider`, `effort`, `service_tier`, `source`, `command_count`, `unexpected_commands`, `started_at`, `completed_at`, `token_usage` and `cost`. Archive the actual task prompt and command transcript with it. Keep missing telemetry null. A token record contains observed `input_tokens`, `output_tokens`, `reasoning_tokens` or `total_tokens`, plus its source. A cost record contains an observed `amount`, `currency` and `source`. Do not infer task costs from subscription prices. An audit's timestamps must cover the round before they can establish its full duration.

Add the comparison and audit paths to `results/catalog.json`. Use a separate collection for a different frozen dataset, embedding track, language scope, prompt mode or interface. Then run:

```sh
bun scripts/build-site.js
bun scripts/build-site.js --check
bun test
```

Commit the result files, catalog and generated `site/data/`. Vercel serves `site/` directly without installing packages or running a build. The selector lists published collections with completed results. Available datasets without completed trials do not appear as leaderboard entries.

## Oracle separation

The published pilot used fresh contexts and audited commands on a shared filesystem. This controls context carryover and records protocol compliance. It does not prevent file access. A private repository does not provide filesystem isolation.

For stronger separation, put the oracle, dataset, database and operator account on another machine or in a container with separate storage. Copy only `tools/participant.js` to the participant machine. Use a network address reachable by that participant. Keep the full repository and vector files off its filesystem. The scoped oracle exposes only the assigned round's feedback and history.

Create a run with `--interface http` and start one scoped oracle per active round:

```sh
bun cli.js create --model MODEL --provider PROVIDER --effort EFFORT --interface http
bun tools/oracle.js --run RUN_ID --round en-01 --token-file TOKEN_FILE --host 127.0.0.1 --port 8766
node participant.js --endpoint http://ORACLE_HOST:8766 --token-file TOKEN_FILE guess river
node participant.js --endpoint http://ORACLE_HOST:8766 --token-file TOKEN_FILE history
node participant.js --endpoint http://ORACLE_HOST:8766 --token-file TOKEN_FILE play
```

Generate a random token of at least 32 characters and save it in a file outside the published repository. Transfer that token file with the client. Use a private network or an authenticated HTTPS connection for traffic between machines. The server supports the baseline HTTP route `/api/runs/RUN_ID/guess` and the compact client's `/guess`, `/round` and `/abandon` routes. It checks authorization and rejects access to other rounds and administrative endpoints. Restart it with a new token for the next assignment.

For the remote client, give the participant the rules in the round's baseline prompt, the endpoint and its client command. Archive the exact instructions and label the interface HTTP. Compare HTTP trials in their own collection. Synchronize clocks for agent-to-oracle durations; otherwise report oracle intervals only. `participant.js` uses Node's built-in fetch and readline. It has no dataset, answer lookup or model dependency. Copying the client into the same account as the oracle does not establish isolation.

## What this measures

This task measures semantic search under limited feedback. Solve rate and PAR2 measure exact success. Checkpoint ranks, threshold steps, stagnation and repeats describe the search trajectory. Human and no-extended-thinking trials are useful comparisons under the same feedback restrictions.

An algorithm with the full embedding matrix has information unavailable to the participants. Such a solver belongs in a separate privileged-information experiment. Its absence is not evidence that a participant failed a comparable baseline. Ten selected tasks and one trial do not establish general intelligence or a reliable subscription recommendation. More words, independent repetitions and multiple embedding spaces are needed to test whether an observed advantage persists.
