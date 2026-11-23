import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { endpoint: { type: 'string' }, 'token-file': { type: 'string' }, 'request-id': { type: 'string' } } });
const [command, word] = positionals;
if (!['guess', 'history', 'abandon', 'play'].includes(command) || positionals.length !== (command === 'guess' ? 2 : 1)) throw Error('Use guess WORD, history, abandon or play with --endpoint URL --token-file PATH');
const token = readFileSync(values['token-file'], 'utf8').trim();
async function call(path, body) {
  const response = await fetch(new URL(path, values.endpoint), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? `HTTP ${response.status}`);
  console.log(JSON.stringify(result));
  return result;
}
if (command === 'guess') await call('/guess', { word, ...(values['request-id'] ? { request_id: values['request-id'] } : {}) });
else if (command === 'history') await call('/round');
else if (command === 'abandon') await call('/abandon', {});
else {
  const round = await call('/round');
  if (!['solved', 'exhausted', 'abandoned'].includes(round.status)) {
    const input = createInterface({ input: process.stdin, terminal: false });
    for await (const line of input) {
      if (line === ':quit') { input.close(); break; }
      const result = line === ':giveup' ? await call('/abandon', {}) : await call('/guess', { word: line });
      if (['solved', 'exhausted', 'abandoned'].includes(result.status)) { input.close(); break; }
    }
  }
}
