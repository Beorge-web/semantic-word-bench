import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, state TEXT NOT NULL)');
  }

  create(run) {
    this.db.query('INSERT INTO runs VALUES (?, ?)').run(run.id, JSON.stringify(run));
    return run;
  }

  get(id) {
    const row = this.db.query('SELECT state FROM runs WHERE id = ?').get(id);
    if (!row) throw new Error('Unknown run');
    return JSON.parse(row.state);
  }

  update(id, change) {
    return this.db.transaction(() => {
      const run = change(this.get(id));
      this.db.query('UPDATE runs SET state = ? WHERE id = ?').run(JSON.stringify(run), id);
      return run;
    }).immediate();
  }

  close() { this.db.close(); }
}
