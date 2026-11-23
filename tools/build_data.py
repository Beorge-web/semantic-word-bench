import gzip
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import h5py
import numpy as np
from wordfreq import top_n_list
from download_source import DESTINATION, SOURCE_SHA256, SOURCE_URL

ROOT = Path(__file__).resolve().parents[1]
VOCABULARY_SIZE = 50000


def canonical(word):
    return unicodedata.normalize('NFC', word).casefold().replace('ё', 'е').strip()


def main():
    source = DESTINATION
    with source.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != SOURCE_SHA256:
            raise ValueError('Source hash differs from the pinned Numberbatch file')
    targets = json.loads((ROOT / 'tools/suite_targets.json').read_text(encoding='utf-8'))
    destination = ROOT / 'data'
    destination.mkdir(exist_ok=True)
    manifest = {
        'id': 'semantic-word-bench-v1', 'version': 1, 'max_guesses': 50,
        'embedding': 'ConceptNet Numberbatch 19.08 mini, int8, 300 dimensions',
        'source_url': SOURCE_URL,
        'source_sha256': SOURCE_SHA256, 'frequency_source': 'wordfreq 3.1.1, top_n_list best, first 200000',
        'license': 'CC-BY-SA-4.0', 'languages': {},
    }
    with h5py.File(source) as model:
        labels = [item.decode('utf-8') for item in model['mat/axis1'][:]]
        for language, answers in targets.items():
            pattern = re.compile(r'[а-яё]{2,30}' if language == 'ru' else r'[a-z]{2,30}')
            rows = {}
            for row, label in enumerate(labels):
                if label.startswith(f'/c/{language}/'):
                    word = label.split('/')[3]
                    if pattern.fullmatch(word):
                        rows.setdefault(canonical(word), row)
            if not all(word in rows for word in answers):
                raise ValueError(f'Missing target vectors in {language}')
            frequent = dict.fromkeys(canonical(word) for word in top_n_list(language, 200000) if pattern.fullmatch(word))
            available = [word for word in frequent if word in rows]
            required = set(answers)
            selected = available[:VOCABULARY_SIZE]
            for answer in answers:
                if answer not in selected:
                    index = next(i for i in range(len(selected)-1, -1, -1) if selected[i] not in required)
                    selected[index] = answer
            if len(selected) != VOCABULARY_SIZE or len(set(selected)) != VOCABULARY_SIZE:
                raise ValueError(f'Not enough vocabulary in {language}: {len(available)}')
            words = sorted(selected)
            indices = np.array([rows[word] for word in words])
            order = np.argsort(indices)
            matrix = np.empty((len(words), 300), dtype=np.float64)
            matrix[order] = model['mat/block0_values'][indices[order]].astype(np.float64)
            norms = np.linalg.norm(matrix, axis=1)
            if np.any(norms == 0):
                raise ValueError('Zero vector')
            matrix /= norms[:, None]
            tables = {}
            for number, answer in enumerate(answers, 1):
                target_index = words.index(answer)
                similarity = np.round(matrix @ matrix[target_index], 6)
                similarity[target_index] = 2
                ranked = np.argsort(-similarity, kind='stable')
                ranks = np.empty(len(words), dtype=np.int32)
                ranks[ranked] = np.arange(1, len(words)+1)
                tables[f'{language}-{number:02d}'] = ranks.tolist()
                assert ranks[target_index] == 1
            payload = json.dumps({'words': words, 'ranks': tables}, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            compressed = gzip.compress(payload, mtime=0)
            filename = f'{language}.json.gz'
            (destination / filename).write_bytes(compressed)
            manifest['languages'][language] = {
                'file': filename, 'sha256': hashlib.sha256(compressed).hexdigest(),
                'vocabulary_size': len(words), 'rounds': list(tables),
            }
            print(language, len(words), 'words,', len(tables), 'targets,', len(compressed), 'bytes', flush=True)
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
