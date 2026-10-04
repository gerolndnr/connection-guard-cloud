-- Connection Guard Cloud schema v1.
-- Times are epoch milliseconds. Personal data lives only in event_batches.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE networks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  retention_days INTEGER NOT NULL DEFAULT 30,
  created_at INTEGER NOT NULL
);

CREATE TABLE memberships (
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (network_id, user_id)
) WITHOUT ROWID;
CREATE INDEX memberships_user ON memberships(user_id);

CREATE TABLE dpa_acceptances (
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  PRIMARY KEY (network_id, version)
) WITHOUT ROWID;

CREATE TABLE installs (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  network_id TEXT REFERENCES networks(id) ON DELETE SET NULL,
  display_name TEXT,
  platform TEXT NOT NULL,
  platform_version TEXT NOT NULL,
  plugin_version TEXT NOT NULL,
  java_version TEXT NOT NULL,
  status_json TEXT,
  last_seq INTEGER NOT NULL DEFAULT -1,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  claimed_at INTEGER
);
CREATE INDEX installs_network ON installs(network_id);
CREATE INDEX installs_seen ON installs(last_seen_at);

CREATE TABLE link_codes (
  code TEXT PRIMARY KEY,
  install_id TEXT NOT NULL UNIQUE REFERENCES installs(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE network_tokens (
  token_hash TEXT PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- One row per install and hour. Aggregates only, kept 13 months.
CREATE TABLE rollups_hourly (
  install_id TEXT NOT NULL REFERENCES installs(id) ON DELETE CASCADE,
  hour INTEGER NOT NULL,
  checks INTEGER NOT NULL DEFAULT 0,
  allowed INTEGER NOT NULL DEFAULT 0,
  denied INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  vpn_positive INTEGER NOT NULL DEFAULT 0,
  geo_flagged INTEGER NOT NULL DEFAULT 0,
  cache_hits INTEGER NOT NULL DEFAULT 0,
  lookups INTEGER NOT NULL DEFAULT 0,
  latency_p95_max INTEGER,
  countries_json TEXT NOT NULL DEFAULT '{}',
  reasons_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (install_id, hour)
) WITHOUT ROWID;

-- One row per sync that carried events. payload is a gzip'd JSON array of
-- DecisionEvent. Kept for networks.retention_days (default 30).
CREATE TABLE event_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  install_id TEXT NOT NULL REFERENCES installs(id) ON DELETE CASCADE,
  received_at INTEGER NOT NULL,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  denied_count INTEGER NOT NULL,
  payload BLOB NOT NULL
);
CREATE INDEX event_batches_network_time ON event_batches(network_id, last_at);

CREATE TABLE commands (
  id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL REFERENCES installs(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id),
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  completed_at INTEGER,
  result_ok INTEGER,
  result_message TEXT
);
CREATE INDEX commands_pending ON commands(install_id, completed_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network_id TEXT REFERENCES networks(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  at INTEGER NOT NULL
);
CREATE INDEX audit_network_time ON audit_log(network_id, at);
