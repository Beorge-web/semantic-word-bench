import gzip
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]


def normalize(word):
    return unicodedata.normalize('NFC', word).casefold().replace('ё', 'е').strip()


class Suite:
    def __init__(self, directory=ROOT / 'data'):
        manifest_bytes = (directory / 'manifest.json').read_bytes()
        self.manifest = json.loads(manifest_bytes)
        self.limit = self.manifest['max_guesses']
        self.tables = {}
        self.words = {}
        fingerprint = hashlib.sha256(manifest_bytes)
        for language, info in self.manifest['languages'].items():
            compressed = (directory / info['file']).read_bytes()
            if hashlib.sha256(compressed).hexdigest() != info['sha256']:
                raise ValueError(f'Dataset checksum mismatch: {language}')
            fingerprint.update(compressed)
            payload = json.loads(gzip.decompress(compressed))
            words = payload['words']
            if len(words) != info['vocabulary_size'] or len(set(words)) != len(words):
                raise ValueError('Invalid vocabulary')
            self.words[language] = {word: index for index, word in enumerate(words)}
            if list(payload['ranks']) != info['rounds']:
                raise ValueError('Round IDs differ from manifest')
            for round_id, ranks in payload['ranks'].items():
                if sorted(ranks) != list(range(1, len(words)+1)):
                    raise ValueError(f'Invalid rank permutation: {round_id}')
                self.tables[round_id] = {'language': language, 'ranks': ranks}
        self.fingerprint = fingerprint.hexdigest()

    def public(self):
        return {
            'id': self.manifest['id'], 'fingerprint': self.fingerprint,
            'max_guesses': self.limit, 'embedding': self.manifest['embedding'],
            'rounds': [
                {'id': round_id, 'language': table['language'], 'vocabulary_size': len(table['ranks'])}
                for round_id, table in self.tables.items()
            ],
        }

    def lookup(self, round_id, word):
        table = self.tables[round_id]
        pattern = r'[а-яе]{2,30}' if table['language'] == 'ru' else r'[a-z]{2,30}'
        if not re.fullmatch(pattern, word):
            return None, 'invalid_format'
        index = self.words[table['language']].get(word)
        return (table['ranks'][index], None) if index is not None else (None, 'unknown_word')
