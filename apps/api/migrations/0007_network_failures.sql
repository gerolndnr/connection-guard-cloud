-- Network failures in error reports (timeouts, DNS, refused or reset connections during lookups and syncs), counted per
-- UTC day, service and exception type. They are normal operations, not bugs, so they never become single analytics
-- events: the daily cron sends one summary per finished day and deletes the rows it sent (cron.ts).
CREATE TABLE network_failures (
  day INTEGER NOT NULL,      -- start of the UTC day, ms
  source TEXT NOT NULL,      -- provider class, e.g. ZowiVpnProvider
  type TEXT NOT NULL,        -- exception class
  count INTEGER NOT NULL,
  installs INTEGER NOT NULL, -- reports (one per server and sync) that added to this row
  PRIMARY KEY (day, source, type)
) WITHOUT ROWID;
