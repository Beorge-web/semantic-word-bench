from copy import deepcopy
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from wordbench.dataset import ROOT, Suite, normalize
from wordbench.engine import RuleError, apply_guess, summarize
from wordbench.server import make_server

SUITE = Suite()
TARGETS = json.loads((ROOT / 'tools/suite_targets.json').read_text(encoding='utf-8'))


def fresh_round(round_id='en-01'):
    return {'id': round_id, 'language': round_id[:2], 'status': 'pending', 'best_rank': None, 'events': []}


def guess(state, word, key='first', received=1000, result=1002):
    return apply_guess(SUITE, state, word, key, received, result, 2)


class DatasetTests(unittest.TestCase):
    def test_frozen_suite_size_and_unique_answers(self):
        self.assertEqual(len(SUITE.tables), 20)
        for language in ('ru', 'en'):
            self.assertEqual(len(SUITE.words[language]), 50000)
            self.assertEqual(len(TARGETS[language]), 10)
            self.assertEqual(len(set(TARGETS[language])), 10)
            for number, answer in enumerate(TARGETS[language], 1):
                self.assertEqual(SUITE.lookup(f'{language}-{number:02d}', answer), (1, None))

    def test_meaningful_semantic_feedback(self):
        self.assertLess(SUITE.lookup('en-05', 'book')[0], SUITE.lookup('en-05', 'volcano')[0])
        self.assertLess(SUITE.lookup('ru-01', 'море')[0], SUITE.lookup('ru-01', 'договор')[0])

    def test_normalization(self):
        self.assertEqual(normalize('  ЗЕРКАЛО '), 'зеркало')
        self.assertEqual(normalize('ЁЖ'), 'еж')
        self.assertEqual(normalize('LIBRARY'), 'library')

    def test_public_manifest_contains_no_word_tables_or_targets(self):
        text = json.dumps(SUITE.public(), ensure_ascii=False)
        self.assertNotIn('ranks', text)
        for answer in TARGETS['ru']+TARGETS['en']:
            self.assertNotIn(answer, text)

    def test_checksum_corruption_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'manifest.json').write_bytes((ROOT / 'data/manifest.json').read_bytes())
            (path / 'ru.json.gz').write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                Suite(path)


