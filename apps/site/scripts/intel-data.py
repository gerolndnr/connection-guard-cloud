#!/usr/bin/env python3
"""Builds src/data/intel.json for /intel from mc-antivpn-bench provider runs and Connection Guard Intel's manifest.

Every number on /intel comes from here or from the live manifest; nothing is typed by hand.

  curl -s https://intel.connectionguard.net/manifest.json -o /tmp/manifest.json
  python3 scripts/intel-data.py --manifest /tmp/manifest.json \
    --summary <newest results-public>/providers/summary.json --run 37627564276 \
    --summary <older results-public>/providers/summary.json --run 37602043725

Summaries are given newest first. Like the README overview of mc-antivpn-bench, each service is taken from the newest
run in which it answered; a service that was down in a newer run keeps its earlier result, with that run's date.
The score is mc-antivpn-bench's (METHODOLOGY 7.9): 100 × (share caught − 3 × share refused) − 5 points per second of
median time (at most 10), floored at 0; unavailable services get none.
"""
import argparse
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'data', 'intel.json')
COHORTS = [('commercial_vpn', 'Commercial VPNs'), ('fresh_vpn', 'Newly added VPN servers'), ('vpn_v6', 'VPNs over IPv6'),
           ('tor', 'Tor exits'), ('proxy', 'Public proxies'), ('residential', 'Home connections'),
           ('residential_v6', 'Home connections, IPv6'), ('mobile_cgnat', 'Mobile networks')]


def score(s, caught=None, refused=None):
    r = s['caught'] / s['bad'] if caught is None and s['bad'] else (caught or 0)
    f = s['refused'] / s['good'] if refused is None and s['good'] else (refused or 0)
    speed = min(10, 5 * (s.get('ms_p50') or 0) / 1000)
    return round(max(0.0, 100 * (r - 3 * f) - speed), 1)


def score_range(s):
    share = lambda k, n: k / n if n else 0
    caught = s.get('caught_ci') or [share(s['caught'], s['bad'])] * 2
    refused = s.get('refused_ci') or [share(s['refused'], s['good'])] * 2
    return [score(s, caught[0], refused[1]), score(s, caught[1], refused[0])]


def unavailable(s):
    if 'unavailable' in s:
        return bool(s['unavailable'])
    errors = s.get('errors') or {}
    return sum(errors.get(k, 0) for k in ('timeout', 'network', 'unavailable')) > (s.get('subjects') or 0) / 2


def source_label(src):
    """A readable name for a manifest source: the GitHub repository, the AS name, or the operator."""
    url, terms, sid = src.get('url') or '', src.get('terms') or '', src['id']
    m = re.match(r'https://raw\.githubusercontent\.com/([^/]+/[^/]+)/', url)
    if m:
        return m.group(1)
    m = re.search(r'prefixes of (AS\d+) ([^;]+?)(?:;|$)', terms)
    if m:
        return f'{m.group(1)} {m.group(2).strip()}'
    names = {'tor-bulk-exit-list': 'Tor Project bulk exit list', 'tor-collector': 'Tor Project CollecTor exit lists',
             'icloud-private-relay': 'Apple iCloud Private Relay egress ranges', 'aws': 'Amazon Web Services', 'gcp': 'Google Cloud',
             'oracle': 'Oracle Cloud', 'digitalocean': 'DigitalOcean geofeed', 'linode': 'Akamai / Linode geofeed',
             'proxy-proxyscrape': 'proxyscrape free API', 'pia': 'Private Internet Access', 'ivpn': 'IVPN', 'nordvpn': 'NordVPN',
             'airvpn': 'AirVPN', 'ovpn': 'OVPN', 'vpnac': 'vpn.ac', 'ipvanish': 'IPVanish', 'privadovpn': 'PrivadoVPN',
             'azirevpn': 'AzireVPN', 'privatevpn': 'PrivateVPN', 'fastestvpn': 'FastestVPN', 'windscribe': 'Windscribe',
             'surfshark': 'Surfshark', 'mullvad': 'Mullvad'}
    return names.get(sid, sid)


def licence(src):
    terms = src.get('terms') or ''
    if 'MIT licence' in terms:
        return 'MIT'
    if 'GPL-3.0' in terms:
        return 'GPL-3.0'
    if 'No licence published' in terms or 'no licence text' in terms.lower():
        return 'none published'
    if 'Commercial service' in terms:
        return 'service terms not reviewed'
    if 'RIPE NCC' in terms:
        return 'RIPE NCC terms'
    if 'geofeed' in terms.lower():
        return 'public geofeed'
    return 'published for this use'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True)
    p.add_argument('--summary', action='append', required=True)
    p.add_argument('--run', action='append', required=True)
    a = p.parse_args()
    if len(a.summary) != len(a.run):
        raise SystemExit('one --run per --summary')
    services, newest_meta = {}, None
    for path, run in zip(a.summary, a.run):
        summary = json.load(open(path))
        meta = summary.get('meta') or {}
        newest_meta = newest_meta or dict(meta, run=run)
        for sid, s in summary['services'].items():
            taken = services.get(sid)
            if taken is None or (unavailable(taken) and not unavailable(s)):
                entry = dict(s, run=run, date=(meta.get('started') or '')[:10])
                services[sid] = entry
    rows = []
    for sid, s in services.items():
        down = unavailable(s)
        rows.append(dict(id=sid, name=s['name'], score=None if down else score(s), range=None if down else score_range(s),
                         caught=s['caught'], bad=s['bad'], refused=s['refused'], good=s['good'], ms=s.get('ms_p50'),
                         local=bool(s.get('local')), keyed=bool(s.get('keyed')), own=bool(s.get('own')), unavailable=down,
                         run=s['run'], date=s['date'], earlier=s['run'] != newest_meta['run']))
    rows.sort(key=lambda r: (r['unavailable'], -(r['score'] or 0)))
    intel = services['cg-intel']
    cohorts = [dict(id=cid, label=label, n=intel['cohorts'][cid]['n'], hit=intel['cohorts'][cid]['positive'])
               for cid, label in COHORTS if cid in intel['cohorts']]
    m = json.load(open(a.manifest))
    # Address counts only where they are countable people-facing numbers (Tor exits, proxies); a hosting range holds
    # 10^32 IPv6 addresses, which says nothing.
    lists = {k: dict(networks=v.get('networks'), addresses=v.get('addresses') if k == 'TOR' else None) for k, v in m['lists'].items()}
    proxy = (m.get('additional_lists') or {}).get('PROXY') or {}
    lists['PROXY'] = dict(networks=proxy.get('networks'), addresses=proxy.get('addresses'))
    sources = [dict(id=s['id'], category=s['category'], name=source_label(s), licence=licence(s), terms=s.get('terms'),
                    url=s.get('url'), entries=s.get('entries'), ok=s.get('status') == 'ok') for s in m['sources']]
    out = dict(
        benchmark=dict(run=newest_meta['run'], date=(newest_meta.get('started') or '')[:10], subjects=newest_meta.get('subjects'),
                       services=rows, intel_cohorts=cohorts),
        manifest=dict(as_of=m['as_of'], lists=lists, tor_history_days=m.get('tor_history_days'),
                      proxy_history_days=7, sources=sources),
    )
    with open(OUT, 'w') as handle:
        json.dump(out, handle, indent=1, ensure_ascii=False)
        handle.write('\n')
    top = ', '.join(f"{r['name']} {r['score']}" for r in rows[:4])
    print(f'{OUT}: {len(rows)} services ({top}), {len(sources)} sources, lists as of {m["as_of"]}')


if __name__ == '__main__':
    main()
