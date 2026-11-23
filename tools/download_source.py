import hashlib
from pathlib import Path
import urllib.request

SOURCE_URL = 'https://conceptnet.s3.amazonaws.com/precomputed-data/2016/numberbatch/19.08/mini.h5'
SOURCE_SHA256 = '15cff2f04a8987b2e8dfbcec76faf7275a95104dbd8ea7b4c428053a095513ad'
DESTINATION = Path(__file__).resolve().parents[1] / '.cache' / 'numberbatch-19.08-mini.h5'


def main():
    DESTINATION.parent.mkdir(exist_ok=True)
    if not DESTINATION.exists():
        temporary = DESTINATION.with_suffix('.download')
        with urllib.request.urlopen(SOURCE_URL, timeout=60) as response, temporary.open('wb') as output:
            total = int(response.headers['Content-Length'])
            downloaded = 0
            while block := response.read(1024 * 1024):
                output.write(block)
                downloaded += len(block)
                if downloaded % (16 * 1024 * 1024) == 0:
                    print(f'{downloaded / 1048576:.0f} / {total / 1048576:.0f} MiB', flush=True)
        temporary.replace(DESTINATION)
    with DESTINATION.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError('Source checksum differs from pinned Numberbatch 19.08')
    print('Source SHA256', digest, flush=True)


if __name__ == '__main__':
    main()
