#!/usr/bin/env python3
"""Builds src/data/benchmark.json from downloaded mc-antivpn-bench `results-public` folders.

Every number on /benchmark and in the homepage section comes from here; nothing is typed by hand.

  python3 scripts/benchmark-data.py --bench ../../../mc-antivpn-bench --status published --rounds 3 \
    --from-latest gerolndnr/mc-antivpn-bench --current connection-guard-061 --previous connection-guard-candidate \
    --candidate-label "0.6.1 RC"

  or, from explicit folders:
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


def product_meta(bench, product_id, candidate_label, current='connection-guard-candidate', previous='connection-guard'):
    adapter = json.load(open(os.path.join(bench, 'products', f'{product_id}.json')))
    pin = adapter['pins'].get('velocity') or next(iter(adapter['pins'].values()))
    pins = {}
    for name in ('modrinth-pins.json', 'candidate-pins.json', 'private-pins.json'):
        path = os.path.join(bench, 'products', name)
        if os.path.exists(path):
            pins.update(json.load(open(path)))
    version = pins.get(pin, {}).get('version', '')
    name = adapter['name'].replace(' AntiVPN (Free)', '')
    late = bool(adapter.get('decides_after_join'))
    if product_id == current:
        return dict(name='Connection Guard', version=candidate_label, us=True, after_join=late)
    if product_id == previous:
        return dict(name='Connection Guard', version=version.replace('-SNAPSHOT', ''), us=True, previous=True, after_join=late)
    return dict(name=name, version=version.split('+')[0], us=False, after_join=late)


def performance(folders):
    """Per product and phase, the median across rounds (r0, r1, r2...) of each value. `folders`: one folder, or several
    holding disjoint products (bench.latest's per-product selection)."""
    import statistics
    rounds = {}
    for folder in ([folders] if isinstance(folders, str) else folders):
        for path in sorted(glob.glob(os.path.join(folder, 'performance', '*-r[0-9]-*.json'))):
            d = json.load(open(path))
            if d.get('platform', 'velocity') == 'velocity':
                rounds.setdefault(d['product'], []).append(d)
    med = lambda values: statistics.median(values) if values else None
    out = {}
    for product, ds in rounds.items():
        entry = dict(rounds=len(ds), start_s=round(med([d.get('start', {}).get('ready_s', 0) for d in ds]), 1),
                     errors=med([d['product_error_lines'] for d in ds if d.get('product_error_lines') is not None]))
        for phase in PHASES:
            xs = [d[phase] for d in ds if phase in d]
            if not xs:
                continue
            outcomes = {}
            for k in {k for x in xs for k in x.get('outcomes', {})}:
                outcomes[k] = round(med([x.get('outcomes', {}).get(k, 0) for x in xs]))
            entry[phase] = dict(decision_p50=round(med([x['decision_ms']['p50'] for x in xs]), 1),
                                decision_p95=round(med([x['decision_ms']['p95'] for x in xs]), 1),
                                join_p50=round(med([x['join_ms']['p50'] for x in xs]), 1),
                                join_p95=round(med([x['join_ms']['p95'] for x in xs]), 1),
                                # Players checked: looked up, or refused from the plugin's own list (mc-antivpn-bench from
                                # 13 Oct 2026). Earlier runs: every refusal added to the lookups (exact for local-list refusals).
                                checked=round(med([x['subjects_checked'] if 'subjects_checked' in x else min(
                                    x.get('distinct_subjects') or 0, (x.get('subjects_with_lookup') or 0)
                                    + sum((x.get('outcomes') or {}).get(k, 0) for k in ('DENY_LOGIN', 'DENY_PLAY'))) for x in xs])),
                                subjects=round(med([x.get('distinct_subjects') or 0 for x in xs])),
                                outcomes=outcomes)
        out[product] = entry
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


def from_latest(args):
    """Every product's newest complete result per family, as the mc-antivpn-bench README overview shows it."""
    import sys
    import tempfile
    sys.path.insert(0, os.path.join(args.bench, 'harness'))
    from bench import latest, overview
    base = tempfile.mkdtemp()
    chosen, providers, profile = latest.select(args.from_latest, base, 60)
    dirs = latest.merge(chosen, providers, profile, base)
    used = latest.sources(chosen, providers)
    det = overview.detection(dirs['detection'])
    keep = [p for p in overview.newest_only(sorted(det['products'], key=lambda p: overview.PRODUCT_ORDER.index(p)
                                                   if p in overview.PRODUCT_ORDER else 99))]
    ids = keep + ([args.previous] if args.previous and args.previous not in keep else [])
    cohorts = [dict(id=cid, label=label, kind=kind, n=det['cohorts'][cid]['n'],
                    blocked={p: det['cohorts'][cid]['blocked'].get(p, 0) for p in keep})
               for cid, label, kind in COHORTS if cid in det['cohorts']]
    perf = performance(dirs['performance'])
    manifests = overview.manifests(sorted({d for v in dirs.values() for d in v}))
    newest = max((m.get('environment', {}).get('started', '') for m in manifests), default='')
    run_of = lambda family, pid: (used.get(family, {}).get(pid) or [None])[0]
    names = {p: product_meta(args.bench, p, args.candidate_label, args.current, args.previous) for p in ids}
    label = lambda p: f"{names[p]['name']} {names[p]['version']}"
    others = lambda family: sorted({r for p, rs in used.get(family, {}).items() if p in keep and p != args.current for r in rs})
    notes = {
        'detection': (f"run {run_of('detection', args.current)} for {label(args.current)} and runs {', '.join(others('detection'))} "
                      f"for the other plugins, keyless"),
        'performance': f"run {run_of('performance', args.current)} for {label(args.current)} and run {', '.join(others('performance'))} for the others",
        'failure': f"run {run_of('failure', args.current)} for {label(args.current)} and runs {', '.join(others('failure'))} for the others",
    }
    # --note section=text replaces a generated note (e.g. when a column comes from an earlier build of the same code).
    notes.update(dict(n.split('=', 1) for n in args.note))
    unnormalized = sorted(p for p in det.get('unnormalized', set()) if p in keep and p != args.current)
    data = dict(
        status=args.status,
        date=newest[:10],
        date_label=overview.measured_dates(manifests),
        platform='velocity',
        rounds=args.rounds,
        host=next((m['environment'].get('host') for m in manifests if m.get('environment', {}).get('host')), None),
        runs=dict(performance=run_of('performance', args.current), detection=run_of('detection', args.current),
                  failure=run_of('failure', args.current)),
        products=names,
        performance={p: v for p, v in perf.items() if p in ids or p == 'none'},
        detection=dict(subjects=det['subjects'], products=keep, cohorts=cohorts, profile=profile,
                       unnormalized=unnormalized),
        failure={p: v for p, v in failure(dirs['failure']).items() if p in ids},
        notes=notes,
    )
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', required=True)
    ap.add_argument('--status', choices=['preliminary', 'published'], required=True)
    ap.add_argument('--candidate-label', default='0.6 build')
    ap.add_argument('--performance')
    ap.add_argument('--detection')
    ap.add_argument('--from-latest', metavar='REPO', help='take every product from its newest complete run (bench.latest)')
    ap.add_argument('--current', default='connection-guard-candidate', help='product id shown as the current Connection Guard')
    ap.add_argument('--previous', default='connection-guard', help='product id shown as the previous release (reference only)')
    ap.add_argument('--failure', action='append', default=[])
    ap.add_argument('--run', action='append', default=[], help='name=github-run-id')
    ap.add_argument('--rounds', type=int, default=1)
    ap.add_argument('--note', action='append', default=[], help='section=text, e.g. "failure=Connection Guard 0.6.0, 7 Oct 2026"')
    args = ap.parse_args()
    if args.from_latest:
        data = from_latest(args)
        with open(OUT, 'w') as handle:
            json.dump(data, handle, indent=2)
            handle.write('\n')
        print('wrote', os.path.relpath(OUT), 'products', ', '.join(data['products']), 'measured', data['date_label'])
        return
    perf = performance(args.performance)
    det = detection(args.detection)
    manifest = json.load(open(os.path.join(args.performance, 'manifest.json')))
    ids = list(manifest['products'])
    # Products of the failure runs too (they may cover more plugins than the speed run).
    for folder in args.failure:
        for p in json.load(open(os.path.join(folder, 'manifest.json')))['products']:
            if p not in ids:
                ids.append(p)
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
        # What each section was measured with, when the sections come from different runs.
        notes=dict(n.split('=', 1) for n in args.note),
    )
    with open(OUT, 'w') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')
    print('wrote', os.path.relpath(OUT), 'status', data['status'], 'products', ', '.join(ids))


if __name__ == '__main__':
    main()
