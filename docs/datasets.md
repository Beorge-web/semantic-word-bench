# Frozen datasets and embedding tracks

The original `data/` stays unchanged. A run records its dataset fingerprint and refuses guesses with a different oracle. A new task set uses a new directory and ID. Generation refuses to overwrite an existing directory.

| Directory | Embedding track | Tasks | Published model trials |
| --- | --- | --- | --- |
| `data/` | Numberbatch 19.08 | 10 Russian and 10 English | English pilot |
| `datasets/numberbatch-20261124/` | Numberbatch 19.08 | 10 new Russian and 10 new English | None |
| `datasets/bge-small-en-v1/` | BGE small English v1.5, CLS pooling, q8 | 10 English, same targets as original pilot | None |

All three packs accept 50,000 words per language. Other imports can have a different vocabulary size; the prompt reports the actual size. Equal sizes do not establish equal difficulty. BGE is an experimental semantic space, not a replacement for Numberbatch. No scores from different spaces are pooled.

```sh
bun cli.js --suite datasets/numberbatch-20261124 check-data
bun cli.js --suite datasets/numberbatch-20261124 create --model MODEL --provider PROVIDER --effort EFFORT
bun cli.js --suite datasets/bge-small-en-v1 check-data
```

Use `--suite` with every command for that run. Its generated prompts include the selected suite path. Replay old experiments by keeping their frozen directory, database, result export and protocol version. Identical target words with different embeddings remain different datasets.

## Generate Numberbatch tasks

Download the pinned [Numberbatch 19.08 mini.h5](https://conceptnet.s3.amazonaws.com/precomputed-data/2016/numberbatch/19.08/mini.h5) to `.cache/numberbatch-19.08-mini.h5`. Its expected SHA-256 is recorded in `data/manifest.json`. Then:

```sh
bun install --cwd tools/vector-import
node tools/vector-import/numberbatch.js --source .cache/numberbatch-19.08-mini.h5 --out .cache/vectors/numberbatch-19.08
node tools/generate-suite.js --bank .cache/vectors/numberbatch-19.08 --out datasets/my-new-set --id numberbatch-my-new-set --seed my-seed --rounds 10
```

The importer uses the original v1 vocabularies and the source int8 vectors. The JavaScript ranking calculation reproduces all 1,000,000 ranks in the original 20 tasks. Cosines are rounded to six decimal places. Ties use alphabetical order, and the exact answer is forced to rank 1.

Verify every frozen rank against the vectors with `node tools/verify-ranks.js --bank .cache/vectors/numberbatch-19.08 --suite data`. The same command accepts another matching bank and suite.

Seeded sampling chooses unique words with 4 to 20 letters from the supplied vocabulary. It records the seed and generator version. This is deterministic sampling, not difficulty calibration or a guarantee that every selected word is common. For curated targets, pass `--targets FILE` containing language keys and arrays of target words. Only the listed languages are generated.

## Import Word2Vec, GloVe or precomputed modern vectors

```sh
node tools/import-vectors.js --source GoogleNews-vectors-negative300.bin.gz --format word2vec-binary --language en --out .cache/vectors/google-news --track word2vec-google-news --embedding GoogleNews-negative300 --source-url SOURCE_URL --license SOURCE_LICENSE
node tools/generate-suite.js --bank .cache/vectors/google-news --out datasets/word2vec-v1 --id word2vec-v1 --seed study-one --rounds 10
```

Supported formats are word2vec binary with little-endian float32 values, whitespace-delimited text with an optional count/dimension header, and JSON shaped as `{ "words": ["alpha", "beta"], "vectors": [[1, 0], [0, 1]] }`. Binary and text files may be gzipped. Text imports cover GloVe and FastText `.vec` exports. JSON also accepts vectors computed by a modern embedding provider without making model requests inside this tool.

By default, the importer keeps the first 50,000 valid unique single words in source order. This is not a frequency claim. Use `--limit N` to change the count, `--vocabulary FILE` for an explicit JSON word list and `--sha256 HASH` to verify a pinned source. An explicit vocabulary must be fully present; the tool rejects missing words rather than silently changing the test. The manifest records the source URL, checksum, license, dimensions and selection method. Obtain source files under their own redistribution terms. The repository does not bundle Google News vectors or claim Word2Vec model results.

## Generate modern embeddings locally

[Transformers.js](https://huggingface.co/docs/transformers.js/v3.8.1/api/pipelines) runs the optional embedding generator in Node. Install its dependencies inside its directory, not at the repository root:

```sh
bun install --cwd tools/modern-embeddings
node tools/modern-embeddings/generate.js --model Xenova/bge-small-en-v1.5 --revision ea104dacec62c0de699686887e3f920caeb4f3e3 --pooling cls --dtype q8 --language en --vocabulary .cache/vectors/numberbatch-19.08/en.words.json --vocabulary-source semantic-word-bench-numberbatch-19.08-v1 --vocabulary-license "CC BY-SA 4.0" --out .cache/vectors/bge-small-en-v1.5-en --track bge-small-en-v1.5-cls-q8 --license MIT --cache .cache/huggingface
```

This command downloads the pinned [ONNX model revision](https://huggingface.co/Xenova/bge-small-en-v1.5/tree/ea104dacec62c0de699686887e3f920caeb4f3e3) and computes vectors locally. It makes no paid model API calls. The committed BGE pack was generated from all 50,000 English vocabulary entries using this revision, CLS pooling, normalized embeddings and Transformers.js 3.8.1. Its vocabulary retains the original attribution and CC BY-SA terms. The model is licensed under MIT.

Specify pooling and any text prefix explicitly for another model. The tool applies the same prefix to every candidate and target. E5-style query prefixes, mean pooling, another revision or another dtype define a different track. BGE English does not establish a Russian modern-embedding result. The generator accepts `--language ru` only when paired with a suitable multilingual model and Russian vocabulary.

Pass the resulting bank to `tools/generate-suite.js`, using a new suite ID and output directory. Vector banks and model weights stay in ignored `.cache/`. Commit the compact frozen rank pack and its manifest when publishing a dataset. The manifest includes vector-bank hashes, model revision, source attribution and target selection. Keeping the vector bank allows independent rank recomputation; playing the frozen pack does not need it.
