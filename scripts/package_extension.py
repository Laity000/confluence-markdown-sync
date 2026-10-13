#!/usr/bin/env python3
"""Make a deterministic Chrome Web Store ZIP with only extension runtime files."""
import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_FILES = (
    'manifest.json', 'background.js', 'editor.html', 'editor.css',
    'editor.js', 'wiki-converter.js', 'storage-converter.js', 'sync-core.js',
    'icon16.png', 'icon48.png', 'icon128.png',
)


def build(output: Path, expected_version: str | None = None):
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest.get('version', '')
    if not re.fullmatch(r'\d+(?:\.\d+){0,3}', version):
        raise ValueError(f'Invalid Chrome extension version: {version!r}')
    if manifest.get('manifest_version') != 3:
        raise ValueError('Only Manifest V3 packages are supported')
    if expected_version and version != expected_version.removeprefix('v'):
        raise ValueError(f'Git version {expected_version} does not equal manifest {version}')
    for relative in RUNTIME_FILES:
        if not (ROOT / relative).is_file():
            raise FileNotFoundError(relative)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in RUNTIME_FILES:
            file = ROOT / relative
            info = ZipInfo(relative, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, file.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    print(f'Created {output} · {len(RUNTIME_FILES)} runtime files · v{version}')
    return version


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT / 'dist' / 'confluence-markdown-sync.zip'))
    parser.add_argument('--version', help='Validate tag/expected version (e.g. v1.4.0)')
    args = parser.parse_args()
    build(Path(args.output), args.version)
