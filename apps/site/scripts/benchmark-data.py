#!/usr/bin/env python3
"""Builds src/data/benchmark.json from downloaded mc-antivpn-bench `results-public` folders.

Every number on /benchmark and in the homepage section comes from here; nothing is typed by hand.

  python3 scripts/benchmark-data.py --bench ../../../mc-antivpn-bench --status preliminary \
    --performance <dir> --detection <dir> --failure <dir> [--failure <dir> ...] \
    --run perf=37529160056 --run detection=37529164268 --run failure=37526896017
"""
import argparse
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'data', 'benchmark.json')

COHORTS = [
    # id, label, kind: "catch" counts blocked (higher is better), "spare" counts refused (lower is better)
    ('commercial_vpn', 'Commercial VPNs', 'catch'),
    ('fresh_vpn', 'Newly added VPN servers', 'catch'),
    ('vpn_v6', 'VPNs over IPv6', 'catch'),
    ('tor', 'Tor exits', 'catch'),
    ('proxy', 'Public proxies', 'catch'),
    ('residential', 'Home connections', 'spare'),
    ('residential_v6', 'Home connections, IPv6', 'spare'),
    ('mobile_cgnat', 'Mobile networks', 'spare'),
]
PHASES = ['cold', 'warm', 'stampede', 'burst']
FAULTS = ['control', 'timeout', 'http_429', 'malformed', 'incomplete']


def product_meta(bench, product_id, candidate_label):
    adapter = json.load(open(os.path.join(bench, 'products', f'{product_id}.json')))
    pin = adapter['pins'].get('velocity') or next(iter(adapter['pins'].values()))
    pins = {}
    for name in ('modrinth-pins.json', 'candidate-pins.json'):
        path = os.path.join(bench, 'products', name)
        if os.path.exists(path):
            pins.update(json.load(open(path)))
    version = pins.get(pin, {}).get('version', '')
    name = adapter['name'].replace(' AntiVPN (Free)', '')
    if product_id == 'connection-guard-candidate':
        return dict(name='Connection Guard', version=candidate_label, us=True)
    if product_id == 'connection-guard':
        return dict(name='Connection Guard', version=version, us=True, previous=True)
    return dict(name=name, version=version.split('+')[0], us=False)


def performance(folder):
    out = {}
    for path in sorted(glob.glob(os.path.join(folder, 'performance', '*-r0-*.json'))):
        d = json.load(open(path))
        entry = dict(start_s=round(d.get('start', {}).get('ready_s', 0), 1), errors=d.get('product_error_lines'))
        for phase in PHASES:
            x = d.get(phase)
            if not x:
                continue
            entry[phase] = dict(decision_p50=x['decision_ms']['p50'], decision_p95=x['decision_ms']['p95'],
                                join_p50=x['join_ms']['p50'], join_p95=x['join_ms']['p95'],
                                checked=x.get('subjects_with_lookup'), subjects=x.get('distinct_subjects'),
                                outcomes=x.get('outcomes', {}))
        out[d['product']] = entry
    return out


def detection(folder):
    d = json.load(open(os.path.join(folder, 'detection', 'enforce.json')))
    final = {}
    for row in d['rows']:
        if row['subject'] not in final or row['attempt'] >= final[row['subject']]['attempt']:
            final[row['subject']] = row
    products = list(d['rows'][0]['products'])
    cohorts = []
    for cid, label, kind in COHORTS:
        rows = [r for r in final.values() if r['cohort'] == cid]
        if rows:
            cohorts.append(dict(id=cid, label=label, kind=kind, n=len(rows),
                                blocked={p: sum(1 for r in rows if r['products'][p]['blocked']) for p in products}))
    return dict(subjects=len(final), products=products, cohorts=cohorts)


def failure(folders):
    out = {}
    for folder in folders:
        for path in sorted(glob.glob(os.path.join(folder, 'failure', '*.json'))):
            d = json.load(open(path))
            if d['fault'] not in FAULTS:
                continue
            during = {k: dict(blocked=v['blocked'], ms=round(v['decision_ms']), lookups=v['lookup_requests'])
                      for k, v in d.get('during', {}).items()}
            out.setdefault(d['product'], {})[d['fault']] = during
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', required=True)
    ap.add_argument('--status', choices=['preliminary', 'published'], required=True)
    ap.add_argument('--candidate-label', default='0.6 build')
    ap.add_argument('--performance', required=True)
    ap.add_argument('--detection', required=True)
    ap.add_argument('--failure', action='append', default=[])
    ap.add_argument('--run', action='append', default=[], help='name=github-run-id')
    ap.add_argument('--rounds', type=int, default=1)
    args = ap.parse_args()
    perf = performance(args.performance)
    det = detection(args.detection)
    manifest = json.load(open(os.path.join(args.performance, 'manifest.json')))
    ids = [p for p in manifest['products']]
    data = dict(
        status=args.status,
        date=manifest['environment']['started'][:10],
        platform=manifest['platforms'][0],
        rounds=args.rounds,
        host=manifest['environment'].get('host'),
        runs=dict(r.split('=', 1) for r in args.run),
        products={p: product_meta(args.bench, p, args.candidate_label) for p in ids},
        performance={p: v for p, v in perf.items() if p in ids or p == 'none'},
        detection=det,
        failure=failure(args.failure),
    )
    with open(OUT, 'w') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')
    print('wrote', os.path.relpath(OUT), 'status', data['status'], 'products', ', '.join(ids))


if __name__ == '__main__':
    main()
