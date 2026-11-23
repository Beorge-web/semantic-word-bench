from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
import uuid

from .dataset import Suite
from .engine import RuleError, apply_guess, summarize
from . import protocol
from .storage import Store

STATIC = Path(__file__).resolve().parents[1] / 'web'


def make_server(host='127.0.0.1', port=8765, database=Path('runs/benchmark.sqlite3'), suite=None):
    suite = suite or Suite()
    store = Store(database)

    def present(run):
        return {**run, 'summary': summarize(run, suite.limit)}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format_string, *args):
            pass

        def send(self, body, status=200, content_type='application/json; charset=utf-8'):
            raw = json.dumps(body, ensure_ascii=False).encode('utf-8') if content_type.startswith('application/json') else body
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path in ('/', '/app.js', '/style.css'):
                filename, content_type = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8')}[path]
                self.send((STATIC / filename).read_bytes(), content_type=content_type)
                return
            if path == '/api/suite':
                self.send({**suite.public(), 'protocol_fingerprint': protocol.fingerprint()})
                return
            if path == '/api/prompts':
                self.send(protocol.templates())
                return
            prompt = re.fullmatch(r'/api/runs/([a-f0-9]{32})/prompt/((?:ru|en)-\d{2})', path)
            if prompt:
                try:
                    run = store.get(prompt[1])
                    row = run['rounds'][prompt[2]]
                    origin = 'http://'+self.headers.get('Host', f'{host}:{self.server.server_port}')
                    self.send({'prompt': protocol.render(row['language'], run['metadata']['track'], run['id'], row['id'], origin)})
                except KeyError:
                    self.send({'error': 'Unknown run or round'}, 404)
                return
            match = re.fullmatch(r'/api/runs/([a-f0-9]{32})', path)
            if match:
                try:
                    self.send(present(store.get(match[1])))
                except KeyError:
                    self.send({'error': 'Unknown run'}, 404)
                return
            self.send({'error': 'Not found'}, 404)

        def do_POST(self):
            started = time.perf_counter_ns()
            received_ms = time.time_ns()/1e6
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 16384:
                    raise ValueError('JSON body must be between 1 and 16384 bytes')
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError('Expected a JSON object')
                path = urlsplit(self.path).path
                if path == '/api/runs':
                    metadata = {}
                    for field in ('model', 'provider', 'effort', 'track'):
                        value = body.get(field)
                        if not isinstance(value, str) or not 1 <= len(value.strip()) <= 120:
                            raise ValueError(f'Missing or invalid {field}')
                        metadata[field] = value.strip()
                    if metadata['track'] not in ('browser', 'http'):
                        raise ValueError('track must be browser or http')
                    repetition = body.get('repetition', 1)
                    if type(repetition) is not int or not 1 <= repetition <= 100:
                        raise ValueError('repetition must be an integer between 1 and 100')
                    run = store.create({
                        'id': uuid.uuid4().hex, 'created_at': datetime.now(timezone.utc).isoformat(),
                        'metadata': {**metadata, 'repetition': repetition},
                        'suite_id': suite.manifest['id'], 'suite_fingerprint': suite.fingerprint,
                        'protocol_fingerprint': protocol.fingerprint(), 'interventions': [],
                        'rounds': {row['id']: {**row, 'status': 'pending', 'best_rank': None, 'events': []} for row in suite.public()['rounds']},
                    })
                    self.send(present(run), 201)
                    return
                match = re.fullmatch(r'/api/runs/([a-f0-9]{32})/(guess|abandon|finish|intervention)', path)
                if not match:
                    self.send({'error': 'Not found'}, 404)
                    return
                run_id, action = match.groups()
                round_id = body.get('round_id')
                if action in ('guess', 'abandon') and round_id not in suite.tables:
                    raise ValueError('Unknown round_id')
                request_id = body.get('request_id', uuid.uuid4().hex)
                if not isinstance(request_id, str) or not 1 <= len(request_id) <= 100:
                    raise ValueError('Invalid request_id')
                if action == 'guess' and (not isinstance(body.get('word'), str) or len(body['word']) > 200):
                    raise ValueError('word must be a string of at most 200 characters')
                if action == 'intervention' and (not isinstance(body.get('note'), str) or not 1 <= len(body['note']) <= 1000):
                    raise ValueError('An intervention needs a note')

                def change(run):
                    if run['suite_fingerprint'] != suite.fingerprint or run['protocol_fingerprint'] != protocol.fingerprint():
                        raise RuleError('Dataset or protocol changed; create a new run')
                    if action == 'guess':
                        for row in run['rounds'].values():
                            if row['id'] != round_id and any(event['request_id'] == request_id for event in row['events']):
                                raise RuleError('request_id already used in another round')
                        run['rounds'][round_id], _ = apply_guess(
                            suite, run['rounds'][round_id], body['word'], request_id,
                            received_ms, time.time_ns()/1e6, (time.perf_counter_ns()-started)/1e6,
                        )
                    elif action == 'abandon':
                        row = run['rounds'][round_id]
                        if row['status'] in ('pending', 'active'):
                            row['status'] = 'abandoned'
                    elif action == 'finish':
                        for row in run['rounds'].values():
                            if row['status'] in ('pending', 'active'):
                                row['status'] = 'abandoned'
                    else:
                        run['interventions'].append({'at': datetime.now(timezone.utc).isoformat(), 'note': body['note']})
                    return run

                self.send(present(store.update(run_id, change)))
            except KeyError:
                self.send({'error': 'Unknown run'}, 404)
            except RuleError as error:
                self.send({'error': str(error)}, 409)
            except (ValueError, TypeError) as error:
                self.send({'error': str(error)}, 400)

    return ThreadingHTTPServer((host, port), Handler)
