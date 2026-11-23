import hashlib
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parents[1] / 'prompts'
INTERFACES = {
    'ru': {
        'browser': 'Этот запуск измеряет работу через браузер. Взаимодействуй со страницей инструментами браузера. JavaScript внутри страницы разрешён. Внешние HTTP-клиенты в этом запуске не используются.',
        'http': 'Этот запуск использует HTTP API. Отправляй попытки в POST /api/runs/{RUN_ID}/guess с JSON {"round_id":"{ROUND_ID}","word":"твоя попытка","request_id":"новый уникальный идентификатор"}. Текущая история доступна в GET /api/runs/{RUN_ID}.',
    },
    'en': {
        'browser': 'This is a browser run. Interact with the page using browser tools. JavaScript inside the page is allowed. External HTTP clients are outside this track.',
        'http': 'This run uses HTTP API. Submit guesses to POST /api/runs/{RUN_ID}/guess with JSON {"round_id":"{ROUND_ID}","word":"your guess","request_id":"a new unique identifier"}. Current history is available at GET /api/runs/{RUN_ID}.',
    },
}


def templates():
    return {language: (DIRECTORY / f'{language}.txt').read_text(encoding='utf-8') for language in ('ru', 'en')}


def fingerprint():
    return hashlib.sha256(('protocol-v1\n'+templates()['ru']+'\n'+templates()['en']+repr(INTERFACES)).encode('utf-8')).hexdigest()


def render(language, track, run_id, round_id, origin):
    text = templates()[language].replace('{INTERFACE_RULE}', INTERFACES[language][track])
    values = {'RUN_ID': run_id, 'ROUND_ID': round_id, 'ROUND_URL': f'{origin}/?run={run_id}&round={round_id}'}
    for key, value in values.items():
        text = text.replace('{'+key+'}', value)
    return text
