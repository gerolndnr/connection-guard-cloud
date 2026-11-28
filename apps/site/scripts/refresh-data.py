#!/usr/bin/env python3
"""Refresh the website from published benchmark artifacts and the signed Intel manifest."""

import argparse
import base64
import json
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SCRIPTS = Path(__file__).resolve().parent
DATA = SCRIPTS.parent / 'src' / 'data'
BENCHMARK = 'gerolndnr/mc-antivpn-bench'
SNAPSHOT = 'https://connectionguard.net/site-data.json'
INTEL = 'https://intel.connectionguard.net/manifest.json'


def fetch(url, limit):
    request = Request(url, headers={'User-Agent': 'connectionguard.net site data build', 'Cache-Control': 'no-cache'})
    with urlopen(request, timeout=25) as response:
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError(f'{url} exceeds {limit} bytes')
    return body


def restore_published_data():
    try:
        published = json.loads(fetch(SNAPSHOT, 2_000_000))
    except HTTPError as exc:
        if exc.code != 404:
            raise
        print('No deployed data snapshot yet; starting with the checked-in data')
        return

    required = {'benchmark': ('date', 'detection', 'performance', 'failure'),
                'intel': ('benchmark', 'manifest'), 'stats': ('fetchedAt', 'sources', 'latest')}
    if published.get('schema') != 1 or any(
        not isinstance(published.get(name), dict) or not set(keys) <= published[name].keys()
        for name, keys in required.items()
    ):
        raise ValueError('invalid published website data snapshot')
    for name in required:
        (DATA / f'{name}.json').write_text(json.dumps(published[name], indent=2) + '\n', encoding='utf-8')


def run_script(name, *args):
    subprocess.run([sys.executable, SCRIPTS / name, *args], check=True, timeout=600)


def refresh(name, file, measured_at, update):
    path = DATA / file
    previous = path.read_bytes()
    try:
        update()
        if measured_at(json.loads(path.read_bytes())) < measured_at(json.loads(previous)):
            raise ValueError('the source is older than the deployed measurement')
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        path.write_bytes(previous)
        print(f'::warning::{name}: keeping the last valid website data ({exc})', flush=True)


def fetch_manifest(scratch):
    manifest = scratch / 'manifest.json'
    signature = scratch / 'manifest.sig'
    manifest.write_bytes(fetch(INTEL, 65_536))
    signature.write_bytes(base64.b64decode(fetch(f'{INTEL}.sig', 256).strip(), validate=True))
    subprocess.run(['openssl', 'dgst', '-sha256', '-verify', SCRIPTS / 'intel-signing-key.pub.pem',
                    '-signature', signature, manifest], check=True, timeout=10)
    run_script('intel-data.py', '--manifest', manifest)


def fetch_provider_results(bench, scratch):
    index = json.loads((bench / 'docs' / 'overview' / 'latest.json').read_bytes())
    ids = index['runs']['providers']
    if not ids or any(not re.fullmatch(r'[0-9]+', run) for run in ids):
        raise ValueError('no valid provider runs in the published overview')
    args = []
    for run in sorted(set(ids), key=int, reverse=True):
        folder = scratch / run
        subprocess.run(['gh', 'run', 'download', run, '--repo', BENCHMARK,
                        '--name', 'results-public', '--dir', folder], check=True, timeout=90)
        args.extend(['--run', run, '--summary', folder / 'providers' / 'summary.json'])
    run_script('intel-data.py', *args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bench', required=True, type=Path, help='mc-antivpn-bench checkout with its published overview')
    args = parser.parse_args()
    restore_published_data()
    print('Refreshing data for connectionguard.net', flush=True)
    with TemporaryDirectory() as folder:
        scratch = Path(folder)
        refresh('Plugin benchmark', 'benchmark.json', lambda data: data['date'],
                lambda: run_script('benchmark-data.py', '--bench', args.bench.resolve(), '--status', 'published',
                                   '--rounds', '3', '--from-overview', BENCHMARK))
        refresh('Provider benchmark', 'intel.json', lambda data: data['benchmark']['date'],
                lambda: fetch_provider_results(args.bench, scratch))
        refresh('Intel manifest', 'intel.json', lambda data: data['manifest']['as_of'],
                lambda: fetch_manifest(scratch))


if __name__ == '__main__':
    main()
