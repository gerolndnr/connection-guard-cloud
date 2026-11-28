-- Connection-probe counts (Velocity plugins from 0.6.2, linked servers that contribute signals): how often each measured
-- connection trait value occurred on logins judged VPN, hosting, clean or unlabelled. Counts only (packages/protocol
-- ProbeCounts). Windows wait here until the daily cron adds them into probe_daily and deletes them (probe.ts).
CREATE TABLE probe_windows (
  day INTEGER NOT NULL,              -- start of the UTC day, ms
  source TEXT NOT NULL,              -- the linked network, so a network with many servers can be told apart
  received_at INTEGER NOT NULL,
  logins INTEGER NOT NULL,
  counts TEXT NOT NULL,              -- JSON array of {s, v, l, n}
  PRIMARY KEY (day, source, received_at)
) WITHOUT ROWID;

-- Per UTC day, signal, value and label: the sum over all windows and how many networks reported it. Kept 90 days.
CREATE TABLE probe_daily (
  day INTEGER NOT NULL,
  signal TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  n INTEGER NOT NULL,
  sources INTEGER NOT NULL,
  PRIMARY KEY (day, signal, value, label)
) WITHOUT ROWID;
