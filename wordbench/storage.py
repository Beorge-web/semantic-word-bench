from contextlib import closing
import json
from pathlib import Path
import sqlite3
import threading


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, state TEXT NOT NULL)')

    def create(self, state):
        with self.lock, closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute('INSERT INTO runs VALUES (?, ?)', (state['id'], json.dumps(state, ensure_ascii=False)))
        return state

    def get(self, run_id):
        with closing(sqlite3.connect(self.path)) as connection:
            row = connection.execute('SELECT state FROM runs WHERE id = ?', (run_id,)).fetchone()
        if row is None:
            raise KeyError('Unknown run')
        return json.loads(row[0])

    def update(self, run_id, change):
        with self.lock, closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('SELECT state FROM runs WHERE id = ?', (run_id,)).fetchone()
            if row is None:
                raise KeyError('Unknown run')
            state = change(json.loads(row[0]))
            connection.execute('UPDATE runs SET state = ? WHERE id = ?', (json.dumps(state, ensure_ascii=False), run_id))
        return state
