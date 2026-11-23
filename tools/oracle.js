import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { App } from '../src/app.js';
import { Suite } from '../src/dataset.js';
import { serveRound } from '../src/round-server.js';

const { values } = parseArgs({ options: Object.fromEntries(['database', 'suite', 'run', 'round', 'token-file', 'host', 'port'].map(key => [key, { type: 'string' }])) });
const app = new App({ database: values.database ? resolve(values.database) : undefined, suite: new Suite(values.suite ? resolve(values.suite) : undefined) });
const token = readFileSync(values['token-file'], 'utf8').trim();
const port = Number(values.port ?? 8766);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
const server = serveRound(app, { runId: values.run, roundId: values.round, token, hostname: values.host ?? '127.0.0.1', port });
console.log(JSON.stringify({ url: server.url.toString(), round: values.round, endpoints: ['/round', '/guess', '/abandon'] }));
const stop = () => { server.stop(true); app.close(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
