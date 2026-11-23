# Third-party data

## ConceptNet Numberbatch 19.08

This data contains semantic vectors from ConceptNet Numberbatch, by Luminoso Technologies, Inc. You may redistribute or modify the data under the terms of the CC BY-SA 4.0 license.

- Project: https://github.com/commonsense/conceptnet-numberbatch
- License: https://creativecommons.org/licenses/by-sa/4.0/
- Source: `mini.h5`, version 19.08. URL and SHA256 are recorded in `data/manifest.json`.
- Attribution: Robyn Speer, Joshua Chin, Catherine Havasi and Joanna Lowry-Duda. Robyn Speer, Joshua Chin and Catherine Havasi, "ConceptNet 5.5: An Open Multilingual Graph of General Knowledge", AAAI 2017, pages 4444 to 4451.
- Changes: language and frequency filtering, case and Russian ё normalization, vector normalization, cosine ranking, six-decimal ties, exact-answer precedence, conversion into fixed rank tables.

## wordfreq 3.1.1

- Project: https://github.com/rspeer/wordfreq
- Author: Robyn Speer and contributors.
- Software license: MIT.
- Frequency data license: CC BY-SA 4.0.
- Changes: Russian and English word lists intersected with Numberbatch and filtered to the vocabulary in `data/manifest.json`.

The generated vocabulary and ranking files in `data/` and `datasets/numberbatch-20261124/` are distributed under CC BY-SA 4.0. The original model and wordfreq package are not included in the Git repository. Build-only dependencies retain their respective licenses.

## BGE small English v1.5

- Base model: https://huggingface.co/BAAI/bge-small-en-v1.5
- ONNX conversion: https://huggingface.co/Xenova/bge-small-en-v1.5
- Model license: MIT.
- Frozen revision: `ea104dacec62c0de699686887e3f920caeb4f3e3`.
- Changes: local q8 inference with Transformers.js 3.8.1, CLS pooling, normalized word vectors, cosine ranks with six-decimal ties and exact-answer precedence.

`datasets/bge-small-en-v1/` reuses the English Numberbatch/wordfreq vocabulary above. Its derived vocabulary and rank pack are distributed under CC BY-SA 4.0. Its manifest identifies the model license separately. ONNX weights and generated vector banks are not bundled. Other Word2Vec, GloVe, FastText or modern vector imports retain their source terms and must provide attribution in their own manifests.
