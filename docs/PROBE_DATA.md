# Connection-probe data

What the connection probe (plugin `core/.../probe/ProbeCounts.java`, Velocity, linked servers that send signals) delivers, how it is stored, and how to analyse it or train a model on it without fooling yourself.

## Where it is

| Table | Rows | Kept |
|---|---|---|
| `probe_windows` | one per six-hour window and server: `day, source, received_at, schema, logins, counts` (JSON `{s, v, l, n}`) | until the next day's cron |
| `probe_daily` | `day, source, schema, signal, value, label, n`: the day's windows of one network added up | 90 days, or until the network is deleted |

- `source` is the linked network. Daily totals stay per network so a result can be checked on several networks and one large network cannot dominate. They are published, if ever, only as totals across networks.
- `schema` is the plugin's `ProbeCounts.SCHEMA`. Every change to a signal, its values, bucket edges or the joint code raises it. **Never add up rows of different schemas.**
- `scripts/probe-report.mjs --schema 1` prints single-signal totals and lifts. `scripts/probe-export.mjs --out probe.csv` writes every row, with pseudonymous networks and decoded joint columns, for pandas, DuckDB or R.

## Labels

`l` is Connection Guard's own verdict for the login's address at login time, not ground truth:

| Label | Meaning |
|---|---|
| `vpn` | the verdict or a positive source said VPN, proxy, Tor or relay |
| `hosting` | a source typed the address as hosting, without a VPN verdict |
| `clean` | checked and negative (or known) |
| `unlabelled` | no verdict for the address (not looked up, local-only policy) |

`positive_sources` (0, 1, >=2) tells how sure a `vpn` label is.

## Signals, schema 1 (plugin 0.6.3)

Every login gives each signal at most one value, so a signal's values add up to the logins it was measured on. `all|all` is the number of logins per label. A signal missing on a login (no TCP info, offline mode, no verdict) simply has no row.

| Signal | Values | Notes |
|---|---|---|
| `joined`, `left_early` | true, false | `left_early`: joined, then left before the twelve ping samples (60 s) |
| `behind_tcp_proxy` | true, false | HAProxy/TCPShield in front: no TCP signals |
| `family` | 4, 6 | |
| `mss_class` | standard, pppoe, ds_lite, wireguard, tunnel, unknown | segment size from the SYN |
| `tcp_timestamps`, `tcp_sack` | true, false | TCP options of the peer |
| `peer_wscale` | -1 … 14 | window scale the peer announced |
| `tcp_rtt` | <10, <25, <50, <100, <200, >=200 ms | kernel round trip |
| `tcp_rttvar` | <2, <5, <10, <25, >=25 ms | |
| `ping_min` | <10, <25, <50, <100, <200, >=200 ms | smallest keep-alive ping |
| `ping_gap` | <5, <10, <20, <30, <40, <60, <80, <150, <300, >=300 ms | `ping_min` minus kernel round trip; large means a TCP-terminating proxy |
| `proxy_suspected` | true, false | gap at or above the server's threshold (default 40 ms) on two or more pings |
| `session_ip` | match, mismatch, unknown, error, skipped, enforced | online mode; see the plugin's docs/CLOUD.md |
| `ptr` | vpn, server, residential, other, none | only where an operator enabled reverse DNS, so rare |
| `vhost` | name, ip | how the server address was typed |
| `brand` | vanilla, fabric, neoforge, forge, quilt, lunarclient, badlion, feather, geyser, labymod, other | |
| `bedrock_os` | Floodgate device names, lower case | |
| `protocol` | protocol number | |
| `handshake_to_login` | <50, <200, <1000, <5000, >=5000 ms | |
| `login_to_join` | <200, <500, <1000, <3000, >=3000 ms | |
| `locale_country_mismatch` | true, false | locale country against the looked-up country |
| `mobile_on_hosting` | true | Bedrock phone on a hosting address |
| `new_account` | true, false | first time on this server; only after the probe ran 7 days |
| `acct_logins_window` | <2, <3, <6, >=6 | logins of the same account in this window, for weighting accounts instead of logins |
| `positive_sources` | 0, 1, >=2 | positive sources behind the verdict |
| `accounts_per_net` | <2, <5, <20, <100, >=100 | accounts behind the login's /24 or /48 in this window |
| `new_account_share_per_net` | <0.2, <0.5, <0.8, >=0.8 | with at least 5 accounts |
| `ping_spread_per_net` | <10, <30, <80, >=80 ms | standard deviation of their pings |
| `skin_shared_by_3plus_accounts` | true | |
| any signal | `_other` | its rarest values, folded when a window had more than 600 keys; totals stay exact |

