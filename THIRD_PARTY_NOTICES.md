# Third-party data

## ConceptNet Numberbatch 19.08

This data contains semantic vectors from ConceptNet Numberbatch, by Luminoso Technologies, Inc. You may redistribute or modify the data under the terms of the CC BY-SA 4.0 license.

- Project: https://github.com/commonsense/conceptnet-numberbatch
- License: https://creativecommons.org/licenses/by-sa/4.0/
- Source: `mini.h5`, version 19.08. URL and SHA256 are recorded in `data/manifest.json`.
- Attribution: Robyn Speer, Joshua Chin, Catherine Havasi and Joanna Lowry-Duda. Robyn Speer, Joshua Chin and Catherine Havasi, "ConceptNet 5.5: An Open Multilingual Graph of General Knowledge", AAAI 2017, pages 4444–4451.
- Changes: language and frequency filtering, case and Russian ё normalization, vector normalization, cosine ranking, six-decimal ties, exact-answer precedence, conversion into fixed rank tables.

## wordfreq 3.1.1

- Project: https://github.com/rspeer/wordfreq
- Author: Robyn Speer and contributors.
- Software license: MIT.
- Frequency data license: CC BY-SA 4.0.
- Changes: Russian and English word lists intersected with Numberbatch and filtered to the vocabulary in `data/manifest.json`.

The generated vocabulary and ranking files in `data/` are distributed under CC BY-SA 4.0. The original model and wordfreq package are not included in the Git repository. Build-only dependencies retain their respective licenses.
