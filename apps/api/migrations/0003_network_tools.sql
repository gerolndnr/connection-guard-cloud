-- Dashboard tools for a network: access rules, team invites, Discord alerts.

-- Access rules the dashboard sent to a network's servers. The plugin keeps the authoritative copy; this is what
-- the dashboard shows and can remove again. Each rule fans out as one command per server (commands.rule_id).
CREATE TABLE access_rules (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  effect TEXT NOT NULL CHECK (effect IN ('ALLOW', 'DENY', 'EXEMPT')),
  scope TEXT NOT NULL CHECK (scope IN ('VPN', 'GEO', 'ALL')),
  target TEXT NOT NULL,
  note TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  removed_at INTEGER
);
CREATE INDEX access_rules_network ON access_rules(network_id, removed_at);
ALTER TABLE commands ADD COLUMN rule_id TEXT;

-- One-time invitations into a network. Only the hash of the token is stored.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at INTEGER
);
CREATE INDEX invites_network ON invites(network_id, used_at);

-- Discord webhook alerts. The webhook URL is stored encrypted (AES-GCM, CONFIG_SECRET_KEY).
CREATE TABLE alert_settings (
  network_id TEXT PRIMARY KEY REFERENCES networks(id) ON DELETE CASCADE,
  webhook_enc BLOB,
  webhook_hint TEXT,
  kinds_json TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- When an alert was last sent, so an ongoing problem is reported once a day, not every check.
CREATE TABLE alert_state (
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  last_sent_at INTEGER NOT NULL,
  PRIMARY KEY (network_id, kind, key)
) WITHOUT ROWID;