### Joint combinations

Single-signal counts show how often a value occurs per label, but not how signals combine, which every model beyond naive Bayes needs. `signal = joint` counts the combination of seven coarse traits per login as a seven-character code:

| Position | Trait | Codes |
|---|---|---|
| 1 | segment size | s standard, a PPPoE or DS-Lite, t tunnel, u unknown |
| 2 | ping gap | 0 <20 ms, 1 <40, 2 <80, 3 more, u unmeasured |
| 3 | session check | m match, x mismatch, u other or none |
| 4 | brand | v vanilla, m modded, b Geyser, o other, u none |
| 5 | locale country | y mismatch, n match, u unknown |
| 6 | new account | y, n, u |
| 7 | login | j joined, e left early, n never joined |

The export decodes them into `joint_*` columns.

- A combination is sent once at least three logins on that server had it, so no combination row describes one or two logins. Rarer combinations wait for later windows (as counts, in memory), and after 28 windows (seven days) they are added to `joint|_suppressed`.
- Joint rows therefore arrive later than the logins they count. Analyse them over weeks, not days.
- Compare `_suppressed` with `all|all` per label. If a label's suppressed share is large, its rare combinations are under-represented.

## Analysing it

**Rates.** Two rates matter per signal value and label:
- **Coverage:** the signal's values added up, divided by `all|all`.
- **Rate among measured:** the value's n, divided by the signal's values added up.

Lift is the rate on `vpn` divided by the rate on `clean`. Give it an interval: few VPN logins make large lifts by chance. `probe-report.mjs` marks values with fewer than 20 logins.

**Networks.** Check a finding per network (`source`) before trusting it. Networks differ in player base, configured sources (and so labels), and proxies in front.
- **Weighting:** weight networks equally, or cap each, when one network supplies most rows.
- **Validation:** for models, leave whole networks out (grouped cross-validation), never random rows.

**Labels are circular.** A model trained on `vpn` against `clean` learns to reproduce today's sources. That is fine for finding which traits go with VPNs, but its "false positives" on `clean` are a mix of errors and VPNs the sources miss.
- **Treat it as positive-unlabelled data:** `clean` and `unlabelled` contain undetected VPNs. `positive_sources >= 2` gives a high-confidence positive subset.
- **Validate independently:** check candidates against independent ground truth before building detection, for example the benchmark's prospective VPN cohort or addresses checked by hand.

**Models from counts.** The joint table is a weighted dataset: one row per (combination, label) with weight `n`.
- A logistic regression or tree on the seven traits fits on it directly with `sample_weight = n`.
- Naive Bayes fits on the single-signal counts, which have finer values. The joint table is the check whether its independence assumption holds.

```python
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold

rows = pd.read_csv("probe.csv")
j = rows[(rows.signal == "joint") & (rows.value != "_suppressed") & (rows.schema == 1) & rows.label.isin(["vpn", "clean"])]
X = pd.get_dummies(j.filter(like="joint_").fillna("none"))
y, w, groups = (j.label == "vpn").astype(int), j.n, j.source
for train, test in GroupKFold(n_splits=min(5, groups.nunique())).split(X, y, groups):
    model = LogisticRegression(max_iter=1000).fit(X.iloc[train], y.iloc[train], sample_weight=w.iloc[train])
    print(model.score(X.iloc[test], y.iloc[test], sample_weight=w.iloc[test]))
```

**Changing definitions.** Change the plugin's `ProbeCounts` and `ci/fixtures/connection-probe/analyze.py` together, raise `SCHEMA`, add the new layout to `JOINT` in `probe-export.mjs`, and add a section here. Old and new schemas are analysed side by side, never added up.

## Limits that come with the privacy design

- Only counts leave a server: no per-login rows, no addresses, prefixes, accounts or names. A trait can be added only as a closed value or bucket, and only after it is documented in the privacy policy (section 4.8).
- Windows with fewer than five logins wait. Above 4,096 logins in six hours a window keeps a uniform sample (`overflow` counts the rest).
- At most 2,000 windows a day are stored (four per Velocity server for 500 servers). Later windows that day are dropped, so raise the limit before the network count gets near it.
- Exports are copies of data kept 90 days and pseudonymous per export. Keep the derived results, not the files.
