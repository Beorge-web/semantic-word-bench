# Semantic Word Bench

A CLI benchmark for semantic search with feedback. The original suite contains 10 hidden Russian words and 10 hidden English words, with a fixed vocabulary of 50,000 accepted words per language. Submit one word and receive its rank. Rank 1 is the exact answer. Additional frozen task sets and embedding tracks are available separately.

Written in JavaScript and run with Bun. SQLite is built into Bun. Scoring uses frozen rank tables, so it requires no extra packages, GPU, or model API keys. Tested with Bun 1.4.2.

## Results

English baseline, November 2026. Each completed participant attempted the same 10 English words once, with a limit of 50 submissions per round. Sol and Astra used Codex with high reasoning effort and the default service tier. Neon used Antigravity GoogleMain with low or medium thought level. Each round used a fresh agent context. The prompts explained the rules without suggesting a search strategy. There were no human interventions. Participants shared a filesystem and their commands were audited.

| Model | Solved | PAR2, attempts | Mean interaction cycle | Median interaction cycle |
| --- | ---: | ---: | ---: | ---: |
| GPT-6.1 Sol high | 3/10 | 78.1 | 4.57 s | 4.38 s |
| GPT-6.2 Sol high | 7/10 | 50.9 | 2.81 s | 2.57 s |
| Gemini 4 Neon low | 4/10 | 73.6 | 10.41 s | 7.43 s |
| Gemini 4 Neon medium | 5/10 | 64.4 | 12.27 s | 10.52 s |
| GPT-6.2 Astra high | 5/10 | 64.8 | 3.29 s | 2.78 s |

PAR2 assigns 100 attempts to an unsolved round, then averages across all rounds. Lower is better. Timing is a separate measurement and does not affect PAR2. Interaction cycles are intervals between consecutive CLI results within a round, excluding its first result. They include model generation, agent work, and CLI startup. They are not provider TTFT.

Providers differ, and the trials ran at different times. Timing measures the complete model and agent system under those conditions. Antigravity did not report `executedModel`; the Neon audit verifies the configured `gemini-4-neon` model and `thought_level` setting.

These results cover only the English subset. Russian rounds were not run and are excluded from the reported metrics. This is one trial on 10 selected words, not a general ranking of model intelligence.

Hit@k is a secondary proximity measure: the number of rounds where a guess reached rank k or better within the attempt budget. Counts include exact wins. Reaching a nearby word does not count as solving the round and does not change PAR2.

| Model | Exact | Hit@2 | Hit@10 | Hit@100 | Hit@1000 |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-6.1 Sol high | 3/10 | 3/10 | 3/10 | 3/10 | 7/10 |
| GPT-6.2 Sol high | 7/10 | 7/10 | 7/10 | 8/10 | 10/10 |
| Gemini 4 Neon low | 4/10 | 4/10 | 4/10 | 4/10 | 6/10 |
| Gemini 4 Neon medium | 5/10 | 5/10 | 5/10 | 6/10 | 8/10 |
| GPT-6.2 Astra high | 5/10 | 5/10 | 5/10 | 6/10 | 10/10 |

Hit@2 and Hit@10 add no near misses in these completed trials. Hit@100 includes one additional unsolved round for Sol 6.2, Neon medium and Astra 6.2. The dashboard shows these thresholds separately from exact wins and compares attempts for each word.

[Astra results, raw events and audit](results/2026-11-24-astra-high-en/README.md) are separate source records and join the same Numberbatch v1 collection. The Astra 6 trial is still in progress and is excluded until all 10 English rounds finish.

[Neon results and four-model comparison](results/2026-11-23-neon-en/README.md) · [CSV](results/2026-11-23-neon-en/rounds.csv) · [Raw comparison](results/2026-11-23-neon-en/comparison.json) · [Neon agent audit](results/2026-11-23-neon-en/audit.json)

[Earlier Sol report and methodology](results/2026-11-23-sol-high-en/README.md)

## Results dashboard

A static results viewer in `site/` reads the collections declared in `results/catalog.json` and their checked-in audit records. Each collection keeps its own dataset, embedding track, language scope, prompt mode and interface. The dashboard includes exact wins, PAR2, top-k proximity, per-word attempts, interaction cycle distributions, checkpoint ranks, threshold steps, stagnation, repeats, raw and best-rank trajectories, solve durations and within-model effort comparisons. Tokens and costs appear only with measured coverage. The optional local game server in `web/` remains separate.

Build and preview locally with Node or Bun:

```sh
node scripts/build-site.js
node scripts/dev-site.js
```

Or via package scripts:

```sh
bun run build:site
bun run preview:site
```

`build:site` refreshes the checked-in `site/data/` catalog and collection JSON files from canonical results and copies the complete site to `dist/` for local preview. `dist/` is ignored by Git. `preview:site` rebuilds `dist/` and serves it at http://127.0.0.1:4173. Set `PORT` to change the port.

