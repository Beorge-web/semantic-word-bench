import argparse
import json
from pathlib import Path

from .dataset import Suite
from .server import make_server


def main():
    parser = argparse.ArgumentParser(prog='python -m wordbench')
    commands = parser.add_subparsers(dest='command', required=True)
    serve = commands.add_parser('serve', help='Start the game and HTTP oracle')
    serve.add_argument('--host', default='127.0.0.1')
    serve.add_argument('--port', type=int, default=8765)
    serve.add_argument('--database', type=Path, default=Path('runs/benchmark.sqlite3'))
    commands.add_parser('check-data', help='Verify checksums, round IDs and rank permutations')
    args = parser.parse_args()
    if args.command == 'check-data':
        print(json.dumps(Suite().public(), ensure_ascii=False, indent=2))
        return
    server = make_server(args.host, args.port, args.database)
    print(f'Semantic Word Bench: http://{args.host}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
