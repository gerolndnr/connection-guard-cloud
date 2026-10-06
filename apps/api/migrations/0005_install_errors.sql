-- Connection Guard's own exceptions as linked servers report them (sync `errors`, plugin 0.5.2+): one row per server
-- and fingerprint, counts added up. No message text and no player data. Unlinked servers' reports only go to product
-- analytics and are not stored. Kept for 30 days after the last occurrence (cron.ts).
CREATE TABLE install_errors (
  install_id TEXT NOT NULL REFERENCES installs(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  cause_type TEXT,
  context TEXT NOT NULL,
  -- "Class.method:line" of the topmost own frame, for the dashboard.
  top_frame TEXT NOT NULL,
  plugin_version TEXT NOT NULL,
  count INTEGER NOT NULL,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (install_id, fingerprint)
) WITHOUT ROWID;