After updating benchmark results, run the build and commit `site/data/`. CI runs `bun scripts/build-site.js --check` and rejects missing or stale published data.

### Deploy on Vercel

Repository root includes `vercel.json` configured with:

- Framework preset: Other (`"framework": null`)
- Install command: skipped (`"installCommand": ""`), because the static site has no external dependencies
- Build command: skipped (`"buildCommand": ""`)
- Output directory: `site`

To deploy from GitHub:

1. Import this repository in Vercel with the repository root as the Root Directory.
2. Keep the build settings from `vercel.json` (no environment variables or secrets are required).
3. Deploy to publish the static results viewer.

[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBeorge-web%2Fsemantic-word-bench)

Vercel publishes the checked-in HTML, CSS, JavaScript and chart data directly. It does not run Node.js, Bun or npm commands. Empty install and build commands [skip those steps](https://vercel.com/docs/builds/configure-a-build#skip-build-step). Node.js or Bun is only needed locally to refresh the chart data.

## Quick start

Requires Bun 1.2.3 or newer.

```sh
bun cli.js create --model gpt-6.2-sol --provider Codex --effort high
```

This creates a run with `track: "cli"` and returns its `run_id`. The model and provider fields label the run. Launch the model separately and give it the generated round prompt.

Replace `RUN_ID` with the returned identifier:

```sh
bun cli.js prompt RUN_ID en-01
bun cli.js guess RUN_ID en-01 "word"
```

Copy the prompt into a fresh model chat. It includes the guess command with absolute paths to the CLI and database, so the chat's working directory does not change which database it uses.

Each submission returns one compact JSON line:

```json
{"round":"en-01","attempt":1,"word":"word","rank":12345,"status":"active","remaining":49}
```

The example rank is illustrative. History and aggregate metrics are not repeated with every response. The `error` and `duplicate` fields appear when applicable. Command usage errors return JSON on stderr and a nonzero exit code. The CLI runs without a browser or HTTP server.

## Persistent process

```sh
bun cli.js play RUN_ID en-01
```

`play` loads the data once and reads words from stdin. After the initial status, send one word per line and read its result before the next submission. A win or an exhausted budget ends the process. `:quit` pauses the game; `:giveup` abandons the round. End of input preserves progress. An empty line consumes an attempt.

Use `play` with agents that can write to a persistent process. Use `guess` when each tool call starts a separate process. Both models must use the same interaction method for timing comparisons. Generated prompts use `guess` by default.

## History and exports

```sh
bun cli.js history RUN_ID en-01
bun cli.js summary RUN_ID
bun cli.js export RUN_ID --out result.json
bun cli.js abandon RUN_ID en-01
bun cli.js finish RUN_ID
bun cli.js intervention RUN_ID --note "Operator provided a hint"
```

`history` returns only the assigned round. `summary` returns metrics without the guess history. `export` saves the full JSON record. `finish` marks unfinished rounds as failed.

The database is stored at `runs/benchmark.sqlite3` inside the project. Pass `--database PATH` to any command to use another database. Generated prompts include that path. The `runs/` directory is excluded from Git.

Use `--request-id ID` to retry a submission after a process or transport failure. Repeating the same ID and word does not consume another attempt. Without this flag, each `guess` invocation is a new submission.

## Experiment protocol

For effort matrices, independent repetitions, human baselines, exports and a separate oracle machine, see [Running experiments](docs/experiments.md). `experiments/english-pilot.json` describes the published participant settings. `experiments/effort-matrix.json` is a configurable plan for future trials, not a claim that those trials ran. Each combination of model, provider, effort and service tier remains a separate participant. Provider effort names are not standardized compute units. A None baseline requires actual provider support; Low is never renamed None.

1. Create a separate run for each model. A run contains all 20 rounds, with the same answers for every participant.
2. Start each round in a fresh chat. Give the model only that round's prompt, without answers or other rounds' histories.
3. Allow 50 submissions per round. Unknown words, invalid formats, and repeated guesses also consume attempts.
4. Read the result after each guess. Submitting a prepared batch of words violates the protocol.
5. Provide no hints. Record human assistance and setting changes as interventions.
6. Create a new run with `--repetition 2` for an independent repeat. Keep the model, agent, reasoning effort, and CLI interaction method fixed.
7. Compare completed runs with matching `suite_fingerprint` and `protocol_fingerprint` values.

The prompts in `prompts/` explain the interface, ranks, and attempt budget. The model chooses its own strategy. This is the `baseline` mode, recorded in `metadata.prompt_mode`. Protocol version 3 uses these rules. Older results remain readable, but a run cannot continue after its protocol changes.

For a language-only experiment, use the relevant `by_language.en` or `by_language.ru` metrics and state the scope. Pending rounds in the other language must not count as failures in that subset.

## Scoring and timing

Metrics are available for Russian, English, and the complete suite. The primary measures are solve rate and PAR2 in attempts. PAR2 assigns 100 attempts to an unsolved round and averages over all tasks. Unfinished rounds receive the same penalty in provisional summaries.

Mean and median attempts among solved rounds are reported alongside solve rate. Unknown words, duplicates, and interventions have separate counters.

[Search metric definitions](docs/search-metrics.md) cover best rank at attempts 10, 25 and 50, steps to top 100 and top 10, longest stagnation, repeat rate, full-round duration and time to solve. The dashboard exposes raw guess ranks alongside best-so-far curves. It preserves missing ranks and distinguishes observed play time from durations supported by agent timestamps. Token usage and task cost remain unavailable when the provider exposes no telemetry.

Time does not affect the quality score. `cycle_ms` measures the interval between consecutive results within a round, including model reasoning and agent work. The first result is excluded. With `guess`, the cycle includes starting the next process and loading its data. With `play`, the process stays open. `service_ms` measures application work up to preparing the state change, excluding transaction commit and response output. Neither measure is provider TTFT.

## Data and semantic similarity

The oracle uses [ConceptNet Numberbatch 19.08](https://github.com/commonsense/conceptnet-numberbatch), the `mini.h5` file with 300-dimensional int8 vectors. Each vocabulary contains 50,000 frequent single words from its intersection with [wordfreq 3.1.1](https://github.com/rspeer/wordfreq). Words have 2 to 30 letters. All target words are included.

Input is case-insensitive and normalized to Unicode NFC. Russian `ё` is mapped to `е`. If both spellings occur in the source, the first entry is used. There is no lemmatization or vector generation for unknown words.

```text
similarity(w, target) = dot(v_w, v_target) / (norm(v_w) * norm(v_target))
```

Words are ranked by descending cosine similarity. Values are rounded to six decimal places; ties use alphabetical order. The exact answer always receives rank 1. A rank is not a distance, and differences between ranks do not measure the size of a semantic difference.

The frozen tables in `data/*.json.gz` were preserved during the JavaScript migration. Their checksums are recorded in `data/manifest.json`. The v1 dataset fingerprint is:

```text
c497f4347aa6cb3515e939da2d6b0b89dbd863a05508db4e63f5b061a125de51
```

Manifest line endings are normalized to CRLF before hashing. This preserves the original v1 identifier across Windows and Linux.

The original generator is preserved in [commit 1756c81](https://github.com/Beorge-web/semantic-word-bench/tree/1756c81476faffd91851a36e3121fdbdea4b27ef/tools). The fixed suite requires no rebuild. `tools/suite_targets.json` is operator-only material.

[Datasets and embedding tracks](docs/datasets.md) documents the Node generators, source checksums, deterministic target sampling, Word2Vec binary and GloVe/text imports, precomputed JSON vectors and local BGE/E5-style embedding generation. Optional model dependencies stay in their own tools directories. Playing any frozen dataset requires no model weights or downloads.

Two additional packs are committed. `datasets/numberbatch-20261124/` contains 10 new Russian and 10 new English targets. `datasets/bge-small-en-v1/` contains the original 10 English targets in a pinned BGE semantic space, with the same 50,000-word vocabulary. Neither pack has completed model trials. Use `--suite DIRECTORY` to select one. Different frozen datasets have separate fingerprints and leaderboard collections.

## Limitations

This is a pilot benchmark of semantic search with feedback. It does not measure general intelligence or programming ability. The 20 tasks have not been calibrated against a participant population.

The vocabulary is limited, so an unknown word does not establish a reasoning error. Equal vocabulary sizes do not imply equal language difficulty. Word vectors mix senses of ambiguous words and can place antonyms close together.

Participants must execute the CLI as a tool, without reading the project or database or inspecting other rounds. The operator is responsible for enforcing these rules. Strict isolation requires separating the participant's filesystem from the oracle data. A private repository alone does not provide that separation.

The mechanics resemble [guess-word.com](https://guess-word.com/), but matching its ranks is not claimed. The original site's model and server formula have not been confirmed. [Semantle](https://semantle.com/faq/) uses GoogleNews word2vec, and its scores are not mixed with this suite.

## Checks and optional web interface

```sh
bun cli.js check-data
bun test
bun cli.js serve
```

Tests cover the dataset fingerprint, all answers, budgets, penalties, SQLite persistence, concurrent retries, real CLI processes, Unicode, different working directories, and exports. After `serve`, the optional web interface is available at http://127.0.0.1:8765. It uses the same JavaScript engine. Browser and HTTP runs have separate `track` values.

## License

Code is licensed under MIT. Derived data in `data/` and the committed `datasets/` packs is licensed under CC BY-SA 4.0. Embedding model licenses are identified separately in their manifests. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for sources and attribution.
