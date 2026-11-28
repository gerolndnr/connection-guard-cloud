-- Connection-probe counts (Velocity plugins from 0.6.2, linked servers that contribute signals): how often each measured
-- connection trait value occurred on logins judged VPN, hosting, clean or unlabelled. Counts only (packages/protocol
-- ProbeCounts). Windows wait here until the daily cron adds them into probe_daily and deletes them (probe.ts).
CREATE TABLE probe_windows (
  day INTEGER NOT NULL,              -- start of the UTC day, ms
  source TEXT NOT NULL,              -- the linked network, so a network with many servers can be told apart
  received_at INTEGER NOT NULL,
  schema INTEGER NOT NULL,           -- the plugin's feature definitions (ProbeCounts.SCHEMA; 0 before the first release)
  logins INTEGER NOT NULL,
  counts TEXT NOT NULL,              -- JSON array of {s, v, l, n}
  PRIMARY KEY (day, source, received_at)
) WITHOUT ROWID;

-- Per UTC day, network, schema, signal, value and label: the sum of that network's windows. Kept 90 days. Per network,
-- so an analysis can check that a result holds on several networks and keep one large network from dominating;
-- per schema, so changed definitions never mix. Published, if ever, only as totals across networks.
CREATE TABLE probe_daily (
  day INTEGER NOT NULL,
  source TEXT NOT NULL,
  schema INTEGER NOT NULL,
  signal TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, source, schema, signal, value, label)
) WITHOUT ROWID;
