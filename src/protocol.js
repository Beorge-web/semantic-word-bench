import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './dataset.js';

const interfaces = {
  ru: {
    cli: 'Используй команду {CLI_COMMAND} guess {RUN_ID} {ROUND_ID} "СЛОВО". Получай результат каждой попытки перед выбором следующей. Для сдачи: {CLI_COMMAND} abandon {RUN_ID} {ROUND_ID}.',
    browser: 'Работай инструментами браузера. JavaScript страницы разрешён. Внешние HTTP-клиенты не используются.',
    http: 'Отправляй POST /api/runs/{RUN_ID}/guess с JSON {"round_id":"{ROUND_ID}","word":"твоя попытка","request_id":"уникальный идентификатор"}.',
  },
  en: {
    cli: 'Use {CLI_COMMAND} guess {RUN_ID} {ROUND_ID} "WORD". Read the result of every guess before choosing the next one. To give up: {CLI_COMMAND} abandon {RUN_ID} {ROUND_ID}.',
    browser: 'Use browser tools. JavaScript inside the page is allowed. External HTTP clients are outside this track.',
    http: 'Send POST /api/runs/{RUN_ID}/guess with JSON {"round_id":"{ROUND_ID}","word":"your guess","request_id":"unique identifier"}.',
  },
};

export const templates = () => Object.fromEntries(['ru', 'en'].map(language => [language, readFileSync(resolve(root, `prompts/${language}.txt`), 'utf8').replaceAll('\r\n', '\n')]));
export const protocolFingerprint = () => createHash('sha256').update(JSON.stringify({ version: 3, templates: templates(), interfaces })).digest('hex');

export function renderPrompt(run, roundId, { origin = '', cliCommand = `bun "${resolve(root, 'cli.js')}"`, maxGuesses } = {}) {
  const round = run.rounds[roundId];
  if (!round) throw new Error('Unknown round');
  if (!Number.isInteger(maxGuesses)) throw new Error('Prompt requires the attempt limit');
  const values = {
    INTERFACE_RULE: interfaces[round.language][run.metadata.track], RUN_ID: run.id, ROUND_ID: roundId,
    ROUND_ENTRY: run.metadata.track === 'cli' ? 'CLI' : `${origin}/?run=${run.id}&round=${roundId}`, CLI_COMMAND: cliCommand,
    VOCABULARY_SIZE: String(round.vocabulary_size), MAX_GUESSES: String(maxGuesses),
  };
  let text = templates()[round.language].replaceAll('{INTERFACE_RULE}', values.INTERFACE_RULE);
  for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{${key}}`, value);
  return text;
}
