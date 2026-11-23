# Search metrics

These diagnostics describe how an agent uses rank feedback. They do not change the rules, solve rate or PAR2. Rank is ordinal. A difference between ranks is not a semantic distance.

## Trajectory

The raw trajectory contains the rank of every scored guess. The best-rank trajectory is the minimum valid rank observed so far. Invalid guesses have no rank and cannot improve it. Best rank is monotonic by definition, so it cannot by itself establish that an agent used a consistent search strategy.

Best rank at attempts 10, 25 and 50 uses only guesses submitted by that checkpoint. An early exact win remains rank 1 at later checkpoints. A round abandoned before a checkpoint is censored at that checkpoint. Missing values do not become rank 50,000. Aggregate checkpoint medians report the number of scored rounds.

Steps to top-k is the first attempt with rank at most k. The threshold is inclusive. A missing value means the threshold was not reached. Means and medians of threshold steps include only reached rounds and must be shown with the reached count and denominator. They cannot rank models without those counts.

Longest stagnation counts the longest consecutive sequence of submissions without a strict improvement in best rank. Equal ranks, invalid guesses and repeated words count as non-improvements. The first valid guess establishes a best rank. Initial invalid guesses count as stagnation.

Repeat rate is repeated normalized words divided by all submissions. Invalid rate is invalid submissions divided by all submissions. Both are submission-weighted across rounds.

## Time

Observed round duration starts when the first submission reaches the CLI and ends at the last recorded result. It excludes thinking before the first guess. Interaction cycle duration retains its existing definition and excludes each round's first result.

When an audited agent start and completion bracket every submission, time to solve starts at agent start and ends at the winning recorded result. Otherwise it uses the first-submission start. The report labels these bases and never combines them into one mean. Unsolved rounds have no time to solve. Their completion and observed play durations remain separate observations.

## Tokens and cost

Unavailable usage is null, not zero. Provider-reported input, output, cached-input, reasoning and total tokens remain separate fields. Reasoning tokens can be part of output tokens and must not be added twice. Totals include coverage counts for every field.

Measured cost requires an amount, ISO currency and evidence source. Costs in different currencies are not added together. Subscription price divided by a guessed number of tasks is not a measured task cost. The current T3 thread metadata does not expose per-run token usage or cost, so those fields remain unavailable until actual evidence is supplied.

## Experimental boundaries

Each model, provider and reasoning setting is a distinct participant configuration. Provider labels such as high do not represent equal computation across providers. Comparisons of effort should be made within one model and provider, with matching task set, prompt, service tier and interface.

The current runs use fresh agent contexts and command audits. They share a filesystem with the oracle. This is not filesystem isolation. Access restrictions in the prompt and transcript audits are separate from process or machine isolation. Stronger separation requires a participant environment that does not contain or mount the oracle files.
