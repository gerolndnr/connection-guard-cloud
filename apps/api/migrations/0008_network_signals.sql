-- Network signals for Connection Guard Intel (plugins from 0.6.2): per UTC day, prefix (IPv4 /24, IPv6 /48) and source,
-- counts only. `source` is the network for linked servers and the install for unlinked ones, so a network with many
-- servers counts once. Rows are kept 7 days (cron.ts); the daily cron publishes only prefixes several sources report.
CREATE TABLE network_signals (
  day INTEGER NOT NULL,              -- start of the UTC day, ms
  prefix TEXT NOT NULL,
  source TEXT NOT NULL,
  logins INTEGER NOT NULL,
  accounts INTEGER NOT NULL,         -- the largest six-hour window of the day, so returning players count once
  vpn INTEGER NOT NULL,
  denied INTEGER NOT NULL,
  banned INTEGER NOT NULL,
  allowed_by_rule INTEGER NOT NULL,
  PRIMARY KEY (day, prefix, source)
) WITHOUT ROWID;

-- Rows written into network_signals per UTC day, so signals never take more than their share of the free plan's
-- 100,000 daily D1 row writes (signals.ts SIGNAL_ROWS_PER_DAY).
CREATE TABLE signal_budget (
  day INTEGER PRIMARY KEY,
  rows INTEGER NOT NULL
);
