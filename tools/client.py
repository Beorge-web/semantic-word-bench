import argparse
import json
from pathlib import Path
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description='HTTP client for Semantic Word Bench')
    parser.add_argument('--server', default='http://127.0.0.1:8765')
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('create')
    for field in ('model', 'provider', 'effort'):
        create.add_argument('--'+field, required=True)
    create.add_argument('--track', choices=('browser', 'http'), default='http')
    create.add_argument('--repetition', type=int, default=1)
    for name in ('state', 'export', 'finish', 'prompt', 'guess', 'abandon', 'intervention'):
        command = commands.add_parser(name)
        command.add_argument('run_id')
        if name in ('prompt', 'guess', 'abandon'):
            command.add_argument('round_id')
        if name == 'guess':
            command.add_argument('word')
            command.add_argument('--request-id', default=None)
        if name == 'intervention':
            command.add_argument('note')
        if name == 'export':
            command.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    body = None
    path = '/api/runs'
    if args.command == 'create':
        body = {field: getattr(args, field) for field in ('model', 'provider', 'effort', 'track', 'repetition')}
    else:
        path += '/'+args.run_id
        if args.command == 'prompt':
            path += '/prompt/'+args.round_id
        elif args.command in ('guess', 'abandon', 'finish', 'intervention'):
            path += '/'+args.command
            body = {}
            if args.command in ('guess', 'abandon'):
                body['round_id'] = args.round_id
            if args.command == 'guess':
                body.update(word=args.word, request_id=args.request_id or uuid.uuid4().hex)
            if args.command == 'intervention':
                body['note'] = args.note
    request = urllib.request.Request(args.server.rstrip('/')+path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        parser.exit(1, error.read().decode('utf-8')+'\n')
    if args.command == 'export':
        args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        print(args.out.resolve())
    elif args.command == 'prompt':
        print(result['prompt'])
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