class EngineTests(unittest.TestCase):
    def test_winning_attempt_and_replay_are_idempotent(self):
        original = fresh_round()
        state, event = guess(original, '  LANTERN ')
        self.assertEqual(state['status'], 'solved')
        self.assertEqual(event['rank'], 1)
        self.assertEqual(original['events'], [])
        replay, replay_event = guess(state, 'lantern', received=9000, result=9002)
        self.assertEqual(replay, state)
        self.assertEqual(replay_event, event)
        with self.assertRaises(RuleError):
            guess(state, 'needle', key='second')

    def test_every_submission_consumes_budget(self):
        state, _ = guess(fresh_round(), 'zzzzzzzzzzzzzzzzzzz')
        self.assertEqual(state['events'][0]['error'], 'unknown_word')
        state, event = guess(state, 'zzzzzzzzzzzzzzzzzzz', key='second')
        self.assertTrue(event['duplicate'])
        state, event = guess(state, 'two words', key='third')
        self.assertEqual(event['error'], 'invalid_format')
        self.assertEqual(len(state['events']), 3)
        for index in range(3, 50):
            state, _ = guess(state, 'invalid!', key=str(index))
        self.assertEqual(state['status'], 'exhausted')
        with self.assertRaises(RuleError):
            guess(state, 'lantern', key='last')

    def test_request_id_cannot_change_word(self):
        state, _ = guess(fresh_round(), 'book')
        with self.assertRaisesRegex(RuleError, 'request_id'):
            guess(state, 'library')

    def test_cycles_exclude_first_response_and_other_rounds(self):
        state, event = guess(fresh_round(), 'book')
        self.assertIsNone(event['cycle_ms'])
        state, event = guess(state, 'lantern', key='second', received=6500, result=6502)
        self.assertEqual(event['cycle_ms'], 5500)
        _, event = guess(fresh_round('en-02'), 'volcano', result=12000)
        self.assertIsNone(event['cycle_ms'])

    def test_summary_penalizes_unfinished_and_failed_rounds(self):
        rounds = {item: fresh_round(item) for item in SUITE.tables}
        rounds['en-01'], _ = guess(rounds['en-01'], 'lantern')
        run = {'rounds': rounds, 'interventions': []}
        summary = summarize(run, 50)
        self.assertFalse(summary['complete'])
        self.assertEqual(summary['all']['solved'], 1)
        self.assertEqual(summary['all']['par2'], 95.05)
        self.assertEqual(summary['all']['solved_guesses_mean'], 1)
        self.assertIsNone(summary['all']['cycle_mean_ms'])
        for state in rounds.values():
            if state['status'] == 'pending':
                state['status'] = 'abandoned'
        self.assertTrue(summarize(run, 50)['complete'])


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.database = Path(cls.directory.name) / 'runs.sqlite3'
        cls.server = make_server(port=0, database=cls.database, suite=SUITE)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.directory.cleanup()

    def request(self, path, body=None):
        request = urllib.request.Request(self.origin+path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def create(self):
        status, run = self.request('/api/runs', {'model': 'test-model', 'provider': 'test-agent', 'effort': 'high', 'track': 'browser'})
        self.assertEqual(status, 201)
        return run

    def test_create_guess_replay_resume_and_finish(self):
        run = self.create()
        route = f'/api/runs/{run["id"]}'
        payload = {'round_id': 'en-01', 'word': 'lantern', 'request_id': 'test-1'}
        status, won = self.request(route+'/guess', payload)
        self.assertEqual(status, 200)
        self.assertEqual(won['rounds']['en-01']['status'], 'solved')
        self.assertEqual(won['summary']['all']['solved'], 1)
        self.assertEqual(self.request(route+'/guess', payload)[1], won)
        payload['round_id'] = 'en-02'
        self.assertEqual(self.request(route+'/guess', payload)[0], 409)
        resumed = self.request(route)[1]
        self.assertEqual(resumed, won)
        self.assertEqual(self.request(route+'/intervention', {'note': 'operator hint'})[1]['summary']['interventions'], 1)
        ended = self.request(route+'/finish', {})[1]
        self.assertTrue(ended['summary']['complete'])
        self.assertEqual(ended['summary']['all']['par2'], 95.05)

    def test_all_twenty_rounds_solve_with_their_own_answers(self):
        run = self.create()
        route = f'/api/runs/{run["id"]}'
        for language, answers in TARGETS.items():
            for index, answer in enumerate(answers, 1):
                status, run = self.request(route+'/guess', {'round_id': f'{language}-{index:02d}', 'word': answer})
                self.assertEqual(status, 200)
        self.assertTrue(run['summary']['complete'])
        self.assertEqual(run['summary']['all']['par2'], 1)
        self.assertEqual(run['summary']['all']['solved'], 20)
        self.assertEqual(run['summary']['all']['cycle_count'], 0)

    def test_prompt_and_metadata_are_reproducible(self):
        first, second = self.create(), self.create()
        self.assertEqual(first['suite_fingerprint'], second['suite_fingerprint'])
        self.assertEqual(first['protocol_fingerprint'], second['protocol_fingerprint'])
        status, result = self.request(f'/api/runs/{first["id"]}/prompt/ru-01')
        self.assertEqual(status, 200)
        self.assertIn(f'run={first["id"]}&round=ru-01', result['prompt'])
        self.assertNotIn('{ROUND', result['prompt'])
        self.assertNotIn('{INTERFACE', result['prompt'])
        self.assertIn('через браузер', result['prompt'])

    def test_private_data_is_not_a_static_route(self):
        for path in ('/data/ru.json.gz', '/tools/suite_targets.json', '/.cache/numberbatch-19.08-mini.h5', '/../../data/manifest.json'):
            self.assertEqual(self.request(path)[0], 404)

    def test_validation(self):
        self.assertEqual(self.request('/api/runs', {})[0], 400)
        run = self.create()
        path = f'/api/runs/{run["id"]}/guess'
        self.assertEqual(self.request(path, {'round_id': 'ru-99', 'word': 'book'})[0], 400)
        self.assertEqual(self.request(path, {'round_id': 'en-01', 'word': ['book', 'needle']})[0], 400)


if __name__ == '__main__':
    unittest.main()
